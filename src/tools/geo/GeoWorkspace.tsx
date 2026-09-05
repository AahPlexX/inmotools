import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import GeoPreview from './GeoPreview';
import { countCoordinates, simplifyTopology } from './geo-engine';
import { consumeFileInput } from '../../lib/file-input';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export default function GeoWorkspace() {
  const [source, setSource] = useState<any | null>(null);
  const [fileName, setFileName] = useState('map.geojson');
  const [decimals, setDecimals] = useState(5);
  const [retain, setRetain] = useState(0.65);
  const [output, setOutput] = useState<'geojson' | 'topojson'>('geojson');
  const [status, setStatus] = useState('Choose a GeoJSON file to simplify locally.');
  const [result, setResult] = useState<any | null>(null);

  const sourceMetrics = useMemo(() => source ? { coordinates: countCoordinates(source), bytes: bytes(source) } : null, [source]);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.type) throw new Error('GeoJSON must contain a top-level type.');
      setSource(parsed); setFileName(file.name); setResult(null);
      setStatus(`${countCoordinates(parsed)} coordinate positions loaded.`);
    } catch (error) { setSource(null); setResult(null); setStatus(`GeoJSON load failed: ${error instanceof Error ? error.message : 'invalid JSON'}`); }
  }

  function simplify() {
    if (!source) return;
    try {
      const preview = simplifyTopology(source, { decimals, retain, output: 'geojson' });
      const exported = output === 'geojson' ? preview.geojson : simplifyTopology(source, { decimals, retain, output: 'topojson' }).topojson;
      setResult({ preview: preview.geojson, exported, outputCoordinates: preview.outputCoordinateCount, bytes: bytes(exported) });
      setStatus(`Simplified locally to ${preview.outputCoordinateCount} coordinate positions.`);
    } catch (error) { setResult(null); setStatus(`Simplification failed: ${error instanceof Error ? error.message : 'unsupported geometry'}`); }
  }

  function save() {
    if (!result) return;
    const base = fileName.replace(/\.(geo)?json$/i, '') || 'map';
    const extension = output === 'geojson' ? 'geojson' : 'topojson';
    downloadText(JSON.stringify(result.exported, null, 2), `${base}.simplified.${extension}`, 'application/json');
  }

  return <>
    <div className="workspace-header"><div><h2>Topology-aware simplifier</h2><p>Reduce coordinate precision and geometry detail without independently drifting shared borders.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="geo-file">Choose GeoJSON file</label><input id="geo-file" type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))}/></div>
      {source ? <>
        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="geo-decimals">Coordinate decimals</label><input id="geo-decimals" type="number" min="0" max="12" value={decimals} onChange={(event) => setDecimals(Math.max(0, Math.min(12, Number(event.target.value))))}/><small>Lower precision usually saves more bytes.</small></div>
          <div className="field"><label htmlFor="geo-retain">Geometry detail retained</label><input id="geo-retain" type="number" min="0.05" max="1" step="0.05" value={retain} onChange={(event) => setRetain(Math.max(0.05, Math.min(1, Number(event.target.value))))}/><small>1 keeps all simplifiable vertices; smaller values remove more detail.</small></div>
          <div className="field"><label htmlFor="geo-output">Export format</label><select id="geo-output" value={output} onChange={(event) => setOutput(event.target.value as 'geojson' | 'topojson')}><option value="geojson">GeoJSON</option><option value="topojson">TopoJSON</option></select><small>TopoJSON preserves shared topology directly and can be more compact.</small></div>
        </div>
        <div className="button-row"><button className="action-button" type="button" onClick={simplify}>Simplify geometry</button><button className="action-button secondary" type="button" disabled={!result} onClick={save}>Download {output === 'geojson' ? 'GeoJSON' : 'TopoJSON'}</button></div>
        <div className="metric-row">
          <div className="metric"><span>Input vertices</span><strong>{sourceMetrics?.coordinates ?? 0}</strong></div>
          <div className="metric"><span>Output vertices</span><strong>{result?.outputCoordinates ?? '—'}</strong></div>
          <div className="metric"><span>Input bytes</span><strong>{sourceMetrics?.bytes.toLocaleString() ?? 0}</strong></div>
          <div className="metric"><span>Output bytes</span><strong>{result ? result.bytes.toLocaleString() : '—'}</strong></div>
        </div>
        <div className="workspace-grid" style={{ marginTop: 18 }}><div><h3>Original</h3><GeoPreview data={source} label="Original GeoJSON geometry preview"/></div><div><h3>Simplified</h3>{result?.preview ? <GeoPreview data={result.preview} label="Simplified GeoJSON geometry preview"/> : <div className="notice">Run the simplifier to compare geometry.</div>}</div></div>
      </> : null}
      <div className={`status-line ${source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
