import { describe, expect, it } from 'vitest';
import { buildQueryResult, normalizeDuckDbValue } from '../../src/tools/duckdb/duckdb-client';

describe('DuckDB result normalization', () => {
  it('preserves bigint precision as text instead of converting to Number', () => {
    expect(normalizeDuckDbValue(BigInt('9007199254740993'))).toBe('9007199254740993');
  });

  it('preserves duplicate-named columns by position in the lossless value matrix', () => {
    const result = buildQueryResult(['duplicate', 'duplicate'], [[1, 2]]);
    expect(result.columns).toEqual(['duplicate', 'duplicate']);
    expect(result.values).toEqual([[1, 2]]);
  });
});
