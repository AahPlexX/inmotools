import katex from 'katex';
// Side-effect import: registers the \ce{} chemistry-notation macro on the
// shared katex module. This extension's real, documented scope is limited
// to \ce{} - it does not implement the full LaTeX mhchem package.
import 'katex/contrib/mhchem';
import type { MathDiagnostic, MathExpression, MathRenderResult } from './markdown-types';

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

// --- Math diagnostics ---
//
// rehype-katex never throws for a malformed expression: it renders a
// `.katex-error` span in place of the broken math and carries on. That keeps
// the preview alive, but it also means a typo in a formula is easy to miss in
// a long document. These helpers re-check every expression through the
// throwing API so the workspace can list exactly which expressions are
// broken, and why, instead of leaving the author to spot red text.

const DISPLAY_MATH = /\$\$([\s\S]*?)\$\$/g;
const INLINE_MATH = /\$([^$\n]+)\$/g;

// Blanks out the contents of code regions while preserving newlines and total
// length, so `$...$` inside a code fence is ignored but every surviving match
// index still maps to the correct line of the original source.
const blankCodeRegions = (source: string): string =>
  source.replace(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g, (region) =>
    region.replace(/[^\n]/g, ' '),
  );

// Extracts every `$$...$$` and `$...$` expression outside code regions,
// tracking the 1-indexed source line each one starts on.
export const findMathExpressions = (source: string): MathExpression[] => {
  const scannable = blankCodeRegions(source);
  const lineAt = (index: number): number => scannable.slice(0, index).split('\n').length;
  const found: MathExpression[] = [];

  for (const match of scannable.matchAll(DISPLAY_MATH)) {
    const body = match[1].trim();
    if (body) found.push({ source: body, displayMode: true, line: lineAt(match.index ?? 0) });
  }

  // Display math is blanked before the inline pass so the `$$` delimiters of
  // a display block are never re-read as a pair of inline expressions.
  const inlineOnly = scannable.replace(DISPLAY_MATH, (region) => region.replace(/[^\n]/g, ' '));
  for (const match of inlineOnly.matchAll(INLINE_MATH)) {
    const body = match[1].trim();
    if (body) found.push({ source: body, displayMode: false, line: lineAt(match.index ?? 0) });
  }

  return found.sort((a, b) => a.line - b.line);
};

export const collectMathDiagnostics = (source: string): MathDiagnostic[] => {
  const diagnostics: MathDiagnostic[] = [];
  for (const expression of findMathExpressions(source)) {
    const result = renderMath(expression.source, expression.displayMode);
    if (result.error) diagnostics.push({ ...expression, error: result.error });
  }
  return diagnostics;
};
