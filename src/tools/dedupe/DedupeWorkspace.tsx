import { useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { downloadText } from '../../lib/download';
import { findDuplicateClusters, mergeCluster, type DedupeCluster, type DedupeConfig, type DedupeRow } from './dedupe-engine';

type Sheet = { name: string; data: unknown[][] };
type Decision = { dismissed: boolean; selections: Record<string, number> };

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); if (row.some((value) => value.length)) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function matrixToRows(matrix: unknown[][]) {
  if (!matrix.length) return { headers: [] as string[], rows: [] as DedupeRow[] };
  const seen = new Map<string, number>();
  const headers = matrix[0].map((cell, index) => {
    const base = String(cell ?? '').trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0; seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
  const rows = matrix.slice(1).filter((values) => values.some((value) => value !== null && value !== undefined && String(value).trim() !== '')).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return { headers, rows };
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: DedupeRow[], headers: string[]) {
  return [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n');
}

function clusterKey(cluster: DedupeCluster) { return cluster.members.map((member) => member.index).join('-'); }

export default function DedupeWorkspace() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('records.csv');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [threshold, setThreshold] = useState(0.82);
  const [clusters, setClusters] = useState<DedupeCluster[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [status, setStatus] = useState('Choose a CSV or XLSX file to reconcile locally.');

  const active = sheets[sheetIndex];
  const table = useMemo(() => matrixToRows(active?.data ?? []), [active]);

  async function load(file: File | undefined) {
    if (!file) return;
    try {
      let nextSheets: Sheet[];
      if (/\.xlsx$/i.test(file.name)) {
        const parsed = await readXlsxFile(file);
        nextSheets = parsed.map((sheet) => ({ name: sheet.sheet, data: sheet.data as unknown[][] }));
      } else nextSheets = [{ name: 'CSV', data: parseCsv(await file.text()) }];
      if (!nextSheets.length) throw new Error('No readable sheets were found.');
      setSheets(nextSheets); setSheetIndex(0); setFileName(file.name); setClusters([]); setDecisions({});
      const first = matrixToRows(nextSheets[0].data); const initial: Record<string, boolean> = {}; const initialWeights: Record<string, number> = {};
      first.headers.forEach((header, index) => { initial[header] = index < Math.min(3, first.headers.length); initialWeights[header] = 1; });
      setSelected(initial); setWeights(initialWeights);
      setStatus(`${first.rows.length} records loaded from ${nextSheets[0].name}.`);
    } catch (error) { setSheets([]); setClusters([]); setStatus(`File load failed: ${error instanceof Error ? error.message : 'unsupported file'}`); }
  }

  function changeSheet(index: number) {
    setSheetIndex(index); setClusters([]); setDecisions({});
    const next = matrixToRows(sheets[index]?.data ?? []); const initial: Record<string, boolean> = {}; const initialWeights: Record<string, number> = {};
    next.headers.forEach((header, columnIndex) => { initial[header] = columnIndex < Math.min(3, next.headers.length); initialWeights[header] = 1; });
    setSelected(initial); setWeights(initialWeights); setStatus(`${next.rows.length} records ready from ${sheets[index]?.name ?? 'sheet'}.`);
  }

  async function analyze() {
    const columns = table.headers.filter((header) => selected[header]).map((column) => ({ column, weight: Math.max(0, weights[column] ?? 0) }));
    if (!columns.length) { setStatus('Select at least one matching column.'); return; }
    const config: DedupeConfig = { columns, threshold };
    setStatus('Scoring local duplicate candidates…');
    try {
      let result: DedupeCluster[];
      if (typeof Worker !== 'undefined') {
        result = await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./dedupe.worker.ts', import.meta.url), { type: 'module' });
          const id = crypto.randomUUID();
          worker.onmessage = (event) => { if (event.data.id !== id) return; worker.terminate(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.clusters); };
          worker.onerror = () => { worker.terminate(); reject(new Error('Worker analysis failed.')); };
          worker.postMessage({ id, rows: table.rows, config });
        });
      } else result = findDuplicateClusters(table.rows, config);
      setClusters(result); setDecisions(Object.fromEntries(result.map((cluster) => [clusterKey(cluster), { dismissed: false, selections: {} }])));
      setStatus(`${result.length} duplicate cluster${result.length === 1 ? '' : 's'} found.`);
    } catch (error) { setStatus(`Analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }

  function updateSelection(key: string, column: string, memberPosition: number) {
    setDecisions((current) => ({ ...current, [key]: { dismissed: current[key]?.dismissed ?? false, selections: { ...(current[key]?.selections ?? {}), [column]: memberPosition } } }));
  }

  function exportCsv() {
    const membership = new Map<number, { cluster: DedupeCluster; key: string; position: number }>();
    clusters.forEach((cluster) => cluster.members.forEach((member, position) => membership.set(member.index, { cluster, key: clusterKey(cluster), position })));
    const output: DedupeRow[] = [];
    table.rows.forEach((row, index) => {
      const linked = membership.get(index);
      if (!linked) { output.push(row); return; }
      const decision = decisions[linked.key] ?? { dismissed: false, selections: {} };
      if (decision.dismissed) { output.push(row); return; }
      if (linked.position === 0) output.push(mergeCluster(linked.cluster, decision.selections));
    });
    const base = fileName.replace(/\.(csv|xlsx)$/i, '') || 'records';
    downloadText(rowsToCsv(output, table.headers), `${base}.deduplicated.csv`, 'text/csv;charset=utf-8');
    setStatus(`Exported ${output.length} reconciled records locally.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Record reconciliation</h2><p>Block candidates, score fuzzy similarity, then choose canonical values before export.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="dedupe-file">Choose CSV or XLSX file</label><input id="dedupe-file" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void load(event.target.files?.[0])}/></div>
      {sheets.length > 1 ? <div className="field" style={{ marginTop: 16 }}><label htmlFor="dedupe-sheet">Spreadsheet sheet</label><select id="dedupe-sheet" value={sheetIndex} onChange={(event) => changeSheet(Number(event.target.value))}>{sheets.map((sheet, index) => <option key={`${sheet.name}-${index}`} value={index}>{sheet.name}</option>)}</select></div> : null}
      {table.rows.length ? <>
        <div className="metric-row"><div className="metric"><span>Rows</span><strong>{table.rows.length}</strong></div><div className="metric"><span>Columns</span><strong>{table.headers.length}</strong></div><div className="metric"><span>Clusters</span><strong>{clusters.length || '—'}</strong></div></div>
        <h3 style={{ marginTop: 24 }}>Matching columns</h3>
        <div className="result-table-wrap" tabIndex={0} aria-label="Matching column weights"><table><thead><tr><th scope="col">Use</th><th scope="col">Column</th><th scope="col">Weight</th></tr></thead><tbody>{table.headers.map((header) => <tr key={header}><td><input aria-label={`Use ${header} for matching`} type="checkbox" checked={selected[header] ?? false} onChange={(event) => setSelected((current) => ({ ...current, [header]: event.target.checked }))}/></td><td>{header}</td><td><input aria-label={`${header} match weight`} type="number" min="0" step="0.1" value={weights[header] ?? 1} onChange={(event) => setWeights((current) => ({ ...current, [header]: Number(event.target.value) }))} style={{ width: 100 }}/></td></tr>)}</tbody></table></div>
        <div className="field" style={{ marginTop: 18, maxWidth: 360 }}><label htmlFor="dedupe-threshold">Duplicate confidence threshold</label><input id="dedupe-threshold" type="number" min="0.5" max="1" step="0.01" value={threshold} onChange={(event) => setThreshold(Math.max(0.5, Math.min(1, Number(event.target.value))))}/><small>Higher values require closer weighted agreement.</small></div>
        <div className="button-row"><button className="action-button" type="button" onClick={() => void analyze()}>Find duplicate clusters</button><button className="action-button secondary" type="button" disabled={!clusters.length} onClick={exportCsv}>Export reconciled CSV</button></div>
        {clusters.map((cluster, clusterIndex) => {
          const key = clusterKey(cluster); const decision = decisions[key] ?? { dismissed: false, selections: {} };
          return <section key={key} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 16, marginTop: 18 }} aria-labelledby={`cluster-${clusterIndex}`}>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}><h3 id={`cluster-${clusterIndex}`} style={{ margin: 0 }}>Cluster {clusterIndex + 1} · {Math.round(cluster.confidence * 100)}% confidence</h3><button className="action-button secondary" type="button" onClick={() => setDecisions((current) => ({ ...current, [key]: { ...decision, dismissed: !decision.dismissed } }))}>{decision.dismissed ? 'Restore duplicate review' : 'Mark false positive'}</button></div>
            {decision.dismissed ? <p className="help-text">This cluster will remain unchanged in the export.</p> : <>
              <div className="result-table-wrap" tabIndex={0} aria-label={`Rows in duplicate cluster ${clusterIndex + 1}`}><table><thead><tr><th scope="col">Source row</th>{table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{cluster.members.map((member) => <tr key={member.index}><td>{member.index + 2}</td>{table.headers.map((header) => <td key={header}>{String(member.row[header] ?? '')}</td>)}</tr>)}</tbody></table></div>
              <div className="workspace-grid" style={{ marginTop: 16 }}>{table.headers.map((header) => <div className="field" key={header}><label htmlFor={`${key}-${header}`}>Canonical {header}</label><select id={`${key}-${header}`} value={decision.selections[header] ?? 0} onChange={(event) => updateSelection(key, header, Number(event.target.value))}>{cluster.members.map((member, position) => <option key={member.index} value={position}>{String(member.row[header] ?? '') || '(blank)'}</option>)}</select></div>)}</div>
            </>}
          </section>;
        })}
      </> : null}
      <div className={`status-line ${table.rows.length ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
