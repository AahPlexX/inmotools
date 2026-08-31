import { describe, expect, it } from 'vitest';
import { buildJsonTreeRows, selectJsonPathPointers, slicePathsWithAncestors } from '../../src/tools/lattice/query-engine';

describe('JSON Lattice query model', () => {
  const sample = { orders: [{ status: 'ok', latency_ms: 20 }, { status: 'error', latency_ms: 700 }] };

  it('creates deterministic relational json_tree rows', () => {
    const rows = buildJsonTreeRows(sample);
    expect(rows.find((row) => row.path === '/orders/1/status')).toMatchObject({ parent_path: '/orders/1', key: 'status', type: 'string', value_text: 'error', depth: 3 });
    expect(rows.find((row) => row.path === '/orders/1')).toMatchObject({ type: 'object', depth: 2 });
  });

  it('returns JSONPath matches and their full ancestor closure', () => {
    expect(selectJsonPathPointers(sample, '$.orders[*].status')).toEqual(['/orders/0/status', '/orders/1/status']);
    expect([...slicePathsWithAncestors(['/orders/1/status'])]).toEqual(['', '/orders', '/orders/1', '/orders/1/status']);
  });
});
