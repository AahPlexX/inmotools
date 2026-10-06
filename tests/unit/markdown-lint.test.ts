import { describe, expect, it } from 'vitest';
import { collectMarkdownStyleSuggestions } from '../../src/tools/markdown/lint-engine';

describe('Markdown style suggestions', () => {
  it('reports heading jumps, adjacent mixed bullets and trailing whitespace at their actual source lines', () => {
    const source = '---\ntitle: Test\n---\n\n# Title\n\n### Jump\n\n- First\n* Second\n\nTrailing \n';
    expect(collectMarkdownStyleSuggestions(source).suggestions.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: 7, rule: 'heading-level' }, { line: 10, rule: 'list-marker' }, { line: 12, rule: 'trailing-space' },
    ]);
  });
  it('preserves two-space hard breaks and skips literal code, math, HTML and frontmatter', () => {
    const source = '---\ntitle: Literal \n---\n\n# Title\n\nBreak  \nnext\n\n```md\n### Literal \n- first\n* second\n```\n\n    code \n\n$$\nx = y \n$$\n\n<pre>literal </pre>\n';
    expect(collectMarkdownStyleSuggestions(source).suggestions).toEqual([]);
  });
  it('allows nested bullet styles, ordered lists and a different style after an intervening block', () => {
    expect(collectMarkdownStyleSuggestions('- Parent\n  * Child\n- Parent\n\nParagraph\n\n* Other\n\n1. Ordered\n2. Ordered\n').suggestions).toEqual([]);
  });
  it('reports nested-container lists and Setext heading jumps without interpreting literals', () => {
    const result = collectMarkdownStyleSuggestions('Title\n=====\n\n> ### Jump\n>\n> - First\n> + Second\n');
    expect(result.suggestions.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: 4, rule: 'heading-level' }, { line: 7, rule: 'list-marker' },
    ]);
  });
  it('bounds the displayed suggestions while retaining an accurate total', () => {
    const result = collectMarkdownStyleSuggestions('trailing \n\n'.repeat(500));
    expect(result.total).toBe(500);
    expect(result.suggestions).toHaveLength(200);
    expect(result.suggestions.at(-1)?.line).toBe(399);
  });
});
