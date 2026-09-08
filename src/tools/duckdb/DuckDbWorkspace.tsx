import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import {
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

function csvCell(value: QueryValue | string) {
  const text = value === null ? '' : String(value);
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

export default function DuckDbWorkspace() {
  const sessionRef = useRef<DuckDbSession | null>(null);
  const taskRef = useRef<LocalQueryTask | null>(null);
  const runVersion = useRef(0);
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("SELECT * FROM 'data.csv' LIMIT 100");
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

  async function executeSql(sql: string, successPrefix = 'Query complete') {
    const version = ++runVersion.current;
    setBusy(true);
    setResult(null);
    setSearch('');
    setInspectedValue(null);
    setCanCancel(false);
    try {
      const session = await ensureSession();
      if (runVersion.current !== version) return;
      const task = startLocalQuery(session.connection, sql);
      taskRef.current = task;
      setCanCancel(true);
      const output = await task.promise;
      if (runVersion.current !== version) return;
      setResult(output);
      setStatus(`${successPrefix}: ${output.values.length.toLocaleString()} row${output.values.length === 1 ? '' : 's'} returned.`);
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
    if (!query.trim()) return;
    await executeSql(query);
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
    return result.values.filter((row) => row.some((value) => String(value ?? '').toLocaleLowerCase().includes(needle)));
  }, [result, search]);

  function exportCsv() {
    if (result) downloadText(resultToCsv(result), 'query-result.csv', 'text/csv;charset=utf-8');
  }

  function exportJson() {
    if (result) {
      downloadText(
        JSON.stringify({ columns: result.columns, rows: result.values }, null, 2),
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

      <div className="button-row">
        <button className="action-button" type="button" disabled={busy || !query.trim()} onClick={() => void execute()}>Run query</button>
        <button className="action-button secondary" type="button" disabled={!canCancel} onClick={() => void cancelQuery()}>Cancel query</button>
        <button className="action-button secondary" type="button" disabled={!result} onClick={exportCsv}>Export full CSV</button>
        <button className="action-button secondary" type="button" disabled={!result} onClick={exportJson}>Export full JSON</button>
      </div>
      <div className="status-line" role="status">{busy ? 'Working in browser memory…' : status}</div>

      {result ? <>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="duck-result-search">Search displayed rows</label>
          <input id="duck-result-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search any returned value" />
          <small>{search.trim() ? `${filteredValues.length.toLocaleString()} of ${result.values.length.toLocaleString()} rows match. ` : ''}Search affects display only; exports always include the complete query result.</small>
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
            const text = value === null ? '' : String(value);
            if (text.length <= 120) return text;
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
