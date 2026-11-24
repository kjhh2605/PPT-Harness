---
name: gnar-deck-cleanup
description: "덱 제작·검수가 끝난 뒤 사용자가 결과물만 남기고 정리해 달라고 할 때 사용한다. PPTX가 없으면 먼저 만들고, out/·원본 렌더·미참조 자산·제작용 메타를 지운 뒤 HTML 참조가 모두 살아 있는지 검증한다."
---

# Gnar 덱 정리

`decks/<deck-id>/`의 결과물(장별 HTML + 뷰어, PDF, PPTX)만 남기고 제작 과정 파일을 지운다. `gnar-slides` 5절 검수(렌더 검수 0건, 청중 검토 findings 0건)가 끝난 덱에만 쓴다.

## 절차

1. 결과물 확인. PPTX가 없으면 만든다.

   ```sh
   ls decks/<deck-id>/*.pdf decks/<deck-id>/*.pptx
   node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<deck-id>   # 종료 코드 0 = 텍스트 누락 없음
   ```

2. 계획을 본다(삭제하지 않음).

   ```sh
   python3 skills/gnar-deck-cleanup/scripts/cleanup.py decks/<deck-id>
   ```

3. 삭제 목록을 사용자에게 요약해 보여주고 확인을 받는다. 사용자가 이미 "정리해 달라"고 명시했으면 바로 적용한다.
4. 적용하고 종료 코드 0을 확인한다.

   ```sh
   python3 skills/gnar-deck-cleanup/scripts/cleanup.py decks/<deck-id> --apply
   ```

5. `skills/gnar-deck-cleanup/CHANGELOG.md`에 스크립트를 고쳤을 때만 한 줄 남긴다. 덱 README의 재생성 안내가 지운 파일을 가리키면 고친다.

## 무엇을 지우고 남기는가

| 구분 | 남김 | 삭제 |
|---|---|---|
| `decks/<id>/` | `slides/*.html`, `index.html`, `deck.js`(source·note 제거), `previews/`, 참조되는 `assets/`, `README.md`, `*.pdf`, `*.pptx`, `build.py`, `render.mjs`, `deck.json` | 참조되지 않는 `assets/`·`previews/` 파일, `.DS_Store`, `__pycache__`, 슬라이드 HTML의 `<meta name="source">`·`<meta name="reference-image">` |
| `out/decks/<id>/` | 없음 | 전부(qa.json, slide-text.md, 검토 JSON, pdf-pages, pptx-tmp) |
| `design/sources/<id>/` | `*.md`(screens.md), 원본 `*.pdf`·`*.pptx`·`*.key` | `pdf-pages/`, `pptx-media/`, `sheet-*.png`, `*-sheet.png`, `page-*.png`, `*.txt` |

- `build.py`·`render.mjs`·`deck.json`은 기본으로 남긴다. 하네스 변경 루프가 같은 덱을 다시 빌드해 확인하기 때문이다. 외부에 전달할 사본처럼 재생성이 필요 없을 때만 `--strip-build`를 쓴다.
- 원본 렌더를 다시 볼 일이 남았으면 `--keep-sources`.
- 스크립트는 알려진 이름만 지운다. 목록에 없는 파일은 손대지 않고 "남는 것"으로 보고하므로, 보고를 보고 사용자와 정리한다.

## 완료 조건

`cleanup.py --apply` 종료 코드 0. 남은 `slides/*.html`·`index.html`·`deck.js`가 가리키는 로컬 파일이 모두 존재하면 0, 깨진 참조가 있으면 1이다. 깨진 참조가 나오면 참조 추출 규칙(`REF_RE`)을 고치고 같은 덱으로 다시 돌린다.
