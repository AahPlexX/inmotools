import { describe, expect, it } from 'vitest';
import { buildMarkdownTable } from '../../src/tools/markdown/table-builder';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';

describe('MDW-R17 table builder', () => {
  it('creates a real GFM table with a header plus the requested data dimensions', () => {
    const { tree } = parseMarkdown(buildMarkdownTable(3, 4));
    const table = (tree as import('mdast').Root).children[0] as import('mdast').Table;
    expect(table.type).toBe('table');
    expect(table.children).toHaveLength(4);
    expect(table.children.every(row => row.children.length === 4)).toBe(true);
  });
  it.each([[0, 4], [-1, 4], [3.5, 4], [101, 4], [3, 0], [3, 21], [NaN, 4], [3, Infinity]])('rejects unsafe or non-integral dimensions %s by %s', (rows, columns) => {
    expect(() => buildMarkdownTable(rows, columns)).toThrow(RangeError);
  });
});
