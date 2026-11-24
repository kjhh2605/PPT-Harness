import { chromium } from 'playwright';
import { access, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = path.join(root, 'reference');
const slidesDir = path.join(reference, 'slides');
const output = path.join(root, 'out/qa');
const args = process.argv.slice(2);
let collectionId = null, jobs = 4, skipGallery = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--original') collectionId = 'bysu-325182';
  else if (args[i] === '--collection') {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('--collection requires a project ID, e.g. 452912');
    collectionId = value.startsWith('bysu-') ? value : `bysu-${value}`;
  } else if (args[i] === '--jobs') {
    jobs = Number(args[++i]);
    if (!Number.isInteger(jobs) || jobs < 1 || jobs > 8) throw new Error('--jobs must be between 1 and 8');
  } else if (args[i] === '--skip-gallery') skipGallery = true;
  else if (args[i] === '--help') {
    console.log('Usage: npm run check -- [--collection 452912 | --original] [--jobs 4] [--skip-gallery]\nChecks registered HTML, source metadata, palette, overflow, scaling and gallery navigation. Rebuilds previews for the selected slides.');
    process.exit(0);
  } else throw new Error(`Unknown option: ${args[i]}`);
}
const library = JSON.parse(await readFile(path.join(reference, 'library.json'), 'utf8'));
if (collectionId && !library.collections.some(collection => collection.id === collectionId)) throw new Error(`Unknown collection: ${collectionId}`);
const slides = library.slides.filter(slide => !collectionId || slide.collectionId === collectionId);
if (!slides.length) throw new Error('No slides selected; run npm run build:library first.');
const errors = [], results = new Array(slides.length);
const assert = (condition, message) => { if (!condition) errors.push(message); };
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const brand = JSON.parse(await readFile(path.join(root, 'design/palettes/brand.json'), 'utf8'));
const allowedHex = new Set([...Object.values(brand.light), ...Object.values(brand.dark)].filter(value => typeof value === 'string' && value.startsWith('#')).map(value => value.toUpperCase()));
const sourceMeta = (source, name) => {
  const tag = [...source.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]).find(value => new RegExp(`\\bname=["']${name}["']`, 'i').test(value));
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1]?.replaceAll('&amp;', '&') || '';
};
await mkdir(output, { recursive: true });
await mkdir(path.join(reference, 'previews'), { recursive: true });
assert(library.slideCount === library.slides.length, 'Library slideCount must match its registered slides');
assert(new Set(library.slides.map(slide => slide.id)).size === library.slides.length, 'Slide IDs must be unique');
assert(new Set(library.slides.map(slide => slide.preview)).size === library.slides.length, 'Preview filenames must be unique');
if (!collectionId) {
  const registered = new Set(library.slides.map(slide => slide.file));
  const unregistered = (await readdir(slidesDir)).filter(file => /^S-(?:toss|bysu)-.*\.html$/.test(file) && !registered.has(file));
  assert(!unregistered.length, `Unregistered slide HTML: ${unregistered.join(', ')}`);
}
for (const collection of library.collections.filter(item => !collectionId || item.id === collectionId)) {
  const selected = slides.filter(slide => slide.collectionId === collection.id);
  assert(selected.length === collection.slideCount, `${collection.id}: collection count does not match library`);
  assert(new Set(selected.map(slide => slide.order)).size === selected.length, `${collection.id}: duplicate source order`);
  // Source images are not kept in the repository, so no per-collection source manifest is checked.
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  let cursor = 0, finished = 0;
  async function worker() {
    const page = await context.newPage();
    let activeFile = '';
    page.on('pageerror', error => errors.push(`${activeFile}: browser error: ${error.message}`));
    while (cursor < slides.length) {
      const index = cursor++, slide = slides[index];
      activeFile = slide.file;
      try {
        const source = await readFile(path.join(slidesDir, slide.file), 'utf8');
        assert(!/(?:linear|radial|conic)-gradient\s*\(/.test(source), `${slide.file}: gradient found`);
        assert(!/<img\b/i.test(source), `${slide.file}: raster image found`);
        const literalColors = [...source.matchAll(/#[\da-fA-F]{6}\b/g)].map(match => match[0].toUpperCase());
        assert(literalColors.every(color => allowedHex.has(color)), `${slide.file}: non-brand color`);
        assert(sourceMeta(source, 'source') === slide.sourceUrl, `${slide.file}: source URL does not match catalog`);
        const referenceImage = sourceMeta(source, 'reference-image');
        assert(referenceImage && !referenceImage.includes('/'), `${slide.file}: reference-image meta must name the original file (filename only)`);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(pathToFileURL(path.join(slidesDir, slide.file)).href, { waitUntil: 'load', timeout: 45000 });
        await page.evaluate(() => document.fonts.ready);
        const measurements = await page.evaluate(() => {
          const slide = document.querySelector('.slide');
          if (!slide) throw new Error('Missing .slide canvas');
          const bounds = slide.getBoundingClientRect(), outside = [], overflowing = [], clippingIssues = [];
          let clippedTextFragments = 0;
          for (const clip of slide.querySelectorAll('[data-intentional-clip]')) {
            const rect = clip.getBoundingClientRect(), style = getComputedStyle(clip);
            if (clip.dataset.intentionalClip !== 'horizontal-carousel' || !['hidden', 'clip'].includes(style.overflowX) || rect.left < bounds.left - 2 || rect.top < bounds.top - 2 || rect.right > bounds.right + 2 || rect.bottom > bounds.bottom + 2) clippingIssues.push('Invalid intentional horizontal clip container');
          }
          const visibleRect = (rect, element) => {
            const clip = element.closest('[data-intentional-clip="horizontal-carousel"]');
            if (!clip || !['hidden', 'clip'].includes(getComputedStyle(clip).overflowX)) return rect;
            const clipBounds = clip.getBoundingClientRect();
            const left = Math.max(rect.left, clipBounds.left), right = Math.min(rect.right, clipBounds.right);
            if (left !== rect.left || right !== rect.right) clippedTextFragments++;
            // Only horizontal clipping is documented. Vertical overflow and
            // text overflowing its own element still fail the normal checks.
            return { left, right, top: rect.top, bottom: rect.bottom, width: Math.max(0, right - left), height: rect.height };
          };
          const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim() || node.parentElement.closest('svg,script,style,.screen-reader-only,.sr-only,[aria-live]')) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            for (const rawRect of range.getClientRects()) {
              const rect = visibleRect(rawRect, node.parentElement);
              if (rect.width && rect.height && (rect.left < bounds.left - 2 || rect.top < bounds.top - 2 || rect.right > bounds.right + 2 || rect.bottom > bounds.bottom + 2)) outside.push(node.textContent.trim().slice(0, 60));
            }
          }
          for (const element of slide.querySelectorAll('h1,h2,h3,p,td,th,li')) {
            if (element.closest('svg,.screen-reader-only,.sr-only,[aria-live]') || getComputedStyle(element).display === 'inline') continue;
            if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) overflowing.push(`${element.tagName}: ${element.textContent.trim().slice(0, 60)}`);
          }
          for (const element of slide.querySelectorAll('svg text')) {
            const rect = visibleRect(element.getBoundingClientRect(), element);
            if (rect.width && rect.height && (rect.left < bounds.left - 2 || rect.top < bounds.top - 2 || rect.right > bounds.right + 2 || rect.bottom > bounds.bottom + 2)) outside.push(`SVG: ${element.textContent.trim().slice(0, 60)}`);
          }
          return { width: bounds.width, height: bounds.height, scrollWidth: slide.scrollWidth, scrollHeight: slide.scrollHeight, outside, overflowing, clippingIssues, clippedTextFragments, fontsLoaded: document.fonts.check('600 32px "Pretendard Variable"'), bodyBackground: getComputedStyle(slide).backgroundColor };
        });
        assert(measurements.width === 1920 && measurements.height === 1080, `${slide.file}: canvas is not 1920×1080`);
        assert(measurements.outside.length === 0, `${slide.file}: text outside canvas: ${measurements.outside.join(', ')}`);
        assert(measurements.overflowing.length === 0, `${slide.file}: text overflow: ${measurements.overflowing.join(', ')}`);
        assert(measurements.clippingIssues.length === 0, `${slide.file}: ${measurements.clippingIssues.join(', ')}`);
        assert(measurements.scrollWidth <= 1921 && measurements.scrollHeight <= 1081, `${slide.file}: canvas overflow`);
        await page.screenshot({ path: path.join(output, `${slide.id}.png`) });
        const sizes = [];
        for (const size of [{ width: 1365, height: 768 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(size);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const fit = await page.evaluate(() => { const rect = document.querySelector('.slide').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight }; });
          assert(fit.x >= -1 && fit.y >= -1 && fit.x + fit.width <= size.width + 1 && fit.y + fit.height <= size.height + 1, `${slide.file}: does not fit ${size.width}px viewport`);
          assert(Math.abs(fit.width / fit.height - 16 / 9) < .001, `${slide.file}: wrong aspect ratio on ${size.width}px`);
          sizes.push(fit);
        }
        const preview = path.resolve(reference, slide.preview);
        await mkdir(path.dirname(preview), { recursive: true });
        // A fresh page at the target viewport avoids Chrome reusing stale tiles
        // after the desktop/mobile resize sequence above.
        const previewPage = await context.newPage();
        try {
          await previewPage.setViewportSize({ width: 960, height: 540 });
          await previewPage.goto(pathToFileURL(path.join(slidesDir, slide.file)).href, { waitUntil: 'load', timeout: 45000 });
          await previewPage.evaluate(() => document.fonts.ready);
          await previewPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await previewPage.screenshot({ path: preview });
        } finally { await previewPage.close(); }
        results[index] = { id: slide.id, collectionId: slide.collectionId, file: slide.file, ...measurements, sizes };
      } catch (error) {
        errors.push(`${slide.file}: ${error.message}`);
        results[index] = { id: slide.id, file: slide.file, error: error.message };
      }
      finished++;
      if (finished % 10 === 0 || finished === slides.length) console.log(`Rendered ${finished}/${slides.length} slides`);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: Math.min(jobs, slides.length) }, worker));
  if (!skipGallery) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`Gallery browser error: ${error.message}`));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.join(reference, 'index.html')).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const embedded = await page.locator('#library-data').textContent();
    assert(JSON.parse(embedded).slides.length === library.slides.length, 'Embedded gallery data is stale; rebuild library');
    assert(await page.locator('.card').count() === library.slides.length, 'Gallery card count must match library');
    assert(await page.locator('#collection option').count() === library.collections.length + 1, 'Collection selector must include every collection');
    for (const collection of library.collections) {
      await page.locator('#collection').selectOption(collection.id);
      assert(await page.locator('.card:visible').count() === collection.slideCount, `${collection.id}: gallery collection filter count`);
    }
    const testCollection = collectionId || slides[0].collectionId;
    const selected = library.slides.filter(slide => slide.collectionId === testCollection);
    await page.locator('#collection').selectOption(testCollection);
    for (const tone of ['light', 'dark', 'brand']) {
      await page.locator(`[data-filter="${tone}"]`).click();
      assert(await page.locator('.card:visible').count() === selected.filter(slide => slide.type === tone).length, `${testCollection}: ${tone} filter count`);
    }
    await page.locator('[data-filter="all"]').click();
    const search = selected[0].title;
    await page.locator('#search').fill(search);
    const expectedSearch = selected.filter(slide => [slide.title, slide.description, slide.collectionTitle, slide.layout, slide.order, ...slide.tags].join(' ').toLowerCase().includes(search.toLowerCase())).length;
    assert(await page.locator('.card:visible').count() === expectedSearch, 'Search should match catalog content');
    await page.locator('#search').fill('존재하지않는화면_qa');
    assert(await page.locator('#empty').isVisible(), 'Empty search should show message');
    assert(await page.locator('#present').isDisabled(), 'Empty selection must disable presentation');
    await page.locator('#search').fill('');
    // Thumbnail generation is scoped; verify the selected first preview only.
    const firstImage = page.locator('.card:visible .preview img').first();
    await firstImage.scrollIntoViewIfNeeded();
    await firstImage.evaluate(image => image.decode().catch(() => {}));
    assert(await firstImage.evaluate(image => image.complete && image.naturalWidth === 960), 'Selected collection preview must load at 960px');
    await page.locator('#present').click();
    assert(await page.locator('#viewer').isVisible(), 'Presenter should open');
    assert(await page.locator('#prev').isDisabled(), 'Previous should be disabled on first selected slide');
    assert(await page.locator('#slide-frame').getAttribute('src') === `slides/${selected[0].file}`, 'Presenter must start with selected collection');
    if (selected.length > 1) {
      await page.locator('#next').click();
      assert(await page.locator('#slide-frame').getAttribute('src') === `slides/${selected[1].file}`, 'Next must follow selected collection order');
      await page.keyboard.press('ArrowLeft');
      assert(await page.locator('#prev').isDisabled(), 'Keyboard previous should return to first slide');
      await page.frameLocator('#slide-frame').locator('.slide').click({ position: { x: 10, y: 10 } });
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(expected => document.querySelector('#slide-frame').getAttribute('src') === expected, `slides/${selected[1].file}`, { timeout: 3000 }).catch(() => {});
      assert(await page.locator('#slide-frame').getAttribute('src') === `slides/${selected[1].file}`, 'Keyboard navigation must work after focusing a file:// slide iframe');
      await page.locator('#close').focus();
      await page.keyboard.press('Home');
    }
    assert(await page.locator('#compare').isHidden(), 'Comparison button must stay hidden when no source image is stored');
    assert(await page.locator('#slide-frame').isVisible(), 'HTML should show');
    await page.keyboard.press('End');
    assert(await page.locator('#next').isDisabled(), 'Next should be disabled on last selected slide');
    assert(await page.locator('#slide-frame').getAttribute('src') === `slides/${selected.at(-1).file}`, 'End must remain within selected collection');
    assert((await page.locator('#position').textContent()).endsWith(`/ ${selected.length}`), 'Presentation count must reflect current filters');
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#viewer').isVisible()), 'Escape should close presenter');
    await page.screenshot({ path: path.join(output, 'gallery-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile gallery must not scroll horizontally');
    await page.screenshot({ path: path.join(output, 'gallery-mobile.png'), fullPage: false });
    await page.locator('#present').click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile presenter must not scroll horizontally');
    await page.screenshot({ path: path.join(output, 'presenter-mobile.png') });
    await page.locator('#close').click();
    await page.close();
  }
  await context.close();
} finally { await browser.close(); }
const report = { checkedAt: new Date().toISOString(), collection: collectionId || 'all', slides: results, errors };
const reportName = collectionId ? `report-${collectionId}.json` : 'report.json';
await writeFile(path.join(output, reportName), JSON.stringify(report, null, 2));
console.log(`Checked ${results.length} slides at desktop, laptop and mobile sizes${skipGallery ? '' : '; gallery filters, search and navigation'}.`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS — no source mismatch, text overflow, non-brand colors or navigation failures. Report: out/qa/${reportName}`);
