import { describe, expect, it } from 'vitest';
import { buildQueryResult, normalizeDuckDbValue } from '../../src/tools/duckdb/duckdb-client';

describe('DuckDB result normalization', () => {
  it('preserves bigint precision as text instead of converting to Number', () => {
    expect(normalizeDuckDbValue(BigInt('9007199254740993'))).toBe('9007199254740993');
  });

  it('applies Arrow decimal scale instead of exporting the unscaled integer', () => {
    const decimalType = { precision: 5, scale: 2, toString: () => 'Decimal[5,2]' };
    expect(normalizeDuckDbValue(BigInt(12345), decimalType)).toBe('123.45');
    expect(normalizeDuckDbValue(BigInt(-5), decimalType)).toBe('-0.05');
  });

  it('preserves lists, structs, maps, and binary values structurally', () => {
    expect(normalizeDuckDbValue([1, 2])).toEqual([1, 2]);
    expect(normalizeDuckDbValue({ name: 'Ada', flags: [true, false] })).toEqual({ name: 'Ada', flags: [true, false] });
    expect(normalizeDuckDbValue(new Map([['a', 1]]))).toEqual({ $map: [['a', 1]] });
    expect(normalizeDuckDbValue(new Uint8Array([0, 255]), { toString: () => 'Binary' })).toEqual({ $binary: 'hex:00ff' });
  });

  it('keeps typed numeric list values as arrays rather than misclassifying them as binary', () => {
    expect(normalizeDuckDbValue(new Int32Array([1, 2]))).toEqual([1, 2]);
  });

  it('preserves duplicate-named columns by position and lazily builds compatibility rows', () => {
    const result = buildQueryResult(['duplicate', 'duplicate'], [[1, 2]]);
    expect(result.columns).toEqual(['duplicate', 'duplicate']);
    expect(result.values).toEqual([[1, 2]]);
    expect(result.rows).toEqual([{ duplicate: 2 }]);
    expect(Object.keys(result)).not.toContain('rows');
  });
});
