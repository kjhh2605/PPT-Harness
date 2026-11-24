# gnar-slides 변경 기록

형식: 날짜 · 계기 · 변경 · 검증. 최신이 위.

- 2026-11-24 · stology-seminar(소개 영상 장 추가) · `scripts/html-to-pptx.mjs`에 `<video>` → `addMedia` 변환 추가(표지는 포스터 렌더 PNG), SKILL.md 6절에 영상 변환과 컨트롤 표시 규칙 한 줄 · 같은 덱 11장 변환 종료 코드 0, PPTX에 `media-4-1.mp4`·video 관계 포함 확인, 비교 시트 3장 확인
- 2026-11-24 · stology-seminar · 사용자 피드백(정보 문구는 `~함`·명사형, 핵심 메시지는 구어체 혼용)으로 `references/slide-quick-rules.md` v1.1에 S-9 역할별 종결 추가, S-6의 덱 고정 문구 제거, SKILL.md 4절에 종결 규칙 한 줄 · 같은 덱 문구 17곳 수정 후 `render.mjs` 0건, `gnar-slide-humanizer` 재실행으로 S-9 위반 확인
- 2026-10-29 · 저장소 정리(두 세션 합의) · `render.mjs` 주석의 사라진 `references/audience-review.md` 참조를 `.claude/agents/gnar-audience-reviewer.md`로 정정, `design/design.md` 2~5절(타이포·그리드·컴포넌트·금지)을 SKILL.md 4절과 레퍼런스 계약서에 흩어져 있던 규칙으로 채움, PLAN.md를 현재 구조로 갱신 · `check-codex.py setup` 통과, lbt-ai-native 재빌드·렌더 issues 0 확인
- 2026-10-29 · lbt-ai-native의 Codex 병행 실행 · Claude/공용 SKILL 보존, `.codex/` 설정·검수 역할 2개와 `references/codex-runtime.md`, `check-codex.py`·`codex-deck.py`·`codex-pptx-compat.cjs` 추가(원본 정의 해시·JSON 계약·날짜 정규화 stamp·내보내기/정리 게이트·styled pre 줄바꿈 보정), 인라인 칩 추출 오인 시 화면 확인 절차 반영 · 새 CLI 세션의 실제 역할 호출·자연어 스킬 선택, 계약 27건·실패/정상 게이트 12건·줄바꿈 6건 통과; 격리 35장 덱 렌더·출처·청중 검수 통과, PPTX 누락 0·비교 시트 7개 확인·정리 후 참조 0건, 원본 567개 보존(상세: `design/sources/codex-harness/screens.md`)

- 2026-10-28 · lbt-ai-native · `scripts/html-to-pptx.mjs` 추가(텍스트 상자·도형·SVG+PNG 대체·래스터 분류, 텍스트 누락 검사, `--compare` 비교 시트), 6절 PPTX 내보내기 신설, pptxgenjs devDependency 추가 · 35장 변환 종료 코드 0, 비교 시트 7장 전부 확인, LibreOffice 프로필 글꼴 링크로 한글 렌더 확인
- 2026-10-28 · lbt-ai-native · `gnar-slide-humanizer` 에이전트(`.claude/agents/`)와 슬라이드용 슬림 룰북 `references/slide-quick-rules.md` 추가, 5절에 문장 다듬기 단계 신설 · `out/decks/lbt-ai-native/humanize-edits.json` 적용 후 재빌드, `gnar-audience-reviewer` 재검토 통과
- 2026-10-28 · lbt-ai-native · 청중 관점 검토 프롬프트를 `references/audience-review.md`에서 `.claude/agents/gnar-audience-reviewer.md`(Sonnet)로 이동 · 같은 덱 pass1·pass2 검토 후 `audience-review.json` findings 0건
- 2026-10-28 · lbt-ai-native · 청중용 출처만 남기는 규칙 추가, `scripts/audit-sources.mjs`(제작용 근거·내부 쪽수·작업 메모 검사)와 `scripts/extract-text.mjs`(장별 텍스트 추출) 추가, `render.mjs` 마지막에 출처 검사 자동 실행 · 같은 덱에서 `source-audit.json` 0건
- 2026-10-28 · lbt-ai-native · 스킬 신설. 원본 확보·허용 범위·자산(Codex `image_gen`)·빌드·검수·기록 6단계 · 31장 PDF를 35장 HTML·PDF로 재구성해 렌더 검수 통과
