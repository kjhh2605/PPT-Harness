#!/usr/bin/env python3
"""Codex 어댑터 설정과 검수 JSON 계약을 검사한다. Python 3.11+; 외부 의존성 없음."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RULEBOOK = ROOT / 'skills/gnar-slides/references/slide-quick-rules.md'
AUDIENCE_TYPES = {'speaker-note', 'process-note', 'internal-ref', 'meta-caveat', 'slop', 'inconsistency'}
SELF_CHECKS = {'do_not_preserved', 'length_within_15pct', 'line_count_same',
               'register_kept', 'nothing_added', 'under_25pct'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_digest(path):
    # extract-text.mjs regenerates this UTC date even when slide content is unchanged.
    # Normalize only its exact metadata line before the first slide, never slide text.
    source = path.read_bytes().decode('utf-8')
    first_slide = re.search(r'^## \d+\s*·[^\r\n]*\r?$', source, re.M)
    require(first_slide is not None, '텍스트에 슬라이드 헤더가 없습니다')
    header, body = source[:first_slide.start()], source[first_slide.start():]
    header = re.sub(r'^(덱: [^\r\n]+ · \d+장 · 추출 )\d{4}-\d{2}-\d{2}(?=\r?$)',
                    r'\g<1>YYYY-MM-DD', header, count=1, flags=re.M)
    return hashlib.sha256((header + body).encode('utf-8')).hexdigest()


def read_json(path):
    value = json.loads(path.read_text(encoding='utf-8'))
    require(isinstance(value, dict), f'{path}: JSON object가 필요합니다')
    require('error' not in value, f'{path}: 에이전트 오류 응답입니다')
    return value


def integer(value):
    return type(value) is int


def strings(item, keys):
    require(isinstance(item, dict), '항목은 JSON object여야 합니다')
    for key in keys:
        require(isinstance(item.get(key), str) and item[key].strip(), f'{key}: 비어 있지 않은 문자열이 필요합니다')


def setup():
    for name in ('gnar-slides', 'gnar-reference-import', 'gnar-deck-cleanup'):
        link = ROOT / '.agents/skills' / name
        require(link.is_symlink(), f'{link}: 스킬 심볼릭 링크가 없습니다')
        require(link.resolve() == ROOT / 'skills' / name, f'{link}: 공용 스킬 대상과 다릅니다')
        require((link / 'SKILL.md').is_file(), f'{link}: SKILL.md가 없습니다')
    config = tomllib.loads((ROOT / '.codex/config.toml').read_text(encoding='utf-8'))
    runtime = 'skills/gnar-slides/references/codex-runtime.md'
    require(runtime in config.get('developer_instructions', ''), 'Codex 설정에 runtime 문서 연결이 없습니다')
    require((ROOT / runtime).is_file(), f'{runtime}: 실행 계약 문서가 없습니다')
    for name in ('gnar-audience-reviewer', 'gnar-slide-humanizer'):
        path = ROOT / '.codex/agents' / f'{name}.toml'
        source = path.read_text(encoding='utf-8')
        agent = tomllib.loads(source)
        strings(agent, ('name', 'description', 'developer_instructions'))
        require(agent['name'] == name, f'{path}: 에이전트 이름이 다릅니다')
        origin = re.search(r'^# source:\s*(\S+)\s*$', source, re.M)
        version = re.search(r'^# source_sha256:\s*([a-f0-9]{64})\s*$', source, re.M)
        expected = f'.claude/agents/{name}.md'
        require(origin is not None and origin[1] == expected, f'{path}: 원본 경로 주석이 없습니다')
        require(version is not None, f'{path}: 원본 SHA256 주석이 없습니다')
        require(digest(ROOT / expected) == version[1], f'{path}: Claude 원본이 변경되어 재검토가 필요합니다')
    print('Codex setup: 스킬 3개, 에이전트 2개, runtime 연결 및 원본 해시 통과')


def read_slides(path):
    source = path.read_text(encoding='utf-8')
    markers = list(re.finditer(r'^## (\d+)\s*·[^\n]*$', source, re.M))
    require(markers, '텍스트에 ## NN · 제목 형식의 슬라이드가 없습니다')
    slides, items = {}, {}
    for i, marker in enumerate(markers):
        n = int(marker[1])
        require(n > 0 and n not in slides, '슬라이드 번호는 양수이며 중복되지 않아야 합니다')
        end = markers[i + 1].start() if i + 1 < len(markers) else len(source)
        slides[n] = source[marker.end():end]
        items[n] = re.findall(r'^  - (.+)$', slides[n], re.M)
    return slides, items


def slide_number(item, slides):
    n = item.get('slide')
    require(integer(n) and n in slides, f'검수 대상에 없는 slide: {n}')
    return n


def confidence(item):
    value = item.get('confidence')
    require(type(value) in (int, float) and 0 <= value <= 1, 'confidence는 0~1 숫자여야 합니다')


def audience(review, slides):
    require(integer(review.get('checked')) and review['checked'] == len(slides), 'checked가 실제 슬라이드 수와 다릅니다')
    findings = review.get('findings')
    require(isinstance(findings, list), 'findings 배열이 필요합니다')
    for item in findings:
        strings(item, ('type', 'text', 'why', 'fix'))
        n = slide_number(item, slides)
        require(item['type'] in AUDIENCE_TYPES, f'알 수 없는 findings type: {item["type"]}')
        require(item['text'] in slides[n], f'{n}장에 findings text가 없습니다')
        confidence(item)
    require(not findings, f'청중 검수 미해결 findings {len(findings)}건')


def humanizer(review, slides, items):
    require(integer(review.get('checked_slides')) and review['checked_slides'] == len(slides), 'checked_slides가 실제 슬라이드 수와 다릅니다')
    total = sum(map(len, items.values()))
    require(integer(review.get('items_total')) and review['items_total'] == total, 'items_total이 본문 항목 수(  - 행)와 다릅니다')
    edits, groups = review.get('edits'), review.get('group_consistency')
    require(isinstance(edits, list) and isinstance(groups, list), 'edits와 group_consistency 배열이 필요합니다')
    require(len(edits) * 4 <= total, 'edits가 본문 항목 수의 25%를 넘습니다')
    rules = set(re.findall(r'^- \*\*([A-Z]-\d+)\b', RULEBOOK.read_text(encoding='utf-8'), re.M)) | {'C-11'}
    seen = set()
    for item in edits:
        strings(item, ('where', 'before', 'rule', 'why'))
        n = slide_number(item, slides)
        before, after = item['before'], item.get('after')
        require(before in items[n], f'{n}장 본문에 before와 정확히 일치하는 항목이 없습니다')
        require((n, before) not in seen, f'{n}장에 같은 before 제안이 중복됩니다')
        seen.add((n, before))
        require(isinstance(after, str) and after != before, 'after는 before와 다른 문자열이어야 합니다')
        if after:
            require(after.strip(), '공백만 남기는 after는 허용하지 않습니다')
            require(len(before) * .85 <= len(after) <= len(before), 'after 길이는 before의 85~100%여야 합니다(전체 삭제 제외)')
            require(len(re.split(r'<br\s*/?>|\n', before, flags=re.I)) == len(re.split(r'<br\s*/?>|\n', after, flags=re.I)), 'before/after 줄 수가 다릅니다')
        require(item['rule'] in rules, f'룰북에 없는 rule: {item["rule"]}')
        confidence(item)
    for item in groups:
        strings(item, ('group', 'issue', 'fix', 'rule'))
        slide_number(item, slides)
        require(item['rule'] in rules, f'룰북에 없는 rule: {item["rule"]}')
    checks = review.get('self_check')
    require(isinstance(checks, dict) and all(checks.get(key) is True for key in SELF_CHECKS), 'self_check 필수 항목이 모두 true여야 합니다')
    strings(review, ('summary',))


def run(args):
    if args.kind == 'setup':
        setup()
        return
    text_path, review_path = args.text.resolve(), args.review.resolve()
    slides, items = read_slides(text_path)
    review = read_json(review_path)
    (audience(review, slides) if args.kind == 'audience' else humanizer(review, slides, items))
    stamp = {'kind': args.kind, 'text_path': str(text_path), 'review_path': str(review_path),
             'text_hash_mode': 'extract-text-date-v1', 'text_sha256': text_digest(text_path),
             'review_sha256': digest(review_path)}
    if args.kind == 'humanizer':
        stamp['rulebook_sha256'] = digest(RULEBOOK)
    if args.verify_stamp:
        saved = read_json(args.verify_stamp)
        require(all(saved.get(key) == value for key, value in stamp.items()), '검수 이후 입력·결과·룰북이 변경되었습니다. 다시 검토하세요')
    if args.stamp:
        require(args.stamp.resolve() not in (text_path, review_path, RULEBOOK), 'stamp는 입력/검수/룰북과 다른 파일이어야 합니다')
        args.stamp.parent.mkdir(parents=True, exist_ok=True)
        args.stamp.write_text(json.dumps(stamp, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Codex {args.kind}: {len(slides)}장 JSON 계약 통과' + (' · stamp 일치' if args.verify_stamp else ''))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='kind', required=True)
    commands.add_parser('setup', help='스킬 링크·TOML·Claude 원본 해시 확인')
    for kind in ('audience', 'humanizer'):
        command = commands.add_parser(kind, help=f'{kind} 검수 JSON 확인')
        command.add_argument('--text', required=True, type=Path, help='extract-text.mjs 출력')
        command.add_argument('--review', required=True, type=Path, help='에이전트 반환 JSON')
        stamps = command.add_mutually_exclusive_group()
        stamps.add_argument('--stamp', type=Path, help='통과한 입력·결과의 SHA256 기록')
        stamps.add_argument('--verify-stamp', type=Path, help='이전 기록과 SHA256 재검증')
    try:
        run(parser.parse_args())
    except (OSError, ValueError, TypeError) as error:
        print(f'Codex check 실패: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
