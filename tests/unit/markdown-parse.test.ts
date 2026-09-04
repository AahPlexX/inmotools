import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';

describe('markdown parsing', () => {
  it('parses CommonMark headings and paragraphs with source line positions', () => {
    const result = parseMarkdown('# Title\n\nSome text.\n');
    expect(result.frontmatter.format).toBeNull();
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({ startLine: 1, endLine: 1 });
    expect(result.nodes[1]).toMatchObject({ startLine: 3, endLine: 3 });
  });

  it('parses GFM tables as a single top-level node', () => {
    const result = parseMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].startLine).toBe(1);
    expect(result.nodes[0].endLine).toBe(3);
  });

  it('parses GFM strikethrough and task lists without throwing', () => {
    expect(() => parseMarkdown('~~gone~~\n\n- [x] done\n- [ ] pending\n')).not.toThrow();
  });

  it('parses inline and block math without throwing', () => {
    const result = parseMarkdown('Inline $x^2$ math.\n\n$$\ny = mx + b\n$$\n');
    expect(result.nodes).toHaveLength(2);
  });

  it('offsets source line numbers by the length of a YAML frontmatter block', () => {
    const source = '---\ntitle: Report\n---\n\n# Heading\n';
    const result = parseMarkdown(source);
    expect(result.frontmatter.format).toBe('yaml');
    expect(result.nodes).toHaveLength(1);
    // The frontmatter occupies lines 1-3; the body starts at line 5, and the
    // heading is the first line of the body, so its offset source line must
    // point back at the real document line, not the stripped-body line.
    expect(result.nodes[0].startLine).toBe(5);
  });

  it('produces no source-line nodes for an empty document', () => {
    const result = parseMarkdown('');
    expect(result.nodes).toHaveLength(0);
  });
});
