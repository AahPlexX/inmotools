import { describe, expect, it } from 'vitest';
import { renderMath } from '../../src/tools/markdown/math-engine';

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
