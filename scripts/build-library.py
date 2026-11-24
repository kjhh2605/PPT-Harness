"""Build the local reference catalog and embed its data for file:// browsing."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'reference'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def local_path(relative, base=REFERENCE):
    path = (base / relative).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f'Path leaves project: {relative}')
    return path


def build():
    # Originals are not kept in the repository; collections carry only the HTML, preview and metadata.
    collections = [read_json(path) for path in sorted((REFERENCE / 'collections').glob('bysu-*.json'))]
    # The supplied project leads the collection, followed by newer source IDs.
    collections.sort(key=lambda collection: (collection['id'] != 'bysu-452912', -int(collection['id'].split('-')[-1])))
    ids, files, collection_ids, all_slides, summaries = set(), set(), set(), [], []
    for collection in collections:
        collection_id = collection['id']
        if collection_id in collection_ids:
            raise ValueError(f'Duplicate collection: {collection_id}')
        collection_ids.add(collection_id)
        slides = sorted(collection['slides'], key=lambda slide: slide['order'])
        for slide in slides:
            slide = dict(slide)
            for required in ('id', 'order', 'title', 'description', 'type', 'file', 'preview'):
                if required not in slide:
                    raise ValueError(f'{collection_id}: missing {required}')
            if slide['id'] in ids or slide['file'] in files:
                raise ValueError(f"Duplicate slide ID/file: {slide['id']}")
            if slide['type'] not in ('light', 'dark', 'brand'):
                raise ValueError(f"Invalid tone: {slide['id']}: {slide['type']}")
            if not local_path('slides/' + slide['file']).is_file():
                raise ValueError(f"Missing {slide['id']} artifact: slides/{slide['file']}")
            slide.pop('sourceImage', None)
            local_path(slide['preview'])
            slide.update(collectionId=collection_id, collectionTitle=collection['title'],
                         sourceUrl=slide.get('sourceUrl') or collection['sourceUrl'])
            slide.setdefault('layout', '')
            slide.setdefault('tags', [])
            ids.add(slide['id'])
            files.add(slide['file'])
            all_slides.append(slide)
        summary = {key: value for key, value in collection.items() if key != 'slides'}
        summary['slideCount'] = len(slides)
        summaries.append(summary)
    library = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
               'collectionCount': len(summaries), 'slideCount': len(all_slides),
               'collections': summaries, 'slides': all_slides}
    serialized = json.dumps(library, ensure_ascii=False, indent=2)
    (REFERENCE / 'library.json').write_text(serialized + '\n', encoding='utf-8')
    index_path = REFERENCE / 'index.html'
    index = index_path.read_text(encoding='utf-8')
    embedded = serialized.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    index, replacements = re.subn(r'(<script id="library-data" type="application/json">)[\s\S]*?(</script>)',
                                  lambda match: match[1] + '\n' + embedded + '\n' + match[2], index)
    if replacements != 1:
        raise ValueError('Gallery must contain exactly one library-data script')
    index_path.write_text(index, encoding='utf-8')
    catalog = ['# bysu · Gnar 컬러 레퍼런스', '', '[전체 갤러리](index.html)', '',
               f"공개 작업 {len(summaries)}개, 편집 가능한 HTML {len(all_slides)}장. 모든 화면은 1920×1080입니다.", '',
               '원문에 공개된 페이지를 기준으로 조사했습니다. 원본 이미지는 저장소에 보관하지 않으며 각 작업의 원문 링크에서 확인합니다.', '']
    for collection in summaries:
        catalog += [f"## {collection['title']}", '', f"[원문]({collection['sourceUrl']}) · {collection['slideCount']}장", '',
                    '| 순서 | HTML | 구성 |', '|---|---|---|']
        for slide in all_slides:
            if slide['collectionId'] != collection['id']:
                continue
            clean = lambda value: str(value).replace('|', '\\|').replace('\n', ' ')
            catalog.append(f"| {slide['order']:02d} | [{clean(slide['title'])}](slides/{slide['file']}) | {clean(slide['description'])} |")
        catalog.append('')
    (REFERENCE / 'bysu-catalog.md').write_text('\n'.join(catalog), encoding='utf-8')
    readme_path = ROOT / 'README.md'
    readme = readme_path.read_text(encoding='utf-8')
    readme = re.sub(r'<!-- library-summary:start -->[\s\S]*?<!-- library-summary:end -->',
                    f'<!-- library-summary:start -->\n**{len(summaries)}개 작업 · HTML {len(all_slides)}장**이 등록되어 있습니다. 기존 토스 14장이 포함됩니다.\n<!-- library-summary:end -->', readme)
    readme_path.write_text(readme, encoding='utf-8')
    print(f"Built {len(summaries)} collections / {len(all_slides)} slides → reference/index.html")


if __name__ == '__main__':
    build()
