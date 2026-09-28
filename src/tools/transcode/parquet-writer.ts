// Parquet output via DuckDB-WASM (F03 export side).
// DuckDB is loaded lazily and only when a Parquet export is requested, keeping
// the workstation shell light. The table is staged as a CSV buffer because CSV
// is DuckDB's most reliable interchange for arbitrary mixed-type data.

import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { toDelimited, type TableData } from './tabular';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
};

export type ParquetCompression = 'snappy' | 'gzip' | 'zstd' | 'uncompressed';

interface DuckDbSession {
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
  close: () => Promise<void>;
}

async function createSession(): Promise<DuckDbSession> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  if (!bundle.mainWorker) throw new Error('No compatible DuckDB worker bundle is available in this browser.');
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({ path: ':memory:' });
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

const safeColumnName = (name: string, index: number): string => {
  const cleaned = name.replace(/[^\p{L}\p{N}_ ]/gu, '_').trim();
  return cleaned.length > 0 ? cleaned : `column_${index + 1}`;
};

export async function writeParquet(table: TableData, compression: ParquetCompression): Promise<Uint8Array> {
  if (table.columns.length === 0) throw new Error('The table has no columns to export.');
  const csv = toDelimited(table, { delimiter: ',', includeHeader: true, lineEnding: 'lf' });
  const session = await createSession();
  try {
    await session.db.registerFileBuffer('input.csv', new TextEncoder().encode(csv));
    const columns = table.columns.map((column, index) => safeColumnName(column, index));
    const unique = columns.map((column, index) => (columns.indexOf(column) === index ? column : `${column}_${index + 1}`));
    const selectList = unique.map((column, index) => `column${index + 1} AS "${column.replace(/"/g, '""')}"`).join(', ');
    const compressionClause = compression === 'uncompressed' ? '' : `, COMPRESSION '${compression}'`;
    await session.connection.query(
      `COPY (SELECT ${selectList} FROM read_csv_auto('input.csv', header=true, all_varchar=true)) TO 'output.parquet' (FORMAT PARQUET${compressionClause});`,
    );
    const buffer = await session.db.copyFileToBuffer('output.parquet');
    return new Uint8Array(buffer);
  } finally {
    await session.close();
  }
}
