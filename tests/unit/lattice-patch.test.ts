import { describe, expect, it } from 'vitest';
import { applyJsonPatch, escapeJsonPointer, getPointerValue } from '../../src/tools/lattice/patch-engine';

describe('JSON Lattice RFC 6902 patch engine', () => {
  it('escapes and resolves RFC 6901 pointer segments exactly', () => {
    expect(escapeJsonPointer('a/b~c')).toBe('a~1b~0c');
    const doc = { 'a/b': { '~key': 42 } };
    expect(getPointerValue(doc, '/a~1b/~0key')).toBe(42);
  });

  it('applies add, remove, replace, copy, move, and test sequentially without mutating source', () => {
    const source = { name: 'before', tags: ['a', 'b'], nested: { value: 4 }, spare: true };
    const snapshot = structuredClone(source);
    const result = applyJsonPatch(source, [
      { op: 'test', path: '/nested/value', value: 4 },
      { op: 'replace', path: '/name', value: 'after' },
      { op: 'add', path: '/tags/-', value: 'c' },
      { op: 'copy', from: '/nested/value', path: '/copied' },
      { op: 'move', from: '/spare', path: '/moved' },
      { op: 'remove', path: '/tags/0' },
    ]);
    expect(result.document).toEqual({ name: 'after', tags: ['b', 'c'], nested: { value: 4 }, copied: 4, moved: true });
    expect(result.applied).toHaveLength(6);
    expect(source).toEqual(snapshot);
  });

  it('rejects a failed test operation instead of partially accepting the patch sequence', () => {
    expect(() => applyJsonPatch({ value: 1 }, [
      { op: 'replace', path: '/value', value: 2 },
      { op: 'test', path: '/value', value: 99 },
    ])).toThrow(/test/i);
  });
});
