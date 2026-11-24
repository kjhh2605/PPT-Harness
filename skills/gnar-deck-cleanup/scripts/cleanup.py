#!/usr/bin/env python3
"""덱 제작이 끝난 뒤 결과물(HTML·PDF·PPTX)만 남기고 제작 과정 파일을 지운다.

사용법:
  python3 skills/gnar-deck-cleanup/scripts/cleanup.py decks/<deck-id>            # 계획만 출력(dry-run)
  python3 skills/gnar-deck-cleanup/scripts/cleanup.py decks/<deck-id> --apply    # 실제 삭제
  옵션:
    --strip-build   build.py · render.mjs · deck.json 도 지운다(재생성 불가, 전달용 사본에만).
    --keep-sources  design/sources/<deck-id>/ 의 렌더 산출물을 남긴다.
    --allow-missing PPTX·PDF 가 없어도 진행한다.

남기는 것: slides/*.html, index.html, deck.js(제작 메모·원본 경로 제거), previews/(뷰어 썸네일), 참조되는 assets/,
          README.md, *.pdf, *.pptx, design/sources/<deck-id>/*.md, 원본 문서(*.pdf·*.pptx·*.key).
지우는 것: out/decks/<deck-id>/, design/sources/<deck-id>/ 의 pdf-pages·pptx-media·시트 PNG·text.txt,
          참조되지 않는 assets/·previews/ 파일, .DS_Store, __pycache__, 슬라이드 HTML의 제작용 <meta> 두 줄.
종료 코드: 0 = 완료(검증 통과), 1 = 검증 실패, 2 = 입력 오류.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE_JUNK_DIRS = {'pdf-pages', 'pptx-media', 'pdf-text', 'frames'}
SOURCE_JUNK_FILES = re.compile(r'^(sheet-\d+\.png|.*-sheet\.png|page-\d+\.png|text\.txt|.*\.txt)$')
SOURCE_KEEP = re.compile(r'\.(md|pdf|pptx|key)$', re.I)
BUILD_FILES = ['build.py', 'render.mjs', 'deck.json']
META_RE = re.compile(r'^\s*<meta name="(source|reference-image)" content="[^"]*">\s*\n', re.M)
REF_RE = re.compile(r'''(?:src|href)\s*=\s*["']([^"'#?]+)|url\(\s*["']?([^"'#)]+)''')


def human(n: int) -> str:
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024:
            return f'{n:.0f}{unit}'
        n /= 1024
    return f'{n:.1f}TB'


def size_of(p: Path) -> int:
    if p.is_file():
        return p.stat().st_size
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file())


def local_refs(html: Path) -> set[Path]:
    refs = set()
    for m in REF_RE.finditer(html.read_text(encoding='utf-8')):
        ref = m.group(1) or m.group(2)
        # 외부 URL, 페이지 내 앵커, 뷰어 스크립트의 템플릿 문자열은 제외
        if not ref or re.match(r'^[a-z]+:', ref) or ref.startswith('//') or ref.startswith('#') or '${' in ref:
            continue
        refs.add((html.parent / ref).resolve())
    return refs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('deck')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--strip-build', action='store_true')
    ap.add_argument('--keep-sources', action='store_true')
    ap.add_argument('--allow-missing', action='store_true')
    a = ap.parse_args()

    deck = (ROOT / a.deck).resolve()
    if not deck.is_dir() or not (deck / 'slides').is_dir():
        print(f'덱 폴더가 아닙니다: {deck}', file=sys.stderr)
        return 2
    deck_id = deck.name
    out_dir = ROOT / 'out/decks' / deck_id
    src_dir = ROOT / 'design/sources' / deck_id

    # 결과물 확인
    slides = sorted((deck / 'slides').glob('*.html'))
    pdfs = sorted(deck.glob('*.pdf'))
    pptxs = sorted(deck.glob('*.pptx'))
    problems = []
    if not slides:
        problems.append('slides/*.html 이 없습니다')
    if not pdfs:
        problems.append('PDF가 없습니다 (node decks/<id>/render.mjs)')
    if not pptxs:
        problems.append('PPTX가 없습니다 (node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<id>)')
    if problems and not a.allow_missing:
        for p in problems:
            print('결과물 누락:', p, file=sys.stderr)
        return 2

    # 참조 집합: 슬라이드·뷰어·deck.js 가 가리키는 파일
    referenced: set[Path] = set()
    for html in slides + [deck / 'index.html']:
        if html.exists():
            referenced |= local_refs(html)
    deck_js = deck / 'deck.js'
    deck_json = deck / 'deck.json'
    manifest = None
    for mf in (deck_json, deck_js):
        if mf.exists():
            text = mf.read_text(encoding='utf-8')
            text = re.sub(r'^window\.__deck\s*=\s*', '', text).rstrip().rstrip(';')
            try:
                manifest = json.loads(text)
                break
            except json.JSONDecodeError:
                continue
    if manifest:
        for s in manifest.get('slides', []):
            for key in ('file', 'preview'):
                if s.get(key):
                    referenced.add((deck / s[key]).resolve())

    remove: list[Path] = []
    # 1. out/decks/<id>
    if out_dir.exists():
        remove.append(out_dir)
    # 2. design/sources/<id> 렌더 산출물
    if src_dir.exists() and not a.keep_sources:
        for p in sorted(src_dir.iterdir()):
            if p.is_dir() and p.name in SOURCE_JUNK_DIRS:
                remove.append(p)
            elif p.is_file() and not SOURCE_KEEP.search(p.name) and SOURCE_JUNK_FILES.match(p.name):
                remove.append(p)
    # 3. 덱 폴더: 캐시·참조되지 않는 자산·미리보기
    for p in deck.rglob('*'):
        if p.name == '.DS_Store' or p.name == '__pycache__' or p.suffix in ('.pyc', '.pyo'):
            remove.append(p)
    for sub in ('assets', 'previews'):
        d = deck / sub
        if d.is_dir():
            for f in sorted(d.rglob('*')):
                if f.is_file() and f.resolve() not in referenced and f.name != '.DS_Store':
                    remove.append(f)
    # 4. 빌드 소스
    if a.strip_build:
        for name in BUILD_FILES:
            if (deck / name).exists():
                remove.append(deck / name)
    remove = sorted(set(remove), key=lambda p: str(p))
    # 상위가 지워지면 하위는 생략
    pruned = [p for p in remove if not any(q != p and q in p.parents for q in remove)]

    # 파일 안 제작 흔적
    meta_hits = [h for h in slides if META_RE.search(h.read_text(encoding='utf-8'))]
    js_strip = deck_js.exists() and manifest is not None and (
        'source' in manifest or any('note' in s for s in manifest.get('slides', []))
    )

    total = sum(size_of(p) for p in pruned)
    print(f'# {deck_id} 정리 계획 ({"적용" if a.apply else "미리보기"})')
    print(f'결과물: HTML {len(slides)}장, PDF {[p.name for p in pdfs]}, PPTX {[p.name for p in pptxs]}')
    print(f'삭제 대상 {len(pruned)}개, {human(total)}')
    for p in pruned:
        print(f'  - {p.relative_to(ROOT)}  ({human(size_of(p))})')
    if meta_hits:
        print(f'슬라이드 HTML 제작용 <meta source/reference-image> 제거: {len(meta_hits)}장')
    if js_strip:
        print('deck.js 에서 source·note 필드 제거 (deck.json 은 그대로)')
    if src_dir.exists():
        left = [p.name for p in src_dir.iterdir() if p not in pruned]
        print(f'design/sources/{deck_id}/ 에 남는 것: {left}')
    if not a.apply:
        print('\n--apply 를 붙이면 위 항목을 지웁니다.')
        return 0

    for p in pruned:
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    for h in meta_hits:
        h.write_text(META_RE.sub('', h.read_text(encoding='utf-8')), encoding='utf-8')
    if js_strip:
        clean = {k: v for k, v in manifest.items() if k != 'source'}
        clean['slides'] = [{k: v for k, v in s.items() if k != 'note'} for s in manifest.get('slides', [])]
        deck_js.write_text('window.__deck = ' + json.dumps(clean, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')

    # 검증: 남은 HTML 이 가리키는 로컬 파일이 모두 존재하는가
    missing = []
    for html in slides + [deck / 'index.html']:
        if not html.exists():
            continue
        for ref in local_refs(html):
            if not ref.exists():
                missing.append((html.relative_to(ROOT), ref))
    if manifest:
        for s in manifest.get('slides', []):
            for key in ('file', 'preview'):
                if s.get(key) and not (deck / s[key]).exists():
                    missing.append((deck_js.relative_to(ROOT), deck / s[key]))
    print(f'\n정리 완료. 덱 폴더 {human(size_of(deck))}, 깨진 참조 {len(missing)}건')
    for src, ref in missing:
        print(f'  ! {src} → {ref}')
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
