import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';
import { AST_ROOT_ID, astRangeOf, findAstNode, flattenAst, parentAstId } from '../../src/tools/markdown/ast-inspector-engine';

const tree = (source: string) => parseMarkdown(source).tree;

describe('syntax tree inspector rows', () => {
  it('lists only the root until a branch is expanded', () => {
    const { rows } = flattenAst(tree('# Title\n\nHello *world*.\n'), new Set(), 0);
    expect(rows.map((row) => row.id)).toEqual([AST_ROOT_ID]);
    expect(rows[0]).toMatchObject({ type: 'root', childCount: 2, expanded: false });
  });

  it('expands level by level with levels, positions and source ranges', () => {
    const { rows } = flattenAst(tree('# Title\n\nHello *world*.\n'), new Set([AST_ROOT_ID, 'r.1']), 0);
    expect(rows.map((row) => `${row.level}:${row.type}`)).toEqual(['1:root', '2:heading', '2:paragraph', '3:text', '3:emphasis', '3:text']);
    expect(rows[1]).toMatchObject({ detail: 'h1', position: 1, siblings: 2, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 8 } });
    expect(rows[4].range).toEqual({ startLine: 3, startColumn: 7, endLine: 3, endColumn: 14 });
  });

  it('shifts ranges by the front matter line offset', () => {
    const doc = parseMarkdown('---\ntitle: x\n---\n\n# Hi\n');
    const heading = findAstNode(doc.tree, 'r.0');
    expect(heading?.type).toBe('heading');
    expect(astRangeOf(heading!, doc.frontmatter.bodyStartLine - 1)).toMatchObject({ startLine: 5, endLine: 5 });
  });

  it('resolves ids and reports a missing path as null after the document shrinks', () => {
    const before = tree('a\n\nb\n');
    const after = tree('a\n');
    expect(findAstNode(before, 'r.1')?.type).toBe('paragraph');
    expect(findAstNode(after, 'r.1')).toBeNull();
    expect(findAstNode(after, 'x.0')).toBeNull();
    expect(parentAstId('r.1.0')).toBe('r.1');
    expect(parentAstId(AST_ROOT_ID)).toBeNull();
  });

  it('describes code, links and lists', () => {
    const { rows } = flattenAst(tree('```js\nlet a = 1;\n```\n\n[x](https://e.test)\n\n1. one\n'), new Set([AST_ROOT_ID, 'r.1']), 0);
    expect(rows.find((row) => row.type === 'code')?.detail).toBe('js let a = 1;');
    expect(rows.find((row) => row.type === 'link')?.detail).toBe('https://e.test');
    expect(flattenAst(tree('1. one\n'), new Set([AST_ROOT_ID]), 0).rows.find((row) => row.type === 'list')?.detail).toBe('ordered');
  });

  it('caps the row count for very large documents and reports truncation', () => {
    const big = Array.from({ length: 500 }, (_, index) => `Paragraph ${index}`).join('\n\n');
    const result = flattenAst(tree(big), new Set([AST_ROOT_ID]), 0, 100);
    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(flattenAst(tree(big), new Set([AST_ROOT_ID]), 0).truncated).toBe(false);
  });

  it('flattens a large expanded tree quickly', () => {
    const big = Array.from({ length: 5000 }, (_, index) => `Line *${index}*`).join('\n\n');
    const t = tree(big);
    const ids = new Set([AST_ROOT_ID, ...Array.from({ length: 5000 }, (_, index) => `r.${index}`)]);
    const start = performance.now();
    const { rows } = flattenAst(t, ids, 0);
    expect(rows.length).toBeGreaterThan(5000);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
