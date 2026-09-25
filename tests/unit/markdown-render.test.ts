import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { buildOutline } from '../../src/tools/markdown/outline-engine';
import { HEADING_ID_PREFIX } from '../../src/tools/markdown/heading-slug';

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

  it('renders a footnote reference and its body', () => {
    const result = renderMarkdown('Text with a note.[^1]\n\n[^1]: The note body.');
    expect(result.html).toContain('data-footnote-ref');
    expect(result.html).toContain('The note body.');
  });

  it('gives every heading a GitHub-style anchor id, de-duplicated against repeats', () => {
    const result = renderMarkdown('# Hello World\n\n## Hello World');
    expect(result.html).toContain(`id="${HEADING_ID_PREFIX}hello-world"`);
    expect(result.html).toContain(`id="${HEADING_ID_PREFIX}hello-world-1"`);
  });

  it("assigns a heading's rendered anchor id to the exact same slug the outline panel uses", () => {
    const source = '# First Section\n\nBody.\n\n## Second Section';
    const [first, second] = buildOutline(source);
    const result = renderMarkdown(source);
    expect(result.html).toContain(`id="${HEADING_ID_PREFIX}${first.id}"`);
    expect(result.html).toContain(`id="${HEADING_ID_PREFIX}${second.id}"`);
  });

  it.each(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'note'])(
    'renders a %s alert blockquote as a styled callout instead of a plain blockquote',
    (kind) => {
      const result = renderMarkdown(`> [!${kind}]\n> Pay attention.`);
      expect(result.html).toContain(`markdown-alert-${kind.toLowerCase()}`);
      expect(result.html).toContain('Pay attention.');
      expect(result.html).not.toContain('<blockquote');
      expect(result.html).not.toContain(`[!${kind}]`);
    },
  );

  it('leaves an ordinary blockquote without a marker untouched', () => {
    const result = renderMarkdown('> Just a quote, no marker.');
    expect(result.html).toContain('<blockquote');
    expect(result.html).not.toContain('markdown-alert');
  });

  it('converts a recognized emoji shortcode and leaves an unrecognized one exactly as written', () => {
    const result = renderMarkdown('Great work! :tada: :not_a_real_shortcode:');
    expect(result.html).toContain('🎉');
    expect(result.html).toContain(':not_a_real_shortcode:');
  });

  it('does not convert emoji-shaped text inside inline code or a fenced code block', () => {
    const result = renderMarkdown('Use `:tada:` in code.\n\n```\n:tada:\n```');
    expect(result.html).not.toContain('🎉');
    expect(result.html).toContain(':tada:');
  });
});
