// LaTeX math transcoding (F17) via the KaTeX engine.
// Targets: MathML markup, standalone SVG (foreignObject), PNG raster, HTML.

import katex from 'katex';

export interface MathSource {
  /** The LaTeX string; display mode is applied unless inline is requested. */
  tex: string;
  displayMode: boolean;
}

function extractHtml(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    errorColor: '#b91c1c',
    output: 'html',
  });
}

/** LaTeX -> MathML (KaTeX native MathML output). */
export function latexToMathMl(source: MathSource): string {
  const rendered = katex.renderToString(source.tex, {
    displayMode: source.displayMode,
    throwOnError: false,
    output: 'mathml',
  });
  const match = /<math[\s\S]*<\/math>/.exec(rendered);
  const math = match ? match[0] : rendered;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${math}\n`;
}

function katexCssForSvg(): string {
  // Geometry-critical subset: KaTeX relies on these for layout. Font URLs are
  // intentionally omitted; standalone SVG renderings fall back to system fonts.
  return `
.katex { font: normal 1.21em KaTeX_Main, "Times New Roman", serif; line-height: 1.2; text-indent: 0; }
.katex .mathnormal { font-family: KaTeX_Math, "Times New Roman", serif; font-style: italic; }
.katex .mord { font-family: KaTeX_Main, "Times New Roman", serif; }
.katex .mbin, .katex .mrel, .katex .mopen, .katex .mclose, .katex .mpunct, .katex .minner { font-family: KaTeX_Main, "Times New Roman", serif; }
.katex .mfrac .frac-line { border-bottom-style: solid; }
.katex .sqrt > .root { margin-left: 0.28em; }
.katex .msupsub { text-align: left; }
.katex .vlist { border-collapse: collapse; }
`.trim();
}

/** LaTeX -> standalone SVG (foreignObject embedding of the KaTeX layout). */
export function latexToSvg(source: MathSource, fontPx = 24): string {
  const html = extractHtml(source.tex, source.displayMode);
  // Width/height are estimated from expression length; browsers reflow the
  // foreignObject content, so overflow stays visible.
  const estimatedWidth = Math.max(160, source.tex.length * fontPx * 0.7);
  const estimatedHeight = source.displayMode ? fontPx * 4 : fontPx * 2.6;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(estimatedWidth)}" height="${Math.round(estimatedHeight)}" viewBox="0 0 ${Math.round(estimatedWidth)} ${Math.round(estimatedHeight)}">`,
    '<title>LaTeX equation rendering</title>',
    `<style>${katexCssForSvg()}</style>`,
    `<foreignObject x="0" y="0" width="100%" height="100%">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${fontPx}px; color:#111827;">${html}</div>`,
    '</foreignObject>',
    '</svg>',
    '',
  ].join('\n');
}

/**
 * LaTeX -> PNG raster. Rasterizes the foreignObject SVG in-browser. Requires a
 * DOM/canvas environment (the workspace UI); throws a clear error elsewhere.
 */
export async function latexToPng(source: MathSource, fontPx = 24, scale = 2): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('PNG equation rendering requires a browser environment.');
  }
  const svg = latexToSvg(source, fontPx);
  const width = Math.max(160, source.tex.length * fontPx * 0.7) * scale;
  const height = (source.displayMode ? fontPx * 4 : fontPx * 2.6) * scale;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The equation SVG could not be rasterized in this browser.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))), 'image/png');
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** LaTeX -> minimal HTML5 page with the rendered equation. */
export function latexToHtml(source: MathSource, title: string): string {
  const html = extractHtml(source.tex, source.displayMode);
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapedTitle}</title>`,
    `<style>${katexCssForSvg()} body { font-size: 28px; padding: 3rem; }</style>`,
    '</head>',
    `<body>${html}</body>`,
    '</html>',
    '',
  ].join('\n');
}

/** Extract math source from a .tex file: equation environments or raw body. */
export function extractTexSource(text: string): MathSource {
  const environments = ['equation*', 'equation', 'align*', 'align', 'gather*', 'gather', 'displaymath', 'math'];
  for (const env of environments) {
    const match = new RegExp(`\\\\begin\\{${env.replace('*', '\\*')}\\}([\\s\\S]*?)\\\\end\\{${env.replace('*', '\\*')}\\}`).exec(text);
    if (match) return { tex: match[1].trim(), displayMode: true };
  }
  const dollars = /\$\$([\s\S]+?)\$\$/.exec(text);
  if (dollars) return { tex: dollars[1].trim(), displayMode: true };
  const inline = /\$([^$\n]+?)\$/.exec(text);
  if (inline) return { tex: inline[1].trim(), displayMode: false };
  return { tex: text.trim(), displayMode: true };
}
