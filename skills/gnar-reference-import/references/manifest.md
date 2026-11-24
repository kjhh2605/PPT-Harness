# 컬렉션 매니페스트

`reference/imports/<id>/manifest.json`에 UTF-8 JSON으로 저장한다. `<id>`는 소문자 영문·숫자·하이픈을 쓰며 사이트와 작품 ID를 조합하면 충돌이 적다. 파일 경로는 프로젝트 루트 기준 상대 경로이며 `..`를 사용하지 않는다.

```json
{
  "version": 1,
  "id": "example-deck-123",
  "title": "브랜드 발표 레퍼런스",
  "source_url": "https://example.com/decks/123",
  "pages": [
    {
      "id": "S-example-deck-123-01",
      "title": "중앙 표지",
      "html": "reference/slides/S-example-deck-123-01.html",
      "preview": "reference/previews/S-example-deck-123-01.png",
      "layout": "중앙 2행 제목",
      "summary": "넓은 여백 안에 두 줄 제목과 한 단어 강조를 배치한다."
    }
  ]
}
```

- `pages`는 원본 순서다. 실제 슬라이드만 포함하고 소개·목업 보드의 제외 사유는 해당 페이지 또는 첫 페이지의 `source_note`에 짧게 기록한다.
- `html`은 편집 가능한 완성 문서, `preview`는 검수 스크립트가 생성할 PNG다.
- `source_image`는 선택 항목이다. 적을 경우 `out/sources/<id>/<파일>` 경로를 쓰며, 검수(`check.mjs`) 시점에만 존재하면 된다. 등록기는 존재 여부를 확인하지 않고 미리보기에 원본 링크를 만들지 않는다. 원본 이미지를 저장소에 추가하지 않는다.
- 모든 페이지의 ID·HTML 경로·미리보기 경로는 각각 고유해야 한다. ID는 `S-<컬렉션 id>-`로 시작하고, HTML은 `reference/slides/<페이지 id>.html`, PNG는 `reference/previews/<페이지 id>.png`로 저장한다. 기존 `01.png` 같은 미리보기를 덮어쓰지 않는다.
- `layout`은 원본의 공간 배치를 짧게 적는다. 고정된 분류 수나 카테고리별 화면 수를 채울 필요는 없다.
- HTML의 `meta name="source"`는 `source_url`과 맞춘다. `meta name="reference-image"`에는 원본 파일명(예: `slide-01.webp`)을 적고, `source_image`를 적었다면 그 파일명과 일치시킨다. 컬렉션 안에 다른 원문에서 확보한 화면이 섞여 있으면 해당 페이지에 선택 항목 `source_url`을 추가한다. 이때 그 페이지의 HTML 출처 메타는 페이지의 `source_url`과 정확히 일치해야 하며, 생략한 페이지는 컬렉션의 `source_url`을 사용한다.
- 원본이 일부만 공개되어 있으면 페이지의 선택 항목 `source_status`에 `partial`을, `source_note`에 확인 범위와 재구성한 부분을 기록한다. `source_note`는 컬렉션 미리보기에도 표시한다.
- 등록 전에는 HTML이 존재해야 하고, 검수가 끝난 뒤에는 PNG도 존재해야 한다.
- 등록 결과: `reference/imports/<id>/index.html`, 기존 `reference/index.html`의 새 컬렉션 링크, `reference/catalog.md`의 새 항목. 기존 화면을 삭제하거나 재구성하지 않는다.
