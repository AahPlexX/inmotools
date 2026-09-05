import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadText } from '../../lib/download';
import LatticeEditor from './LatticeEditor';
import LatticeViewport from './LatticeViewport';
import { diffStructures } from './diff-engine';
import { buildFlatCsv, buildLatticeSvg, rasterizeLatticeSvg } from './export-engine';
import { parseStructuredText, serializeStructuredData, type JsonPrimitive, type JsonValue, type StructuredFormat } from './format-engine';
import { buildGraphModel } from './graph-engine';
import type { LatticeLayoutDirection, LatticeLayoutModel } from './layout-engine';
import { createLatticeLayoutWorkerClient, type LatticeLayoutWorkerClient, type LatticeLayoutWorkerRequest } from './layout-worker';
import { applyJsonPatch, escapeJsonPointer, getPointerValue } from './patch-engine';
import { protectData } from './privacy-engine';
import { selectJsonPathPointers, slicePathsWithAncestors } from './query-engine';
import { generateSchemaTargets } from './schema-engine';
import { closeLatticeSqlSession, createLatticeSqlSession, refreshJsonTreeTable, runLatticeSql, type LatticeSqlSession } from './lattice-sql';
import { commitHistory, createHistory, redoHistory, undoHistory } from './state-engine';
import type { QueryResult } from '../duckdb/duckdb-client';
import { consumeFileInput } from '../../lib/file-input';

const DEFAULT_SOURCE = JSON.stringify({
  project: 'JSON Lattice Studio',
  status: 'local',
  owner: { id: 'team-1', email: 'owner@example.com' },
  tasks: [{ id: 'task-1', title: 'Map structure', owner_id: 'team-1' }],
}, null, 2);
const STORAGE_KEY = 'inmotools:json-lattice:v1';
const FORMATS: StructuredFormat[] = ['json', 'yaml', 'toml', 'xml', 'csv'];

type SchemaTarget = 'typescript' | 'zod' | 'go' | 'rust' | 'jsonSchemaDraft07' | 'jsonSchema202012';
interface InitialSession { source: string; format: StructuredFormat; value: JsonValue; collapsed: string[]; direction: LatticeLayoutDirection; }

const parseMaybeJson = (text: string): JsonValue => {
  try { return parseStructuredText(text, 'json'); } catch { return text; }
};
const detectFormat = (name: string): StructuredFormat => {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  if (ext === 'toml') return 'toml';
  if (ext === 'xml') return 'xml';
  if (ext === 'csv') return 'csv';
  return 'json';
};
const loadInitial = (): InitialSession => {
  const fallback = { source: DEFAULT_SOURCE, format: 'json' as const, value: parseStructuredText(DEFAULT_SOURCE, 'json'), collapsed: [], direction: 'LR' as const };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<{ source: string; format: StructuredFormat; collapsed: string[]; direction: LatticeLayoutDirection }>;
    const format = FORMATS.includes(saved.format as StructuredFormat) ? saved.format as StructuredFormat : 'json';
    const source = typeof saved.source === 'string' ? saved.source : DEFAULT_SOURCE;
    return { source, format, value: parseStructuredText(source, format), collapsed: Array.isArray(saved.collapsed) ? saved.collapsed.filter((item): item is string => typeof item === 'string') : [], direction: ['LR', 'TB', 'RL', 'BT'].includes(saved.direction ?? '') ? saved.direction as LatticeLayoutDirection : 'LR' };
  } catch { return fallback; }
};
const sameJson = (a: JsonValue, b: JsonValue): boolean => JSON.stringify(a) === JSON.stringify(b);
const plural = (count: number, noun: string, pluralNoun = `${noun}s`): string => `${count} ${count === 1 ? noun : pluralNoun}`;

export default function LatticeWorkspace() {
  const initial = useMemo(loadInitial, []);
  const [source, setSource] = useState(initial.source);
  const [format, setFormat] = useState<StructuredFormat>(initial.format);
  const [history, setHistory] = useState(() => createHistory(initial.value));
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set(initial.collapsed));
  const [direction, setDirection] = useState<LatticeLayoutDirection>(initial.direction);
  const [layout, setLayout] = useState<LatticeLayoutModel | null>(null);
  const [layoutError, setLayoutError] = useState('');
  const [parseError, setParseError] = useState('');
  const [status, setStatus] = useState('Edit, inspect, query, and export locally.');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [activePath, setActivePath] = useState('');
  const [privacyEnabled, setPrivacyEnabled] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<'mask' | 'mock'>('mask');
  const [diffMode, setDiffMode] = useState(false);
  const [comparison, setComparison] = useState('{}');
  const [schemaTarget, setSchemaTarget] = useState<SchemaTarget>('typescript');
  const [jsonPath, setJsonPath] = useState('$');
  const [jsonPathPointers, setJsonPathPointers] = useState<string[]>([]);
  const [querySlice, setQuerySlice] = useState(false);
  const [querySummary, setQuerySummary] = useState('No query run yet.');
  const [sql, setSql] = useState("SELECT path, key, type, value_text FROM json_tree LIMIT 50");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [renameKey, setRenameKey] = useState('');
  const [addKey, setAddKey] = useState('newField');
  const [addValue, setAddValue] = useState('null');
  const workerRef = useRef<LatticeLayoutWorkerClient | null>(null);
  const requestIdRef = useRef(0);
  const suppressParseRef = useRef(false);
  const sqlSessionRef = useRef<LatticeSqlSession | null>(null);

  const privacy = useMemo(() => protectData(history.present, { mode: privacyMode }), [history.present, privacyMode]);
  const displayValue = privacyEnabled ? privacy.value : history.present;
  const baseGraph = useMemo(() => buildGraphModel(displayValue, { collapsedPaths }), [displayValue, collapsedPaths]);
  const queryClosure = useMemo(() => querySlice && jsonPathPointers.length ? slicePathsWithAncestors(jsonPathPointers) : null, [querySlice, jsonPathPointers]);
  const graph = useMemo(() => {
    if (!queryClosure) return baseGraph;
    const nodes = baseGraph.nodes.filter((node) => queryClosure.has(node.path));
    const ids = new Set(nodes.map((node) => node.path));
    return {
      nodes,
      edges: baseGraph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
      crossLinks: baseGraph.crossLinks.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  }, [baseGraph, queryClosure]);
  const searchMatches = useMemo(() => {
    if (!deferredSearch) return new Set<string>();
    return new Set(graph.nodes.filter((node) => `${node.key} ${node.value ?? ''} ${node.type} ${node.path}`.toLowerCase().includes(deferredSearch)).map((node) => node.path));
  }, [graph, deferredSearch]);
  const schemaOutputs = useMemo(() => generateSchemaTargets(history.present), [history.present]);
  const selectedNode = useMemo(() => baseGraph.nodes.find((node) => node.path === activePath) ?? baseGraph.nodes[0], [baseGraph, activePath]);
  const selectedValue = useMemo(() => { try { return selectedNode ? getPointerValue(history.present, selectedNode.path) : null; } catch { return null; } }, [history.present, selectedNode]);

  const comparisonResult = useMemo(() => {
    if (!diffMode) return { result: null, error: '' };
    try { return { result: diffStructures(history.present, parseStructuredText(comparison, 'json')), error: '' }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : 'Comparison JSON is invalid.' }; }
  }, [diffMode, history.present, comparison]);

  const syncSourceFromValue = (value: JsonValue, targetFormat: StructuredFormat = format) => {
    try {
      suppressParseRef.current = true;
      setSource(serializeStructuredData(value, targetFormat));
      setParseError('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not serialize the current document.'); }
  };
  const commitValue = (value: JsonValue, note: string) => {
    setHistory((current) => commitHistory(current, value));
    syncSourceFromValue(value);
    setStatus(note);
  };

  useEffect(() => {
    if (suppressParseRef.current) { suppressParseRef.current = false; return; }
    const timer = window.setTimeout(() => {
      try {
        const next = parseStructuredText(source, format);
        setParseError('');
        setHistory((current) => sameJson(current.present, next) ? current : commitHistory(current, next));
      } catch (error) { setParseError(error instanceof Error ? error.message : 'Could not parse this document.'); }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [source, format]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ source, format, collapsed: [...collapsedPaths], direction })); } catch { /* storage can be blocked */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [source, format, collapsedPaths, direction]);

  useEffect(() => {
    try {
      const worker = createLatticeLayoutWorkerClient();
      workerRef.current = worker;
      setLayoutError('');
      return () => { worker.terminate(); workerRef.current = null; };
    } catch (error) {
      workerRef.current = null;
      setLayout(null);
      setLayoutError(error instanceof Error ? error.message : 'Could not start the local layout worker.');
    }
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const requestId = ++requestIdRef.current;
    setLayout(null);
    const request: LatticeLayoutWorkerRequest = { requestId, graph, direction };
    void worker.layout(request).then((response) => {
      if (response.requestId !== requestIdRef.current) return;
      if (response.ok) { setLayout(response.layout); setLayoutError(''); }
      else { setLayout(null); setLayoutError(response.error); }
    });
  }, [graph, direction]);

  useEffect(() => () => { void closeLatticeSqlSession(sqlSessionRef.current); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if ((event.target as HTMLElement | null)?.closest('input,textarea,select,.cm-editor')) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && history.past.length) { event.preventDefault(); const next = undoHistory(history); setHistory(next); syncSourceFromValue(next.present); }
      if ((event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) && history.future.length) { event.preventDefault(); const next = redoHistory(history); setHistory(next); syncSourceFromValue(next.present); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, format]);

  const changeFormat = (next: StructuredFormat) => {
    try {
      const nextSource = serializeStructuredData(history.present, next);
      suppressParseRef.current = true;
      setFormat(next);
      setSource(nextSource);
      setParseError('');
      setStatus(`Editor converted to ${next.toUpperCase()} locally.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : `Cannot represent this document as ${next}.`); }
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    const nextFormat = detectFormat(file.name);
    const text = await file.text();
    suppressParseRef.current = false;
    setFormat(nextFormat);
    setSource(text);
    setStatus(`${file.name} loaded locally as ${nextFormat.toUpperCase()}.`);
  };
  const toggleCollapse = (path: string) => setCollapsedPaths((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const editPrimitive = (path: string, value: JsonPrimitive) => {
    if (privacyEnabled) { setStatus('Turn off Privacy Shield before editing canonical values.'); return; }
    const { document } = applyJsonPatch(history.present, [{ op: 'replace', path, value }]);
    commitValue(document, `${path || '/'} updated with an RFC 6902 replace operation.`);
  };
  const undo = () => { const next = undoHistory(history); if (next === history) return; setHistory(next); syncSourceFromValue(next.present); setStatus('Undo applied.'); };
  const redo = () => { const next = redoHistory(history); if (next === history) return; setHistory(next); syncSourceFromValue(next.present); setStatus('Redo applied.'); };

  const renameSelected = () => {
    if (!selectedNode?.path || !selectedNode.parentPath && selectedNode.parentPath !== '') return;
    const nextKey = renameKey.trim(); if (!nextKey) return;
    const target = `${selectedNode.parentPath ?? ''}/${escapeJsonPointer(nextKey)}`;
    try { getPointerValue(history.present, target); setStatus(`Cannot rename: ${target} already exists.`); return; } catch { /* expected for a free target */ }
    try {
      const { document } = applyJsonPatch(history.present, [{ op: 'move', from: selectedNode.path, path: target }]);
      commitValue(document, `${selectedNode.path} renamed to ${target}.`); setActivePath(target); setRenameKey('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Rename failed.'); }
  };
  const removeSelected = () => {
    if (!selectedNode?.path) { setStatus('The document root cannot be removed.'); return; }
    try { const { document } = applyJsonPatch(history.present, [{ op: 'remove', path: selectedNode.path }]); commitValue(document, `${selectedNode.path} removed.`); setActivePath(selectedNode.parentPath ?? ''); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Remove failed.'); }
  };
  const addChild = () => {
    if (!selectedNode || !['object', 'array'].includes(selectedNode.type)) { setStatus('Select an object or array before adding a child.'); return; }
    const value = parseMaybeJson(addValue);
    const path = selectedNode.type === 'array' ? `${selectedNode.path}/-` : `${selectedNode.path}/${escapeJsonPointer(addKey.trim() || 'newField')}`;
    try { const { document } = applyJsonPatch(history.present, [{ op: 'add', path, value }]); commitValue(document, `Added ${path}.`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Add failed.'); }
  };

  const runJsonPath = () => {
    try { const pointers = selectJsonPathPointers(history.present, jsonPath.trim() || '$'); setJsonPathPointers(pointers); setQuerySummary(`${plural(pointers.length, 'match', 'matches')} · ${slicePathsWithAncestors(pointers).size} nodes with ancestors`); }
    catch (error) { setJsonPathPointers([]); setQuerySummary(error instanceof Error ? error.message : 'JSONPath failed.'); }
  };
  const runSql = async () => {
    setSqlBusy(true); setSqlResult(null);
    try {
      if (!sqlSessionRef.current) sqlSessionRef.current = await createLatticeSqlSession();
      await refreshJsonTreeTable(sqlSessionRef.current, history.present);
      const result = await runLatticeSql(sqlSessionRef.current, sql);
      setSqlResult(result); setStatus(`DuckDB returned ${plural(result.rows.length, 'row')}.`);
    } catch (error) { setStatus(`SQL failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { setSqlBusy(false); }
  };

  const exportSvg = () => {
    if (!layout) return;
    downloadText(buildLatticeSvg(graph, layout), 'json-lattice.svg', 'image/svg+xml;charset=utf-8');
  };
  const exportRaster = async (kind: 'png' | 'jpeg') => {
    if (!layout) return;
    try { const svg = buildLatticeSvg(graph, layout); downloadBlob(await rasterizeLatticeSvg(svg, { format: kind, scale: 2 }), `json-lattice.${kind === 'jpeg' ? 'jpg' : 'png'}`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Raster export failed.'); }
  };
  const exportFormat = (target: 'json' | 'yaml' | 'toml') => {
    try { downloadText(serializeStructuredData(history.present, target), `json-lattice.${target === 'yaml' ? 'yaml' : target}`, target === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Export failed.'); }
  };
  const exportProtectedJson = () => downloadText(serializeStructuredData(privacy.value, 'json'), 'json-lattice-protected.json', 'application/json;charset=utf-8');

  const diffSummary = (() => {
    if (!diffMode) return 'Diff mode off.';
    if (comparisonResult.error) return comparisonResult.error;
    const changes = comparisonResult.result?.changes ?? [];
    const counts = { modify: 0, delete: 0, insert: 0, move: 0 };
    for (const item of changes) counts[item.kind] += 1;
    return `${counts.modify} modified · ${counts.delete} deleted · ${counts.insert} inserted · ${counts.move} moved`;
  })();

  return <div className="lattice-studio" data-testid="json-lattice-studio">
    <div className="lattice-topbar">
      <div className="lattice-actions">
        <button type="button" onClick={undo} disabled={!history.past.length}>Undo</button>
        <button type="button" onClick={redo} disabled={!history.future.length}>Redo</button>
        <button type="button" aria-pressed={privacyEnabled} onClick={() => setPrivacyEnabled((value) => !value)}>Privacy Shield</button>
        <button type="button" aria-pressed={diffMode} onClick={() => setDiffMode((value) => !value)}>Diff Mode</button>
      </div>
      <div className="lattice-statline" aria-label="Graph statistics"><span>Loaded <strong>{baseGraph.nodes.length}</strong></span><span>Visible <strong data-testid="visible-node-count">{graph.nodes.length}</strong></span><span>Rendered <strong>{layout?.nodes.size ?? 0}</strong></span></div>
    </div>

    <div className="lattice-inputbar">
      <label>Input format<select aria-label="Input format" value={format} onChange={(event) => changeFormat(event.target.value as StructuredFormat)}>{FORMATS.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
      <label className="lattice-file">Open local file<input type="file" accept=".json,.yaml,.yml,.toml,.xml,.csv,application/json,text/csv" onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))} /></label>
      <label className="lattice-search">Search graph<input aria-label="Search graph" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="key, value, type, or path" /></label>
      <span className="lattice-search-count"><strong data-testid="search-match-count">{searchMatches.size}</strong> matches</span>
      <label>Layout<select value={direction} onChange={(event) => setDirection(event.target.value as LatticeLayoutDirection)}><option value="LR">Left → right</option><option value="TB">Top → bottom</option><option value="RL">Right → left</option><option value="BT">Bottom → top</option></select></label>
    </div>

    <div className="lattice-main">
      <section className="lattice-source-panel" aria-label="Canonical source editor">
        <div className="lattice-panel-heading"><div><h2>Canonical source</h2><p>{format.toUpperCase()} input normalizes to a JSON-compatible model.</p></div><span className={parseError ? 'lattice-bad' : 'lattice-good'}>{parseError ? 'Parse error' : 'Valid'}</span></div>
        <LatticeEditor value={source} format={format} onChange={setSource} />
        {parseError ? <div className="lattice-error" role="alert">{parseError}</div> : null}
      </section>

      <section className="lattice-graph-panel" aria-label="Interactive JSON graph">
        <div className="lattice-panel-heading"><div><h2>Graph workspace</h2><p>Drag to pan · wheel to zoom · double-click primitives to edit.</p></div>{layoutError ? <span className="lattice-bad">Layout error</span> : <span className="lattice-good">ELK worker</span>}</div>
        <LatticeViewport graph={graph} layout={layout} collapsedPaths={collapsedPaths} searchMatches={searchMatches} activePath={activePath} onToggleCollapse={toggleCollapse} onEditPrimitive={editPrimitive} onSelect={setActivePath} />
        {layoutError ? <div className="lattice-error" role="alert">{layoutError}</div> : null}
      </section>

      <aside className="lattice-inspector" aria-label="Node inspector">
        <div className="lattice-panel-heading"><div><h2>Inspector</h2><p>{selectedNode?.path || '/'}</p></div><span>{selectedNode?.type ?? '—'}</span></div>
        <dl className="lattice-inspector-list"><div><dt>Key</dt><dd>{selectedNode?.key ?? '—'}</dd></div><div><dt>Depth</dt><dd>{selectedNode?.depth ?? 0}</dd></div><div><dt>Children</dt><dd>{selectedNode?.childCount ?? 0}</dd></div><div><dt>Value</dt><dd>{selectedValue === null ? 'null' : typeof selectedValue === 'object' ? selectedNode?.type : String(selectedValue)}</dd></div></dl>
        {selectedNode?.path ? <div className="field"><label htmlFor="lattice-rename">Rename property</label><input id="lattice-rename" value={renameKey} onChange={(event) => setRenameKey(event.target.value)} /><div className="button-row"><button type="button" className="action-button secondary" onClick={renameSelected}>Rename</button><button type="button" className="action-button secondary" onClick={removeSelected}>Remove node</button></div></div> : null}
        {selectedNode && ['object', 'array'].includes(selectedNode.type) ? <div className="lattice-add-child"><h3>Add child</h3>{selectedNode.type === 'object' ? <label>Property key<input value={addKey} onChange={(event) => setAddKey(event.target.value)} /></label> : null}<label>JSON value<input value={addValue} onChange={(event) => setAddValue(event.target.value)} /></label><button type="button" onClick={addChild}>Add child</button></div> : null}
      </aside>
    </div>

    <div className="lattice-dock">
      <details open><summary>Privacy & diff</summary><div className="lattice-dock-grid">
        <div><h3>Privacy Shield</h3><label>Protection mode<select value={privacyMode} onChange={(event) => setPrivacyMode(event.target.value as 'mask' | 'mock')}><option value="mask">Mask detected values</option><option value="mock">Deterministic mock values</option></select></label><p data-testid="privacy-summary">{privacyEnabled ? `${privacy.findings.length} protected values` : 'Shield off · source unchanged'}</p><button type="button" onClick={exportProtectedJson}>Export protected JSON</button><small>Heuristic detector: review before sharing.</small></div>
        <div><h3>Structural diff</h3><label>Comparison JSON<textarea aria-label="Comparison JSON" value={comparison} onChange={(event) => setComparison(event.target.value)} /></label><p data-testid="diff-summary">{diffSummary}</p></div>
      </div></details>

      <details><summary>Schema generator</summary><div className="lattice-dock-grid single"><label>Schema target<select aria-label="Schema target" value={schemaTarget} onChange={(event) => setSchemaTarget(event.target.value as SchemaTarget)}><option value="typescript">TypeScript</option><option value="zod">Zod</option><option value="go">Go</option><option value="rust">Rust Serde</option><option value="jsonSchemaDraft07">JSON Schema Draft-07</option><option value="jsonSchema202012">JSON Schema 2020-12</option></select></label><pre data-testid="schema-output" tabIndex={0}>{schemaOutputs[schemaTarget]}</pre></div></details>

      <details><summary>JSONPath & DuckDB</summary><div className="lattice-dock-grid">
        <div><h3>JSONPath slice</h3><label>JSONPath query<input aria-label="JSONPath query" value={jsonPath} onChange={(event) => setJsonPath(event.target.value)} /></label><div className="button-row"><button type="button" onClick={runJsonPath}>Run JSONPath</button><label className="lattice-check"><input type="checkbox" checked={querySlice} onChange={(event) => setQuerySlice(event.target.checked)} /> Slice graph to matches + ancestors</label></div><p data-testid="query-summary">{querySummary}</p></div>
        <div><h3>Local SQL</h3><label>SQL query<textarea aria-label="SQL query" value={sql} onChange={(event) => setSql(event.target.value)} /></label><button type="button" disabled={sqlBusy || !sql.trim()} onClick={() => void runSql()}>{sqlBusy ? 'Running locally…' : 'Run SQL'}</button>{sqlResult ? <div className="result-table-wrap" data-testid="sql-results"><table><thead><tr>{sqlResult.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{sqlResult.rows.map((row, index) => <tr key={index}>{sqlResult.columns.map((column) => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div> : <div data-testid="sql-results" className="lattice-empty">No SQL results yet.</div>}</div>
      </div></details>
    </div>

    <div className="lattice-exportbar" aria-label="JSON Lattice export controls">
      <button type="button" disabled={!layout} onClick={exportSvg}>Export SVG</button>
      <button type="button" disabled={!layout} onClick={() => void exportRaster('png')}>Export PNG</button>
      <button type="button" disabled={!layout} onClick={() => void exportRaster('jpeg')}>Export JPEG</button>
      <button type="button" onClick={() => downloadText(buildFlatCsv(history.present), 'json-lattice.csv', 'text/csv;charset=utf-8')}>Export CSV</button>
      <button type="button" onClick={() => exportFormat('json')}>Export JSON</button>
      <button type="button" onClick={() => exportFormat('yaml')}>Export YAML</button>
      <button type="button" onClick={() => exportFormat('toml')}>Export TOML</button>
      <button type="button" onClick={() => { window.localStorage.removeItem(STORAGE_KEY); setStatus('Saved JSON Lattice session cleared from this browser.'); }}>Clear saved session</button>
    </div>
    <div className="lattice-status" role="status">{status}</div>
    <p className="lattice-disclaimer">Privacy Shield is heuristic, foreign-key links are convention-based suggestions, and browser/Wasm memory is finite. Processing stays local to this browser.</p>
  </div>;
}
