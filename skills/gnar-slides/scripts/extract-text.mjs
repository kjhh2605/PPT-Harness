#!/usr/bin/env node
// 덱의 장별 가시 텍스트를 읽기 순서대로 한 Markdown 파일로 뽑는다. 서브에이전트 검토 입력용.
// 실행: node skills/gnar-slides/scripts/extract-text.mjs decks/<id> [--out out/decks/<id>/slide-text.md]
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const deckDir = args.find(a => !a.startsWith('--'));
if (!deckDir) { console.error('usage: extract-text.mjs decks/<id> [--out file]'); process.exit(2); }
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join('out', deckDir, 'slide-text.md');
const slidesDir = path.join(deckDir, 'slides');
const files = (await readdir(slidesDir)).filter(f => f.endsWith('.html')).sort();
const deck = JSON.parse(await readFile(path.join(deckDir, 'deck.json'), 'utf8').catch(() => '{}'));

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const textOf = html => decode(html
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<svg[\s\S]*?<\/svg>/gi, m => m.replace(/<text[^>]*>([\s\S]*?)<\/text>/gi, ' $1\n').replace(/<[^>]+>/g, ''))
  .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => alt ? `[이미지: ${alt}]\n` : '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|li|div|h\d|pre|footer|header|section|article|ol|ul)>/gi, '\n')
  .replace(/<[^>]+>/g, ''))
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const parts = [`# ${deck.title ?? deckDir} · 장별 텍스트`, '', `덱: ${deckDir} · ${files.length}장 · 추출 ${new Date().toISOString().slice(0, 10)}`, ''];
for (const file of files) {
  const n = Number(file.replace('.html', ''));
  const html = await readFile(path.join(slidesDir, file), 'utf8');
  const main = html.match(/<main[\s\S]*<\/main>/i)?.[0] ?? html;
  const title = deck.slides?.find(s => s.n === n)?.title ?? '';
  const footer = main.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? '';
  const header = main.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? '';
  const body = main.replace(header, '').replace(footer, '');
  parts.push(`## ${String(n).padStart(2, '0')} · ${title}`);
  if (header) parts.push(`- 헤더: ${textOf(header).join(' · ')}`);
  parts.push('- 본문:');
  for (const line of textOf(body)) parts.push(`  - ${line}`);
  if (footer) parts.push(`- 각주: ${textOf(footer).join(' · ')}`);
  parts.push('');
}
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, parts.join('\n'));
console.log(`${files.length}장 → ${out}`);
