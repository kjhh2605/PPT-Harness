# Codex 실행 어댑터

이 문서는 **Codex 메인 에이전트에만** 적용한다. 기존 `gnar-slides`, `gnar-reference-import`, `gnar-deck-cleanup`의 내용·디자인·출력 규칙을 그대로 사용하되, Claude 전용 호출을 아래 계약으로 바꾼다. `.claude/`와 기존 `SKILL.md` 본문은 그대로 둔다. `.agents/skills/`의 기존 링크가 공용 스킬을 노출하므로 같은 이름의 스킬을 복제하지 않는다.

## 시작

1. 프로젝트 루트에서 해당 스킬을 읽고 다음을 실행한다. 실패하면 원인을 먼저 해결한다.

   ```sh
   python3 skills/gnar-slides/scripts/check-codex.py setup
   ```

2. `.codex/config.toml`과 두 사용자 정의 에이전트가 현재 클라이언트에 로드되었는지 확인한다. 새 설정이 보이지 않으면 프로젝트를 신뢰한 새 Codex 세션에서 시작한다. 사용자가 선택한 계정·모델·권한을 유지하며 전역 설치/설정 변경을 하지 않는다. CLI와 앱은 별도 클라이언트이므로 CLI 검증만으로 앱 로딩까지 확인했다고 보고하지 않는다.
3. Node, 프로젝트 `playwright`·`pptxgenjs`, Google Chrome, Python 3.11+, PDF 도구(`pdfinfo`, `pdftotext`, `pdftoppm`, `pdfunite`)를 확인한다. `--compare`에는 LibreOffice(`soffice`)도 필요하다. 빠진 도구는 보고하며 필수 검사를 건너뛰어 완료 처리하지 않는다.

## 실행 대응

| 공유 지침 | Codex 동작 |
|---|---|
| Agent / Sonnet / Opus | 아래 두 사용자 정의 에이전트. 모델·추론 수준은 기존 Codex 서브에이전트 선택 정책을 유지; Claude 모델 이름은 전달하지 않음 |
| Read·Write | 메인이 전체 입력을 읽어 검수자 메시지에 전달. 검수자는 도구 없이 JSON만 반환. 메인이 지정 경로에 저장 |
| 이미지 생성용 `codex exec` | 현재 세션의 이미지 생성 도구를 직접 사용. 제공되지 않으면 누락 사실과 필요한 자산을 알리고 해당 단계는 미완료로 남김. 중첩 Codex/Claude 실행을 기본 대안으로 삼지 않음 |
| 외부 링크·화면 확보 | 사용 가능한 서비스 도구 우선, 없으면 실제 사용 가능한 브라우저. 원본 확인 없이 캡처·변환을 완료했다고 하지 않음 |
| LibreOffice 전역 글꼴 링크 | 자동 실행하지 않음. 기존 환경을 확인하고 필요하면 `out/` 아래 격리된 LibreOffice 프로필 사용을 검토. 한글 비교가 불가능하면 미검증으로 보고 |

모델을 TOML에서 고정하지 않는다. 실제 선택 순서는 명시적 spawn 값 → 사용자 `[agents]` 기본값 → 부모 값이다. 기존 사용자 기본값을 덮어쓰지 않고, 확인 가능한 실제 모델을 실행 기록에 남긴다.

서브에이전트에는 `fork_turns="none"` 또는 해당 클라이언트의 독립 입력 방식을 사용한다. 제작 과정 대화 대신 검토 대상 전체 텍스트와 명시한 예외만 전달한다. 도구 이름을 추측하지 말고 클라이언트가 제공하는 서브에이전트 도구의 스키마를 따른다. 사용자 정의 역할이 없다면 일반 역할로 몰래 대체해 통과 처리하지 않는다.

## 동일 역할의 Codex 계약

기존 Claude 에이전트에 새 판정 역할을 더하지 않는다. TOML의 `source`·`source_sha256` 주석으로 원본 변경을 탐지한다. 원본이 바뀌면 규칙 차이를 검토해 포팅하고 해시를 갱신한 뒤 같은 덱으로 재검증한다. 해시만 덮어써 통과시키지 않는다.

| 역할·정의 | 입력(메시지에 전문 전달) | 모델 | 출력(메인이 저장) | 기계적 통과 조건 |
|---|---|---|---|---|
| `gnar-audience-reviewer` / `.codex/agents/gnar-audience-reviewer.toml` | `slide-text.md` 전체, 의도적 예외(장·문구·이유) | 기존 Codex 선택 정책(별도 기본값 없으면 부모 상속) | `out/decks/<id>/audience-review.json` | checked가 실제 장수와 일치, findings 빈 배열, validator 종료 0 |
| `gnar-slide-humanizer` / `.codex/agents/gnar-slide-humanizer.toml` | `slide-text.md` 전체, `references/slide-quick-rules.md` 전체, 의도적 예외·청중 검수에서 이미 다룬 문구 | 기존 Codex 선택 정책(별도 기본값 없으면 부모 상속) | `out/decks/<id>/humanize-edits.json` | checked_slides 일치, before 원문 일치, 길이·상한·self_check·룰북 검사 종료 0 |

JSON은 코드 펜스 없이 원형 그대로 저장한다. 입력 부족 `error` 응답, 도구 실패, 일부 장만 검토한 응답, 잘못된 JSON은 통과가 아니다. 모델 결과를 빈 findings로 바꾸거나 자체 판정으로 대체하지 않는다. 검수자는 슬라이드를 수정하지 않는다. 에이전트는 부모 권한을 상속하므로 “별도 읽기 전용 샌드박스”라고 주장하지 않는다.

## 덱 제작·검수

1. 공유 스킬 1–4절대로 원본·브랜드·레퍼런스를 확인하고 `decks/<id>/build.py`와 자산을 만든다. 기준 `render.mjs`를 복사할 때 **모든 하드코딩된 덱 ID·out 경로·PDF 이름**을 새 덱에 맞춘다. 검증용 사본은 프로젝트 구조 전체를 `out/` 아래에 격리하면 같은 ID를 유지할 수 있다.
2. Codex 실행 경로에서는 다음 명령을 사용한다. 내부에서 빌드 → 렌더 → 출처 검사 → 텍스트 추출을 순서대로 실행하며 하나라도 실패하면 즉시 멈춘다. 렌더러가 출처 검사까지 수행한다고 가정하지 않는다.

   ```sh
   python3 skills/gnar-slides/scripts/codex-deck.py prepare decks/<id>
   ```

   렌더 QA의 전체 장수·issues, manifest·실제 HTML 일치를 확인한 뒤 `codex-checkpoint.json`을 기록한다. 새 prepare는 이전 검수 stamp를 무효화한다.
3. `gnar-audience-reviewer`를 새로 호출하고 JSON을 저장한다. 지적을 메인이 `build.py`에서 수정한다. 추출된 한 줄이 붙어 보인다는 지적은 실제 미리보기에서 별도 칩·열·도형으로 구분되는지 먼저 확인한다. 잘못된 지적은 `design/sources/<id>/screens.md`에 장·문구·이유를 기록하고 다음 호출에 의도적 예외로 전달한다. 수정했다면 prepare부터 다시 실행한다. 최종 findings는 빈 배열이어야 한다.
4. 청중 검토 통과 뒤 `gnar-slide-humanizer`를 호출하고 JSON을 저장한다. `items_total`은 추출 파일의 본문 `  - ` 행 수다. 제목이 본문에 포함되면 개수에는 포함하지만 수정 대상은 아니다. 제안을 검토해 수락한 것은 메인이 적용하고 거절한 제안·묶음 제안의 처리 이유는 `screens.md`에 기록한다. 수치·고유명사·의미 보존은 메인이 검토한다. JSON의 자체검증만으로 의미 보존을 입증하지 않는다.
5. 변경이 있으면 prepare → 청중 검수 → 윤문을 최종 텍스트에서 다시 실행한다. 이미 처리하거나 거절한 항목은 이유와 함께 전달해 반복 제안을 막는다. 최종 JSON 두 개를 아래 명령으로 검증하고 해당 텍스트에 묶는다. 추출기의 첫 메타 행에 있는 생성 날짜만 해시에서 정규화하며, 본문의 날짜·내용·장수 변경은 여전히 검수를 무효화한다.

   ```sh
   python3 skills/gnar-slides/scripts/check-codex.py audience --text out/decks/<id>/slide-text.md --review out/decks/<id>/audience-review.json --stamp out/decks/<id>/audience-stamp.json
   python3 skills/gnar-slides/scripts/check-codex.py humanizer --text out/decks/<id>/slide-text.md --review out/decks/<id>/humanize-edits.json --stamp out/decks/<id>/humanizer-stamp.json
   ```

6. 모든 HTML 미리보기를 직접 본 뒤 내보낸다. 아래 경로는 덱 fingerprint와 최신 추출 텍스트·검수 JSON·룰북 stamp가 일치해야 실행된다.

   ```sh
   python3 skills/gnar-slides/scripts/codex-deck.py export decks/<id> --compare
   ```

   이 명령은 공용 변환기를 그대로 호출하되 `codex-pptx-compat.cjs`를 해당 Node 프로세스에만 preload한다. 색·굵기가 섞인 preformatted 텍스트의 raw newline을 명시적 줄바꿈으로 바꿔 pptxgenjs의 중복 줄바꿈을 막는다. 공용 변환기·설치 패키지를 수정하지 않고 텍스트 편집 가능성을 유지한다.

   PPTX 텍스트 누락 0건 및 모든 비교 시트의 줄바꿈·위치 확인까지 해야 완료다. `--compare` 도구가 없으면 기본 export로 편집 가능한 PPTX를 만들 수 있으나 시각 검증 미완료를 보고한다. 이미지의 차이를 검수 통과로 숨기지 않는다. 실패 시 직접 exporter를 호출해 게이트를 우회하지 않는다.
7. `screens.md`에 실행 클라이언트·모델(알 수 없으면 확인 불가), 장수, 검수 결과·예외, 윤문 처리, 시각 비교 결과를 기록한다. 기준 덱 사본 테스트도 같은 위치의 테스트용 기록에 남긴다.

## 정리와 레퍼런스 임포트

- 덱 정리는 **사용자가 정리를 요청한 경우에만** `gnar-deck-cleanup`과 함께 진행한다. 완료된 검수/내보내기를 먼저 확인한다. dry-run과 적용 모두 같은 게이트를 통과해야 한다.

  ```sh
  python3 skills/gnar-slides/scripts/codex-deck.py cleanup decks/<id>
  python3 skills/gnar-slides/scripts/codex-deck.py cleanup decks/<id> --apply
  ```

  삭제 목록을 확인하고 핵심 검증 결과를 `screens.md`에 남긴 뒤 적용한다. 이미 명시적인 정리 요청이 있으면 재승인을 요구하지 않는다. `out/decks/<id>/` 검토 JSON도 삭제되므로 정리 후 재작업 시 prepare부터 다시 검수한다. 빌더는 기본 보존한다. 원본 렌더를 유지하려면 `--keep-sources`, 사용자가 재생성 불필요한 전달용 사본을 명시한 경우에만 `--strip-build`를 추가한다.
- 레퍼런스 추가는 기존 `gnar-reference-import`의 중복 검사 → 원본 확보 → 변환 → 전용 검사 → 등록을 그대로 따른다. 덱 게이트를 레퍼런스에 적용하지 않는다. 기존 레퍼런스 교체·대량 변형 생성은 별도 요청 없이는 하지 않는다.

## 검증 근거

- OpenAI 공식 문서: [skills](https://developers.openai.com/codex/skills), [project config](https://developers.openai.com/codex/config-basic), [custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- 실제 적용 여부는 새 Codex 세션의 스킬 선택·두 역할 호출 및 JSON 검증으로 확인한다. 파일 존재/TOML 파싱만으로 연동 성공이라 보고하지 않는다.
