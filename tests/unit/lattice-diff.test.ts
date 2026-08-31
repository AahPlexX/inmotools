import { describe, expect, it } from 'vitest';
import { diffStructures } from '../../src/tools/lattice/diff-engine';

describe('JSON Lattice structural diff engine', () => {
  it('ignores object key order and reports insert/delete/modify deterministically', () => {
    expect(diffStructures({ a: 1, b: 2 }, { b: 2, a: 1 }).changes).toEqual([]);
    const diff = diffStructures(
      { status: 'new', removed: 1, stable: true },
      { status: 'paid', added: 2, stable: true },
    );
    expect(diff.changes).toEqual([
      expect.objectContaining({ kind: 'insert', path: '/added', after: 2 }),
      expect.objectContaining({ kind: 'delete', path: '/removed', before: 1 }),
      expect.objectContaining({ kind: 'modify', path: '/status', before: 'new', after: 'paid' }),
    ]);
  });

  it('reconciles a unique equivalent subtree as a move instead of delete plus insert', () => {
    const diff = diffStructures(
      { profile: { id: 7, name: 'Ada' }, keep: true },
      { archive: { id: 7, name: 'Ada' }, keep: true },
    );
    expect(diff.changes).toEqual([expect.objectContaining({ kind: 'move', from: '/profile', path: '/archive' })]);
  });
});
