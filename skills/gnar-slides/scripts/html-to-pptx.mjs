#!/usr/bin/env node
// 덱의 장별 HTML(1920×1080)을 편집 가능한 PPTX로 변환한다.
//   텍스트  → 텍스트 상자(글꼴·크기·굵기·색·자간·행간·줄바꿈 유지)
//   배경·테두리 상자 → 도형(둥근 모서리·원 포함)
//   SVG     → SVG 그림(PowerPoint에서 "도형으로 변환" 가능) + PNG 대체 이미지
//   <img>   → 원본 파일 그대로(자르기 없을 때) 또는 렌더한 PNG(cover 자르기·마스크·둥근 모서리)
//   <video> → 원본 영상을 삽입한 미디어 개체(표지는 HTML에 보이는 포스터를 렌더한 PNG)
//   그 밖의 변형·마스크·클립·그라디언트 요소 → 렌더한 PNG
// 실행: node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<deck-id> [--out file.pptx] [--only 3,5] [--no-check] [--compare]
//   --compare: LibreOffice로 PPTX를 PDF로 바꿔 HTML 미리보기와 나란히 놓은 비교 시트를 out/decks/<deck-id>/pptx-compare-N.png 에 만든다.
// 종료 코드: 0 = 모든 텍스트가 PPTX에 들어감, 1 = 누락 텍스트 있음(out/decks/<deck-id>/pptx-report.json 참고).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const args = process.argv.slice(2);
let deckArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' || args[i] === '--only') { i++; continue; }
  if (!args[i].startsWith('--')) { deckArg = args[i]; break; }
}
if (!deckArg) {
  console.error('사용법: node skills/gnar-slides/scripts/html-to-pptx.mjs decks/<deck-id> [--out file.pptx] [--only 3,5] [--no-check] [--compare]');
  process.exit(2);
}
const deck = path.resolve(root, deckArg);
const deckId = path.basename(deck);
const optValue = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = optValue('--only') ? new Set(optValue('--only').split(',').map(Number)) : null;
const doCheck = !args.includes('--no-check');
const doCompare = args.includes('--compare');
const manifest = JSON.parse(await readFile(path.join(deck, 'deck.json'), 'utf8'));
const outDir = path.join(root, 'out/decks', deckId);
const tmp = path.join(outDir, 'pptx-tmp');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

// 출력 파일 이름: --out > 덱 폴더의 유일한 PDF와 같은 이름 > <deck-id>.pptx
let outFile = optValue('--out');
if (!outFile) {
  const pdfs = (await readdir(deck)).filter(f => f.toLowerCase().endsWith('.pdf'));
  outFile = path.join(deck, pdfs.length === 1 ? pdfs[0].replace(/\.pdf$/i, '.pptx') : `${deckId}.pptx`);
} else outFile = path.resolve(root, outFile);

const PX = 96; // 1920px = 20in
const inch = v => v / PX;
const pt = v => v * 0.75;
const DSF = 2; // 래스터 해상도 배율

// ───────────────────────── 브라우저 안에서 실행되는 추출기 ─────────────────────────
const EXTRACT = () => {
  const slideEl = document.querySelector('.slide');
  const base = slideEl.getBoundingClientRect();
  const scale = base.width / 1920 || 1;
  const px = v => parseFloat(v) || 0;
  const rel = r => ({ x: (r.left - base.left) / scale, y: (r.top - base.top) / scale, w: r.width / scale, h: r.height / scale });
  const color = v => {
    const m = v && v.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha === 0) return null;
    return { hex: [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase(), alpha };
  };
  const tag = el => el.tagName.toLowerCase();
  const isInline = cs => cs.display === 'inline' || cs.display === 'contents';
  const ops = [];
  let nextId = 1;
  const mark = el => { const id = String(nextId++); el.setAttribute('data-pptx-id', id); return id; };
  const hasDirectText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const hasAnyText = el => !!el.textContent.trim();
  const radiusOf = cs => Math.max(...['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(c => px(cs[`border${c}Radius`])));
  const faceOf = cs => cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const styleOf = cs => ({
    size: px(cs.fontSize), color: color(cs.color), weight: Number(cs.fontWeight) || 400, face: faceOf(cs),
    italic: /^(italic|oblique)/.test(cs.fontStyle), underline: cs.textDecorationLine.includes('underline'), strike: cs.textDecorationLine.includes('line-through'),
    spacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing), transform: cs.textTransform, ws: cs.whiteSpace, highlight: null,
  });

  const isTextBlock = el => {
    if (['svg', 'img', 'br'].includes(tag(el))) return false;
    if (hasDirectText(el)) return true;
    const kids = [...el.children];
    if (!kids.length || !hasAnyText(el)) return false;
    return kids.every(k => { const t = tag(k); if (t === 'br') return true; if (t === 'svg' || t === 'img') return false; return isInline(getComputedStyle(k)); });
  };

  // 텍스트 블록의 런(run)과 텍스트 노드 목록. 블록 자식은 blocks에 모아 따로 처리한다.
  const collect = (el, blocks) => {
    const runs = [], nodes = [];
    const walkInline = (node, st) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          let t = n.textContent;
          if (!/^pre/.test(st.ws)) t = t.replace(/\s+/g, ' ');
          if (st.transform === 'uppercase') t = t.toUpperCase(); else if (st.transform === 'lowercase') t = t.toLowerCase();
          if (t) { runs.push({ text: t, ...st }); nodes.push(n); }
        } else if (n.nodeType === 1) {
          const t = tag(n);
          if (t === 'br') { runs.push({ text: '', br: true }); continue; }
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (t === 'img' || t === 'svg' || !isInline(cs)) { blocks.push(n); continue; }
          const s = styleOf(cs);
          const bg = color(cs.backgroundColor);
          if (bg) s.highlight = bg.hex;
          walkInline(n, s);
        }
      }
    };
    walkInline(el, styleOf(getComputedStyle(el)));
    // 공백 정리: 블록 처음·끝, <br> 앞뒤의 공백 제거, 런 경계의 중복 공백 제거
    const out = [];
    const lastText = () => { for (let i = out.length - 1; i >= 0; i--) { if (out[i].breakLine) return null; if (out[i].text) return out[i]; } return null; };
    for (const r of runs) {
      if (r.br) {
        const prev = lastText();
        if (prev) prev.text = prev.text.replace(/ +$/, '');
        if (out.length && !out[out.length - 1].breakLine) out[out.length - 1].breakLine = true;
        else out.push({ text: '', breakLine: true, size: runs.find(x => x.size)?.size || 16 });
        continue;
      }
      const prev = lastText();
      if (!prev || prev.text.endsWith(' ')) r.text = r.text.replace(/^ +/, '');
      if (!r.text) continue;
      out.push(r);
    }
    const last = lastText();
    if (last) last.text = last.text.replace(/ +$/, '');
    return { runs: out.filter(r => r.text || r.breakLine), nodes };
  };

  // 텍스트 노드들의 줄 사각형으로 실제 글줄 위치를 잰다.
  const lineGeom = nodes => {
    const rects = [];
    for (const n of nodes) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(rel(r)); }
    if (!rects.length) return null;
    const lines = [];
    for (const r of rects.sort((a, b) => a.y - b.y)) {
      const L = lines[lines.length - 1];
      if (L && Math.abs(r.y - L.y) < Math.max(2, L.h * 0.3)) { L.h = Math.max(L.h, r.h); L.x1 = Math.min(L.x1, r.x); L.x2 = Math.max(L.x2, r.x + r.w); }
      else lines.push({ y: r.y, h: r.h, x1: r.x, x2: r.x + r.w });
    }
    return { top: lines[0].y, firstH: lines[0].h, bottom: Math.max(...lines.map(l => l.y + l.h)), left: Math.min(...lines.map(l => l.x1)), right: Math.max(...lines.map(l => l.x2)), n: lines.length };
  };

  const textOp = (el, cs, r, runs, nodes, opacity) => {
    const g = lineGeom(nodes);
    if (!g) return;
    const size = px(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? size * 1.2 : px(cs.lineHeight);
    const padL = px(cs.paddingLeft) + px(cs.borderLeftWidth), padR = px(cs.paddingRight) + px(cs.borderRightWidth);
    let x = r.x + padL, w = r.w - padL - padR;
    if (w <= 1) { x = g.left; w = g.right - g.left; }
    const align = { start: 'left', left: 'left', center: 'center', right: 'right', end: 'right', justify: 'justify' }[cs.textAlign] || 'left';
    const slack = Math.max(4, w * 0.02);
    if (align === 'right') x -= slack; else if (align === 'center') x -= slack / 2;
    w += slack;
    const y = g.top - Math.max(0, (lh - g.firstH) / 2);
    const h = Math.max(lh, g.n * lh);
    // 브라우저 줄 수가 <br> 수 + 1 이면 자동 줄바꿈이 없던 블록이므로 PPT에서도 끈다(글꼴 측정 차이로 생기는 추가 줄바꿈 방지).
    const softWrapped = g.n > runs.filter(r => r.breakLine).length + 1;
    ops.push({ type: 'text', x, y, w, h, align, lineHeight: lh, runs, opacity, softWrapped, el: `${tag(el)}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` });
  };

  const shapeOf = (el, cs, r, opacity) => {
    const bg = color(cs.backgroundColor);
    const names = ['Top', 'Right', 'Bottom', 'Left'];
    const sides = names.map(s => { const w = px(cs[`border${s}Width`]), c = color(cs[`border${s}Color`]), st = cs[`border${s}Style`]; return (st === 'none' || st === 'hidden' || !w || !c) ? null : { w, c }; });
    const uniform = sides.every(Boolean) && sides.every(s => s.w === sides[0].w && s.c.hex === sides[0].c.hex);
    const radius = radiusOf(cs);
    if (!bg && !sides.some(Boolean)) return;
    if (bg || uniform) ops.push({ type: 'shape', ...r, fill: bg, line: uniform ? sides[0] : null, radius, opacity });
    if (!uniform) names.forEach((name, i) => {
      const s = sides[i]; if (!s) return;
      const rr = name === 'Top' ? { x: r.x, y: r.y, w: r.w, h: s.w } : name === 'Bottom' ? { x: r.x, y: r.y + r.h - s.w, w: r.w, h: s.w } : name === 'Left' ? { x: r.x, y: r.y, w: s.w, h: r.h } : { x: r.x + r.w - s.w, y: r.y, w: s.w, h: r.h };
      ops.push({ type: 'shape', ...rr, fill: s.c, line: null, radius: 0, opacity });
    });
  };

  // ::before / ::after 가 절대 배치된 배경 상자(불릿 점 등)면 도형으로 옮긴다.
  const pseudo = (el, r, opacity) => {
    for (const which of ['::before', '::after']) {
      const p = getComputedStyle(el, which);
      if (!p || p.content === 'none' || p.content === 'normal' || p.display === 'none' || p.position !== 'absolute') continue;
      const bg = color(p.backgroundColor), w = px(p.width), h = px(p.height);
      if (!bg || !w || !h) continue;
      const x = p.left !== 'auto' ? r.x + px(p.left) : p.right !== 'auto' ? r.x + r.w - px(p.right) - w : r.x;
      const y = p.top !== 'auto' ? r.y + px(p.top) : p.bottom !== 'auto' ? r.y + r.h - px(p.bottom) - h : r.y;
      ops.push({ type: 'shape', x, y, w, h, fill: bg, line: null, radius: radiusOf(p), opacity: opacity * (parseFloat(p.opacity) || 1) });
    }
  };

  const needsRaster = (el, cs) => {
    if (cs.transform !== 'none') {
      const m = cs.transform.match(/^matrix\(([^)]+)\)$/);
      if (!m) return true;
      const [a, b, c, d] = m[1].split(',').map(Number);
      if (Math.abs(a - 1) > 1e-3 || Math.abs(d - 1) > 1e-3 || Math.abs(b) > 1e-3 || Math.abs(c) > 1e-3) return true;
    }
    const mask = cs.maskImage || cs.webkitMaskImage;
    if (cs.clipPath !== 'none' || (mask && mask !== 'none') || cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow !== 'none' && !hasAnyText(el)) return true;
    return false;
  };
  const rasterFrame = (el, cs) => cs.overflow !== 'visible' && radiusOf(cs) > 0 && el.querySelector('img,svg') && !hasAnyText(el);

  const objPos = (v, freeW, freeH) => {
    const parts = v.split(/\s+/);
    const toPct = (s, axis) => { if (s === 'left' || s === 'top') return 0; if (s === 'center') return 50; if (s === 'right' || s === 'bottom') return 100; return s.endsWith('%') ? parseFloat(s) : null; };
    let px0 = toPct(parts[0] || 'center'), py0 = toPct(parts[1] || 'center');
    const ox = px0 === null ? px(parts[0]) : freeW * px0 / 100, oy = py0 === null ? px(parts[1]) : freeH * py0 / 100;
    return [ox, oy];
  };

  const imgOp = (el, cs, r, opacity) => {
    const nw = el.naturalWidth, nh = el.naturalHeight;
    const fit = cs.objectFit || 'fill';
    let box = r, direct = false;
    if (nw && nh && radiusOf(cs) === 0 && !needsRaster(el, cs)) {
      const ar = nw / nh, br = r.w / r.h;
      if (fit === 'fill' || Math.abs(ar / br - 1) < 0.01) direct = true;
      else if (fit === 'contain' || fit === 'scale-down') {
        const s = Math.min(r.w / nw, r.h / nh), dw = nw * s, dh = nh * s;
        const [ox, oy] = objPos(cs.objectPosition, r.w - dw, r.h - dh);
        box = { x: r.x + ox, y: r.y + oy, w: dw, h: dh };
        direct = true;
      }
    }
    if (direct) ops.push({ type: 'image', ...box, src: el.currentSrc || el.src, opacity });
    else ops.push({ type: 'raster', ...r, id: mark(el), opacity, el: 'img' });
  };

  const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing'];
  const svgOp = (el, r, opacity) => {
    const id = mark(el);
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((s, i) => {
      const c = getComputedStyle(s);
      for (const p of SVG_PROPS) { const v = c.getPropertyValue(p); if (v && v !== 'normal') dst[i].setAttribute(p, v); }
      dst[i].removeAttribute('style'); dst[i].removeAttribute('class'); dst[i].removeAttribute('data-pptx-id');
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(r.w)); clone.setAttribute('height', String(r.h));
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${r.w} ${r.h}`);
    ops.push({ type: 'svg', ...r, id, svg: new XMLSerializer().serializeToString(clone), opacity });
  };

  const walk = (el, parentOpacity) => {
    const t = tag(el);
    if (['script', 'style', 'template', 'noscript'].includes(t)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.classList.contains('screen-reader-only') || el.classList.contains('sr-only')) return;
    const opacity = parentOpacity * (parseFloat(cs.opacity) || 1);
    if (opacity <= 0.01) return;
    const r = rel(el.getBoundingClientRect());
    if (t === 'svg') { if (r.w && r.h) svgOp(el, r, opacity); return; }
    if (t === 'img') { if (r.w && r.h) imgOp(el, cs, r, opacity); return; }
    if (t === 'video') { const src = el.currentSrc || el.src || el.querySelector('source')?.src; if (r.w && r.h && src) ops.push({ type: 'video', ...r, id: mark(el), src, opacity }); return; }
    if (t === 'br') return;
    if (r.w > 0 && r.h > 0) {
      if (needsRaster(el, cs) || rasterFrame(el, cs)) { ops.push({ type: 'raster', ...r, id: mark(el), opacity, el: t + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') }); return; }
      shapeOf(el, cs, r, opacity);
      pseudo(el, r, opacity);
    }
    if (isTextBlock(el)) {
      const blocks = [];
      const { runs, nodes } = collect(el, blocks);
      if (runs.some(x => x.text)) textOp(el, cs, r, runs, nodes, opacity);
      for (const b of blocks) walk(b, opacity);
      return;
    }
    for (const k of el.children) walk(k, opacity);
  };

  const bg = color(getComputedStyle(slideEl).backgroundColor) || color(getComputedStyle(document.body).backgroundColor);
  for (const k of slideEl.children) walk(k, 1);
  return { base: { left: base.left, top: base.top, scale }, bg: bg ? bg.hex : 'FFFFFF', ops };
};

// ───────────────────────── Node 쪽 ─────────────────────────
const ISO_CSS = `
html.pptx-iso, html.pptx-iso body, html.pptx-iso .viewport, html.pptx-iso .slide { background: transparent !important; }
html.pptx-iso .slide *:not([data-pptx-keep]):not([data-pptx-anc]) { visibility: hidden !important; }
html.pptx-iso [data-pptx-anc] { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }
html.pptx-iso [data-pptx-anc]::before, html.pptx-iso [data-pptx-anc]::after { visibility: hidden !important; }`;

async function rasterize(page, id, box, base) {
  await page.evaluate(id => {
    document.documentElement.classList.add('pptx-iso');
    const el = document.querySelector(`[data-pptx-id="${id}"]`);
    el.setAttribute('data-pptx-keep', '1');
    for (const d of el.querySelectorAll('*')) d.setAttribute('data-pptx-keep', '1');
    let n = el.parentElement;
    while (n) { n.setAttribute('data-pptx-anc', '1'); n = n.parentElement; }
  }, id);
  const clip = { x: base.left + box.x * base.scale, y: base.top + box.y * base.scale, width: box.w * base.scale, height: box.h * base.scale };
  const buf = await page.screenshot({ clip, omitBackground: true, scale: 'device' });
  await page.evaluate(() => {
    document.documentElement.classList.remove('pptx-iso');
    for (const e of document.querySelectorAll('[data-pptx-keep],[data-pptx-anc]')) { e.removeAttribute('data-pptx-keep'); e.removeAttribute('data-pptx-anc'); }
  });
  return buf;
}

// 캔버스(0..1920 × 0..1080) 밖으로 나간 부분을 잘라낸다.
const clampBox = op => {
  const x1 = Math.max(0, op.x), y1 = Math.max(0, op.y), x2 = Math.min(1920, op.x + op.w), y2 = Math.min(1080, op.y + op.h);
  if (x2 - x1 < 0.5 || y2 - y1 < 0.5) return null;
  return { ...op, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

const FONT_WEIGHTS = [[100, 'Thin'], [200, 'ExtraLight'], [300, 'Light'], [400, ''], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']];
const fontOf = run => {
  let face = run.face;
  if (/^Pretendard/i.test(face)) face = 'Pretendard';
  if (face === 'Pretendard') {
    let best = FONT_WEIGHTS[3];
    for (const fw of FONT_WEIGHTS) if (Math.abs(fw[0] - run.weight) < Math.abs(best[0] - run.weight)) best = fw;
    if (best[1] === 'Bold') return { fontFace: 'Pretendard', bold: true };
    return { fontFace: best[1] ? `Pretendard ${best[1]}` : 'Pretendard', bold: false };
  }
  if (['SF Mono', 'Menlo', 'Consolas', 'JetBrains Mono', 'monospace'].includes(face)) face = 'Menlo';
  if (['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'].includes(face)) face = 'Apple SD Gothic Neo';
  return { fontFace: face, bold: run.weight >= 600 };
};
const transparency = (alpha, opacity) => { const t = Math.round((1 - (alpha ?? 1) * (opacity ?? 1)) * 100); return t > 0 ? t : undefined; };

const pres = new PptxGenJS();
pres.defineLayout({ name: 'GNAR_1920', width: 20, height: 11.25 });
pres.layout = 'GNAR_1920';
pres.title = manifest.title || deckId;
pres.lang = 'ko-KR';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DSF });
const report = [];
const svgPngs = []; // { target, png }
let svgSeq = 0;

for (const slide of manifest.slides) {
  if (only && !only.has(slide.n)) continue;
  await page.goto(pathToFileURL(path.join(deck, slide.file)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.addStyleTag({ content: ISO_CSS });
  const { base, bg, ops } = await page.evaluate(EXTRACT);
  const s = pres.addSlide();
  s.background = { color: bg };
  const counts = { text: 0, shape: 0, image: 0, svg: 0, raster: 0, video: 0 };
  const texts = [];
  for (const raw of ops) {
    const op = clampBox(raw);
    if (!op) continue;
    const geo = { x: inch(op.x), y: inch(op.y), w: inch(op.w), h: inch(op.h) };
    if (op.type === 'shape') {
      const minSide = Math.min(op.w, op.h);
      const shape = op.radius >= minSide / 2 - 0.5 && Math.abs(op.w - op.h) < 1 ? pres.ShapeType.ellipse : op.radius > 0 ? pres.ShapeType.roundRect : pres.ShapeType.rect;
      const o = { ...geo };
      if (op.fill) o.fill = { color: op.fill.hex, transparency: transparency(op.fill.alpha, op.opacity) };
      if (op.line) o.line = { color: op.line.c.hex, width: pt(op.line.w), transparency: transparency(op.line.c.alpha, op.opacity) };
      if (shape === pres.ShapeType.roundRect) o.rectRadius = inch(Math.min(op.radius, minSide / 2));
      s.addShape(shape, o);
      counts.shape++;
    } else if (op.type === 'text') {
      const runs = op.runs.map(r => {
        const f = fontOf(r);
        const o = { fontFace: f.fontFace, bold: f.bold, fontSize: pt(r.size), lang: 'ko-KR', breakLine: !!r.breakLine };
        if (r.color) o.color = r.color.hex;
        const tr = transparency(r.color?.alpha, op.opacity); if (tr) o.transparency = tr;
        if (r.italic) o.italic = true;
        if (r.underline) o.underline = { style: 'sng' };
        if (r.strike) o.strike = 'sngStrike';
        if (r.spacing) o.charSpacing = pt(r.spacing);
        if (r.highlight) o.highlight = r.highlight;
        if (r.text) texts.push(r.text);
        return { text: r.text, options: o };
      });
      s.addText(runs, { ...geo, margin: 0, valign: 'top', align: op.align, lineSpacing: pt(op.lineHeight), paraSpaceBefore: 0, paraSpaceAfter: 0, fit: 'none', wrap: op.softWrapped, autoFit: false });
      counts.text++;
    } else if (op.type === 'image') {
      const file = op.src.startsWith('file:') ? fileURLToPath(op.src) : op.src;
      s.addImage({ path: file, ...geo, transparency: transparency(1, op.opacity) });
      counts.image++;
    } else if (op.type === 'raster') {
      const png = await rasterize(page, op.id, op, base);
      s.addImage({ data: 'image/png;base64,' + png.toString('base64'), ...geo, transparency: transparency(1, op.opacity) });
      counts.raster++;
    } else if (op.type === 'video') {
      // 표지: 컨트롤 없이 포스터만 보이는 상태를 렌더한다. 영상은 원본 파일을 그대로 넣는다.
      const file = op.src.startsWith('file:') ? fileURLToPath(op.src) : op.src;
      const cover = await rasterize(page, op.id, op, base);
      s.addMedia({ type: 'video', path: file, ...geo, cover: 'data:image/png;base64,' + cover.toString('base64') });
      counts.video++;
    } else if (op.type === 'svg') {
      const file = path.join(tmp, `svg-${String(slide.n).padStart(2, '0')}-${++svgSeq}.svg`);
      await writeFile(file, op.svg);
      s.addImage({ path: file, ...geo, transparency: transparency(1, op.opacity) });
      const rel = s._relsMedia.find(m => m.isSvgPng && m.path === file);
      if (rel) svgPngs.push({ target: rel.Target.replace(/^\.\.\//, 'ppt/'), png: await rasterize(page, op.id, op, base) });
      counts.svg++;
    }
  }
  report.push({ n: slide.n, title: slide.title, counts, texts });
  console.log(`[${String(slide.n).padStart(2, '0')}] text ${counts.text} · shape ${counts.shape} · image ${counts.image} · svg ${counts.svg} · raster ${counts.raster}${counts.video ? ` · video ${counts.video}` : ''}`);
}
await browser.close();

// PPTX 쓰기 + SVG의 PNG 대체 이미지 교체(pptxgenjs는 Node에서 깨진 PNG를 넣는다)
const buffer = await pres.write({ outputType: 'nodebuffer' });
const zip = await JSZip.loadAsync(buffer);
for (const { target, png } of svgPngs) if (zip.file(target)) zip.file(target, png);
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('pptx →', path.relative(root, outFile));

// 검사: 추출한 모든 텍스트 런이 PPTX 슬라이드 XML에 들어 있는지
let missingTotal = 0;
if (doCheck) {
  const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  for (let i = 0; i < report.length; i++) {
    const xml = await zip.file(slideFiles[i]).async('string');
    const got = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => unescape(m[1])).join('\n');
    // pptxgenjs는 런 안의 줄바꿈을 문단으로 나누므로 줄 단위로 비교한다.
    const missing = report[i].texts.flatMap(t => t.split('\n').map(l => l.trim()).filter(Boolean)).filter(l => !got.includes(l));
    report[i].missing = missing;
    missingTotal += missing.length;
    if (missing.length) console.log(`[${String(report[i].n).padStart(2, '0')}] 누락 텍스트:`, missing);
  }
  console.log(`${report.length} slides, ${missingTotal} missing text runs`);
}
await writeFile(path.join(outDir, 'pptx-report.json'), JSON.stringify({ file: path.relative(root, outFile), slides: report.map(r => ({ n: r.n, title: r.title, counts: r.counts, missing: r.missing || [] })) }, null, 1));

// 비교 시트: LibreOffice 렌더 vs HTML 미리보기
if (doCompare) {
  const checkDir = path.join(outDir, 'pptx-check');
  await rm(checkDir, { recursive: true, force: true });
  await mkdir(checkDir, { recursive: true });
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', checkDir, outFile], { stdio: 'ignore' });
  const pdf = path.join(checkDir, path.basename(outFile).replace(/\.pptx$/i, '.pdf'));
  execFileSync('pdftoppm', ['-r', '48', '-png', pdf, path.join(checkDir, 'page')]);
  const pages = (await readdir(checkDir)).filter(f => /^page-\d+\.png$/.test(f)).sort();
  const selected = manifest.slides.filter(sl => !only || only.has(sl.n));
  const per = 5;
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  for (let k = 0; k * per < selected.length; k++) {
    const dataUri = async file => file ? 'data:image/png;base64,' + (await readFile(file)).toString('base64') : '';
    const rows = [];
    for (const [i, sl] of selected.slice(k * per, (k + 1) * per).entries()) {
      const html = await dataUri(path.join(deck, sl.preview));
      const pp = await dataUri(pages[k * per + i] ? path.join(checkDir, pages[k * per + i]) : '');
      rows.push(`<div class="row"><div class="n">${String(sl.n).padStart(2, '0')}</div><img src="${html}"><img src="${pp}"></div>`);
    }
    const p = await b.newPage({ viewport: { width: 1340, height: 60 + 390 * rows.length } });
    await p.setContent(`<style>body{margin:0;background:#fff;font:14px sans-serif}.hd{display:grid;grid-template-columns:60px 640px 640px;padding:12px 0 8px;color:#444}.row{display:grid;grid-template-columns:60px 640px 640px;align-items:center;margin-bottom:10px}.row img{width:640px;height:360px;border:1px solid #ccc;object-fit:contain;background:#eee}.n{text-align:center;font-weight:700}</style><div class="hd"><div></div><div>HTML</div><div>PPTX (LibreOffice)</div></div>${rows.join('')}`);
    await p.waitForTimeout(300);
    const file = path.join(outDir, `pptx-compare-${k + 1}.png`);
    await p.screenshot({ path: file, fullPage: true });
    await p.close();
    console.log('compare →', path.relative(root, file));
  }
  await b.close();
}
process.exit(missingTotal ? 1 : 0);
