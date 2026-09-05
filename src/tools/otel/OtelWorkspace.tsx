import { useMemo, useState } from 'react';
import FlamegraphCanvas from './FlamegraphCanvas';
import { computeCriticalPath, parseTraceExport, type NormalizedSpan } from './otel-engine';
import { consumeFileInput } from '../../lib/file-input';

export default function OtelWorkspace() {
  const [spans, setSpans] = useState<NormalizedSpan[]>([]); const [status, setStatus] = useState('Choose an OTLP or Jaeger JSON trace export.'); const [selectedSpanId, setSelectedSpanId] = useState<string>(); const [service, setService] = useState('all'); const [errorsOnly, setErrorsOnly] = useState(false); const [minLatency, setMinLatency] = useState(0);
  const services = useMemo(() => [...new Set(spans.map((span) => span.serviceName))].sort(), [spans]);
  const filtered = useMemo(() => spans.filter((span) => (service === 'all' || span.serviceName === service) && (!errorsOnly || span.error) && span.durationMs >= minLatency), [errorsOnly, minLatency, service, spans]);
  const criticalPath = useMemo(() => computeCriticalPath(spans), [spans]);
  const selected = spans.find((span) => span.spanId === selectedSpanId);

  async function load(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseTraceExport(JSON.parse(await file.text()));
      if (!parsed.spans.length) throw new Error('No supported spans were found.');
      setSpans(parsed.spans); setSelectedSpanId(parsed.spans[0].spanId); setService('all'); setErrorsOnly(false); setMinLatency(0);
      setStatus(`${parsed.spans.length} spans loaded across ${new Set(parsed.spans.map((span) => span.serviceName)).size} services.`);
    } catch (error) { setSpans([]); setSelectedSpanId(undefined); setStatus(`Trace load failed: ${error instanceof Error ? error.message : 'invalid JSON'}`); }
  }

  return <>
    <div className="workspace-header"><div><h2>Trace flamegraph explorer</h2><p>Normalize OTLP or Jaeger spans, filter latency, and follow the critical path without uploading the trace.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="otel-file">Choose trace JSON</label><input id="otel-file" type="file" accept="application/json,.json" onChange={(event) => consumeFileInput(event.target, () => load(event.target.files?.[0]))}/></div>
      {spans.length ? <>
        <div className="metric-row"><div className="metric"><span>Spans</span><strong>{spans.length}</strong></div><div className="metric"><span>Visible</span><strong>{filtered.length}</strong></div><div className="metric"><span>Errors</span><strong>{spans.filter((span) => span.error).length}</strong></div><div className="metric"><span>Critical spans</span><strong>{criticalPath.length}</strong></div></div>
        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="otel-service">Service</label><select id="otel-service" value={service} onChange={(event) => setService(event.target.value)}><option value="all">All services</option>{services.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
          <div className="field"><label htmlFor="otel-latency">Minimum latency (ms)</label><input id="otel-latency" type="number" min="0" step="1" value={minLatency} onChange={(event) => setMinLatency(Math.max(0, Number(event.target.value)))}/></div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', alignSelf: 'end', minHeight: 44 }}><input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)}/> Errors only</label>
        </div>
        <div className="notice" style={{ marginTop: 18 }}><strong>Legend:</strong> ◆ critical path · ! error. Scroll to zoom, drag to pan, or use keyboard controls after focusing the graph.</div>
        {filtered.length ? <FlamegraphCanvas spans={filtered} selectedSpanId={selectedSpanId} criticalPath={criticalPath} onSelect={setSelectedSpanId}/> : <div className="notice" style={{ marginTop: 18 }}>No spans match the current filters.</div>}
        {selected ? <section style={{ marginTop: 22 }} aria-labelledby="selected-span-heading"><h3 id="selected-span-heading">Selected span</h3><div className="metric-row"><div className="metric"><span>Service</span><strong>{selected.serviceName}</strong></div><div className="metric"><span>Duration</span><strong>{selected.durationMs.toFixed(3)} ms</strong></div><div className="metric"><span>Status</span><strong>{selected.error ? 'Error !' : 'OK'}</strong></div></div><div className="result-table-wrap" tabIndex={0} aria-label="Selected trace span identifiers"><table><tbody><tr><th scope="row">Operation</th><td>{selected.name}</td></tr><tr><th scope="row">Trace ID</th><td>{selected.traceId}</td></tr><tr><th scope="row">Span ID</th><td>{selected.spanId}</td></tr><tr><th scope="row">Parent</th><td>{selected.parentSpanId ?? 'root'}</td></tr><tr><th scope="row">Start</th><td>{selected.startMs.toFixed(3)} ms</td></tr></tbody></table></div><details style={{ marginTop: 16 }}><summary>Span attributes</summary><pre className="code-output" tabIndex={0}>{JSON.stringify(selected.attributes, null, 2)}</pre></details></section> : null}
      </> : null}
      <div className={`status-line ${spans.length ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
