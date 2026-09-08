import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
};

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

export type QueryValue = string | number | boolean | null;

export interface QueryResult {
  columns: string[];
  values: QueryValue[][];
  /** Compatibility view for consumers that currently require name-keyed rows. */
  rows: Array<Record<string, QueryValue>>;
}

export function normalizeDuckDbValue(value: unknown): QueryValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function buildQueryResult(columns: string[], values: QueryValue[][]): QueryResult {
  const rows = values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])));
  return { columns, values, rows };
}

export interface LocalQueryTask {
  promise: Promise<QueryResult>;
  cancel: () => Promise<boolean>;
}

export function startLocalQuery(connection: duckdb.AsyncDuckDBConnection, sql: string): LocalQueryTask {
  let settled = false;
  const promise = (async () => {
    const reader = await connection.send(sql, true);
    const columns = reader.schema.fields.map((field) => field.name);
    const values: QueryValue[][] = [];

    for await (const batch of reader) {
      for (let rowIndex = 0; rowIndex < batch.numRows; rowIndex += 1) {
        const row = columns.map((_, columnIndex) => normalizeDuckDbValue(batch.getChildAt(columnIndex)?.get(rowIndex)));
        values.push(row);
      }
    }
    return buildQueryResult(columns, values);
  })().finally(() => { settled = true; });

  return {
    promise,
    cancel: async () => settled ? false : connection.cancelSent(),
  };
}

export async function runLocalQuery(connection: duckdb.AsyncDuckDBConnection, sql: string): Promise<QueryResult> {
  return startLocalQuery(connection, sql).promise;
}
