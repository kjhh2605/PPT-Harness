# Gnar-PPT 하네스 계획

> 목표: `design.md`(스타일 사양) → 레퍼런스 HTML 라이브러리(자산) → 스킬·서브에이전트(절차) 순으로 쌓아,
> 발표 원고와 원본 자료만 주면 일관된 HTML 슬라이드·PDF·PPTX가 적은 토큰으로 나오는 구조를 만든다.
> 모든 작업은 이 저장소 안에서만 진행한다. **전역 설치는 하지 않는다** (`~/.claude/skills`, 전역 pip/npm, 시스템 폰트 설치 모두 제외).
> 작업 규칙 전문은 `AGENTS.md`, 스킬별 변경 기록은 `skills/<skill>/CHANGELOG.md`.

---

## 0. 설계 원칙

| 원칙 | 이유 |
|---|---|
| 스타일과 내용을 분리 | 스타일은 토큰·레퍼런스로 고정, 모델은 내용 배치만 담당 → 토큰 절감·일관성 |
| 레퍼런스는 "복사해서 쓰는" 수준으로 구체적 | 모델이 CSS를 새로 짜지 않고 가까운 화면을 골라 내용만 바꾼다 |
| 한 장 = 한 메시지 | 장별 검수를 자동화하려면 구조가 단순해야 한다 |
| 검수를 스킬에 내장 | 글자 크기·브랜드 색·넘침은 스크립트가, 사람처럼 읽어야 하는 판정만 서브에이전트가 한다 |
| 프로젝트 로컬 전용 | 스킬은 `skills/`에 두고 `.claude/skills/`·`.agents/skills/`로 링크, 파이썬은 `.venv/`, 노드는 `node_modules/`, 폰트는 CDN 링크 |

---

## 1. 디렉터리 구조 (현재)

```
Gnar-PPT/
├── AGENTS.md                  # 하네스 변경 규칙
├── PLAN.md
├── README.md
├── design/
│   ├── design.md              # 스타일 SSOT: 색·타이포·그리드·컴포넌트·금지 규칙
│   ├── tokens.css             # 토큰의 CSS 사본 (모든 슬라이드가 인라인으로 포함)
│   ├── palettes/brand.json    # 확정 팔레트 원천 데이터 (indigo-sets.json은 후보 기록)
│   ├── scripts/ladder.py      # 색상(H) 교체 시 토큰 재생성 (faded.py는 계산 모듈)
│   └── sources/<deck-id>/     # 덱별 원본 분석·변경 기록 (screens.md)
├── reference/                 # 레퍼런스 라이브러리. 덱과 섞지 않는다
│   ├── index.html             # 갤러리 뷰어 (file:// 동작)
│   ├── library.json           # 전체 목록 (build-library.py 생성)
│   ├── catalog.md             # 토스 14장 상세 카탈로그
│   ├── bysu-catalog.md        # 작업별 전체 HTML 목록 (생성)
│   ├── slides/                # 1920×1080 독립 HTML 143장
│   ├── previews/              # 960×540 PNG
│   ├── collections/           # 작업별 메타데이터
│   └── imports/<id>/          # 임포트 매니페스트·컬렉션 미리보기
├── decks/<deck-id>/           # 발표 덱: build.py, render.mjs, slides/, previews/, index.html, PDF, PPTX
├── skills/
│   ├── gnar-slides/           # 덱 제작·검수·PPTX 내보내기
│   ├── gnar-reference-import/ # 링크 → 레퍼런스 추가
│   └── gnar-deck-cleanup/     # 결과물만 남기는 정리
├── .claude/agents/            # gnar-audience-reviewer, gnar-slide-humanizer
├── .codex/                    # Codex 어댑터 (config.toml, agents/*.toml)
├── scripts/                   # 공용: slide_document.py, build-library.py, check-slides.mjs
└── out/                       # 검수 JSON·임시 산출물 (gitignore)
```

---

## 2. 단계와 상태

| 단계 | 산출물 | 상태 |
|---|---|---|
| P1 design.md | `design/design.md`, `tokens.css`, `brand.json` | 완료. 색 확정(2026-10-28), 타이포·그리드·컴포넌트·금지 규칙은 덱 제작 경험으로 채움 |
| P2 레퍼런스 | `reference/slides/` 143장 + 갤러리·카탈로그 | 완료. 커버리지 매트릭스 대신 bysu 공개 작업 19개를 임포트하는 방식으로 전환 |
| P3 스킬 | `skills/` 3종, 서브에이전트 2종, Codex 어댑터 | 완료. `decks/lbt-ai-native/` 35장으로 e2e 검증 |
| P4 볼트 연계 | `vault/` 노트 | 보류 |

### 변경 루프

덱·레퍼런스 작업 중 발견한 문제는 산출물만 고치지 않고 원인이 되는 스킬·스크립트·에이전트에 반영하고, 같은 덱으로 다시 실행해 확인한다. 자세한 규칙은 `AGENTS.md`.

---

## 3. 다음 할 일

1. 두 번째 덱을 `gnar-slides`로 만들어 `decks/lbt-ai-native/` 기준 구현에 묶인 가정(헤더·각주 위치, `render.mjs`의 고정 경로)을 일반화한다.
2. 레퍼런스에서 가까운 화면을 고르는 기준을 `gnar-slides` SKILL.md에 명시한다. 지금은 기준 덱 복사에서 시작한다.
3. Phase 4 볼트 연계는 덱이 2개 이상 쌓인 뒤 다시 판단한다.

## 4. 확정된 결정 사항

- **최종 포맷**: HTML 슬라이드 + **PPTX 필수**. 따라서 차트는 PPTX 변환 친화적인 **인라인 SVG** 우선.
- **레퍼런스 사용 방식**: 모양·배치·슬라이드 구조는 레퍼런스에서 그대로 차용, **색상만 브랜드 컬러로 교체**. → 레퍼런스 HTML은 색을 전부 CSS 변수로만 쓴다.
- **브랜드 컬러 운용 방식**: 발표마다 색상(H)은 바꿀 수 있고 명도(L)·채도(C)는 design.md에 고정한다. 바랜(faded) 톤 유지가 브랜드 정체성.
  - **확정 (2026-10-28)**: **Deep Indigo Ink** (H 283, hero C 0.14). 무채 베이스·갈색·토프 포함 전체 토큰은 `design/palettes/brand.json`, `design/tokens.css`, `design/design.md` 1장. 선정 당시 후보는 `design/palettes/indigo-sets.json`의 3번.
  - 구조: 색상 하나에 ink/hero/support/tint 4단계. 생성기 `design/scripts/ladder.py`(계산 모듈 `faded.py`). 색 실험용 후보 파일은 2026-10-29에 정리했다.

- **하네스 구조 (2026-10-28)**: 발표 덱은 `decks/<deck-id>/`에 빌더·뷰어·PDF를 함께 둔다. 스킬은 `skills/`에 두고 `.claude/skills/`·`.agents/skills/` 양쪽에 링크한다. 서브에이전트는 `.claude/agents/<name>.md`, 스킬별 변경 기록은 `skills/<skill>/CHANGELOG.md`. 규칙 전문은 `AGENTS.md` "하네스 변경 규칙".
- **검수 체인 (2026-10-28)**: 렌더 검수(`render.mjs`) → 출처 검사(`audit-sources.mjs` 0건) → 청중 관점 검토(`gnar-audience-reviewer`, Sonnet, findings 빈 배열) → 문장 다듬기(`gnar-slide-humanizer` 제안 적용 후 재검토). Phase 4 볼트 연계는 보류.
- **PPTX 내보내기 (2026-10-28)**: 전역 `pptx` 스킬(html2pptx)에 위임하지 않고 프로젝트 전용 `skills/gnar-slides/scripts/html-to-pptx.mjs`(Playwright + pptxgenjs)로 변환한다. 이유: html2pptx는 `<p>`·`<h*>` 밖의 텍스트를 버리고 웹 안전 글꼴만 허용해 레퍼런스 HTML 구조와 맞지 않는다. 슬라이드 크기 20×11.25in으로 1px=1/96in을 유지하고, 텍스트는 텍스트 상자, 배경 상자는 도형, SVG는 SVG+PNG 대체, 자르기·마스크·그라디언트만 PNG로 넣는다. 완료 조건은 텍스트 누락 0건 + `--compare` 시트 육안 확인.
- **덱 마무리 정리 (2026-10-28)**: `gnar-deck-cleanup` 스킬이 결과물(HTML·PDF·PPTX)만 남기고 `out/`·원본 렌더·미참조 자산·제작용 `<meta>`를 지운다. `build.py`·`render.mjs`·`deck.json`은 변경 루프 재실행을 위해 기본 보존(`--strip-build`로만 제거).
- **레퍼런스 원본 보관 중단 (2026-10-28)**: 원본 이미지·조사 메모는 `out/sources/<id>/`에만 두고 저장소에는 재구성 HTML·미리보기·매니페스트만 남긴다. 레퍼런스 생성 스크립트(`scripts/generate-*.py`, `scripts/imports/`)와 분석 노트(`reference/notes/`)는 원본이 없어 재실행할 수 없으므로 2026-10-29에 제거했다. 레퍼런스 HTML은 파일을 직접 편집한다.

- **Codex 병행 실행 (2026-10-29)**: 공용 `SKILL.md`, `.claude/`, 기존 덱·레퍼런스는 유지한다. `.agents/skills/` 링크를 재사용하고 `.codex/config.toml`·`.codex/agents/*.toml`로 동일 검수 역할을 대응한다. Codex 검수자는 기존 모델·추론 선택 정책을 유지하고(별도 서브에이전트 기본값 없으면 부모 상속) 입력 전문만 받아 JSON을 반환하며, 저장·수정은 메인이 담당한다. 입력·출력·모델·완료 조건은 `skills/gnar-slides/references/codex-runtime.md`에 명시하는 좁은 배치 예외를 둔다. `check-codex.py`로 원본 정의 해시·검수 JSON·최신 입력을 검증하고, `codex-deck.py`로 빌드→렌더→출처→추출→검수 stamp 확인→내보내기/정리를 연결한다. 실패·변경 후 오래된 검수는 후속 단계를 차단한다. Codex 내보내기에만 `codex-pptx-compat.cjs`를 preload해 styled pre 텍스트의 중복 줄바꿈을 정규화한다. 공용 변환기와 패키지는 유지한다. 전역 설정·인증은 변경하지 않는다.
