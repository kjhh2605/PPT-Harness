"""Development helper: emits a standalone HTML slide, no runtime dependency."""
from pathlib import Path
import html

ROOT = Path(__file__).resolve().parents[1]

BASE_CSS = """
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; height: 100%; }
body { background: var(--bg); color: var(--text); font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; -webkit-font-smoothing: antialiased; }
.viewport { width: 100%; height: 100%; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); place-items: center; overflow: hidden; }
.slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; flex-shrink: 0; fill: var(--text); background: var(--surface); transform-origin: center center; }
h1, h2, h3, p, figure { margin: 0; }
svg { display: block; }
.eyebrow { font-size: 25px; font-weight: 650; color: var(--muted); letter-spacing: -.4px; }
.slide-title { font-size: 64px; font-weight: 750; line-height: 1.25; letter-spacing: -2.3px; color: var(--ink); word-break: keep-all; }
.slide-copy { font-size: 28px; line-height: 1.6; letter-spacing: -.6px; color: var(--muted); word-break: keep-all; }
.slide-header { position: absolute; top: 112px; left: 132px; right: 132px; }
.slide-header .eyebrow { margin-bottom: 20px; }
.slide-header .slide-copy { margin-top: 25px; }
.slide-footer { position: absolute; left: 132px; right: 132px; bottom: 60px; display: flex; justify-content: space-between; align-items: center; font-size: 20px; line-height: 1; color: var(--muted); }
.wordmark { color: var(--ink); font-size: 30px; font-weight: 800; letter-spacing: -1.4px; }
.screen-reader-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media print {
  @page { size: 20in 11.25in; margin: 0; }
  html, body, .viewport { width: 1920px; height: 1080px; overflow: visible; }
  .slide { transform: none !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
"""

FIT_JS = """
(() => {
  const slide = document.querySelector('.slide');
  const fit = () => { slide.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; };
  const theme = new URLSearchParams(location.search).get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  addEventListener('resize', fit); fit();
  // file:// frames have isolated origins; relay navigation without reading parent DOM.
  if (parent !== window) document.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'f', 'F'].includes(event.key)) return;
    if (event.target.closest('button,input,textarea,select,[contenteditable],.carousel-controls,.carousel-nav')) return;
    queueMicrotask(() => {
      if (!event.defaultPrevented) parent.postMessage({ type: 'gnar-slide-key', key: event.key, shiftKey: event.shiftKey }, '*');
    });
  });
})();
"""

def document(title, body, css='', slide_id='', source_image='', source_url='', theme='light'):
    tokens = (ROOT / 'design/tokens.css').read_text()
    return f'''<!doctype html>
<html lang="ko" data-theme="{html.escape(theme, quote=True)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="source" content="{html.escape(source_url, quote=True)}">
<meta name="reference-image" content="{html.escape(source_image, quote=True)}">
<title>{html.escape(title)} · Gnar</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<style>\n{tokens}\n{BASE_CSS}\n{css}\n</style>
</head>
<body>
<div class="viewport"><main class="slide" data-slide-id="{html.escape(slide_id, quote=True)}" aria-label="{html.escape(title, quote=True)}">{body}</main></div>
<script>{FIT_JS}</script>
</body>
</html>
'''

def write_slide(filename, title, body, css='', source_image='', source_url='', theme='light'):
    path = ROOT / 'reference/slides' / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(document(title, body, css, path.stem, source_image, source_url, theme))
    return path
