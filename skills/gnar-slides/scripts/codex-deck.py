#!/usr/bin/env python3
"""Codex-only, fail-closed entry points around the existing deck scripts."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / 'skills/gnar-slides/scripts'


def run(*args: object) -> None:
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True)


def digest(deck: Path) -> str:
    paths = [deck / n for n in ('deck.json', 'build.py', 'render.mjs')]
    for folder in ('slides', 'assets'):
        paths.extend(p for p in (deck / folder).rglob('*') if p.is_file())
    paths.extend(ROOT / p for p in ('design/tokens.css', 'design/palettes/brand.json'))
    h = hashlib.sha256()
    for p in sorted(set(paths)):
        h.update(str(p.relative_to(ROOT)).encode())
        h.update(b'\0')
        h.update(p.read_bytes())
        h.update(b'\0')
    return h.hexdigest()


def read(path: Path):
    return json.loads(path.read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'export', 'cleanup'])
    parser.add_argument('deck', help='decks/<deck-id>')
    parser.add_argument('--compare', action='store_true', help='export: LibreOffice comparison sheets')
    parser.add_argument('--apply', action='store_true', help='cleanup: only after an explicit cleanup request')
    parser.add_argument('--keep-sources', action='store_true', help='cleanup: keep original source renders')
    parser.add_argument('--strip-build', action='store_true', help='cleanup: remove builders only when explicitly requested')
    args = parser.parse_args()
    if args.compare and args.action != 'export' or (args.apply or args.keep_sources or args.strip_build) and args.action != 'cleanup':
        parser.error('--compare is for export; --apply/--keep-sources/--strip-build are for cleanup')
    deck = (ROOT / args.deck).resolve()
    if deck.parent != ROOT / 'decks' or not deck.is_dir():
        parser.error('deck must be an existing direct child of this project’s decks/')
    out = ROOT / 'out/decks' / deck.name
    out.mkdir(parents=True, exist_ok=True)
    checkpoint = out / 'codex-checkpoint.json'
    text = out / 'slide-text.md'
    rel = deck.relative_to(ROOT)
    if args.action == 'prepare':
        # An interrupted/failed rerun must not leave a valid old checkpoint.
        checkpoint.unlink(missing_ok=True)
        for name in ('qa.json', 'source-audit.json', 'slide-text.md',
                     'audience-stamp.json', 'humanizer-stamp.json'):
            (out / name).unlink(missing_ok=True)
        python = ROOT / '.venv/bin/python'
        run(python if python.exists() else sys.executable, deck / 'build.py')
        run('node', deck / 'render.mjs')
        manifest = read(deck / 'deck.json')
        numbers = [s['n'] for s in manifest['slides']]
        actual = sorted(p.name for p in (deck / 'slides').glob('*.html'))
        expected = sorted(Path(s['file']).name for s in manifest['slides'])
        if not numbers or len(set(numbers)) != len(numbers) or actual != expected:
            raise ValueError('manifest/slide files mismatch or duplicate slide numbers')
        qa = read(out / 'qa.json')
        if sorted(r['n'] for r in qa) != sorted(numbers) or any(r['issues'] for r in qa):
            raise ValueError('render QA is incomplete or contains issues')
        run('node', SCRIPTS / 'audit-sources.mjs', rel, '--json', out / 'source-audit.json')
        run('node', SCRIPTS / 'extract-text.mjs', rel, '--out', text)
        if not text.read_text().strip():
            raise ValueError('empty slide text')
        checkpoint.write_text(json.dumps({'deck': str(rel), 'sha256': digest(deck),
                                         'slides': len(numbers)}, indent=2) + '\n')
        print(f'Prepared {len(numbers)} slides. Run both reviewers, then validate and stamp their JSON.')
        return

    if read(checkpoint)['sha256'] != digest(deck):
        raise ValueError('deck changed since prepare; rerun prepare and both reviews')
    # Refresh extraction so stamps cannot approve changed or manually substituted text.
    run('node', SCRIPTS / 'extract-text.mjs', rel, '--out', text)
    for kind, filename, stamp in [('audience', 'audience-review.json', 'audience-stamp.json'),
                                   ('humanizer', 'humanize-edits.json', 'humanizer-stamp.json')]:
        run(sys.executable, SCRIPTS / 'check-codex.py', kind, '--text', text,
            '--review', out / filename, '--verify-stamp', out / stamp)
    if args.action == 'export':
        # Invalidate proof before export, including an export that later fails.
        (out / 'codex-export.json').unlink(missing_ok=True)
        run('node', '--require', SCRIPTS / 'codex-pptx-compat.cjs',
            SCRIPTS / 'html-to-pptx.mjs', rel, *(['--compare'] if args.compare else []))
        report = read(out / 'pptx-report.json')
        pptx = (ROOT / report['file']).resolve()
        if pptx.parent != deck or pptx.suffix.lower() != '.pptx':
            raise ValueError('export report points outside the requested deck')
        if len(report['slides']) != read(checkpoint)['slides'] or any(s['missing'] for s in report['slides']):
            raise ValueError('incomplete export or missing text runs')
        artifacts = [pptx, *deck.glob('*.pdf')]
        if len(artifacts) < 2:
            raise ValueError('export requires the prepared PDF')
        # The existing exporter checks all text runs and returns nonzero on omissions.
        (out / 'codex-export.json').write_text(json.dumps({'sha256': digest(deck),
            'report_sha256': hashlib.sha256((out / 'pptx-report.json').read_bytes()).hexdigest(),
            'artifacts': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts},
            'compare': args.compare}, indent=2) + '\n')
        print('PPTX export passed. Inspect every comparison sheet when --compare was used.')
    else:
        exported = read(out / 'codex-export.json')
        if exported['sha256'] != digest(deck) or exported['report_sha256'] != hashlib.sha256((out / 'pptx-report.json').read_bytes()).hexdigest():
            raise ValueError('missing or stale successful export; export before cleanup')
        artifacts = exported['artifacts']
        if not artifacts or any(hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != sha for p, sha in artifacts.items()):
            raise ValueError('exported PDF/PPTX changed; export before cleanup')
        run(sys.executable, ROOT / 'skills/gnar-deck-cleanup/scripts/cleanup.py', rel,
            *(['--apply'] if args.apply else []),
            *(['--keep-sources'] if args.keep_sources else []),
            *(['--strip-build'] if args.strip_build else []))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        print(f'Codex deck gate failed: {exc}', file=sys.stderr)
        sys.exit(1)
