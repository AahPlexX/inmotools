import { useMemo, useState } from 'react';
import { PagedTable } from '../../components/PagedTable';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import HarWaterfallCanvas from './HarWaterfallCanvas';
import { analyzeHar, buildWaterfallRows, displayUrl, parseHarJson, sanitizeHar, stringifyHarJson, type HarFindingCategory, type HarSanitizePolicy } from './har-engine';

const CATEGORY_LABELS: Record<HarFindingCategory, string> = {
  headers: 'Sensitive headers',
  cookies: 'Cookies',
  query: 'URLs & query parameters',
  bodies: 'Request/response bodies',
  emails: 'Email addresses',
  addresses: 'IP addresses',
};

const CATEGORY_TIPS: Record<HarFindingCategory, string> = {
  headers: 'Authorization, API keys, session headers, and any extra names you add.',
  cookies: 'Every cookie value. Names stay so the HAR still loads.',
  query: 'Usernames, passwords, and sensitive query names in the URL and redirect.',
  bodies: 'Form fields and JSON keys that look like secrets, including base64 bodies.',
  emails: 'Email-shaped text in headers, URLs, and bodies. Off until you turn it on.',
  addresses: 'serverIPAddress, forwarding headers, and IP literals. URL hosts that are IPs become redacted.invalid.',
};

const SAMPLE_HAR = `{
  "log": {
    "version": "1.2",
    "entries": [{
      "startedDateTime": "2026-10-01T14:00:00.000Z",
      "time": 42,
      "serverIPAddress": "203.0.113.10",
      "request": {
        "method": "POST",
        "url": "https://ada:sample-pass@api.example.test/orders?token=sample-token&safe=yes",
        "headers": [{"name": "Authorization", "value": "Bearer sample-token"}, {"name": "X-Forwarded-For", "value": "198.51.100.8"}],
        "cookies": [{"name": "session", "value": "sample-session"}],
        "queryString": [{"name": "token", "value": "sample-token"}, {"name": "safe", "value": "yes"}],
        "postData": {"mimeType": "application/json", "text": "{\\"email\\":\\"ada@example.test\\",\\"note\\":\\"hello\\"}"}
      },
      "response": {"status": 201, "headers": [], "cookies": [], "content": {"mimeType": "application/json", "size": 24, "text": "{\\"ok\\":true}"}},
      "timings": {"blocked": -1, "dns": 4, "connect": 12, "ssl": 5, "send": 1, "wait": 16, "receive": 4}
    }]
  }
}`;

type FindingRow = { id: string; category: HarFindingCategory; label: string; field: string; entryIndex: number };
type RequestRow = ReturnType<typeof buildWaterfallRows>[number] & { id: string };
type Tone = '' | 'good' | 'error';

export default function HarWorkspace() {
  const [source, setSource] = useState<ReturnType<typeof parseHarJson> | null>(null);
  const [fileName, setFileName] = useState('network.har');
  const [status, setStatus] = useState('Drop a HAR here, or pick one. It stays in this browser.');
  const [tone, setTone] = useState<Tone>('');
  const [mode, setMode] = useState<HarSanitizePolicy['mode']>('redact');
  const [mask, setMask] = useState('MASKED');
  const [categories, setCategories] = useState<Record<HarFindingCategory, boolean>>({ headers: true, cookies: true, query: true, bodies: true, emails: false, addresses: false });
  const [extraNames, setExtraNames] = useState('');
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);
  const [methodFilter, setMethodFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [findingCategory, setFindingCategory] = useState<'all' | HarFindingCategory>('all');
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof sanitizeHar>> | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const extraNameList = useMemo(() => extraNames.split(/[\s,]+/).map((name) => name.trim()).filter(Boolean), [extraNames]);
  const analysis = useMemo(() => source ? analyzeHar(source, extraNameList) : null, [source, extraNameList]);
  const rows = useMemo(() => source ? buildWaterfallRows(source, extraNameList) : [], [source, extraNameList]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const methodOk = !methodFilter || row.method.toLowerCase().includes(methodFilter.toLowerCase());
    let host = '';
    try { host = new URL(row.displayUrl || row.url).hostname; } catch { host = row.displayUrl || row.url; }
    const domainOk = !domainFilter || host.toLowerCase().includes(domainFilter.toLowerCase());
    const statusOk = !statusFilter || String(row.status).startsWith(statusFilter.trim());
    const haystack = `${row.method} ${row.displayUrl} ${row.mime} ${row.status}`.toLowerCase();
    const searchOk = !search || haystack.includes(search.toLowerCase());
    return methodOk && domainOk && statusOk && searchOk;
  }), [rows, methodFilter, domainFilter, statusFilter, search]);

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
      entryIndex: finding.entryIndex,
    })), [analysis, findingCategory]);

  const requestRows = useMemo<RequestRow[]>(() => filteredRows.map((row) => ({ ...row, id: `request-${row.index}` })), [filteredRows]);

  function invalidatePrepared(nextStatus?: string) {
    setLastResult(null);
    if (nextStatus) { setStatus(nextStatus); setTone(''); }
  }

  async function loadText(text: string, name: string) {
    try {
      const parsed = parseHarJson(text);
      if (!parsed?.log || !Array.isArray(parsed.log.entries)) throw new Error('This JSON does not contain a HAR log.entries array.');
      setSource(parsed);
      setFileName(name);
      setSelectedEntryIndex(0);
      setFindingCategory('all');
      setLastResult(null);
      setTone('good');
      setStatus(`${parsed.log.entries.length} requests loaded. Secrets are hidden in the list. Review findings before you prepare a download.`);
    } catch (error) {
      setSource(null);
      setLastResult(null);
      setTone('error');
      setStatus(`Could not read that HAR: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    await loadText(await file.text(), file.name);
  }

  async function prepareSanitized() {
    if (!source) return;
    try {
      setTone('');
      setStatus('Cleaning the selected categories in this browser…');
      const result = await sanitizeHar(source, { mode, mask, categories, extraNames: extraNameList });
      setLastResult(result);
      setTone('good');
      setStatus(`Prepared ${result.changedFindings.length} changed locations. Read the review, then download.`);
    } catch (error) {
      setLastResult(null);
      setTone('error');
      setStatus(`Cleaning failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  function downloadPrepared() {
    if (!lastResult) return;
    const base = fileName.replace(/\.har$/i, '').replace(/\.json$/i, '');
    downloadText(stringifyHarJson(lastResult.har, 2), `${base || 'network'}.sanitized.har`, 'application/json');
    setTone('good');
    setStatus(`Downloaded the reviewed HAR. ${lastResult.remainingFindings.length} unsanitized location${lastResult.remainingFindings.length === 1 ? '' : 's'} remain because you left those categories off.`);
  }

  function downloadFindings() {
    if (!analysis) return;
    const lines = ['category,request,path', ...analysis.findings.map((finding) => `${finding.category},${finding.entryIndex + 1},"${finding.field.replaceAll('"', '""')}"`)];
    const base = fileName.replace(/\.har$/i, '').replace(/\.json$/i, '');
    downloadText(lines.join('\n'), `${base || 'network'}.findings.csv`, 'text/csv');
    setStatus('Downloaded finding locations only. Values are not in that file.');
  }

  function clearCapture() {
    setSource(null);
    setLastResult(null);
    setTone('');
    setStatus('Capture cleared from this tab.');
  }

  return <>
    <div className="workspace-header"><div><h2>Check the capture, then share a cleaned copy</h2><p>Secrets stay in this browser. Hide what you choose, look at timing, and download only after you have reviewed the result.</p></div></div>
    <div className="workspace-body">
      <div
        className="field"
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); void loadFile(event.dataTransfer.files?.[0]); }}
        style={{ outline: dragOver ? '2px solid var(--signal)' : undefined, borderRadius: 8 }}
      >
        <label htmlFor="har-file">Choose HAR file</label>
        <input id="har-file" type="file" accept=".har,application/json,.json" title="HAR or JSON from DevTools. Read only in this tab." onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))} />
        <small>Drop a file here or pick one. Large integer JSON values stay exact instead of being rounded. On-screen URLs hide userinfo and sensitive query values; the file you download uses the mode you pick.</small>
        <div className="button-row">
          <button className="action-button secondary" type="button" title="Loads a tiny local example so you can try the review flow without a real capture." onClick={() => void loadText(SAMPLE_HAR, 'sample.har')}>Load a sample capture</button>
          {source ? <button className="action-button secondary" type="button" onClick={clearCapture}>Clear capture</button> : null}
        </div>
      </div>

      {analysis ? <>
        <div className="metric-row">
          <div className="metric" title="Requests in the loaded log."><span>Requests</span><strong>{analysis.requestCount}</strong></div>
          <div className="metric" title="Locations only. Secret values are not shown."><span>Original findings</span><strong>{analysis.findings.length}</strong></div>
          <div className="metric" title="Requests matching the filters below."><span>Visible requests</span><strong>{filteredRows.length}</strong></div>
        </div>

        <div className="workspace-grid" style={{ marginTop: 18 }}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">What to hide</legend>
            {(Object.keys(CATEGORY_LABELS) as HarFindingCategory[]).map((category) => <label key={category} title={CATEGORY_TIPS[category]} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 36 }}>
              <input type="checkbox" checked={categories[category]} onChange={(event) => { setCategories((current) => ({ ...current, [category]: event.target.checked })); invalidatePrepared('That choice changed the cleaned file. Prepare it again before downloading.'); }} />
              {CATEGORY_LABELS[category]}
            </label>)}
          </fieldset>
          <div className="field">
            <label htmlFor="har-mode">Replacement</label>
            <select id="har-mode" title="Redact hides the value. Hash keeps a stable stand-in. Mask uses your text." value={mode} onChange={(event) => { setMode(event.target.value as HarSanitizePolicy['mode']); invalidatePrepared('Replacement changed. Prepare a new reviewed output before downloading.'); }}>
              <option value="redact">[REDACTED]</option>
              <option value="hash">SHA-256 hash</option>
              <option value="mask">Custom mask</option>
            </select>
            {mode === 'mask' ? <><label htmlFor="har-mask">Mask text</label><input id="har-mask" type="text" title="Every selected value becomes this text." value={mask} onChange={(event) => { setMask(event.target.value); invalidatePrepared('Mask changed. Prepare a new reviewed output before downloading.'); }} /></> : null}
            <label htmlFor="har-extra-names">Extra field names</label>
            <input id="har-extra-names" type="text" title="Comma-separated names to treat like secrets, such as x-internal-key." value={extraNames} placeholder="x-internal-key, accountPin" onChange={(event) => { setExtraNames(event.target.value); invalidatePrepared('Extra names changed. Prepare again before downloading.'); }} />
            <small>SHA-256 keeps the same stand-in for the same secret. It is not encryption. Email and IP hiding are off until you check them.</small>
          </div>
        </div>

        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="har-method-filter">Filter method</label><input id="har-method-filter" title="Matches the HTTP method, such as GET or POST." value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} placeholder="GET" /></div>
          <div className="field"><label htmlFor="har-domain-filter">Filter domain</label><input id="har-domain-filter" title="Matches the host shown in the safe URL." value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} placeholder="api.example.com" /></div>
          <div className="field"><label htmlFor="har-status-filter">Filter status</label><input id="har-status-filter" title="Prefix match. 4 shows 4xx. 404 shows that status." inputMode="numeric" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="4" /></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="har-search">Search visible requests</label>
          <input id="har-search" title="Searches method, safe URL, status, and response type." value={search} onChange={(event) => setSearch(event.target.value)} placeholder="orders, json, 201" />
        </div>

        {filteredRows.length ? <HarWaterfallCanvas rows={filteredRows} selectedIndex={selectedPosition} onSelect={(position) => { const row = filteredRows[position]; if (row) setSelectedEntryIndex(row.index); }} /> : <div className="notice" style={{ marginTop: 18 }}>No requests match these filters.</div>}

        {selected ? <div className="notice" style={{ marginTop: 18 }}><strong>{selected.method} · HTTP {selected.status}</strong><div style={{ overflowWrap: 'anywhere', marginTop: 5 }}>{selected.displayUrl}</div><div style={{ marginTop: 5 }}>{selected.totalMs} ms total · wait {selected.phases.wait} ms · receive {selected.phases.receive} ms{selected.mime ? ` · ${selected.mime}` : ''}{selected.bytes ? ` · ${selected.bytes} bytes` : ''}</div></div> : null}
        {selectedEntry ? <details style={{ marginTop: 16 }}><summary title="Method, safe URL, status, and timings. Header values stay out of this preview.">Selected request metadata</summary><pre className="code-output" tabIndex={0}>{stringifyHarJson({ method: selectedEntry.request?.method, url: displayUrl(String(selectedEntry.request?.url ?? ''), extraNameList), status: selectedEntry.response?.status, mime: selectedEntry.response?.content?.mimeType, timings: selectedEntry.timings }, 2)}</pre></details> : null}

        <h3 style={{ marginTop: 24 }}>Request list</h3>
        <p className="help-text">The chart and this table are the same filtered requests. Pick a method to highlight that row in the chart. URLs here hide passwords and sensitive query values.</p>
        <PagedTable
          columns={[{ key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }, { key: 'url', label: 'URL' }, { key: 'duration', label: 'Duration' }]}
          rows={requestRows}
          pageSize={50}
          caption="Filtered HAR requests"
          rowKey={(row) => row.id}
          renderCell={(row, key) => key === 'method' ? <button type="button" className="action-button secondary" onClick={() => setSelectedEntryIndex(row.index)}>Select {row.method || 'request'}</button> : key === 'status' ? row.status : key === 'url' ? <span style={{ overflowWrap: 'anywhere' }}>{row.displayUrl}</span> : `${row.totalMs} ms`}
          testId="har-request-table"
        />

        <div className="workspace-grid" style={{ marginTop: 24 }}>
          <div><h3 style={{ marginTop: 0 }}>Findings in the source</h3><p className="help-text">This list names locations only. Secret values are not printed.</p></div>
          <div className="field"><label htmlFor="har-finding-category">Finding category</label><select id="har-finding-category" title="Show one kind of finding, or all of them." value={findingCategory} onChange={(event) => setFindingCategory(event.target.value as 'all' | HarFindingCategory)}><option value="all">All findings</option>{(Object.keys(CATEGORY_LABELS) as HarFindingCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></div>
        </div>
        <PagedTable
          columns={[{ key: 'category', label: 'Category' }, { key: 'field', label: 'Path' }, { key: 'jump', label: 'Request' }]}
          rows={findingRows}
          pageSize={25}
          caption="Detected HAR credential fields"
          rowKey={(row) => row.id}
          renderCell={(row, key) => key === 'category' ? row.label : key === 'field' ? row.field : <button type="button" className="action-button secondary" onClick={() => setSelectedEntryIndex(row.entryIndex)}>Show request {row.entryIndex + 1}</button>}
          testId="har-findings"
        />
        {!findingRows.length ? <div className="notice" style={{ marginTop: 12 }}>No findings match this category.</div> : null}

        {lastResult ? <div className="notice" data-testid="har-output-scan" style={{ marginTop: 18 }}>
          <strong>Prepared output review</strong>
          <p>{lastResult.changedFindings.length} selected locations were changed. {lastResult.remainingFindings.length} unsanitized location{lastResult.remainingFindings.length === 1 ? '' : 's'} remain because those categories are off.</p>
          <p className="help-text">A rescan still sees {lastResult.outputFindings.length} sensitive-named location{lastResult.outputFindings.length === 1 ? '' : 's'} because redaction, masking, and hashing keep the field names. A name left in place is not the same as a secret left in place.</p>
        </div> : null}

        <div className="button-row">
          <button className="action-button" type="button" title="Builds the cleaned HAR in memory. Nothing downloads until the next button." onClick={() => void prepareSanitized()}>Prepare sanitized HAR</button>
          <button className="action-button secondary" type="button" title="Downloads the reviewed file. Disabled until a prepare finishes." onClick={downloadPrepared} disabled={!lastResult}>Download prepared HAR</button>
          <button className="action-button secondary" type="button" title="CSV of category, request number, and path. No secret values." onClick={downloadFindings}>Download finding locations</button>
        </div>
      </> : null}
      <div className={`status-line ${tone}`} role="status">{status}</div>
    </div>
  </>;
}
