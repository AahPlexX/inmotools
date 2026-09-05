import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import HarWaterfallCanvas from './HarWaterfallCanvas';
import { analyzeHar, buildWaterfallRows, sanitizeHar, type HarFindingCategory, type HarSanitizePolicy } from './har-engine';
import { consumeFileInput } from '../../lib/file-input';

const CATEGORY_LABELS: Record<HarFindingCategory, string> = {
  headers: 'Sensitive headers', cookies: 'Cookies', query: 'Query parameters', bodies: 'Request bodies',
};

export default function HarWorkspace() {
  const [source, setSource] = useState<any | null>(null);
  const [fileName, setFileName] = useState('network.har');
  const [status, setStatus] = useState('Choose a HAR file to inspect locally.');
  const [mode, setMode] = useState<HarSanitizePolicy['mode']>('redact');
  const [mask, setMask] = useState('MASKED');
  const [categories, setCategories] = useState<Record<HarFindingCategory, boolean>>({ headers: true, cookies: true, query: true, bodies: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const analysis = useMemo(() => source ? analyzeHar(source) : null, [source]);
  const rows = useMemo(() => source ? buildWaterfallRows(source) : [], [source]);
  const selected = rows[selectedIndex];
  const selectedEntry = source?.log?.entries?.[selectedIndex];

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.log || !Array.isArray(parsed.log.entries)) throw new Error('This JSON does not contain a HAR log.entries array.');
      setSource(parsed); setFileName(file.name); setSelectedIndex(0);
      setStatus(`${parsed.log.entries.length} requests loaded. Review findings before export.`);
    } catch (error) {
      setSource(null); setStatus(`HAR load failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  async function exportSanitized() {
    if (!source) return;
    try {
      setStatus('Sanitizing the selected categories locally…');
      const result = await sanitizeHar(source, { mode, mask, categories });
      const base = fileName.replace(/\.har$/i, '').replace(/\.json$/i, '');
      downloadText(JSON.stringify(result.har, null, 2), `${base || 'network'}.sanitized.har`, 'application/json');
      setStatus(`Sanitized ${result.findings.length} detected credential-bearing fields locally.`);
    } catch (error) {
      setStatus(`Sanitization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return <>
    <div className="workspace-header"><div><h2>Credential review & waterfall</h2><p>Inspect sensitive fields before creating a shareable HAR.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="har-file">Choose HAR file</label><input id="har-file" type="file" accept=".har,application/json,.json" onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))}/><small>The source file is read only by this browser session.</small></div>
      {analysis ? <>
        <div className="metric-row">
          <div className="metric"><span>Requests</span><strong>{analysis.requestCount}</strong></div>
          <div className="metric"><span>Findings</span><strong>{analysis.findings.length}</strong></div>
          <div className="metric"><span>Categories</span><strong>{Object.values(categories).filter(Boolean).length}/4</strong></div>
        </div>
        <div className="workspace-grid" style={{ marginTop: 18 }}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="field-label">Sanitize categories</legend>{(Object.keys(CATEGORY_LABELS) as HarFindingCategory[]).map((category) => <label key={category} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 36 }}><input type="checkbox" checked={categories[category]} onChange={(event) => setCategories((current) => ({ ...current, [category]: event.target.checked }))}/>{CATEGORY_LABELS[category]}</label>)}</fieldset>
          <div className="field"><label htmlFor="har-mode">Replacement mode</label><select id="har-mode" value={mode} onChange={(event) => setMode(event.target.value as HarSanitizePolicy['mode'])}><option value="redact">[REDACTED]</option><option value="hash">SHA-256 hash</option><option value="mask">Custom mask</option></select>{mode === 'mask' ? <><label htmlFor="har-mask">Custom mask text</label><input id="har-mask" type="text" value={mask} onChange={(event) => setMask(event.target.value)}/></> : null}<small>SHA-256 preserves equality for comparison; it is not a guarantee that low-entropy secrets cannot be guessed.</small></div>
        </div>
        <HarWaterfallCanvas rows={rows} selectedIndex={Math.min(selectedIndex, Math.max(0, rows.length - 1))} onSelect={setSelectedIndex}/>
        {selected ? <div className="notice" style={{ marginTop: 18 }}><strong>{selected.method} · HTTP {selected.status}</strong><div style={{ overflowWrap: 'anywhere', marginTop: 5 }}>{selected.url}</div><div style={{ marginTop: 5 }}>{selected.totalMs} ms total · wait {selected.phases.wait} ms · receive {selected.phases.receive} ms</div></div> : null}
        {selectedEntry ? <details style={{ marginTop: 16 }}><summary>Selected request metadata</summary><pre className="code-output" tabIndex={0}>{JSON.stringify({ method: selectedEntry.request?.method, url: selectedEntry.request?.url, status: selectedEntry.response?.status, timings: selectedEntry.timings }, null, 2)}</pre></details> : null}
        <h3 style={{ marginTop: 24 }}>Credential findings</h3>
        <div className="result-table-wrap" tabIndex={0} aria-label="Detected HAR credential fields"><table><thead><tr><th scope="col">Category</th><th scope="col">Path</th></tr></thead><tbody>{analysis.findings.length ? analysis.findings.map((finding, index) => <tr key={`${finding.entryIndex}-${finding.field}-${index}`}><td>{CATEGORY_LABELS[finding.category]}</td><td>{finding.field}</td></tr>) : <tr><td colSpan={2}>No likely credential-bearing fields detected.</td></tr>}</tbody></table></div>
        <div className="button-row"><button className="action-button" type="button" onClick={() => void exportSanitized()}>Download sanitized HAR</button></div>
      </> : null}
      <div className={`status-line ${source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
