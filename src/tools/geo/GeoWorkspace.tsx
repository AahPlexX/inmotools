import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PagedTable } from '../../components/PagedTable';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import GeoPreview from './GeoPreview';
import { computeGeoBounds, countCoordinates, simplifyTopology, validateGeoJson, type GeoSimplifyOptions, type GeoValidation } from './geo-engine';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
type Result = {
  preview: any;
  exported: any;
  outputCoordinates: number;
  bytes: number;
  settings: GeoSimplifyOptions;
  sourceToken: number;
  outputValidation: GeoValidation;
  rootShape: string;
  collapsedFeatureCount: number;
};
type View = { zoom: number; panX: number; panY: number };
type WarningRow = { id: string; message: string };
const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 };

function featureLabel(feature: any, index: number): string {
  const properties = feature?.properties ?? {};
  const label = properties.name ?? properties.label ?? properties.title ?? properties.id ?? feature?.id;
  return label === undefined || label === null || label === '' ? `Feature ${index + 1}` : `${index + 1}. ${String(label)}`;
}

export default function GeoWorkspace() {
  const [source, setSource] = useState<any | null>(null);
  const [fileName, setFileName] = useState('map.geojson');
  const [decimals, setDecimals] = useState(5);
  const [retain, setRetain] = useState(.65);
  const [output, setOutput] = useState<'geojson' | 'topojson'>('geojson');
  const [status, setStatus] = useState('Choose a GeoJSON file to simplify locally.');
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const sourceTokenRef = useRef(0);
  const [running, setRunning] = useState(false);

  const validation = useMemo(() => source ? validateGeoJson(source) : null, [source]);
  const sourceMetrics = useMemo(() => source ? { coordinates: countCoordinates(source), bytes: bytes(source), bounds: computeGeoBounds(source) } : null, [source]);
  const sharedBounds = result?.preview ? sourceMetrics?.bounds ?? computeGeoBounds(result.preview) : sourceMetrics?.bounds ?? null;
  const warningRows = useMemo<WarningRow[]>(() => (validation?.warnings ?? []).map((message, index) => ({ id: `warning-${index}`, message })), [validation]);
  const features = useMemo<any[]>(() => source?.type === 'FeatureCollection' && Array.isArray(source.features) ? source.features : source?.type === 'Feature' ? [source] : [], [source]);
  const selectedFeature = features[Math.min(selectedFeatureIndex, Math.max(0, features.length - 1))];

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => () => terminateWorker(), [terminateWorker]);

  const invalidate = useCallback((message: string) => {
    terminateWorker();
    setRunning(false);
    setResult(null);
    setStatus(message);
  }, [terminateWorker]);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    terminateWorker();
    setRunning(false);
    sourceTokenRef.current += 1;
    const token = sourceTokenRef.current;
    try {
      const text = await file.text();
      if (token !== sourceTokenRef.current) return;
      const parsed = JSON.parse(text);
      const check = validateGeoJson(parsed);
      if (!check.valid) throw new Error(check.errors[0]);
      if (token !== sourceTokenRef.current) return;
      setSource(parsed);
      setFileName(file.name);
      setResult(null);
      setView(DEFAULT_VIEW);
      setSelectedFeatureIndex(0);
      setStatus(`${check.coordinateCount.toLocaleString()} positions loaded${check.warnings.length ? ` with ${check.warnings.length} interoperability warning${check.warnings.length === 1 ? '' : 's'}` : ''}.`);
    } catch (error) {
      if (token !== sourceTokenRef.current) return;
      setSource(null);
      setResult(null);
      setStatus(`GeoJSON load failed: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  const setDecimalsSafe = (value: number) => {
    const next = Math.max(0, Math.min(12, value));
    setDecimals(next);
    invalidate('Coordinate precision changed. Run simplification again before export.');
  };
  const setRetainSafe = (value: number) => {
    const next = Math.max(.05, Math.min(1, value));
    setRetain(next);
    invalidate('Geometry detail changed. Run simplification again before export.');
  };
  const setOutputSafe = (value: 'geojson' | 'topojson') => {
    setOutput(value);
    invalidate('Export format changed. Run simplification again so the preview and download are bound to this format.');
  };

  const runSimplify = useCallback((request: GeoSimplifyOptions) => {
    if (!source) return;
    terminateWorker();
    const sourceToken = sourceTokenRef.current;
    const finish = (computed: any) => {
      if (sourceToken !== sourceTokenRef.current) return;
      const exported = request.output === 'geojson' ? computed.geojson : computed.topojson;
      if (!exported) throw new Error(`The ${request.output} result was not generated.`);
      setResult({
        preview: computed.geojson,
        exported,
        outputCoordinates: computed.outputCoordinateCount,
        bytes: bytes(exported),
        settings: { ...request },
        sourceToken,
        outputValidation: computed.outputValidation,
        rootShape: computed.rootShape,
        collapsedFeatureCount: computed.collapsedFeatureCount,
      });
      setRunning(false);
      setStatus(`Simplified locally to ${computed.outputCoordinateCount.toLocaleString()} coordinate positions.`);
    };

    if (typeof Worker === 'undefined') {
      try { finish(simplifyTopology(source, request)); }
      catch (error) {
        setResult(null);
        setRunning(false);
        setStatus(`Simplification failed: ${error instanceof Error ? error.message : 'unsupported geometry'}`);
      }
      return;
    }

    setRunning(true);
    setStatus('Simplifying geometry in a background worker…');
    const worker = new Worker(new URL('./geo.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const id = `geo-${Date.now()}-${sourceToken}`;
    worker.onmessage = (event: MessageEvent<{ id: string; result?: any; error?: string }>) => {
      if (event.data.id !== id || workerRef.current !== worker || sourceToken !== sourceTokenRef.current) return;
      if (event.data.error) {
        terminateWorker();
        setRunning(false);
        setResult(null);
        setStatus(`Simplification failed: ${event.data.error}`);
        return;
      }
      try { finish(event.data.result); terminateWorker(); }
      catch (error) {
        terminateWorker();
        setRunning(false);
        setResult(null);
        setStatus(`Simplification failed: ${error instanceof Error ? error.message : 'invalid result'}`);
      }
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      terminateWorker();
      setRunning(false);
      setStatus('The simplification worker failed to start.');
    };
    worker.postMessage({ id, source, options: request });
  }, [source, terminateWorker]);

  const simplify = () => runSimplify({ decimals, retain, output });
  const cancel = () => {
    terminateWorker();
    setRunning(false);
    setStatus('Simplification stopped. Adjust the settings and run it again.');
  };

  function baseName() {
    return fileName.replace(/\.(geo)?json$/i, '') || 'map';
  }

  function save() {
    if (!result) return;
    if (result.sourceToken !== sourceTokenRef.current) {
      setStatus('The current result belongs to an older file. Run simplification again.');
      return;
    }
    const extension = result.settings.output === 'geojson' ? 'geojson' : 'topojson';
    downloadText(JSON.stringify(result.exported, null, 2), `${baseName()}.simplified.${extension}`, 'application/json');
    setStatus(`Downloaded the ${extension.toUpperCase()} generated with the displayed settings.`);
  }

  function saveStats() {
    if (!result || !validation || !sourceMetrics) return;
    const payload = {
      sourceFile: fileName,
      settings: result.settings,
      rootShape: result.rootShape,
      collapsedFeatureCount: result.collapsedFeatureCount,
      input: {
        coordinates: sourceMetrics.coordinates,
        bytes: sourceMetrics.bytes,
        validation,
      },
      output: {
        coordinates: result.outputCoordinates,
        bytes: result.bytes,
        validation: result.outputValidation,
      },
    };
    downloadText(JSON.stringify(payload, null, 2), `${baseName()}.simplification-stats.json`, 'application/json');
    setStatus('Downloaded the processing statistics for the current source and settings snapshot.');
  }

  return <>
    <div className="workspace-header"><div><h2>Topology-aware simplifier</h2><p>Every preview and export is bound to one source file, one settings snapshot, and one output format.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="geo-file">Choose GeoJSON file</label><input id="geo-file" type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0]))} /></div>

      {source && validation ? <>
        <div className={`notice ${validation.valid ? '' : 'error'}`}>
          <strong>RFC 7946 structural check: {validation.valid ? 'passes' : 'fails'}</strong>
          <div className="help-text">{validation.featureCount.toLocaleString()} features · {validation.coordinateCount.toLocaleString()} positions{validation.bounds ? ` · bounds ${validation.bounds.minX.toFixed(4)}, ${validation.bounds.minY.toFixed(4)} → ${validation.bounds.maxX.toFixed(4)}, ${validation.bounds.maxY.toFixed(4)}` : ''}</div>
        </div>

        {warningRows.length ? <div style={{ marginTop: 16 }}>
          <PagedTable
            columns={[{ key: 'warning', label: `Interoperability warnings (${warningRows.length})` }]}
            rows={warningRows}
            pageSize={20}
            caption="GeoJSON interoperability warnings"
            rowKey={(row) => row.id}
            renderCell={(row) => row.message}
            testId="geo-warnings"
          />
        </div> : null}

        {features.length ? <div className="workspace-grid" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="geo-feature-select">Inspect feature</label>
            <select id="geo-feature-select" value={Math.min(selectedFeatureIndex, features.length - 1)} onChange={(event) => setSelectedFeatureIndex(Number(event.target.value))}>
              {features.map((item, index) => <option key={item?.id ?? index} value={index}>{featureLabel(item, index)}</option>)}
            </select>
          </div>
          <div className="notice" data-testid="geo-feature-inspector" style={{ minWidth: 0 }}>
            <strong>{featureLabel(selectedFeature, Math.min(selectedFeatureIndex, features.length - 1))}</strong>
            <pre className="code-output" tabIndex={0}>{JSON.stringify({ id: selectedFeature?.id ?? null, properties: selectedFeature?.properties ?? null, geometryType: selectedFeature?.geometry?.type ?? null }, null, 2)}</pre>
          </div>
        </div> : null}

        <div className="workspace-grid three" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="geo-decimals">Coordinate decimals</label><input id="geo-decimals" type="number" min="0" max="12" value={decimals} onChange={(event) => setDecimalsSafe(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="geo-retain">Geometry detail retained</label><input id="geo-retain" type="number" min="0.05" max="1" step="0.05" value={retain} onChange={(event) => setRetainSafe(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="geo-output">Export format</label><select id="geo-output" value={output} onChange={(event) => setOutputSafe(event.target.value as 'geojson' | 'topojson')}><option value="geojson">GeoJSON</option><option value="topojson">TopoJSON</option></select></div>
        </div>

        <div className="button-row">
          <button className="action-button" type="button" onClick={simplify} disabled={running}>{running ? 'Simplifying…' : 'Simplify geometry'}</button>
          {running ? <button className="action-button secondary" type="button" onClick={cancel}>Stop</button> : null}
          <button className="action-button secondary" type="button" disabled={!result || running} onClick={save}>Download generated {result?.settings.output === 'topojson' ? 'TopoJSON' : 'GeoJSON'}</button>
          <button className="action-button secondary" type="button" disabled={!result || running} onClick={saveStats}>Download processing stats</button>
          <button className="action-button secondary" type="button" onClick={() => setView(DEFAULT_VIEW)}>Reset linked view</button>
        </div>

        <div className="metric-row">
          <div className="metric"><span>Input vertices</span><strong>{sourceMetrics?.coordinates ?? 0}</strong></div>
          <div className="metric"><span>Output vertices</span><strong>{result?.outputCoordinates ?? '—'}</strong></div>
          <div className="metric"><span>Input bytes</span><strong>{sourceMetrics?.bytes.toLocaleString() ?? 0}</strong></div>
          <div className="metric"><span>Output bytes</span><strong>{result ? result.bytes.toLocaleString() : '—'}</strong></div>
        </div>

        {result ? <>
          <div className="notice">
            <strong>Generated settings</strong>
            <div className="help-text">{result.settings.decimals} decimals · {(result.settings.retain * 100).toFixed(0)}% detail · {result.settings.output === 'geojson' ? 'GeoJSON' : 'TopoJSON'}. Changing any setting invalidates this result.</div>
          </div>
          <div className={`notice ${result.outputValidation.valid ? '' : 'error'}`} style={{ marginTop: 12 }}>
            <strong>Post-simplification check: {result.outputValidation.valid ? 'passes' : 'fails'}</strong>
            <div className="help-text">Root shape {result.rootShape} · {result.collapsedFeatureCount} feature geometr{result.collapsedFeatureCount === 1 ? 'y' : 'ies'} collapsed to empty/null output · {result.outputValidation.coordinateCount.toLocaleString()} validated output positions.</div>
          </div>
        </> : null}

        <div className="workspace-grid" style={{ marginTop: 18 }}>
          <div><h3>Original</h3><GeoPreview data={source} label="Original GeoJSON geometry preview" bounds={sharedBounds} view={view} onViewChange={setView} /></div>
          <div><h3>Simplified</h3>{result?.preview ? <GeoPreview data={result.preview} label="Simplified GeoJSON geometry preview" bounds={sharedBounds} view={view} onViewChange={setView} /> : <div className="notice">Run the simplifier to compare geometry.</div>}</div>
        </div>
        <p className="help-text">Both previews share the same geographic bounds and pan/zoom state. Drag either preview or use the mouse wheel; rendering is sampled for very large geometry while export always uses all coordinates. Bare geometry inputs remain bare geometry outputs; topology processing never silently wraps them in a Feature.</p>
      </> : null}
      <div className={`status-line ${source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
