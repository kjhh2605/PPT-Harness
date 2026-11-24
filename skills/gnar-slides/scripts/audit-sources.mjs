#!/usr/bin/env node
// 청중용 덱 출처 검사: 슬라이드에 남은 "제작 과정용" 근거·메모 표기를 찾는다.
// 실행: node skills/gnar-slides/scripts/audit-sources.mjs decks/<id> [--json out.json]
// 종료 코드: 발견 0건이면 0, 1건 이상이면 1.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const deckDir = args.find(a => !a.startsWith('--'));
if (!deckDir) { console.error('usage: audit-sources.mjs decks/<id> [--json file]'); process.exit(2); }
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const slidesDir = path.join(deckDir, 'slides');
const files = (await readdir(slidesDir)).filter(f => f.endsWith('.html')).sort();

// 청중이 보면 안 되는 표기. 발표 자료 제작 중에만 쓰는 근거 번호, 내부 문서 참조, 작업 메모.
const INTERNAL = [
  { id: 'evidence-label', re: /근거\s*[:：]/, why: '제작용 근거 표기' },
  { id: 'bracket-citation', re: /\[\d{1,3}\]/, why: '번호 각주 [n]는 내부 근거 목록을 가리킴' },
  { id: 'refs-page', re: /참고\s*자료\s*\d+\s*쪽/, why: '덱 내부 참고 목록 쪽수 참조' },
  { id: 'source-pdf-page', re: /원문\s*PDF|원본\s*(?:PDF|PPT|슬라이드|이미지)/, why: '원본 문서 참조' },
  { id: 'verified-date', re: /확인일/, why: '검증 일자는 제작 기록' },
  { id: 'production-note', re: /재구성|단색\s*처리|잘라\s*사용|크롭|image_gen|생성\s*이미지|제작\s*과정|교체함|치환/, why: '제작 과정 메모' },
  { id: 'speaker-doc', re: /발표자용|발표\s*대본|대본에서/, why: '발표자 전용 문서 언급' },
];
// 청중에게 보여도 되는 출처 표기 형식. 보고용 분류일 뿐 검사에서 제외하지는 않는다.
const PUBLIC_PREFIX = /^(출처|영상|화면|아이콘|로고|더 알아보기|도구|자료)\s*[:：]/;

const strip = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d|span|pre|footer|header)>/gi, '$&\n')
  .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

const pick = (html, selector) => {
  // 단순 클래스 추출: class="... ftr ..." 블록의 안쪽 텍스트
  const out = [];
  const re = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${selector}\\b[^"]*"[^>]*>`, 'gi');
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    let depth = 1, i = re.lastIndex;
    const open = new RegExp(`<${tag}\\b`, 'gi'), close = new RegExp(`</${tag}>`, 'gi');
    while (depth && i < html.length) {
      open.lastIndex = i; close.lastIndex = i;
      const o = open.exec(html), c = close.exec(html);
      if (!c) break;
      if (o && o.index < c.index) { depth++; i = o.index + 1; } else { depth--; i = c.index + c[0].length; }
    }
    out.push(strip(html.slice(re.lastIndex, i)).trim());
  }
  return out;
};

const findings = [];
const publicSources = [];
for (const file of files) {
  const html = await readFile(path.join(slidesDir, file), 'utf8');
  const n = Number(file.replace('.html', ''));
  const footer = pick(html, 'src').join(' ').replace(/\s+/g, ' ').trim();
  if (footer) (PUBLIC_PREFIX.test(footer) ? publicSources : findings).push(PUBLIC_PREFIX.test(footer) ? { slide: n, text: footer } : { slide: n, where: 'footer', text: footer, rule: 'footer-not-public', why: '허용 접두어(출처·영상·화면·아이콘·로고·더 알아보기·도구)가 아닌 각주' });
  // 화면 전체 텍스트에서 내부 표기 검사 (footer 포함)
  const main = html.match(/<main[\s\S]*<\/main>/i)?.[0] ?? html;
  const lines = strip(main).split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) for (const rule of INTERNAL) {
    if (rule.re.test(line)) findings.push({ slide: n, where: 'text', text: line.slice(0, 140), rule: rule.id, why: rule.why });
  }
}
// 같은 줄에 여러 규칙이 걸리면 한 번만
const seen = new Set();
const unique = findings.filter(f => { const k = `${f.slide}|${f.text}`; if (seen.has(k)) return false; seen.add(k); return true; });

console.log(`검사한 화면: ${files.length}장`);
console.log(`청중용으로 허용된 각주: ${publicSources.length}건`);
for (const s of publicSources) console.log(`  [${String(s.slide).padStart(2, '0')}] ${s.text}`);
console.log(`\n제거 대상: ${unique.length}건`);
for (const f of unique) console.log(`  [${String(f.slide).padStart(2, '0')}] (${f.rule}) ${f.text}\n       → ${f.why}`);
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ checked: files.length, publicSources, findings: unique }, null, 1));
process.exit(unique.length ? 1 : 0);
