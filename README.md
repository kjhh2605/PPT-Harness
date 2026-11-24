# Gnar PPT · 발표 자료 제작 하네스

발표 원고·기존 PPT·PDF를 Gnar의 **Deep Indigo Ink** 디자인 시스템으로 재구성해 장별 1920×1080 HTML, PDF, 편집 가능한 PPTX를 만드는 저장소입니다. 스타일 사양(`design/`), 레퍼런스 HTML 라이브러리(`reference/`), 제작·검수 스킬(`skills/`)과 서브에이전트(`.claude/agents/`)로 구성됩니다. 작업 규칙은 [`AGENTS.md`](AGENTS.md), 설계 결정은 [`PLAN.md`](PLAN.md)에 있습니다.

## 덱 만들기

Claude Code에서 이 프로젝트를 열고 자연어로 요청합니다.

```text
이 PDF를 Gnar 디자인의 발표 덱으로 재구성해줘.
```

- `gnar-slides`: 원본 분석 → 장별 HTML·PDF 빌드 → 렌더 검수 → 출처 검사 → 청중 관점 검토(`gnar-audience-reviewer`) → 문장 다듬기(`gnar-slide-humanizer`) → PPTX 내보내기. 절차는 [`skills/gnar-slides/SKILL.md`](skills/gnar-slides/SKILL.md).
- `gnar-reference-import`: 링크 속 화면을 브랜드 팔레트의 HTML 레퍼런스로 추가.
- `gnar-deck-cleanup`: 검수가 끝난 덱에서 결과물만 남기고 정리.

결과물은 `decks/<deck-id>/`에 둡니다. 레퍼런스 라이브러리(`reference/`)와 섞지 않습니다.

- [`decks/lbt-ai-native/`](decks/lbt-ai-native/README.md): LBT AI 활용 강의 31장을 재구성하고 사용 사례·참고 자료를 더한 35장 덱. 기준 구현이며 새 덱은 이 폴더의 `build.py`·`render.mjs`를 복사해 시작합니다.

### Codex에서 만들기

이 저장소를 Codex에서 프로젝트로 열고 다음처럼 요청합니다.

```text
$gnar-slides로 이 자료를 Gnar 디자인의 발표 덱으로 만들어줘.
```

`.agents/skills/`는 Claude와 같은 공용 스킬을 가리킵니다. Codex는 `.codex/config.toml`과 `.codex/agents/`를 추가로 사용하며, 기존 `.claude/`와 공용 `SKILL.md` 본문은 유지합니다. 모델은 기존 Codex 서브에이전트 설정을 따르며 별도 기본값이 없으면 현재 세션의 선택을 상속합니다. 새 설정이 나타나지 않으면 프로젝트를 신뢰한 새 세션에서 시작합니다. 별도 API 키나 전역 스킬 설치는 필요 없습니다.

```sh
python3 skills/gnar-slides/scripts/check-codex.py setup
```

이 명령은 링크·설정·원본 정의의 변경 여부를 확인합니다. 실제 제작은 [Codex 실행 절차](skills/gnar-slides/references/codex-runtime.md)를 따르며, 검수자는 JSON만 반환하고 메인이 결과를 저장·검증합니다. 검수 실패 또는 오래된 결과가 있으면 Codex 전용 내보내기·정리 명령이 중단됩니다. `out/`의 검사 JSON은 정리 전까지 보존합니다.

## 디자인 시스템

- [`design/design.md`](design/design.md): 색·타이포·그리드·컴포넌트·금지 규칙의 단일 진실 원천.
- `design/palettes/brand.json`, `design/tokens.css`: 확정 토큰. 색상(H)을 바꿀 때는 `design/scripts/ladder.py`로 다시 생성합니다.

## 레퍼런스 라이브러리

[전체 갤러리](reference/index.html) · [작업별 페이지 카탈로그](reference/bysu-catalog.md) · [토스 14장 상세](reference/catalog.md)

<!-- library-summary:start -->
**19개 작업 · HTML 143장**이 등록되어 있습니다. 기존 토스 14장이 포함됩니다.
<!-- library-summary:end -->

[bysu의 공개 PPT 작업](https://notefolio.net/bysu.ppt)과 작가 블로그에 공개된 개별 페이지의 배치·정보 구조를 Deep Indigo Ink로 재구성한 화면입니다. 모두 1920×1080 독립 HTML이며 텍스트·도형·차트를 HTML/CSS/SVG로 편집할 수 있습니다. 덱을 만들 때 가까운 화면을 골라 내용만 바꾸는 용도입니다.

`reference/index.html`을 브라우저에서 직접 열거나 로컬 서버를 실행합니다.

```sh
npm run preview        # http://127.0.0.1:4173/reference/index.html
```

- 템플릿, 배경 톤, 제목·구성 검색을 함께 적용할 수 있고, 발표·좌우 탐색은 현재 필터에 포함된 화면만 순서대로 표시합니다.
- `HTML ↗` 링크로 개별 파일을 엽니다. `←`·`→`, `Home`·`End`, `F` 전체 화면, `Esc` 닫기를 지원합니다.
- 원본 이미지에 일부만 보이는 페이지는 뷰어에 **일부 원본 복원**으로 표시합니다.

### 갱신과 검수

```sh
npm install
npm run build:library                 # library.json, bysu-catalog.md, README 요약 갱신
npm run check                         # 카탈로그 갱신 + Chrome 렌더 검수 + 미리보기 생성
npm run check -- --collection 452912  # 특정 작업만
npm run check:original                # 토스 14장만
```

`check`는 출처 메타, 등록된 페이지 수, 브랜드 색상, 글자·캔버스 넘침, 노트북·모바일 축소, 갤러리 필터·탐색을 검사하고 결과를 `out/qa/`에 저장합니다. `--collection`은 숫자 ID와 `bysu-452912` 형식을 모두 받고, `--jobs`는 1–8(기본 4), `--skip-gallery`는 개별 슬라이드만 검수합니다.

## 파일 구성

- `reference/slides/`: 독립 HTML. `reference/previews/`: 960×540 미리보기. `reference/collections/`: 작업별 메타데이터. `reference/library.json`: 전체 목록. `reference/imports/<id>/`: 임포트 매니페스트와 컬렉션 미리보기.
- 원본 이미지는 저장소에 두지 않습니다. 변환 중에만 `out/sources/<collection-id>/`에 내려받고 재구성 HTML·미리보기·메타데이터만 남깁니다. 레퍼런스 HTML은 파일을 직접 편집합니다.
- `scripts/slide_document.py`: 독립 HTML 문서·인쇄·뷰포트 축소 헬퍼. `scripts/build-library.py`: 카탈로그·갤러리 데이터 갱신. `scripts/check-slides.mjs`: 레퍼런스 렌더 검수.
- `skills/<skill>/`: SKILL.md, `scripts/`, `references/`, `CHANGELOG.md`. `skills/gnar-slides/scripts/html-to-pptx.mjs`는 덱 HTML을 편집 가능한 PPTX로 바꿉니다.
- `design/sources/<deck-id>/screens.md`: 덱별 원본 분석과 변경 기록.

슬라이드마다 CSS·SVG·화면 축소 코드가 포함됩니다. Pretendard 폰트는 CDN에서 불러오며 오프라인에서는 시스템 한글 글꼴을 사용합니다. 브라우저 인쇄에서는 16:9 한 장으로 출력됩니다.

## 레퍼런스 출처와 범위

기준 링크는 [인플루언서 마케팅 서비스 회사소개서](https://notefolio.net/bysu.ppt/452912)이며, 작가의 다른 공개 PPT 작업도 같은 방식으로 조사했습니다. **노트폴리오와 작가 블로그에 공개된 페이지**가 대상이며, 비공개이거나 비밀번호가 필요한 PPTX 내부 페이지는 확인하지 않았습니다. 원본 배치와 정보 구조를 참고하고 색상을 브랜드 토큰으로 치환했으며, 사진·입체 그래픽·장식은 편집 가능한 도형으로 단순화했습니다. 화면의 숫자와 문구는 레이아웃 참고용 예시이며 실제 현황을 주장하는 데이터가 아닙니다.
