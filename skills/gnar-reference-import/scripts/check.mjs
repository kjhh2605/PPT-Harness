#!/usr/bin/env node
// Collection-scoped validation and fresh-page thumbnail rendering. No registration.
import { readFile, writeFile, mkdir, realpath, stat, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node check.mjs --manifest reference/imports/<collection>/manifest.json [--root <project>]');
  process.exit(0);
}
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--root', '--manifest'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid arguments. Use --help.');
  options[args[i]] = args[i + 1];
}
if (!options['--manifest']) throw new Error('--manifest is required');
const root = await realpath(options['--root'] || process.cwd());
const inside = p => p === root || p.startsWith(root + path.sep);
async function safePath(relative, { exists = false } = {}) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') || relative.split('/').includes('..')) throw new Error(`Invalid project path: ${relative}`);
  const target = path.resolve(root, relative);
  if (!inside(target) || target === root) throw new Error(`Path leaves project: ${relative}`);
  let current = root;
  for (const component of path.relative(root, target).split(path.sep)) {
    current = path.join(current, component);
    let info;
    try { info = await lstat(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (info.isSymbolicLink()) {
      let resolved;
      try { resolved = await realpath(current); } catch { throw new Error(`Dangling symlink: ${relative}`); }
      if (!inside(resolved)) throw new Error(`Symlink leaves project: ${relative}`);
    }
  }
  if (exists && !(await stat(target)).isFile()) throw new Error(`Expected file: ${relative}`);
  return target;
}
const text = value => typeof value === 'string' && value.trim().length > 0;
function canonical(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('source_url must be an HTTP(S) URL without credentials');
  url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
const manifestFile = await safePath(options['--manifest'], { exists: true });
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
if (manifest.version !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id || '') || manifest.id.length > 80 || !text(manifest.title) || !text(manifest.source_url) || !Array.isArray(manifest.pages) || manifest.pages.length === 0 || manifest.pages.length > 300) throw new Error('Invalid manifest header or pages');
const sourceUrl = canonical(manifest.source_url);
const ids = new Set(), targets = new Set(), inputs = [];
// Validate every input/output path before creating directories, reports, or previews.
for (const entry of manifest.pages) {
  if (!/^S-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '') || !['title', 'layout', 'summary'].every(k => text(entry[k]))) throw new Error('Invalid page metadata');
  if (!['source_status', 'source_note'].every(k => entry[k] === undefined || text(entry[k]))) throw new Error('Invalid optional source metadata');
  if (ids.has(entry.id) || !entry.id.startsWith(`S-${manifest.id}-`) || entry.html !== `reference/slides/${entry.id}.html` || entry.preview !== `reference/previews/${entry.id}.png`) throw new Error(`Invalid or duplicate page paths: ${entry.id}`);
  // Originals are working files only: optional, kept under out/sources/.
  if (entry.source_image !== undefined && !/^out\/sources\//.test(entry.source_image)) throw new Error(`source_image must be under out/sources/: ${entry.id}`);
  const html = await safePath(entry.html, { exists: true });
  const preview = await safePath(entry.preview);
  const source = entry.source_image === undefined ? null : await safePath(entry.source_image, { exists: true });
  if (targets.has(preview)) throw new Error(`Duplicate preview target: ${entry.preview}`);
  const pageSourceUrl = entry.source_url === undefined ? sourceUrl : canonical(entry.source_url);
  ids.add(entry.id); targets.add(preview); inputs.push({ ...entry, pageSourceUrl, htmlPath: html, previewPath: preview, sourcePath: source });
}
const reportPath = await safePath(`out/reference-import/${manifest.id}/qa.json`);
const palette = JSON.parse(await readFile(await safePath('design/palettes/brand.json', { exists: true }), 'utf8'));
const allowed = new Set([...Object.values(palette.light), ...Object.values(palette.dark)].filter(v => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v)).map(v => v.toUpperCase()));
if (!allowed.size) throw new Error('Brand palette has no usable colors');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const issues = [], files = [];
const check = (condition, id, message, details) => { if (!condition) issues.push({ id, message, ...(details ? { details } : {}) }); };
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
try {
  for (const entry of inputs) {
    const page = await context.newPage();
    page.on('pageerror', error => issues.push({ id: entry.id, message: error.message }));
    try {
      const html = await readFile(entry.htmlPath, 'utf8');
      const colors = [...html.matchAll(/(?:[:=]\s*["']?\s*)(#[\da-f]{3,8})\b/gi)].map(m => m[1].toUpperCase());
      check(colors.every(c => allowed.has(c)), entry.id, 'Non-brand literal hex color', [...new Set(colors.filter(c => !allowed.has(c)))]);
      check(!/(?:linear|radial|conic)-gradient\s*\(/i.test(html), entry.id, 'Gradient conflicts with brand rules');
      await page.goto(pathToFileURL(entry.htmlPath).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready); await frames(page);
      const metadata = await page.evaluate(() => ({ source: document.querySelector('meta[name="source"]')?.content, image: document.querySelector('meta[name="reference-image"]')?.content, id: document.querySelector('.slide')?.dataset.slideId }));
      let matchesSource = false;
      try { matchesSource = canonical(metadata.source) === entry.pageSourceUrl; } catch {}
      check(matchesSource, entry.id, 'Source meta does not match source_url');
      if (entry.source_image !== undefined) check([entry.source_image, path.basename(entry.source_image)].includes(metadata.image), entry.id, 'reference-image meta does not match source_image');
      else check(text(metadata.image) && !metadata.image.includes('/'), entry.id, 'reference-image meta must name the original file (filename only)');
      check(metadata.id === entry.id, entry.id, 'data-slide-id does not match page ID');
      const measurement = await page.evaluate(sourceImageName => {
        const slide = document.querySelector('.slide');
        if (!slide) return { missing: true };
        const r = slide.getBoundingClientRect(), outside = [], overflowing = [], smallText = [], clippingIssues = [], paintColors = new Set(), validClips = new Set();
        let clippedTextFragments = 0;
        for (const clip of slide.querySelectorAll('[data-intentional-clip]')) {
          const rect = clip.getBoundingClientRect(), style = getComputedStyle(clip);
          if (clip.dataset.intentionalClip !== 'horizontal-carousel' || !['hidden', 'clip'].includes(style.overflowX) || rect.left < r.left - 2 || rect.top < r.top - 2 || rect.right > r.right + 2 || rect.bottom > r.bottom + 2) clippingIssues.push('Invalid intentional horizontal clip container');
          else validClips.add(clip);
        }
        const visibleRect = (rect, element) => {
          const clip = element.closest('[data-intentional-clip="horizontal-carousel"]');
          if (!validClips.has(clip)) return rect;
          const bounds = clip.getBoundingClientRect();
          const left = Math.max(rect.left, bounds.left), right = Math.min(rect.right, bounds.right);
          if (left !== rect.left || right !== rect.right) clippedTextFragments++;
          // Documented carousels clip horizontally only. Preserve vertical
          // overflow and the independent element-level overflow checks.
          return { left, right, top: rect.top, bottom: rect.bottom, width: Math.max(0, right - left), height: rect.height };
        };
        const visible = el => {
          if (el.closest('script,style,svg title,svg desc,.sr-only,.screen-reader-only,[aria-live]')) return false;
          for (let p = el; p && p !== slide.parentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; }
          return true;
        };
        const beyond = b => b.width > 0 && b.height > 0 && (b.left < r.left - 2 || b.top < r.top - 2 || b.right > r.right + 2 || b.bottom > r.bottom + 2);
        const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) {
          const el = node.parentElement;
          if (!node.textContent.trim() || !visible(el) || el.closest('svg')) continue;
          const range = document.createRange(); range.selectNodeContents(node); const rects = [...range.getClientRects()].map(rect => visibleRect(rect, el));
          if (!rects.some(b => b.width && b.height)) continue;
          const sample = node.textContent.trim().slice(0, 90);
          if (rects.some(beyond)) outside.push(sample);
          const box = el.getBoundingClientRect();
          const scale = Math.min(el.offsetWidth ? box.width / el.offsetWidth : 1, el.offsetHeight ? box.height / el.offsetHeight : 1);
          if (parseFloat(getComputedStyle(el).fontSize) * scale < 19.5) smallText.push(sample);
        }
        for (const el of slide.querySelectorAll('svg text')) {
          if (!visible(el)) continue;
          const rect = visibleRect(el.getBoundingClientRect(), el);
          if (!rect.width || !rect.height) continue;
          if (beyond(rect)) outside.push(el.textContent.trim());
          const m = el.getScreenCTM(); if (parseFloat(getComputedStyle(el).fontSize) * (m ? Math.hypot(m.a, m.b) : 1) < 19.9) smallText.push(el.textContent.trim());
        }
        for (const el of slide.querySelectorAll('h1,h2,h3,h4,p,td,th,li,blockquote,figcaption')) if (visible(el) && !el.closest('svg') && getComputedStyle(el).display !== 'inline' && (el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3)) overflowing.push(el.textContent.trim().slice(0, 90));
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d');
        let largeRaster = false, originalAsSlide = false;
        for (const el of [slide, ...slide.querySelectorAll('*')]) {
          if (!visible(el)) continue;
          const style = getComputedStyle(el), box = el.getBoundingClientRect();
          for (const property of ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','fill','stroke']) {
            const color = style[property]; if (!color || ['none','transparent'].includes(color) || color.startsWith('url(')) continue;
            const rgb = color.match(/^rgba?\(([^)]+)\)$/), srgb = color.match(/^color\(srgb\s+([^)]+)\)$/);
            const parsed = (rgb?.[1] || srgb?.[1])?.match(/[\d.]+/g)?.map(Number);
            if (parsed) { if (parsed.length < 4 || parsed[3] > 0) paintColors.add('#'+parsed.slice(0,3).map(v=>Math.round(srgb ? v*255 : v).toString(16).padStart(2,'0')).join('').toUpperCase()); }
            else { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); const data = ctx.getImageData(0,0,1,1).data; if (data[3]) paintColors.add('#'+[...data.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()); }
          }
          if (box.width * box.height < r.width * r.height * .9) continue;
          const image = el.currentSrc || el.getAttribute('href') || el.getAttribute('xlink:href') || '';
          const raster = ['IMG','CANVAS','image'].includes(el.tagName) || /url\(/.test(style.backgroundImage);
          if (raster) largeRaster = true;
          if (raster && sourceImageName && (image.includes(sourceImageName) || style.backgroundImage.includes(sourceImageName))) originalAsSlide = true;
        }
        const rasterOnly = originalAsSlide || (largeRaster && slide.innerText.trim().length < 20);
        return { width:r.width, height:r.height, outside, overflowing, smallText, clippingIssues, clippedTextFragments, rasterOnly, paintColors:[...paintColors], fontsLoaded:[...document.fonts].some(f => f.family.replace(/["']/g, '').includes('Pretendard') && f.status === 'loaded') };
      }, entry.source_image === undefined ? '' : path.basename(entry.source_image));
      check(!measurement.missing, entry.id, 'Missing .slide');
      if (!measurement.missing) {
        check(Math.abs(measurement.width - 1920) < 1 && Math.abs(measurement.height - 1080) < 1, entry.id, 'Canvas must be 1920×1080');
        for (const key of ['outside', 'overflowing', 'smallText', 'clippingIssues']) check(measurement[key].length === 0, entry.id, `Text validation: ${key}`, measurement[key]);
        check(measurement.paintColors.every(c => allowed.has(c)), entry.id, 'Non-brand rendered color', measurement.paintColors.filter(c => !allowed.has(c)));
        check(!measurement.rasterOnly, entry.id, 'Possible whole-slide screenshot; confirm editable reconstruction');
        check(measurement.fontsLoaded, entry.id, 'Pretendard did not load; verify the font source');
        for (const size of [{ width:1365, height:768 }, { width:390, height:844 }]) {
          await page.setViewportSize(size); await frames(page);
          const b = await page.locator('.slide').boundingBox();
          check(b && b.x >= -1 && b.y >= -1 && b.x + b.width <= size.width + 1 && b.y + b.height <= size.height + 1 && Math.abs(b.width / b.height - 16 / 9) < .001, entry.id, `Slide does not fit ${size.width}px viewport`, b);
        }
      }
      // Never screenshot a page after viewport changes: Chrome can duplicate tiles.
      const preview = await context.newPage();
      try { await preview.setViewportSize({ width:960, height:540 }); await preview.goto(pathToFileURL(entry.htmlPath).href, { waitUntil:'load' }); await preview.evaluate(() => document.fonts.ready); await frames(preview); await mkdir(path.dirname(entry.previewPath), { recursive:true }); await preview.screenshot({ path:entry.previewPath }); }
      finally { await preview.close(); }
      files.push({ id:entry.id, html:entry.html, preview:entry.preview, ...measurement });
    } catch (error) { issues.push({ id:entry.id, message:error.message }); }
    finally { await page.close(); }
  }
} finally { await context.close(); await browser.close(); }
await mkdir(path.dirname(reportPath), { recursive:true });
await writeFile(reportPath, JSON.stringify({ version:1, collection:manifest.id, source_url:manifest.source_url, checkedAt:new Date().toISOString(), files, issues }, null, 2) + '\n');
console.log(`Checked ${files.length}/${inputs.length} pages; ${issues.length} issue(s). ${path.relative(root, reportPath)}`);
if (issues.length) { console.error(JSON.stringify(issues, null, 2)); process.exitCode = 1; }
