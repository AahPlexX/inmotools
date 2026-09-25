import { describe, expect, it } from 'vitest';
import { highlightSnippet } from '../../src/tools/markdown/code-highlight-engine';

describe('preview fenced-code language coloring', () => {
  it('wraps a recognized language into styled spans without losing any source text', async () => {
    const result = await highlightSnippet('const x = 1;', 'javascript');
    expect(result.recognized).toBe(true);
    expect(result.html).toContain('<span class="');
    // Stripping tags must reproduce the exact original source.
    expect(result.html.replace(/<[^>]+>/g, '')).toBe('const x = 1;');
  });

  it('preserves newlines as literal line breaks in the output', async () => {
    const result = await highlightSnippet('a\nb\nc', 'python');
    expect(result.recognized).toBe(true);
    expect(result.html.replace(/<[^>]+>/g, '')).toBe('a\nb\nc');
  });

  it('escapes HTML-significant characters in the source', async () => {
    const result = await highlightSnippet('a < b && c > d', 'javascript');
    expect(result.html).not.toContain('<b');
    expect(result.html).toContain('&lt;');
    expect(result.html).toContain('&gt;');
  });

  it('resolves common language aliases to the same underlying grammar', async () => {
    const canonical = await highlightSnippet('def f(): pass', 'python');
    const alias = await highlightSnippet('def f(): pass', 'py');
    expect(alias.recognized).toBe(true);
    expect(alias.html).toBe(canonical.html);
  });

  it('is case-insensitive on the language tag', async () => {
    const result = await highlightSnippet('SELECT 1', 'SQL');
    expect(result.recognized).toBe(true);
  });

  it('leaves an unrecognized language as plain escaped text instead of guessing', async () => {
    const result = await highlightSnippet('<not a real lang>', 'not-a-real-language-xyz');
    expect(result.recognized).toBe(false);
    expect(result.html).toBe('&lt;not a real lang&gt;');
  });
});
