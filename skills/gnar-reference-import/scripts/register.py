#!/usr/bin/env python3
"""Register a converted reference collection without replacing existing slides."""
import argparse
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import quote, urlsplit, urlunsplit

START = '<!-- gnar-reference-import:start -->'
END = '<!-- gnar-reference-import:end -->'
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\Z')
PAGE_ID = re.compile(r'S-[a-z0-9]+(?:-[a-z0-9]+)*\Z')


def normalize_url(value):
    if not isinstance(value, str):
        raise ValueError('source_url must be an HTTP(S) URL')
    url = urlsplit(value.strip())
    if url.scheme.lower() not in ('http', 'https') or not url.hostname or url.username or url.password:
        raise ValueError('source_url must be an HTTP(S) URL without credentials')
    host = url.hostname.lower()
    if ':' in host:
        host = '[' + host + ']'
    if url.port:
        host += ':' + str(url.port)
    return urlunsplit((url.scheme.lower(), host, url.path.rstrip('/'), url.query, ''))


def safe_path(root, value, prefix=None, suffix=None, exists=True):
    if not isinstance(value, str) or '\\' in value or '\0' in value:
        raise ValueError('Paths must be project-relative POSIX strings')
    rel = Path(value)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts:
        raise ValueError(f'Unsafe project path: {value}')
    if prefix and rel.parts[:len(prefix)] != tuple(prefix):
        raise ValueError(f'Unexpected path location: {value}')
    if suffix and rel.suffix.lower() != suffix:
        raise ValueError(f'Unexpected file type: {value}')
    current = root
    for part in rel.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f'Symlinks are not accepted for import paths: {value}')
    target = (root / rel).resolve()
    if not target.is_relative_to(root):
        raise ValueError(f'Path leaves the project: {value}')
    if (exists and not target.is_file()) or (target.exists() and not target.is_file()):
        raise ValueError(f'Missing file or non-file path: {value}')
    return target


class Sources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and str(attrs.get('name', '')).lower() == 'source':
            try:
                self.urls.append(normalize_url(attrs.get('content', '')))
            except ValueError:
                pass


def html_sources(path):
    parser = Sources()
    with path.open(encoding='utf-8') as stream:
        parser.feed(stream.read(131072))
    return parser.urls


def load_manifest(root, relative):
    path = safe_path(root, relative, ('reference', 'imports'), '.json')
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or type(data.get('version')) is not int or data['version'] != 1:
        raise ValueError('Manifest version must be 1')
    ident = data.get('id')
    if not isinstance(ident, str) or not SLUG.fullmatch(ident):
        raise ValueError('Collection id must be a lowercase hyphenated slug')
    if Path(relative).as_posix() != f'reference/imports/{ident}/manifest.json':
        raise ValueError('Manifest must be reference/imports/<id>/manifest.json')
    data['source_url'] = normalize_url(data.get('source_url'))
    if not isinstance(data.get('title'), str) or not data['title'].strip():
        raise ValueError('Collection title is required')
    pages = data.get('pages')
    if not isinstance(pages, list) or not pages:
        raise ValueError('Manifest pages must be a nonempty list')
    ids, outputs = set(), set()
    for page in pages:
        if not isinstance(page, dict):
            raise ValueError('Each page must be an object')
        pid = page.get('id')
        if not isinstance(pid, str) or not PAGE_ID.fullmatch(pid) or pid in ids:
            raise ValueError('Page IDs must be unique S-... identifiers')
        if not pid.startswith('S-' + ident + '-'):
            raise ValueError(f'{pid}: page id must start with S-{ident}-')
        if page.get('html') != f'reference/slides/{pid}.html' or page.get('preview') != f'reference/previews/{pid}.png':
            raise ValueError(f'{pid}: HTML and preview paths must use the page id')
        ids.add(pid)
        for field in ('title', 'layout', 'summary'):
            if not isinstance(page.get(field), str) or not page[field].strip():
                raise ValueError(f'{pid}: {field} is required')
        for field in ('source_status', 'source_note'):
            if field in page and (not isinstance(page[field], str) or not page[field].strip()):
                raise ValueError(f'{pid}: {field} must be nonempty text')
        target = safe_path(root, page.get('html'), ('reference', 'slides'), '.html')
        if target.stem != pid:
            raise ValueError(f'{pid}: HTML basename must match page id')
        if 'source_url' in page:
            page['source_url'] = normalize_url(page['source_url'])
        if page.get('source_url', data['source_url']) not in html_sources(target):
            raise ValueError(f'{pid}: HTML source meta does not match source_url')
        preview = safe_path(root, page.get('preview'), ('reference', 'previews'), '.png')
        if 'source_image' in page:
            # Originals live in out/sources/ while converting and are not kept in the repo,
            # so only the path shape is validated here.
            source = page['source_image']
            prefix = ('out', 'sources') if isinstance(source, str) and source.startswith('out/') else ('design', 'sources')
            safe_path(root, source, prefix, exists=False)
        for output in (target, preview):
            if output in outputs:
                raise ValueError('Pages cannot share an HTML or preview output')
            outputs.add(output)
    return data


def collections(root):
    return [load_manifest(root, p.relative_to(root).as_posix())
            for p in sorted((root / 'reference/imports').glob('*/manifest.json'))]


def find_existing(root, url):
    root = Path(root).resolve(strict=True)
    url = normalize_url(url)
    matches = {}
    for collection in collections(root):
        for page in collection['pages']:
            if collection['source_url'] == url or page.get('source_url', collection['source_url']) == url:
                matches[page['html']] = {'html': page['html'], 'collection': collection['id']}
    for path in sorted((root / 'reference/slides').glob('*.html')):
        checked = safe_path(root, path.relative_to(root).as_posix(), ('reference', 'slides'), '.html')
        if url in html_sources(checked):
            rel = path.relative_to(root).as_posix()
            matches.setdefault(rel, {'html': rel})
    return {'already_imported': bool(matches), 'source_url': url, 'matches': list(matches.values())}


def managed_block(original, body, html_document=False):
    block = START + '\n' + body + '\n' + END
    if original.count(START) != original.count(END) or original.count(START) > 1:
        raise ValueError('Existing import markers are incomplete or duplicated')
    if START in original:
        start, end = original.index(START), original.index(END)
        if end < start:
            raise ValueError('Existing import markers are out of order')
        return original[:start] + block + original[end + len(END):]
    if html_document:
        match = re.search(r'</main\s*>', original, re.I)
        if not match:
            raise ValueError('reference/index.html must contain a closing main element')
        return original[:match.start()] + block + '\n' + original[match.start():]
    return original + ('\n' if original.endswith('\n') else '\n\n') + block + '\n'


def href(base, target):
    return html.escape(quote(os.path.relpath(target, base).replace(os.sep, '/'), safe='/.-_~'), quote=True)


def md(value):
    return str(value).replace('\n', ' ').replace('\r', ' ').replace('\\', '\\\\').replace('|', '\\|').replace('[', '\\[').replace(']', '\\]')


def gallery(root, data):
    base = root / 'reference/imports' / data['id']
    cards = []
    for page in data['pages']:
        page_source = page.get('source_url', data['source_url'])
        source_link = f' · <a href="{html.escape(page_source, quote=True)}" target="_blank" rel="noopener noreferrer">화면 출처 ↗</a>' if page_source != data['source_url'] else ''
        source_note = f'<p class="source-note"><strong>원본 확인 범위:</strong> {html.escape(page["source_note"])}</p>' if page.get('source_note') else ''
        cards.append(f'<article><a href="{href(base, root / page["html"])}"><img src="{href(base, root / page["preview"])}" alt="{html.escape(page["title"], quote=True)}" width="960" height="540"></a><h2>{html.escape(page["title"])}</h2><p>{html.escape(page["layout"])} · {html.escape(page["summary"])}</p>{source_note}{source_link}</article>')
    return f'''<!doctype html><html lang="ko" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(data['title'])} · Gnar</title>
<link rel="stylesheet" href="../../../design/tokens.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<style>*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font-family:'Pretendard Variable',sans-serif}}main{{max-width:1440px;margin:auto;padding:48px}}h1{{font-size:36px;color:var(--ink);letter-spacing:-1.2px}}a{{color:var(--ink)}}.intro{{color:var(--muted);line-height:1.7}}.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 24px;margin-top:32px}}article{{min-width:0}}img{{width:100%;height:auto;display:block;border:1px solid var(--border)}}h2{{font-size:17px;margin:14px 0 8px}}article p{{font-size:14px;color:var(--muted);line-height:1.6}}article>a:last-child{{font-size:13px}}@media(max-width:1000px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}@media(max-width:600px){{main{{padding:24px}}.grid{{grid-template-columns:1fr}}}}a:focus-visible{{outline:3px solid var(--hero);outline-offset:4px}}</style>
<main><a href="../../index.html">← 전체 레퍼런스</a><h1>{html.escape(data['title'])}</h1><p class="intro">{len(data['pages'])}개 화면 · 브랜드 팔레트 적용 · 편집 가능한 독립 HTML<br><a href="{html.escape(data['source_url'], quote=True)}" target="_blank" rel="noopener noreferrer">출처 페이지 ↗</a></p><div class="grid">{''.join(cards)}</div></main></html>'''


def publish(root, relative):
    root = Path(root).resolve(strict=True)
    data = load_manifest(root, relative)
    expected = {p['html'] for p in data['pages']}
    source_urls = {data['source_url'], *(p.get('source_url', data['source_url']) for p in data['pages'])}
    conflicts = sorted({m['html'] for url in source_urls for m in find_existing(root, url)['matches'] if m['html'] not in expected})
    if conflicts:
        raise ValueError('Source URL already exists under other page IDs: ' + ', '.join(conflicts))
    all_data = collections(root)
    if any(c['source_url'] == data['source_url'] and c['id'] != data['id'] for c in all_data):
        raise ValueError('Source URL is already registered under another collection id')
    target = safe_path(root, f'reference/imports/{data["id"]}/index.html', exists=False)
    index = safe_path(root, 'reference/index.html')
    catalog = safe_path(root, 'reference/catalog.md')
    safe_path(root, 'design/tokens.css')
    links = ''.join(f'<li><a href="imports/{c["id"]}/index.html">{html.escape(c["title"])}</a> · {len(c["pages"])}개 화면</li>' for c in all_data)
    block_html = '<section aria-label="추가 레퍼런스" style="margin-top:40px;padding-top:24px;border-top:1px solid var(--border)"><h2 style="font-size:20px;color:var(--ink)">추가 레퍼런스</h2><ul style="line-height:2">' + links + '</ul></section>'
    rows = ['## 링크에서 추가한 레퍼런스', '']
    for item in all_data:
        rows.extend([f'### [{md(item["title"])}](imports/{item["id"]}/index.html)', '', '| 화면 | 레이아웃 | 사용 목적 |', '|---|---|---|'])
        for page in item['pages']:
            link = quote(str(Path(page['html']).relative_to('reference')), safe='/.-_~')
            rows.append(f'| [{md(page["id"])} · {md(page["title"])}]({link}) | {md(page["layout"])} | {md(page["summary"])} |')
        rows.append('')
    outputs = {target: gallery(root, data), index: managed_block(index.read_text(encoding='utf-8'), block_html, True), catalog: managed_block(catalog.read_text(encoding='utf-8'), '\n'.join(rows))}
    staged = []
    try:
        for path, content in outputs.items():
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, prefix='.' + path.name + '.', delete=False) as stream:
                staged.append((Path(stream.name), path))
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        for temporary, destination in staged:
            os.replace(temporary, destination)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
    return {'registered': True, 'id': data['id'], 'page_count': len(data['pages']), 'gallery': target.relative_to(root).as_posix(), 'index': 'reference/index.html', 'catalog': 'reference/catalog.md'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check-url')
    group.add_argument('--manifest')
    args = parser.parse_args()
    try:
        root = args.root.resolve(strict=True)
        result = find_existing(root, args.check_url) if args.check_url else publish(root, args.manifest)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, json.dumps({'error': str(error)}, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
