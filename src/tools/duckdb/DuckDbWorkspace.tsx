import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import {
  WORKBENCH_QUERY_MAX_BYTES,
  createDuckDbSession,
  registerLocalFile,
  startLocalQuery,
  unregisterLocalFile,
  type DuckDbSession,
  type LocalQueryTask,
  type QueryResult,
  type QueryValue,
} from './duckdb-client';
import { consumeFileInput } from '../../lib/file-input';

const ROW_LIMIT_OPTIONS = [1_000, 10_000, 50_000] as const;
const QUERY_HISTORY_LIMIT = 12;

function displayValue(value: QueryValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvCell(value: QueryValue | string) {
  const text = value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function resultToCsv(result: QueryResult) {
  return [
    result.columns.map(csvCell).join(','),
    ...result.values.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n');
}

function sqlFileName(name: string) {
  return name.replaceAll("'", "''");
}

function limitStatus(result: QueryResult, rowLimit: number): string {
  if (result.complete) return 'Complete result captured.';
  if (result.limitedBy === 'rows') return `Result incomplete: stopped after the ${rowLimit.toLocaleString()}-row capture limit.`;
  return `Result incomplete: stopped before exceeding the ${(WORKBENCH_QUERY_MAX_BYTES / 1024 / 1024).toLocaleString()} MiB capture limit.`;
}

export default function DuckDbWorkspace() {
  const sessionRef = useRef<DuckDbSession | null>(null);
  const taskRef = useRef<LocalQueryTask | null>(null);
  const runVersion = useRef(0);
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("SELECT * FROM 'data.csv' LIMIT 100");
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [rowLimit, setRowLimit] = useState<number>(10_000);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [search, setSearch] = useState('');
  const [inspectedValue, setInspectedValue] = useState<{ column: string; value: string } | null>(null);
  const [status, setStatus] = useState('Choose a CSV or Parquet file to start the local database.');
  const [busy, setBusy] = useState(false);
  const [canCancel, setCanCancel] = useState(false);

  useEffect(() => () => {
    runVersion.current += 1;
    void taskRef.current?.cancel();
    void sessionRef.current?.close();
  }, []);

  async function ensureSession() {
    if (!sessionRef.current) sessionRef.current = await createDuckDbSession();
    return sessionRef.current;
  }

  async function loadFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    try {
      const session = await ensureSession();
      const incoming = Array.from(selected);
      const known = new Set(files);
      for (const file of incoming) {
        if (known.has(file.name)) await unregisterLocalFile(session.db, file.name);
        await registerLocalFile(session.db, file);
        known.add(file.name);
      }
      const names = Array.from(known);
      setFiles(names);
      setResult(null);
      setSearch('');
      setInspectedValue(null);
      if (incoming.length === 1) setQuery(`SELECT * FROM '${sqlFileName(incoming[0].name)}' LIMIT 100`);
      setStatus(`${incoming.map((file) => file.name).join(', ')} ready in the local DuckDB workspace. ${names.length} file${names.length === 1 ? '' : 's'} registered.`);
    } catch (error) {
      setStatus(`Could not open data locally: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(name: string) {
    if (busy) return;
    setBusy(true);
    try {
      const session = await ensureSession();
      await unregisterLocalFile(session.db, name);
      setFiles((current) => current.filter((file) => file !== name));
      setResult(null);
      setSearch('');
      setInspectedValue(null);
      setStatus(`${name} removed from the local DuckDB filesystem.`);
    } catch (error) {
      setStatus(`Could not remove ${name}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function executeSql(sql: string, successPrefix = 'Query complete', remember = false) {
    const version = ++runVersion.current;
    setBusy(true);
    setResult(null);
    setSearch('');
    setInspectedValue(null);
    setCanCancel(false);
    try {
      const session = await ensureSession();
      if (runVersion.current !== version) return;
      const task = startLocalQuery(session.connection, sql, {
        maxRows: rowLimit,
        maxBytes: WORKBENCH_QUERY_MAX_BYTES,
      });
      taskRef.current = task;
      setCanCancel(true);
      const output = await task.promise;
      if (runVersion.current !== version) return;
      setResult(output);
      if (remember) {
        setQueryHistory((current) => [sql, ...current.filter((item) => item !== sql)].slice(0, QUERY_HISTORY_LIMIT));
      }
      setStatus(`${successPrefix}: ${output.values.length.toLocaleString()} row${output.values.length === 1 ? '' : 's'} captured. ${limitStatus(output, rowLimit)}`);
    } catch (error) {
      if (runVersion.current !== version) return;
      setStatus(`Query failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      if (runVersion.current === version) {
        taskRef.current = null;
        setCanCancel(false);
        setBusy(false);
      }
    }
  }

  async function execute() {
    const sql = query.trim();
    if (!sql) return;
    await executeSql(sql, 'Query complete', true);
  }

  async function cancelQuery() {
    const task = taskRef.current;
    if (!task) return;
    runVersion.current += 1;
    taskRef.current = null;
    setCanCancel(false);
    const cancelled = await task.cancel();
    setBusy(false);
    setStatus(cancelled ? 'Query cancelled.' : 'Cancellation requested; the query may already have completed.');
  }

  async function showSchema(name: string) {
    if (busy) return;
    await executeSql(`DESCRIBE SELECT * FROM '${sqlFileName(name)}'`, `Schema for ${name}`);
  }

  const filteredValues = useMemo(() => {
    if (!result || !search.trim()) return result?.values ?? [];
    const needle = search.toLocaleLowerCase();
    return result.values.filter((row) => row.some((value) => displayValue(value).toLocaleLowerCase().includes(needle)));
  }, [result, search]);

  function exportCsv() {
    if (result) downloadText(resultToCsv(result), 'query-result.csv', 'text/csv;charset=utf-8');
  }

  function exportJson() {
    if (result) {
      downloadText(
        JSON.stringify({
          columns: result.columns,
          types: result.types,
          rows: result.values,
          complete: result.complete,
          limitedBy: result.limitedBy,
        }, null, 2),
        'query-result.json',
        'application/json',
      );
    }
  }

  const tableColumns = useMemo(
    () => result?.columns.map((column, index) => ({ key: String(index), label: column })) ?? [],
    [result],
  );

  return <>
    <div className="workspace-header"><div><h2>Local SQL workbench</h2><p>DuckDB-Wasm runs in a dedicated browser worker.</p></div></div>
    <div className="workspace-body">
      <div className="field">
        <label htmlFor="duck-files">Choose data files</label>
        <input id="duck-files" type="file" accept=".csv,.parquet,text/csv,application/vnd.apache.parquet" multiple disabled={busy} onChange={(event) => consumeFileInput(event.target, () => loadFiles(event.target.files))} />
        <small>New selections are added to the existing local file set. Re-selecting a filename replaces that registered file.</small>
      </div>

      {files.length ? <div style={{ marginTop: 12 }}>
        <strong>Registered files</strong>
        <div className="button-row" style={{ marginTop: 8 }}>
          {files.map((name) => <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', flexWrap: 'wrap' }}>
            <code style={{ overflowWrap: 'anywhere' }}>{name}</code>
            <button type="button" disabled={busy} onClick={() => void showSchema(name)}>Schema</button>
            <button type="button" disabled={busy} onClick={() => void removeFile(name)}>Remove</button>
          </span>)}
        </div>
      </div> : null}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="sql-query">SQL query</label>
        <textarea
          id="sql-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              if (!busy && query.trim()) void execute();
            }
          }}
          spellCheck={false}
        />
        <small>Press Ctrl+Enter (Cmd+Enter on macOS) to run the query.</small>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <div className="field" style={{ minWidth: 'min(100%, 13rem)', flex: '1 1 13rem', margin: 0 }}>
          <label htmlFor="duck-row-limit">Maximum captured rows</label>
          <select id="duck-row-limit" value={rowLimit} disabled={busy} onChange={(event) => setRowLimit(Number(event.target.value))}>
            {ROW_LIMIT_OPTIONS.map((value) => <option value={value} key={value}>{value.toLocaleString()}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 'min(100%, 13rem)', flex: '1 1 13rem', margin: 0 }}>
          <label htmlFor="duck-query-history">Query history</label>
          <select id="duck-query-history" value="" disabled={busy || !queryHistory.length} onChange={(event) => { if (event.target.value) setQuery(event.target.value); }}>
            <option value="">{queryHistory.length ? 'Choose a previous query' : 'No queries yet'}</option>
            {queryHistory.map((item, index) => <option value={item} key={`${index}-${item}`}>{item}</option>)}
          </select>
        </div>
      </div>
      <p className="muted" style={{ overflowWrap: 'anywhere' }}>
        Results stream from DuckDB and stop retaining rows at the selected row cap or 32 MiB of normalized result data. Incomplete captures are always labeled before export.
      </p>

      <div className="button-row">
        <button className="action-button" type="button" disabled={busy || !query.trim()} onClick={() => void execute()}>Run query</button>
        <button className="action-button secondary" type="button" disabled={!canCancel} onClick={() => void cancelQuery()}>Cancel query</button>
        <button className="action-button secondary" type="button" disabled={!result} onClick={exportCsv}>Export captured CSV</button>
        <button className="action-button secondary" type="button" disabled={!result} onClick={exportJson}>Export captured JSON</button>
      </div>
      <div className="status-line" role="status">{busy ? 'Working in browser memory…' : status}</div>

      {result ? <>
        <div className="notice" style={{ marginTop: 14, overflowWrap: 'anywhere' }} data-testid="duckdb-result-metadata">
          <strong>{result.complete ? 'Complete capture' : 'Incomplete capture'}</strong>
          <div>{result.columns.map((column, index) => `${column}: ${result.types[index] ?? 'unknown'}`).join(' · ')}</div>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="duck-result-search">Search displayed rows</label>
          <input id="duck-result-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search any returned value" />
          <small>{search.trim() ? `${filteredValues.length.toLocaleString()} of ${result.values.length.toLocaleString()} captured rows match. ` : ''}Search affects display only; exports include every captured row and identify whether capture was complete.</small>
        </div>

        <PagedTable
          columns={tableColumns}
          rows={filteredValues}
          caption="DuckDB query results"
          pageSize={200}
          testId="duckdb-results"
          renderCell={(row, columnKey) => {
            const index = Number(columnKey);
            const value = row[index];
            const text = displayValue(value);
            if (text.length <= 120) return value === null ? <span aria-label="NULL">NULL</span> : text;
            return <button type="button" onClick={() => setInspectedValue({ column: result.columns[index] ?? `Column ${index + 1}`, value: text })}>
              {text.slice(0, 117)}…
            </button>;
          }}
        />

        {inspectedValue ? <div className="notice" style={{ marginTop: 14 }}>
          <strong>{inspectedValue.column}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 0 }}>{inspectedValue.value}</pre>
        </div> : null}
      </> : null}
    </div>
  </>;
}
