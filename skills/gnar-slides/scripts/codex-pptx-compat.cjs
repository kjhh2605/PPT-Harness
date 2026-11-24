// Process-local Codex adapter. Never edits pptxgenjs or the shared exporter.
// pptxgenjs 4.0.1 leaves trailing newlines inside rich-text a:t runs and
// splits other newlines into paragraphs. Normalize them before serialization.
const PptxGenJS = require('pptxgenjs');

function normalizeRuns(input) {
  if (!Array.isArray(input)) return input;
  return input.flatMap(run => {
    if (typeof run.text !== 'string' || !/[\r\n]/.test(run.text)) return [run];
    const parts = run.text.replace(/\r\n?/g, '\n').split('\n');
    return parts.flatMap((text, index) => {
      const newline = index < parts.length - 1;
      // A trailing newline is represented by the preceding breakLine.
      // Empty segments before another newline represent intentional blank lines.
      if (!text && !newline && !run.options?.breakLine) return [];
      return [{ ...run, text, options: { ...run.options,
        breakLine: newline || Boolean(run.options?.breakLine) } }];
    });
  });
}

const originalAddSlide = PptxGenJS.prototype.addSlide;
PptxGenJS.prototype.addSlide = function (...args) {
  const slide = originalAddSlide.apply(this, args);
  const originalAddText = slide.addText;
  slide.addText = function (text, options) {
    return originalAddText.call(this, normalizeRuns(text), options);
  };
  return slide;
};

module.exports = { normalizeRuns };
