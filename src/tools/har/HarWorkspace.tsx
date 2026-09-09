import { useMemo, useState } from 'react';
import { PagedTable } from '../../components/PagedTable';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import HarWaterfallCanvas from './HarWaterfallCanvas';
import { analyzeHar, buildWaterfallRows, parseHarJson, sanitizeHar, stringifyHarJson, type HarFindingCategory, type HarSanitizePolicy } from './har-engine';

const CATEGORY_LABELS: Record<HarFindingCategory, string> = {
  headers: 'Sensitive headers',
  cookies: 'Cookies',
  query: 'URLs & query parameters',
  bodies: 'Request/response bodies',
};

type FindingRow = { id: string; category: HarFindingCategory; label: string; field: string };
type RequestRow = ReturnType<typeof buildWaterfallRows>[number] & { id: string };

export default function HarWorkspace() {
  const [source, setSource] = useState<any | null>(null);
  const [fileName, setFileName] = useState('network.har');
  const [status, setStatus] = useState('Choose a HAR file to inspect locally.');
  const [mode, setMode] = useState<HarSanitizePolicy['mode']>('redact');
  const [mask, setMask] = useState('MASKED');
  const [categories, setCategories] = useState<Record<HarFindingCategory, boolean>>({ headers: true, cookies: true, query: true, bodies: true });
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);
  const [methodFilter, setMethodFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [findingCategory, setFindingCategory] = useState<'all' | HarFindingCategory>('all');
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof sanitizeHar>> | null>(null);

  const analysis = useMemo(() => source ? analyzeHar(source) : null, [source]);
  const rows = useMemo(() => source ? buildWaterfallRows(source) : [], [source]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const methodOk = !methodFilter || row.method.toLowerCase().includes(methodFilter.toLowerCase());
    let host = '';
    try { host = new URL(row.url).hostname; } catch { host = row.url; }
    const domainOk = !domainFilter || host.toLowerCase().includes(domainFilter.toLowerCase());
    const statusOk = !statusFilter || String(row.status).startsWith(statusFilter.trim());
    return methodOk && domainOk && statusOk;
  }), [rows, methodFilter, domainFilter, statusFilter]);

  const selectedPosition = Math.max(0, filteredRows.findIndex((row) => row.index === selectedEntryIndex));
  const selected = filteredRows[selectedPosition];
  const selectedEntry = selected ? source?.log?.entries?.[selected.index] : undefined;

  const findingRows = useMemo<FindingRow[]>(() => (analysis?.findings ?? [])
    .filter((finding) => findingCategory === 'all' || finding.category === findingCategory)
    .map((finding, index) => ({
      id: `${finding.category}-${finding.entryIndex}-${finding.field}-${index}`,
      category: finding.category,
      label: CATEGORY_LABELS[finding.category],
      field: finding.field,
    })), [analysis, findingCategory]);

  const requestRows = useMemo<RequestRow[]>(() => filteredRows.map((row) => ({ ...row, id: `request-${row.index}` })), [filteredRows]);

  function invalidatePrepared(nextStatus?: string) {
    setLastResult(null);
    if (nextStatus) setStatus(nextStatus);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseHarJson(await file.text());
      if (!parsed?.log || !Array.isArray(parsed.log.entries)) throw new Error('This JSON does not contain a HAR log.entries array.');
      setSource(parsed);
      setFileName(file.name);
      setSelectedEntryIndex(0);
      setFindingCategory('all');
      setLastResult(null);
      setStatus(`${parsed.log.entries.length} requests loaded. Review findings before preparing an export.`);
    } catch (error) {
      setSource(null);
      setLastResult(null);
      setStatus(`HAR load failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  async function prepareSanitized() {
    if (!source) return;
    try {
      setStatus('Sanitizing the selected categories locally…');
      const result = await sanitizeHar(source, { mode, mask, categories });
      setLastResult(result);
      setStatus(`Prepared ${result.changedFindings.length} transformed credential-bearing locations. Review the post-sanitize summary before downloading.`);
    } catch (error) {
      setLastResult(null);
      setStatus(`Sanitization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  function downloadPrepared() {
    if (!lastResult) return;
    const base = fileName.replace(/\.har$/i, '').replace(/\.json$/i, '');
    downloadText(stringifyHarJson(lastResult.har, 2), `${base || 'network'}.sanitized.har`, 'application/json');
    setStatus(`Downloaded the reviewed sanitized HAR. ${lastResult.remainingFindings.length} unsanitized credential-bearing location${lastResult.remainingFindings.length === 1 ? '' : 's'} remain by policy.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Credential review & waterfall</h2><p>Inspect sensitive fields, request timing, and the reviewed post-sanitize state before sharing a HAR.</p></div></div>
    <div className="workspace-body">
      <div className="field">
        <label htmlFor="har-file">Choose HAR file</label>
        <input id="har-file" type="file" accept=".har,application/json,.json" onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))} />
        <small>The source file is read only by this browser session. Large integer JSON values are retained exactly instead of being rounded through JavaScript Number conversion.</small>
      </div>

      {analysis ? <>
        <div className="metric-row">
          <div className="metric"><span>Requests</span><strong>{analysis.requestCount}</strong></div>
          <div className="metric"><span>Original findings</span><strong>{analysis.findings.length}</strong></div>
          <div className="metric"><span>Visible requests</span><strong>{filteredRows.length}</strong></div>
        </div>

        <div className="workspace-grid" style={{ marginTop: 18 }}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Sanitize categories</legend>
            {(Object.keys(CATEGORY_LABELS) as HarFindingCategory[]).map((category) => <label key={category} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 36 }}>
              <input type="checkbox" checked={categories[category]} onChange={(event) => { setCategories((current) => ({ ...current, [category]: event.target.checked })); invalidatePrepared('Sanitization policy changed. Prepare a new reviewed output before downloading.'); }} />
              {CATEGORY_LABELS[category]}
            </label>)}
          </fieldset>
          <div className="field">
            <label htmlFor="har-mode">Replacement mode</label>
            <select id="har-mode" value={mode} onChange={(event) => { setMode(event.target.value as HarSanitizePolicy['mode']); invalidatePrepared('Replacement mode changed. Prepare a new reviewed output before downloading.'); }}>
              <option value="redact">[REDACTED]</option>
              <option value="hash">SHA-256 hash</option>
              <option value="mask">Custom mask</option>
            </select>
            {mode === 'mask' ? <><label htmlFor="har-mask">Custom mask text</label><input id="har-mask" type="text" value={mask} onChange={(event) => { setMask(event.target.value); invalidatePrepared('Mask changed. Prepare a new reviewed output before downloading.'); }} /></> : null}
            <small>SHA-256 preserves equality for comparison; it is not encryption.</small>
          </div>
        </div>

        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="har-method-filter">Filter method</label><input id="har-method-filter" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} placeholder="GET" /></div>
          <div className="field"><label htmlFor="har-domain-filter">Filter domain</label><input id="har-domain-filter" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} placeholder="api.example.com" /></div>
          <div className="field"><label htmlFor="har-status-filter">Filter status</label><input id="har-status-filter" inputMode="numeric" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="4" /></div>
        </div>

        {filteredRows.length ? <HarWaterfallCanvas rows={filteredRows} selectedIndex={selectedPosition} onSelect={(position) => { const row = filteredRows[position]; if (row) setSelectedEntryIndex(row.index); }} /> : <div className="notice" style={{ marginTop: 18 }}>No requests match the current filters.</div>}

        {selected ? <div className="notice" style={{ marginTop: 18 }}><strong>{selected.method} · HTTP {selected.status}</strong><div style={{ overflowWrap: 'anywhere', marginTop: 5 }}>{selected.url}</div><div style={{ marginTop: 5 }}>{selected.totalMs} ms total · wait {selected.phases.wait} ms · receive {selected.phases.receive} ms</div></div> : null}
        {selectedEntry ? <details style={{ marginTop: 16 }}><summary>Selected request metadata</summary><pre className="code-output" tabIndex={0}>{stringifyHarJson({ method: selectedEntry.request?.method, url: selectedEntry.request?.url, status: selectedEntry.response?.status, timings: selectedEntry.timings }, 2)}</pre></details> : null}

        <h3 style={{ marginTop: 24 }}>Accessible request list</h3>
        <p className="help-text">The canvas and this paged table describe the same filtered requests. Use whichever representation works best for your input method or assistive technology.</p>
        <PagedTable
          columns={[{ key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }, { key: 'url', label: 'URL' }, { key: 'duration', label: 'Duration' }]}
          rows={requestRows}
          pageSize={50}
          caption="Filtered HAR requests"
          rowKey={(row) => row.id}
          renderCell={(row, key) => key === 'method' ? row.method : key === 'status' ? row.status : key === 'url' ? <span style={{ overflowWrap: 'anywhere' }}>{row.url}</span> : `${row.totalMs} ms`}
          testId="har-request-table"
        />

        <div className="workspace-grid" style={{ marginTop: 24 }}>
          <div><h3 style={{ marginTop: 0 }}>Credential findings in source</h3><p className="help-text">Findings name locations only; secret values are never echoed in this list.</p></div>
          <div className="field"><label htmlFor="har-finding-category">Finding category</label><select id="har-finding-category" value={findingCategory} onChange={(event) => setFindingCategory(event.target.value as 'all' | HarFindingCategory)}><option value="all">All findings</option>{(Object.keys(CATEGORY_LABELS) as HarFindingCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></div>
        </div>
        <PagedTable
          columns={[{ key: 'category', label: 'Category' }, { key: 'field', label: 'Path' }]}
          rows={findingRows}
          pageSize={25}
          caption="Detected HAR credential fields"
          rowKey={(row) => row.id}
          renderCell={(row, key) => key === 'category' ? row.label : row.field}
          testId="har-findings"
        />
        {!findingRows.length ? <div className="notice" style={{ marginTop: 12 }}>No credential findings match this category filter.</div> : null}

        {lastResult ? <div className="notice" data-testid="har-output-scan" style={{ marginTop: 18 }}>
          <strong>Prepared output review</strong>
          <p>{lastResult.changedFindings.length} selected credential-bearing locations were transformed. {lastResult.remainingFindings.length} unsanitized credential-bearing location{lastResult.remainingFindings.length === 1 ? '' : 's'} remain because their categories are not selected.</p>
          <p className="help-text">The structural rescan still sees {lastResult.outputFindings.length} sensitive-named field location{lastResult.outputFindings.length === 1 ? '' : 's'} because redaction, masking, and hashing intentionally preserve HAR field names. Structural presence is not counted as remaining unsanitized risk.</p>
        </div> : null}

        <div className="button-row">
          <button className="action-button" type="button" onClick={() => void prepareSanitized()}>Prepare sanitized HAR</button>
          <button className="action-button secondary" type="button" onClick={downloadPrepared} disabled={!lastResult}>Download prepared HAR</button>
        </div>
      </> : null}
      <div className={`status-line ${source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
