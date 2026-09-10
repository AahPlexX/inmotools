import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
};

export const WORKBENCH_QUERY_MAX_BYTES = 32 * 1024 * 1024;

export interface DuckDbSession {
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
  close: () => Promise<void>;
}

export async function createDuckDbSession(): Promise<DuckDbSession> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  if (!bundle.mainWorker) throw new Error('No compatible DuckDB worker bundle is available in this browser.');
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({ path: ':memory:', query: { castBigIntToDouble: false } });
    const connection = await db.connect();
    return {
      db,
      connection,
      close: async () => {
        await connection.close();
        await db.terminate();
      },
    };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

export async function registerLocalFile(db: duckdb.AsyncDuckDB, file: File): Promise<void> {
  await db.registerFileBuffer(file.name, new Uint8Array(await file.arrayBuffer()));
}

export async function unregisterLocalFile(db: duckdb.AsyncDuckDB, name: string): Promise<void> {
  await db.dropFile(name);
}

export type QueryValue = string | number | boolean | null | QueryValue[] | { [key: string]: QueryValue };
export type QueryLimitReason = 'rows' | 'memory' | null;

export interface QueryResult {
  columns: string[];
  types: string[];
  values: QueryValue[][];
  /** Compatibility view for consumers that require name-keyed rows. Materialized lazily. */
  rows: Array<Record<string, QueryValue>>;
  complete: boolean;
  limitedBy: QueryLimitReason;
  capturedBytes: number;
}

export interface QueryLimits {
  maxRows?: number;
  maxBytes?: number;
}

type ArrowTypeLike = {
  precision?: unknown;
  scale?: unknown;
  children?: unknown;
  toString?: () => string;
};

type ArrowFieldLike = {
  name: string;
  type: unknown;
};

function typeLabel(type: unknown): string {
  if (type === null || type === undefined) return 'unknown';
  try {
    const text = String(type);
    return text && text !== '[object Object]' ? text : 'unknown';
  } catch {
    return 'unknown';
  }
}

function childFields(type: unknown): ArrowFieldLike[] {
  if (!type || typeof type !== 'object') return [];
  const children = (type as ArrowTypeLike).children;
  if (!Array.isArray(children)) return [];
  return children.filter((field): field is ArrowFieldLike => Boolean(
    field
    && typeof field === 'object'
    && typeof (field as ArrowFieldLike).name === 'string'
    && 'type' in field,
  ));
}

function decimalScale(type: unknown): number | null {
  if (!type || typeof type !== 'object') return null;
  const candidate = type as ArrowTypeLike;
  if (!Number.isInteger(candidate.scale) || !Number.isInteger(candidate.precision)) return null;
  return Number(candidate.scale);
}

function isBinaryType(type: unknown): boolean {
  return /(?:^|\b)(?:binary|blob|fixed\s*size\s*binary)(?:\b|$)/i.test(typeLabel(type));
}

function wordsToSignedBigInt(words: readonly number[]): bigint | null {
  if (!words.length || !words.every((word) => Number.isInteger(word))) return null;
  let result = 0n;
  for (let index = words.length - 1; index >= 0; index -= 1) {
    result = (result << 32n) | BigInt(words[index] >>> 0);
  }
  const highest = words[words.length - 1] >>> 0;
  if ((highest & 0x80000000) !== 0) result -= 1n << BigInt(words.length * 32);
  return result;
}

function decimalUnscaled(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return BigInt(value.trim());

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return wordsToSignedBigInt(value as number[]);
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const words = Array.from(value as unknown as ArrayLike<number>);
    if (words.every((item) => typeof item === 'number')) return wordsToSignedBigInt(words);
  }

  try {
    const text = String(value).trim();
    if (/^[+-]?\d+$/.test(text)) return BigInt(text);
  } catch {
    // Fall through to the caller's structural representation.
  }
  return null;
}

function formatScaledInteger(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const sign = negative ? '-' : '';
  if (scale === 0) return `${sign}${digits}`;
  if (scale < 0) return `${sign}${digits}${'0'.repeat(-scale)}`;
  if (digits.length <= scale) return `${sign}0.${digits.padStart(scale, '0')}`;
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function bytesFromView(value: ArrayBufferView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function encodeBinary(bytes: Uint8Array): QueryValue {
  return { $binary: `hex:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}` };
}

function normalizeObject(value: object, fieldType: unknown, seen: WeakSet<object>): QueryValue {
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === 'function') {
      const converted = withJson.toJSON();
      if (converted !== value) return normalizeDuckDbValue(converted, fieldType, seen);
    }

    const withArray = value as { toArray?: () => unknown };
    if (typeof withArray.toArray === 'function') {
      const converted = withArray.toArray();
      if (converted !== value) return normalizeDuckDbValue(converted, fieldType, seen);
    }

    const childTypeByName = new Map(childFields(fieldType).map((field) => [field.name, field.type]));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeDuckDbValue(item, childTypeByName.get(key), seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

export function normalizeDuckDbValue(value: unknown, fieldType?: unknown, seen = new WeakSet<object>()): QueryValue {
  if (value === null || value === undefined) return null;

  const scale = decimalScale(fieldType);
  if (scale !== null) {
    const unscaled = decimalUnscaled(value);
    if (unscaled !== null) return formatScaledInteger(unscaled, scale);
  }

  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return encodeBinary(new Uint8Array(value));

  const children = childFields(fieldType);
  const listChildType = children.length === 1 ? children[0].type : undefined;

  if (ArrayBuffer.isView(value)) {
    if (isBinaryType(fieldType)) return encodeBinary(bytesFromView(value));
    if (value instanceof DataView) return encodeBinary(bytesFromView(value));
    return Array.from(value as unknown as ArrayLike<unknown>, (item) => normalizeDuckDbValue(item, listChildType, seen));
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeDuckDbValue(
      item,
      children.length === 1 ? listChildType : children[index]?.type,
      seen,
    ));
  }
  if (value instanceof Map) {
    return {
      $map: Array.from(value.entries(), ([key, item]) => [
        normalizeDuckDbValue(key, undefined, seen),
        normalizeDuckDbValue(item, undefined, seen),
      ]),
    };
  }
  if (typeof value === 'object') return normalizeObject(value, fieldType, seen);
  return String(value);
}

function estimateRowBytes(row: QueryValue[]): number {
  return new TextEncoder().encode(JSON.stringify(row)).byteLength;
}

export function buildQueryResult(
  columns: string[],
  values: QueryValue[][],
  metadata: Partial<Pick<QueryResult, 'types' | 'complete' | 'limitedBy' | 'capturedBytes'>> = {},
): QueryResult {
  let rowCache: Array<Record<string, QueryValue>> | null = null;
  const result = {
    columns,
    types: metadata.types ?? columns.map(() => 'unknown'),
    values,
    complete: metadata.complete ?? true,
    limitedBy: metadata.limitedBy ?? null,
    capturedBytes: metadata.capturedBytes ?? values.reduce((sum, row) => sum + estimateRowBytes(row), 0),
  } as QueryResult;
  Object.defineProperty(result, 'rows', {
    enumerable: false,
    configurable: false,
    get: () => {
      if (!rowCache) {
        rowCache = values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])));
      }
      return rowCache;
    },
  });
  return result;
}

export interface LocalQueryTask {
  promise: Promise<QueryResult>;
  cancel: () => Promise<boolean>;
}

export function startLocalQuery(
  connection: duckdb.AsyncDuckDBConnection,
  sql: string,
  limits: QueryLimits = {},
): LocalQueryTask {
  let settled = false;
  const promise = (async () => {
    // DuckDB-Wasm's streaming send() returns an async Arrow reader whose schema
    // may not be populated until the first RecordBatch arrives. Discover field
    // metadata from batches while streaming instead of forcing materialization.
    const reader = await connection.send(sql, true);
    let fields: ArrowFieldLike[] | null = null;
    const values: QueryValue[][] = [];
    let capturedBytes = 0;
    let limitedBy: QueryLimitReason = null;

    outer: for await (const batch of reader) {
      const batchFields = batch.schema.fields as ArrowFieldLike[];
      if (!fields) fields = batchFields;
      for (let rowIndex = 0; rowIndex < batch.numRows; rowIndex += 1) {
        if (limits.maxRows !== undefined && values.length >= limits.maxRows) {
          limitedBy = 'rows';
          break outer;
        }
        const row = batchFields.map((field, columnIndex) =>
          normalizeDuckDbValue(batch.getChildAt(columnIndex)?.get(rowIndex), field.type));
        const rowBytes = estimateRowBytes(row);
        if (limits.maxBytes !== undefined && capturedBytes + rowBytes > limits.maxBytes) {
          limitedBy = 'memory';
          break outer;
        }
        values.push(row);
        capturedBytes += rowBytes;
      }
    }

    if (!fields) {
      const readerSchema = reader.schema as { fields?: ArrowFieldLike[] } | undefined;
      fields = readerSchema?.fields ?? [];
    }

    if (limitedBy) {
      try { await connection.cancelSent(); } catch { /* Query may already have completed. */ }
    }

    const columns = fields.map((field) => field.name);
    const types = fields.map((field) => typeLabel(field.type));
    return buildQueryResult(columns, values, {
      types,
      complete: limitedBy === null,
      limitedBy,
      capturedBytes,
    });
  })().finally(() => { settled = true; });

  return {
    promise,
    cancel: async () => settled ? false : connection.cancelSent(),
  };
}

export async function runLocalQuery(
  connection: duckdb.AsyncDuckDBConnection,
  sql: string,
  limits?: QueryLimits,
): Promise<QueryResult> {
  return startLocalQuery(connection, sql, limits).promise;
}
