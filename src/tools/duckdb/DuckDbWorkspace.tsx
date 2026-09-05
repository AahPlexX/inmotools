import { useEffect, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { rowsToCsv } from '../logs/log-engine';
import { createDuckDbSession, registerLocalFile, runLocalQuery, type DuckDbSession, type QueryResult } from './duckdb-client';

export default function DuckDbWorkspace() {
  const sessionRef = useRef<DuckDbSession | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("SELECT * FROM 'data.csv' LIMIT 100");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [status, setStatus] = useState('Choose a CSV or Parquet file to start the local database.');
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { void sessionRef.current?.close(); }, []);

  async function ensureSession() {
    if (!sessionRef.current) sessionRef.current = await createDuckDbSession();
    return sessionRef.current;
  }

  async function loadFiles(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    try {
      const session = await ensureSession();
      const names: string[] = [];
      for (const file of Array.from(selected)) {
        await registerLocalFile(session.db, file);
        names.push(file.name);
      }
      setFiles(names);
      if (names.length === 1) setQuery(`SELECT * FROM '${names[0].replaceAll("'", "''")}' LIMIT 100`);
      setStatus(`${names.join(', ')} ready in the local DuckDB workspace.`);
    } catch (error) { setStatus(`Could not open data locally: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { setBusy(false); }
  }

  async function execute() {
    setBusy(true); setResult(null);
    try {
      const session = await ensureSession();
      const output = await runLocalQuery(session.connection, query);
      setResult(output);
      setStatus(`Query complete: ${output.rows.length.toLocaleString()} row${output.rows.length === 1 ? '' : 's'} returned.`);
    } catch (error) { setStatus(`Query failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { setBusy(false); }
  }

  function exportCsv() { if (result) downloadText(rowsToCsv(result.rows, result.columns), 'query-result.csv', 'text/csv;charset=utf-8'); }
  function exportJson() { if (result) downloadText(JSON.stringify(result.rows, null, 2), 'query-result.json', 'application/json'); }

  return <>
    <div className="workspace-header"><div><h2>Local SQL workbench</h2><p>DuckDB-Wasm runs in a dedicated browser worker.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="duck-files">Choose data files</label><input id="duck-files" type="file" accept=".csv,.parquet,text/csv,application/vnd.apache.parquet" multiple onChange={(event) => void loadFiles(event.target.files)} /><small>Loaded files: {files.length ? files.join(', ') : 'none'}</small></div>
      <div className="field" style={{marginTop:16}}><label htmlFor="sql-query">SQL query</label><textarea id="sql-query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (!busy && query.trim()) void execute(); } }} spellCheck={false} /><small>Press Ctrl+Enter (Cmd+Enter on macOS) to run the query.</small></div>
      <div className="button-row"><button className="action-button" type="button" disabled={busy || !query.trim()} onClick={() => void execute()}>Run query</button><button className="action-button secondary" type="button" disabled={!result} onClick={exportCsv}>Export CSV</button><button className="action-button secondary" type="button" disabled={!result} onClick={exportJson}>Export JSON</button></div>
      <div className="status-line" role="status">{busy ? 'Working in browser memory…' : status}</div>
      {result ? <div className="result-table-wrap"><table><thead><tr>{result.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{result.columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div> : null}
    </div>
  </>;
}
