import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';

describe('markdown rendering and sanitization', () => {
  it('renders a heading and paragraph to HTML', () => {
    const result = renderMarkdown('# Title\n\nBody text.');
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('Title');
    expect(result.html).toContain('Body text.');
  });

  it('strips raw script tags from the rendered output, leaving only the inert text', () => {
    const result = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(result.html).not.toContain('<script');
    // The script tag itself is removed; its text content becomes ordinary,
    // inert paragraph text rather than being executed.
    expect(result.html).toContain('Hello alert(1) world');
  });

  it('strips a javascript: URI from a link', () => {
    const result = renderMarkdown("[click](javascript:alert(1))");
    expect(result.html).not.toContain('javascript:');
  });

  it('strips inline event handler attributes from raw HTML', () => {
    const result = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(result.html).not.toContain('onerror');
  });

  it('renders inline math as KaTeX markup', () => {
    const result = renderMarkdown('Some $x^2$ math.');
    expect(result.html).toContain('katex');
  });

  it('renders a malformed math expression as a labeled error span instead of throwing', () => {
    expect(() => renderMarkdown('$$\\frac{1$$')).not.toThrow();
    const result = renderMarkdown('$$\\frac{1$$');
    expect(result.html).toContain('katex-error');
  });

  it('tags top-level rendered elements with their originating source line', () => {
    const result = renderMarkdown('# Title\n\nBody text.');
    expect(result.html).toContain('data-source-line="1"');
    expect(result.anchors.map((a) => a.sourceLine)).toEqual([1, 3]);
  });

  it('renders a GFM table', () => {
    const result = renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(result.html).toContain('<table');
    expect(result.html).toContain('<td>1</td>');
  });
});
