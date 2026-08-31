import type { JsonValue } from './format-engine';
import { buildFlatCsv } from './export-engine';
import { createDuckDbSession, runLocalQuery, type DuckDbSession, type QueryResult } from '../duckdb/duckdb-client';

export interface LatticeSqlSession {
  readonly duckdb: DuckDbSession;
  revision: number;
}

export const createLatticeSqlSession = async (): Promise<LatticeSqlSession> => ({
  duckdb: await createDuckDbSession(),
  revision: 0,
});

export const refreshJsonTreeTable = async (session: LatticeSqlSession, value: JsonValue): Promise<void> => {
  session.revision += 1;
  const fileName = `__json_lattice_${session.revision}.csv`;
  await session.duckdb.db.registerFileBuffer(fileName, new TextEncoder().encode(buildFlatCsv(value)));
  const escaped = fileName.replaceAll("'", "''");
  await session.duckdb.connection.query(`CREATE OR REPLACE TEMP TABLE json_tree AS SELECT * FROM read_csv_auto('${escaped}', header = true, all_varchar = false)`);
};

export const runLatticeSql = async (session: LatticeSqlSession, sql: string): Promise<QueryResult> =>
  runLocalQuery(session.duckdb.connection, sql);

export const closeLatticeSqlSession = async (session: LatticeSqlSession | null): Promise<void> => {
  if (session) await session.duckdb.close();
};
