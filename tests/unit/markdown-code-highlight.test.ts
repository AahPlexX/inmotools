import { describe, expect, it } from 'vitest';
import { highlightFencedCode, isDiagramLanguageTag } from '../../src/tools/markdown/code-highlight-engine';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';

describe('code-highlight-engine', () => {
  it('returns undefined for a language with no registered grammar', () => {
    expect(highlightFencedCode('anything at all', 'brainfuck-esque-nonsense')).toBeUndefined();
  });

  it('tags a JavaScript keyword and a string literal with stable tok-* classes', () => {
    const tokens = highlightFencedCode("const greeting = 'hi';", 'js');
    expect(tokens).toBeDefined();
    expect(tokens?.some((token) => token.text === 'const' && token.classes.includes('tok-keyword'))).toBe(true);
    expect(tokens?.some((token) => token.classes.includes('tok-string'))).toBe(true);
  });

  it('resolves common language aliases to the same grammar as their canonical name', () => {
    const viaAlias = highlightFencedCode('def f(): pass', 'py');
    const viaCanonical = highlightFencedCode('def f(): pass', 'python');
    expect(viaAlias).toEqual(viaCanonical);
  });

  it('reassembles line breaks as their own zero-class token, not merged into surrounding text', () => {
    const tokens = highlightFencedCode('a\nb', 'javascript');
    expect(tokens?.map((token) => token.text).join('')).toBe('a\nb');
  });

  it('never throws for arbitrary text handed to a registered grammar', () => {
    expect(() => highlightFencedCode('\u0000￿"""```<<<>>>', 'javascript')).not.toThrow();
  });

  it('classifies mermaid and dot as diagram languages, not code to highlight', () => {
    expect(isDiagramLanguageTag('mermaid')).toBe(true);
    expect(isDiagramLanguageTag('DOT')).toBe(true);
    expect(isDiagramLanguageTag('javascript')).toBe(false);
  });
});

describe('render-engine fenced code highlighting', () => {
  it('wraps a recognized language\'s tokens in tok-* spans inside the rendered preview', () => {
    const result = renderMarkdown('```js\nconst x = 1;\n```');
    expect(result.html).toContain('class="language-js"');
    expect(result.html).toContain('tok-keyword');
  });

  it('highlights a fenced code block nested inside a list item', () => {
    const result = renderMarkdown('- Example:\n\n  ```js\n  const x = 1;\n  ```\n');
    expect(result.html).toContain('tok-keyword');
  });

  it('leaves an unrecognized language fenced block as plain escaped text', () => {
    const result = renderMarkdown('```some-made-up-language\nfoo bar baz\n```');
    expect(result.html).toContain('foo bar baz');
    expect(result.html).not.toContain('tok-');
  });

  it('leaves a plain, language-less fenced block untouched', () => {
    const result = renderMarkdown('```\nplain text\n```');
    expect(result.html).toContain('plain text');
    expect(result.html).not.toContain('tok-');
  });

  it('does not highlight mermaid/dot diagram source, since diagram-renderer replaces the block wholesale', () => {
    const result = renderMarkdown('```mermaid\ngraph TD\nA --> B\n```');
    expect(result.html).toContain('language-mermaid');
    expect(result.html).not.toContain('tok-');
  });

  it('still HTML-escapes a highlighted code block\'s own literal text, even split across multiple tok-* spans', () => {
    const result = renderMarkdown('```html\n<img src=x onerror=alert(1)>\n```');
    expect(result.html).toContain('tok-');
    expect(result.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(result.html).not.toMatch(/<img\b/);
  });
});
