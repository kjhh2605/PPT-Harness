# 하네스 변경 규칙

이 저장소는 발표 자료 제작 하네스다. 덱을 만들다 스킬·에이전트·페이즈를 고치는 일이 반복되므로 다음을 지킨다.

## 배치

| 대상 | 위치 |
|---|---|
| 스킬 | `skills/<name>/SKILL.md`. 새 스킬은 `.claude/skills/`와 `.agents/skills/` 양쪽에 상대 경로 심볼릭 링크를 만든다 |
| 서브에이전트 | `.claude/agents/<name>.md`. frontmatter에 `model`·`tools`, 본문에 입력 파일·출력 경로·판정 기준·출력 JSON 형식을 둔다. SKILL.md에는 호출 지시문만 쓴다 |
| 동일 역할의 Codex 어댑터 | `.codex/agents/<name>.toml`. 기존 Claude 정의는 유지하고 Codex의 도구·모델·응답 계약만 대응한다. 실행 진입점은 `.codex/config.toml`, 계약은 `skills/gnar-slides/references/codex-runtime.md` |
| 긴 규칙·룰북 | `skills/<skill>/references/`. SKILL.md 본문은 절차와 명령만 담는다 |
| 스크립트 | 한 스킬만 쓰면 `skills/<skill>/scripts/`, 여러 스킬·덱이 쓰면 루트 `scripts/`(`slide_document.py`, `build-library.py`, `check-slides.mjs`). 레퍼런스 HTML은 생성 스크립트를 두지 않고 `reference/slides/`의 파일을 직접 편집한다 |
| 덱 전용 코드 | `decks/<deck-id>/`(`build.py`, `render.mjs`). 기준 구현은 `decks/lbt-ai-native/` |
| 임시 산출물·검토 JSON | `out/`(gitignore). 덱 작업의 기록은 `design/sources/<deck-id>/screens.md`. 레퍼런스 임포트의 원본 이미지·메모는 `out/sources/<collection-id>/`에만 두고 저장소에는 재구성 HTML·미리보기·매니페스트만 남긴다 |

## 변경 루프

덱·레퍼런스 작업 중 발견한 문제는 산출물만 고치지 않고 원인이 되는 스킬·스크립트·에이전트에 반영한다. 반영 후 같은 덱으로 다시 실행해 동작을 확인해야 완료다. 전역 플러그인·전역 스킬 파일은 수정하지 않고 프로젝트 전용 사본을 만든다.

## 페이즈·에이전트 추가

새 페이즈나 서브에이전트는 입력, 출력 경로, 모델, 기계적으로 판정 가능한 완료 조건(스크립트 종료 코드 0, `findings` 빈 배열 등)을 SKILL.md에 적는다. 정규식·스크립트로 되는 검사는 스크립트로 두고, 사람처럼 읽어야 하는 판정만 서브에이전트에 맡긴다. 서브에이전트는 판정·제안만 하고 슬라이드를 직접 고치지 않는다.

기존 검수 역할을 Codex에 대응시키는 경우에만 입력·출력·모델·완료 조건을 위 Codex 실행 문서에 둔다. 공용 SKILL.md와 Claude 정의를 변경하지 않기 위한 좁은 예외이며, 새 판정 역할·페이즈 추가에는 원래 규칙을 적용한다.

## 기록

스킬·스크립트·에이전트를 바꾸면 `skills/<skill>/CHANGELOG.md`에 날짜, 계기가 된 덱, 변경, 검증 방법을 한 줄로 남긴다. 설계 결정이 바뀌면 `PLAN.md` 5절을 갱신한다. 하네스에 들어갈 규칙은 메모리가 아니라 저장소 파일에 쓴다.

## 경계

전역 설치 금지. `reference/`(레퍼런스 라이브러리)와 `decks/`(발표 덱)를 섞지 않는다. 요청 없는 대량 변형 생성과 기존 레퍼런스 교체 금지.
