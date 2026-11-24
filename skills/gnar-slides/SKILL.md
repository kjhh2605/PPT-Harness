---
name: gnar-slides
description: "사용자가 기존 PPT·PDF 발표 자료를 Gnar 디자인 시스템(Deep Indigo Ink)으로 전체 재구성하거나 새 발표 덱을 만들어 달라고 할 때 사용한다. 원본을 분석해 장별 1920×1080 HTML과 PDF를 만들고, 렌더 검수와 청중용 출처 검사를 거친 뒤 변경 기록을 남긴다."
---

# Gnar 덱 제작

이 스킬은 **Gnar-PPT 프로젝트 전용**이다. 결과물은 `decks/<deck-id>/`에 두고 `reference/`(레퍼런스 라이브러리)와 섞지 않는다. 레퍼런스 라이브러리에 화면을 추가하는 요청은 `gnar-reference-import`를 쓴다.

## 처음에 읽는 것

- `design/design.md`, `design/palettes/brand.json`, `design/tokens.css`: 현재 확정 팔레트와 색 규칙. 값을 스킬에 고정하지 않는다. 빌드 전에 `design/tokens.css`가 제자리에 있는지 확인한다.
- `scripts/slide_document.py`: 독립 HTML 문서·인쇄·뷰포트 축소 헬퍼. `document(title, body, css, slide_id, source_image, source_url, theme)`.
- `decks/lbt-ai-native/`: 완성된 덱의 기준 구현. `build.py`(내용·레이아웃), `render.mjs`(미리보기·PDF·검수), `index.html`(뷰어)을 복사해 시작한다.

## 1. 원본 확보

1. PDF는 `pdfinfo`로 쪽수·크기를 확인하고 `pdftoppm -r 60 -png`로 `design/sources/<deck-id>/pdf-pages/`에 렌더한다. `pdftotext -layout`로 문구를 뽑는다. PPTX가 함께 있으면 `unzip 'ppt/media/*'`로 삽입 이미지를 원본 해상도로 확보한다.
2. 페이지 묶음 시트를 만들어 **모든 쪽을 직접 본다.** 발표 대본·원본 초안이 있으면 함께 읽어 보강할 설명의 근거로 삼는다.
3. 각주가 가리키는 외부 문서(예: "원문 PDF 11–12쪽")는 실제 파일을 찾아 내용을 확인한다.

## 2. 허용 범위 확인

- 기본은 원본의 문구·순서·정보 위계 유지, 색과 타이포만 교체다.
- 사용자가 "원본 내용을 벗어나지 않는 선에서 수정·추가 허용"이라고 하면 발표 대본에 있는 설명을 캡션·콜아웃으로 보강하고, 외부 UI 캡처를 토큰 색 목업으로 다시 그릴 수 있다. 새 주장·수치는 넣지 않는다.
- 사용자가 사례·화면을 추가로 보내면 그 장만 새로 만들고 나머지는 번호만 밀린다. 쪽 번호와 상호 참조는 빌드 시 자동으로 채운다(`__PAGE__`).

## 3. 자산

- 사진·AI 생성 이미지가 원본에 있으면 Codex 내장 `image_gen`으로 팔레트에 맞춰 다시 만든다. 프롬프트에 토큰 hex와 "텍스트·로고 없음", 글자가 올라갈 영역의 여백을 명시한다.

  ```sh
  codex exec --skip-git-repo-check -C "$PWD" - < prompt.md   # 절대 경로로 저장하게 지시
  ```

- 제품 로고는 PNG를 `ink` 단색 실루엣으로 변환해 쓴다. 실제 화면 캡처는 그대로 두되 다크 프레임에 담는다.
- 모든 자산은 `decks/<deck-id>/assets/`에 둔다. 생성 이미지는 `assets/generated/`.

## 4. 빌드 규칙

- 한 장에 `hero`는 한 요소(또는 한 묶음). 섹션 표지는 다크 토큰. 글자 최소 20px, 본문 24–28px, 제목 64px.
- 상단 헤더(브랜드 / 섹션 라벨)와 하단 각주(출처 / 쪽 번호)를 모든 장에 같은 위치로 둔다.
- 문구 종결은 `references/slide-quick-rules.md` S-9를 따른다. 정보 전달 문구는 명사형·`~함`, 핵심 메시지는 구어체 `~습니다`.
- 도식은 HTML/SVG로 그린다. 원본 슬라이드 이미지를 배경으로 깔지 않는다.

```sh
.venv/bin/python decks/<deck-id>/build.py
node decks/<deck-id>/render.mjs            # 미리보기·PDF·검수·출처 검사
```

## 5. 검수

`render.mjs`는 캔버스 밖 요소, 20px 미만 글자, 잘린 텍스트, 글자 상자 겹침, 토큰 밖 색을 검사하고 마지막에 장별 텍스트를 `out/decks/<deck-id>/slide-text.md`로 뽑는다. 자동 검수 후 묶음 시트를 만들어 모든 장을 직접 본다.

### 청중 관점 검토 — Sonnet 서브에이전트 (필수)

발표 자료를 만들 때 참고한 근거, 발표자에게 하는 메모, 제작 과정 흔적은 청중용 화면에 남으면 안 된다. 정규식으로는 "발표 포인트:" 같은 문장을 잡지 못하므로 **별도 서브에이전트가 사람처럼 읽고 판정**한다.

1. 텍스트를 뽑는다. `render.mjs`가 이미 만들었다면 생략한다.

   ```sh
   node skills/gnar-slides/scripts/extract-text.mjs decks/<deck-id> --out out/decks/<deck-id>/slide-text.md
   ```

2. Agent 도구로 **`gnar-audience-reviewer`** 서브에이전트(`.claude/agents/gnar-audience-reviewer.md`, Sonnet)를 호출한다. 판정 기준은 에이전트 정의에 들어 있으므로 작업 지시는 짧게 쓴다.

   > `out/decks/<deck-id>/slide-text.md`를 검토하고 결과를 `out/decks/<deck-id>/audience-review.json`에 저장해 주세요. 의도적 예외: (있으면 장 번호와 문구).

   유형: `speaker-note`, `process-note`, `internal-ref`, `meta-caveat`, `slop`, `inconsistency`.
3. 결과를 하나씩 보고 `build.py`에서 고친다. 발표자 메모는 삭제하거나 청중용 문장으로 바꾸고, 제작 메모·내부 참조는 지우고, 군더더기는 줄인다. 지적이 틀렸다고 판단한 항목은 이유를 `screens.md`에 적는다.
4. 다시 빌드·렌더·추출하고 `gnar-audience-reviewer`를 **새로 호출**해 같은 검토를 반복한다. `findings`가 비거나, 남은 항목이 모두 기록된 의도적 예외일 때 끝난다. 최종 JSON은 `out/`에 남긴다.

`scripts/audit-sources.mjs`는 번호 각주·내부 쪽수·작업 메모만 빠르게 거르는 보조 검사다. 서브에이전트 검토를 대신하지 않는다.

### 문장 다듬기 — gnar-slide-humanizer (청중 검토 통과 후)

전역 `humanize-korean` 플러그인은 산문용이라 슬라이드에 그대로 쓰면 불릿을 문단으로 합치거나 종결을 다양화해 레이아웃을 깨뜨린다. 그래서 같은 철학을 슬라이드 문구에 맞게 좁힌 **프로젝트 전용 에이전트**(`.claude/agents/gnar-slide-humanizer.md`)와 **슬림 룰북**(`references/slide-quick-rules.md`)을 쓴다. 전역 플러그인 파일은 수정하지 않는다.

1. Agent 도구로 `gnar-slide-humanizer`를 호출한다. 작업 지시는 세 경로와 예외 목록이면 된다.

   > 입력: `out/decks/<deck-id>/slide-text.md` · 룰북: `skills/gnar-slides/references/slide-quick-rules.md` · 출력: `out/decks/<deck-id>/humanize-edits.json`. 의도적 예외: (장 번호와 문구).

2. 결과 JSON의 `edits`를 하나씩 보고 `build.py`에서 `before` → `after`로 바꾼다. `group_consistency`는 묶음 단위 종결 통일 제안이므로 해당 묶음을 함께 고친다. 수치·고유명사·인용이 바뀐 제안, 글자 수가 15% 넘게 늘어난 제안은 적용하지 않고 `screens.md`에 사유를 적는다.
3. 다시 빌드·렌더해 넘침 0건을 확인하고, `gnar-audience-reviewer`로 한 번 더 검토한다. 윤문이 새 문제를 만들지 않았는지 보는 단계다.


## 6. PPTX 내보내기

검수가 끝난 HTML을 편집 가능한 PPTX로 바꾼다. 텍스트는 텍스트 상자, 배경·테두리 상자는 도형, SVG는 SVG 그림(PowerPoint에서 "도형으로 변환" 가능), 자르기·마스크·그라디언트가 있는 요소만 PNG로 들어간다. `<video>`는 원본 영상을 담은 미디어 개체가 되고 표지는 HTML에 보이는 포스터를 렌더한 PNG다. 영상 장은 PDF·미리보기에 재생 바가 찍히지 않도록 `controls` 대신 `onmouseenter="this.controls=true"`를 쓴다. 슬라이드 크기는 20×11.25in(1px = 1/96in)이라 좌표·글자 크기가 HTML과 1:1이다.

```sh
node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<deck-id>              # decks/<deck-id>/<PDF와 같은 이름>.pptx
node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<deck-id> --compare    # + LibreOffice 렌더와 HTML 미리보기 비교 시트
```

- 완료 조건: 종료 코드 0(추출한 텍스트 런이 모두 PPTX XML에 있음). 보고서는 `out/decks/<deck-id>/pptx-report.json`.
- `--compare`는 `out/decks/<deck-id>/pptx-compare-N.png`(장당 HTML | PPTX 한 줄)을 만든다. 모든 시트를 직접 보고 줄바꿈·위치가 어긋난 장을 찾는다. 어긋나면 산출물이 아니라 스크립트의 규칙(텍스트 상자 폭 여유, 줄바꿈 판정, 래스터 조건)을 고치고 다시 돌린다.
- 이 Mac의 Homebrew LibreOffice는 시스템 글꼴을 읽지 못한다. 비교 시트를 쓰기 전에 한 번만 글꼴을 프로필에 링크한다. PowerPoint·Keynote에서 열 때는 필요 없다.

  ```sh
  mkdir -p "$HOME/Library/Application Support/LibreOffice/4/user/fonts"
  ln -sf ~/Library/Fonts/Pretendard/*.otf /System/Library/Fonts/Menlo.ttc /System/Library/Fonts/AppleSDGothicNeo.ttc "$HOME/Library/Application Support/LibreOffice/4/user/fonts/"
  ```

- 글꼴은 Pretendard 정적 패밀리(`Pretendard`, `Pretendard SemiBold`, `Pretendard ExtraBold` 등)로 쓴다. 가변 폰트 굵기(650·750)는 가장 가까운 정적 굵기로 내린다.
- 변환이 끝나고 결과물만 남길 때는 `gnar-deck-cleanup` 스킬을 쓴다.

## 7. 기록과 보고

- `design/sources/<deck-id>/screens.md`: 원본 경로, 페이지 대응표, 장별 변경 요약, 제작용 근거 목록, 확인하지 못한 것.
- `decks/<deck-id>/README.md`: 열기·재생성 방법, 자산 출처.
- `skills/gnar-slides/CHANGELOG.md`: 이 작업에서 스킬·스크립트·에이전트를 고쳤으면 날짜·계기·변경·검증을 한 줄로 남긴다.
- 사용자에게는 장 수, 뷰어·PDF 경로, 원본과 달라진 점, 확인이 필요한 점만 짧게 알린다.
