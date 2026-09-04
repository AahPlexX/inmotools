import katex from 'katex';
// Side-effect import: registers the \ce{} chemistry-notation macro on the
// shared katex module. This extension's real, documented scope is limited
// to \ce{} - it does not implement the full LaTeX mhchem package.
import 'katex/contrib/mhchem';
import type { MathRenderResult } from './markdown-types';

// Direct KaTeX rendering for contexts outside the remark/rehype preview
// pipeline (standalone HTML export, DOCX rasterization) where render-engine's
// pipeline-level error handling is not in play. Unlike rehype-katex (which
// never throws), the direct katex.renderToString API throws a ParseError for
// malformed input when throwOnError is true, so this wrapper is the one
// place in this tool that needs its own try/catch around a KaTeX call.
//
// KaTeX's native `CD` environment (commutative diagrams) is built into KaTeX
// core and requires display mode; it is unrelated to LaTeX's `tikz-cd`
// package, which requires a full LaTeX engine and cannot run in a browser.

export const renderMath = (source: string, displayMode: boolean): MathRenderResult => {
  try {
    const html = katex.renderToString(source, { displayMode, throwOnError: true });
    return { html };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KaTeX render error.';
    return {
      html: `<span class="katex-error" title="${message.replace(/"/g, '&quot;')}">${source}</span>`,
      error: message,
    };
  }
};
