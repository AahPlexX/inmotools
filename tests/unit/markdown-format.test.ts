import { describe, expect, it } from 'vitest';
import { formatMarkdownSource } from '../../src/tools/markdown/format-engine';

describe('Markdown formatting', () => {
  it('aligns ragged table pipes and normalizes bullet spacing without changing cell values', async () => {
    const { formatted } = await formatMarkdownSource('|A|Longer|\n|-|-|\n|one|=SUM(A1)|\n\n* first\n* second', 0);
    expect(formatted).toContain('| A   | Longer   |');
    expect(formatted).toContain('| one | =SUM(A1) |');
    expect(formatted).toContain('- first\n- second');
  });
  it.each(['---\ntitle: Report\n---\n', '+++\ntitle = "Report"\n+++\n', '{\n"title": "Report"\n}\n'])('preserves frontmatter exactly and maps a cursor inside it', async (prefix) => {
    const result = await formatMarkdownSource(prefix + '\n* item', 2);
    expect(result.formatted.startsWith(prefix)).toBe(true);
    expect(result.cursorOffset).toBe(2);
    expect(result.formatted).toContain('- item');
  });
  it('preserves code and document extensions and returns a usable mapped caret', async () => {
    const source = 'Emoji 😀 text and $x^2$ [@doe] ==mark== ~sub~ ^sup^.\n\n```mermaid\ngraph LR\n A-->B\n```\n\nBreak  \nnext';
    const result = await formatMarkdownSource(source, source.indexOf('text'));
    expect(result.formatted).toContain('Emoji 😀 text and $x^2$ [@doe] ==mark== ~sub~ ^sup^.');
    expect(result.formatted).toContain('```mermaid\ngraph LR\n A-->B\n```');
    expect(result.formatted).toContain('Break  \nnext');
    expect(result.formatted.slice(result.cursorOffset)).toMatch(/^text/);
  });
});
