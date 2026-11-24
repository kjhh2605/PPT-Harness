---
name: gnar-reference-import
description: "사용자가 링크 속 PPT·슬라이드·화면 예시를 우리 컬러 팔레트로 변환해 Gnar-PPT의 HTML 레퍼런스로 추가해 달라고 할 때 사용한다. 원본 화면을 분석하고 브랜드 색을 적용해 개별 HTML, 미리보기, 출처와 카탈로그 항목을 추가한다."
---

# 링크를 Gnar HTML 레퍼런스로 추가

이 스킬은 **Gnar-PPT 프로젝트 전용**이다. 링크에 실제로 있는 화면을 우리 디자인 시스템으로 재구성한 HTML을 기존 레퍼런스에 더한다. 저장소에 남기는 산출물은 **재구성한 HTML·미리보기 PNG·매니페스트·카탈로그 항목**뿐이다. 원본 이미지와 분석 메모는 작업 중에만 `out/`에 두고 저장소에 보관하지 않는다. 새 레이아웃을 대량으로 창작하거나 기존 라이브러리를 교체하는 작업으로 확대하지 않는다.

## 프로젝트 기준

현재 작업 폴더 또는 상위 폴더에서 `design/palettes/brand.json`과 `reference/`가 있는 프로젝트 루트를 찾는다. 없으면 프로젝트 위치를 확인한다. 모든 산출물과 도구 설치는 프로젝트 안에 둔다.

처음에 다음만 읽는다.

- `design/design.md`: 색상 운용 규칙의 기준.
- `design/palettes/brand.json`, `design/tokens.css`: **현재 확정 팔레트**. 값을 스킬에 고정하거나 과거 값으로 덮어쓰지 않는다.
- `reference/catalog.md`: 기존 자료와 중복 확인.
- `scripts/slide_document.py`: 독립 HTML 문서·인쇄·뷰포트 축소 코드.

입력이 링크와 “우리 컬러로 변환해서 추가” 정도라면 바로 진행한다. 원본 화면 수와 프로젝트 팔레트는 직접 확인할 수 있으므로 다시 묻지 않는다.

## 원본 확보와 화면 정리

1. 입력 URL의 기존 등록 여부를 읽기 전용으로 확인한다.

   ```sh
   python3 skills/gnar-reference-import/scripts/register.py --check-url 'SOURCE_URL'
   ```

   이미 같은 자료가 있으면 기존 결과를 안내한다. 재변환·수정 요청이 명시된 경우에는 해당 파일을 갱신하고 중복 사본을 만들지 않는다.
2. 해당 서비스의 도구가 있으면 먼저 사용하고, 없으면 공개 페이지 또는 사용 가능한 브라우저로 이미지·본문을 확인한다. 동적 페이지나 긴 합성 이미지일 때만 [원본 확보 가이드](references/source-capture.md)를 읽는다.
3. 실제 슬라이드, 홍보용 목업 보드, 중복·확대 이미지를 구분한다. **보드 이미지 수를 슬라이드 수로 간주하지 않는다.** 화면별 이미지를 직접 보고 순서·문구·정렬·크기·여백·시각 요소를 기록한다.
4. 내려받은 원본 이미지와 분석 메모는 `out/sources/<collection-id>/`(gitignore)에만 둔다. 작업 중 참고용 `screens.md`를 같은 폴더에 써도 되지만 `design/sources/`나 `reference/`로 옮기지 않는다. 제외한 보드와 이유, 잘 보이지 않는 부분은 매니페스트의 `summary`·`source_note`에 남긴다. 접근할 수 없는 화면을 추측해서 “변환 완료”로 처리하지 않는다.

## HTML 변환

- **실제 화면 하나당 독립 HTML 하나**를 만든다. 원본의 구조·문구·정보 위계·배치·여백·비율을 최대한 보존하고 색을 현재 브랜드 토큰으로 바꾼다. 레이아웃 변형은 사용자가 별도로 요청한 경우만 만든다.
- 기본 캔버스는 1920×1080이고, 브라우저 크기에 맞춰 비율을 유지하며 축소한다. 원본이 명백한 세로 문서나 웹페이지이면 임의로 잘라 슬라이드라 부르지 말고 변환 단위를 먼저 판단한다. 다른 비율이 꼭 필요한 자료는 현재 16:9 검수 도구를 그대로 통과시켰다고 보고하지 않는다.
- CSS·SVG·축소 JS는 각 HTML에 포함한다. 텍스트와 차트는 편집 가능한 HTML/SVG로 구현한다. **원본 전체 슬라이드 이미지를 배경으로 깔아 완성하지 않는다.** 사진·제품 이미지처럼 본래 이미지인 부분만 이미지 자산을 사용한다.
- Pretendard, 제목 48~88px, 본문 28px 이상, 캡션 20px 이상을 기준으로 원본 비율을 맞춘다. 색상 규칙과 충돌하면 원본 효과를 최소한으로 바꾸고 변경 이유를 기록한다. 예: 그라데이션 입체 도형 → 같은 배치의 단색 SVG.
- 토큰 밖 색과 그라데이션은 쓰지 않는다. 핵심 강조 하나만 `hero`, 나머지 글자는 `text/ink/muted`, 보조 면은 `surface/tint/border`를 사용한다. 다크 원본은 브랜드의 다크 토큰을 적용한다.
- 기존 `slide_document.py`를 재사용할 수 있다. `source_url`에 실제 입력 URL을 넘겨 `meta name="source"`를 채운다. `reference-image` 메타에는 원본 이미지 **파일명만**(예: `slide-03.webp`) 남긴다. 원본 파일 자체는 저장소에 넣지 않으므로 경로를 적지 않는다.
- `S-<collection-id>-01.html`처럼 충돌하지 않는 ID를 사용하고 기존 파일을 덮어쓰지 않는다. 여러 화면을 병렬 구현할 때는 공통 규격을 먼저 전달하고 각 작업자에게 서로 다른 파일을 배정한다.

## 검수하고 기존 목록에 추가

등록 전에 [매니페스트 규격](references/manifest.md)을 읽고 `reference/imports/<collection-id>/manifest.json`을 만든다. 모든 경로는 프로젝트 루트 기준이다.

```sh
node skills/gnar-reference-import/scripts/check.mjs --manifest reference/imports/COLLECTION/manifest.json
```

이 명령은 새 컬렉션만 검사하고 미리보기를 만든다. `npm run check`는 등록된 라이브러리 전체를 다시 렌더하므로 등록 전 새 컬렉션 검수에는 쓰지 않는다. 자동 검수 후 **`out/sources/`의 원본과 렌더 이미지를 직접 비교**하여 줄바꿈·간격·도형·강조를 확인하고 문제가 있으면 수정한다. 썸네일 중복 같은 캡처 결함과 HTML 결함을 구분한다. 매니페스트에 `source_image`를 적었다면 검수 시점에는 그 파일이 `out/sources/`에 있어야 하지만, 등록 뒤에는 지워도 된다.

완성된 자료만 등록한다.

```sh
python3 skills/gnar-reference-import/scripts/register.py --manifest reference/imports/COLLECTION/manifest.json
```

등록기는 새 컬렉션의 미리보기 HTML을 만들고 `reference/index.html`과 `reference/catalog.md`의 전용 블록에 링크·항목을 추가한다. 기존 토스 14장과 기존 본문은 유지한다. 같은 매니페스트의 재등록은 링크를 중복시키지 않는다.

마지막으로 생성한 컬렉션 미리보기와 개별 HTML을 열어 확인한다. 사용자에게 추가한 화면 수, 미리보기 링크, 원본 대비 필요한 변경만 짧게 알린다. `out/sources/<collection-id>/`는 정리 대상이며 저장소에 커밋하지 않는다. 로컬 파일 제작 요청을 공개 게시·업로드로 확대하지 않는다.
