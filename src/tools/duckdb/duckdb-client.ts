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
    await db.open({ path: ':memory:', query: { castBigIntToDouble: true } });
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

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function runLocalQuery(connection: duckdb.AsyncDuckDBConnection, sql: string): Promise<QueryResult> {
  const result = await connection.query(sql);
  const columns = result.schema.fields.map((field) => field.name);
  const rows = result.toArray().map((row) => Object.fromEntries(columns.map((column) => [column, normalizeValue(row[column])]))) as QueryResult['rows'];
  return { columns, rows };
}
