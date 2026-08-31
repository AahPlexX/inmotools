import { describe, expect, it } from 'vitest';
import { ancestorClosure, buildGraphModel } from '../../src/tools/lattice/graph-engine';

describe('JSON Lattice graph engine', () => {
  const data = {
    users: [{ id: 'usr_1', name: 'Ada' }],
    order: { id: 'ord_1', userId: 'usr_1', items: [{ sku: 'A1', qty: 2 }] },
  };

  it('builds stable RFC 6901 paths and foreign-key cross-links', () => {
    const graph = buildGraphModel(data);
    expect(graph.nodes.find((node) => node.path === '/order/items/0/sku')).toMatchObject({ key: 'sku', type: 'string', depth: 4 });
    expect(graph.edges.some((edge) => edge.source === '/order/items/0' && edge.target === '/order/items/0/sku')).toBe(true);
    expect(graph.crossLinks).toContainEqual(expect.objectContaining({ source: '/order/userId', target: '/users/0/id', kind: 'foreign-key' }));
  });

  it('keeps collapsed parents while omitting their descendants', () => {
    const graph = buildGraphModel(data, { collapsedPaths: new Set(['/users']) });
    expect(graph.nodes.some((node) => node.path === '/users')).toBe(true);
    expect(graph.nodes.some((node) => node.path === '/users/0')).toBe(false);
    expect(graph.nodes.some((node) => node.path === '/order')).toBe(true);
  });

  it('returns matches plus every structural ancestor for subgraph isolation', () => {
    expect([...ancestorClosure(['/order/items/0/sku'])]).toEqual(['', '/order', '/order/items', '/order/items/0', '/order/items/0/sku']);
  });

  it('terminates safely when a cyclic JavaScript object reaches the traversal seam', () => {
    const root: Record<string, unknown> = { id: 'root' };
    root.self = root;
    const graph = buildGraphModel(root);
    expect(graph.nodes.some((node) => node.path === '/self' && node.cycle === true)).toBe(true);
    expect(graph.nodes.length).toBeLessThan(10);
  });
});
