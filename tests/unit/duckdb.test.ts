import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { buildQueryResult, normalizeDuckDbValue, startLocalQuery } from '../../src/tools/duckdb/duckdb-client';

describe('DuckDB result normalization', () => {
  it('normalizes actual Arrow list vectors nested in structs', () => {
    const require = createRequire(import.meta.url);
    const arrow = createRequire(require.resolve('@duckdb/duckdb-wasm'))('apache-arrow');
    const decimal = new arrow.Decimal(2, 10, 128);
    const vector = arrow.makeVector({ type: decimal, data: new Int32Array([12345, 0, 0, 0]) });
    const list = new arrow.List(new arrow.Field('item', decimal));
    expect(normalizeDuckDbValue(vector, list)).toEqual(['123.45']);
    const struct = new arrow.Struct([new arrow.Field('amounts', list)]);
    expect(normalizeDuckDbValue({ amounts: vector }, struct)).toEqual({ amounts: ['123.45'] });
  });
  it('preserves bigint precision as text instead of converting to Number', () => {
    expect(normalizeDuckDbValue(BigInt('9007199254740993'))).toBe('9007199254740993');
  });

  it('applies Arrow decimal scale instead of exporting the unscaled integer', () => {
    const decimalType = { precision: 5, scale: 2, toString: () => 'Decimal[5,2]' };
    expect(normalizeDuckDbValue(BigInt(12345), decimalType)).toBe('123.45');
    expect(normalizeDuckDbValue(BigInt(-5), decimalType)).toBe('-0.05');
  });

  it('propagates Arrow decimal child metadata through lists', () => {
    const decimalType = { precision: 10, scale: 2, toString: () => 'Decimal[10,2]' };
    const listType = { children: [{ name: 'item', type: decimalType }], toString: () => 'List<Decimal[10,2]>' };
    expect(normalizeDuckDbValue([[12345, 0, 0, 0]], listType)).toEqual(['123.45']);
  });

  it('propagates Arrow decimal child metadata through structures', () => {
    const decimalType = { precision: 10, scale: 2, toString: () => 'Decimal[10,2]' };
    const structType = { children: [{ name: 'amount', type: decimalType }], toString: () => 'Struct<amount: Decimal[10,2]>' };
    expect(normalizeDuckDbValue({ amount: [12345, 0, 0, 0] }, structType)).toEqual({ amount: '123.45' });
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

  it('derives schema from the first streamed RecordBatch when the reader schema is not ready yet', async () => {
    const integerType = { toString: () => 'Int64' };
    const fields = [{ name: 'exact_value', type: integerType }];
    const batch = {
      schema: { fields },
      numRows: 1,
      getChildAt: () => ({ get: () => BigInt('9007199254740993') }),
    };
    const reader = {
      schema: undefined,
      async *[Symbol.asyncIterator]() {
        yield batch;
      },
    };
    const connection = {
      send: async () => reader,
      cancelSent: async () => false,
    };

    const result = await startLocalQuery(connection as never, 'SELECT 1').promise;
    expect(result.columns).toEqual(['exact_value']);
    expect(result.types).toEqual(['Int64']);
    expect(result.values).toEqual([['9007199254740993']]);
    expect(result.complete).toBe(true);
  });
});
