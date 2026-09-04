import { describe, expect, it } from 'vitest';
import {
  collectMathDiagnostics,
  findMathExpressions,
  renderMath,
} from '../../src/tools/markdown/math-engine';

describe('direct KaTeX rendering', () => {
  it('renders a valid inline expression to KaTeX markup', () => {
    const result = renderMath('x^2', false);
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('katex');
  });

  it('renders a valid display-mode expression', () => {
    const result = renderMath('y = mx + b', true);
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('katex-display');
  });

  it('renders the mhchem \\ce{} chemistry notation', () => {
    const result = renderMath('\\ce{H2O}', false);
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('katex');
  });

  it('renders the native CD commutative-diagram environment in display mode', () => {
    const result = renderMath('\\begin{CD} A @>>> B \\end{CD}', true);
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('katex');
  });

  it('returns a labeled error block instead of throwing for malformed input', () => {
    expect(() => renderMath('\\frac{1', false)).not.toThrow();
    const result = renderMath('\\frac{1', false);
    expect(result.error).toBeDefined();
    expect(result.html).toContain('katex-error');
    expect(result.html).toContain('\\frac{1');
  });

  it('always produces a single well-formed error span, regardless of error message contents', () => {
    const result = renderMath('\\frac{1', false);
    expect(result.html.startsWith('<span class="katex-error"')).toBe(true);
    expect(result.html.endsWith('</span>')).toBe(true);
  });
});


describe('math expression discovery', () => {
  it('finds an inline expression with its source line', () => {
    expect(findMathExpressions('Text $x^2$ more.')).toEqual([
      { source: 'x^2', displayMode: false, line: 1 },
    ]);
  });

  it('finds a display expression and marks it as display mode', () => {
    expect(findMathExpressions('Intro\n\n$$a + b$$\n')).toEqual([
      { source: 'a + b', displayMode: true, line: 3 },
    ]);
  });

  it('does not re-read display delimiters as inline expressions', () => {
    const found = findMathExpressions('$$y = mx$$');
    expect(found).toHaveLength(1);
    expect(found[0].displayMode).toBe(true);
  });

  it('ignores math inside a fenced code block', () => {
    expect(findMathExpressions('```\n$x^2$\n```\n')).toEqual([]);
  });

  it('ignores math inside an inline code span', () => {
    expect(findMathExpressions('Write `$x^2$` to typeset.')).toEqual([]);
  });

  it('reports correct line numbers for expressions after a code fence', () => {
    const found = findMathExpressions('```\n$ignored$\n```\n\n$real$\n');
    expect(found).toEqual([{ source: 'real', displayMode: false, line: 5 }]);
  });

  it('returns expressions ordered by line', () => {
    const found = findMathExpressions('$$first$$\n\ntext $second$\n');
    expect(found.map((item) => item.source)).toEqual(['first', 'second']);
  });
});

describe('math diagnostics', () => {
  it('reports nothing for a document whose math all parses', () => {
    expect(collectMathDiagnostics('$x^2$ and $$y = mx + b$$')).toEqual([]);
  });

  it('reports a malformed expression with its line and an explanation', () => {
    const diagnostics = collectMathDiagnostics('Intro\n\n$\\frac{1$\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(3);
    expect(diagnostics[0].source).toBe('\\frac{1');
    expect(diagnostics[0].error).toBeTruthy();
  });

  it('does not flag math that only appears inside code', () => {
    expect(collectMathDiagnostics('```\n$\\frac{1$\n```\n')).toEqual([]);
  });

  it('reports every broken expression in a document', () => {
    const diagnostics = collectMathDiagnostics('$\\frac{1$\n\n$\\sqrt{$\n');
    expect(diagnostics).toHaveLength(2);
  });
});
