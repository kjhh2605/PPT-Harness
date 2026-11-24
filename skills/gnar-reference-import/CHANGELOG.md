# gnar-reference-import 변경 기록

형식: 날짜 · 계기 · 변경 · 검증. 최신이 위.

- 2026-10-29 · 저장소 정리(두 세션 합의) · `check.mjs`·`register.py`·`references/manifest.md`의 `design/sources/` legacy 분기 제거, SKILL.md의 `npm run check` 범위 설명 정정과 `slide_document.py` 기본 `source_url` 공백화에 맞춘 안내 수정. 원본이 없어 재실행할 수 없던 `scripts/imports/generate-*.py`·`scripts/sync-imports.py`·`reference/notes/` 제거 · 기존 매니페스트로 `check.mjs`·`register.py` 재실행해 산출물 변경 없음 확인
- 2026-10-28 · 기존 컬렉션 원본 정리 · `design/sources/notefolio-*` 19개 폴더를 저장소에서 제거(`out/retired-sources/`로 이동). 컬렉션 JSON의 `sourceImage`, 매니페스트의 `source_image` 전부 제거하고 토스 14장을 `reference/collections/bysu-325182.json`으로 고정. `scripts/build-library.py`는 원본 매니페스트 의존 삭제·카탈로그 원본 열 제거, `scripts/check-slides.mjs`는 원본 대응 검사 대신 `reference-image` 메타 파일명 검사와 비교 버튼 숨김 검사로 교체, `reference/index.html` 뷰어는 `sourceImage` 없는 화면에서 원본 보기 버튼을 숨김 · 18개 컬렉션 재등록, `npm run check` 143장 통과
- 2026-10-28 · 원본 보관 중단 요청 · 원본 이미지·메모를 `out/sources/<id>/`에만 두고 저장소에는 재구성 HTML·PNG·매니페스트만 남기도록 SKILL.md·`references/manifest.md`·`source-capture.md` 수정. `source_image`를 선택 항목으로 바꾸고 `check.mjs`는 검수 시점에만 존재 확인, `register.py`는 경로 형태만 검사하며 `design/sources/` 기존 경로만 갤러리에 원본 링크 표시 · `bysu-431729` 매니페스트 원본 경로 유지본과 `source_image` 제거본 둘 다 `check.mjs` 0건, 임시 루트에서 `register.py` 등록·잘못된 경로 거부 확인

- 2026-10-28 · bysu 컬렉션 · 스킬 신설. URL 중복 확인(`scripts/register.py --check-url`), 매니페스트 규격(`references/manifest.md`), 원본 확보 가이드(`references/source-capture.md`), 컬렉션 검수(`scripts/check.mjs`), 등록(`scripts/register.py`) · 19개 작업 143장 등록, `reference/index.html` 갤러리 확인
