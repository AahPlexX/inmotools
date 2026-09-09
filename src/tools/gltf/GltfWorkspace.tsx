import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import GltfViewport from './GltfViewport';
import { inspectGlb, optimizeGlb, type GltfInspection, type GltfOptimizeResult } from './gltf-engine';
import { consumeFileInput } from '../../lib/file-input';

function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`; return `${(value / 1024 / 1024).toFixed(2)} MiB`; }

export default function GltfWorkspace() {
  const abortRef = useRef<AbortController | null>(null);
  const operationRevisionRef = useRef(0);
  const sourceRevisionRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Uint8Array | null>(null);
  const [modelKey, setModelKey] = useState('no-model');
  const [inspection, setInspection] = useState<GltfInspection | null>(null);
  const [result, setResult] = useState<GltfOptimizeResult | null>(null);
  const [targetRatio, setTargetRatio] = useState(.65);
  const [maxTextureDimension, setMaxTextureDimension] = useState(2048);
  const [preview, setPreview] = useState<'before' | 'after'>('before');
  const [wireframe, setWireframe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('Choose a binary GLB model to inspect and optimize locally.');

  useEffect(() => () => {
    operationRevisionRef.current += 1;
    sourceRevisionRef.current += 1;
    abortRef.current?.abort();
  }, []);

  const previewBytes = useMemo(() => preview === 'after' && result ? result.bytes : source, [preview, result, source]);
  const previewBlocked = Boolean(inspection?.previewBlockers.length);

  function invalidateOptimization(note: string) {
    operationRevisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress(0);
    setStage('');
    setResult(null);
    setPreview('before');
    if (source) setStatus(note);
  }

  function changeTargetRatio(value: number) {
    invalidateOptimization('Geometry settings changed. Any running or completed optimization was invalidated; optimize again for the current settings.');
    setTargetRatio(value);
  }

  function changeTextureDimension(value: number) {
    invalidateOptimization('Texture settings changed. Any running or completed optimization was invalidated; optimize again for the current settings.');
    setMaxTextureDimension(value);
  }

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    const sourceRevision = ++sourceRevisionRef.current;
    operationRevisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(true);
    setFile(next);
    setSource(null);
    setResult(null);
    setInspection(null);
    setPreview('before');
    setProgress(0);
    setStage('');
    setStatus('Inspecting the original GLB without transforming it…');
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      if (sourceRevision !== sourceRevisionRef.current) return;
      const inspected = await inspectGlb(bytes);
      if (sourceRevision !== sourceRevisionRef.current) return;
      setSource(bytes);
      setModelKey(`source-${sourceRevision}`);
      setInspection(inspected);
      const blockerText = inspected.transformBlockers.length ? ` ${inspected.transformBlockers.join(' ')}` : '';
      setStatus(`Loaded original bytes unchanged: ${inspected.stats.meshes} mesh${inspected.stats.meshes === 1 ? '' : 'es'} · ${inspected.stats.triangles.toLocaleString()} triangles · ${inspected.stats.cameras} camera${inspected.stats.cameras === 1 ? '' : 's'}.${blockerText}`);
    } catch (error) {
      if (sourceRevision !== sourceRevisionRef.current) return;
      setSource(null);
      setInspection(null);
      setStatus(`GLB inspection failed: ${error instanceof Error ? error.message : 'unsupported model'}`);
    } finally {
      if (sourceRevision === sourceRevisionRef.current) setBusy(false);
    }
  }

  async function optimize() {
    if (!source || !inspection || inspection.transformBlockers.length) return;
    const revision = ++operationRevisionRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const sourceSnapshot = source;
    const optionsSnapshot = { targetRatio, maxTextureDimension };
    setBusy(true);
    setResult(null);
    setPreview('before');
    setProgress(0);
    setStage('Starting');
    setStatus('Optimizing geometry and resizing only supported textures locally…');
    try {
      const optimized = await optimizeGlb(sourceSnapshot, optionsSnapshot, {
        signal: controller.signal,
        onProgress: (value, nextStage) => {
          if (revision !== operationRevisionRef.current || controller.signal.aborted) return;
          setProgress(value);
          setStage(nextStage);
        },
      });
      if (revision !== operationRevisionRef.current || controller.signal.aborted) return;
      setResult(optimized);
      setPreview('after');
      const delta = optimized.inputBytes ? (1 - optimized.outputBytes / optimized.inputBytes) * 100 : 0;
      setStatus(`Optimization complete: ${optimized.after.triangles.toLocaleString()} triangles · ${formatBytes(optimized.outputBytes)} (${delta >= 0 ? `${delta.toFixed(1)}% smaller` : `${Math.abs(delta).toFixed(1)}% larger`}). ${optimized.report.resizedTextures} texture${optimized.report.resizedTextures === 1 ? '' : 's'} resized without changing image format.`);
    } catch (error) {
      if (revision !== operationRevisionRef.current) return;
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'Optimization canceled; no stale output was restored.' : `Optimization failed: ${error instanceof Error ? error.message : 'GLB processing error'}`);
    } finally {
      if (revision === operationRevisionRef.current) {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    }
  }

  function cancelOptimization() {
    if (!abortRef.current) return;
    operationRevisionRef.current += 1;
    abortRef.current.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress(0);
    setStage('');
    setResult(null);
    setPreview('before');
    setStatus('Optimization canceled; no incomplete or stale output is available for download.');
  }

  function download() {
    if (!result || !file || busy) return;
    downloadBytes(result.bytes, `${file.name.replace(/\.glb$/i, '')}.optimized.glb`, 'model/gltf-binary');
    setStatus('Downloaded the optimized GLB for the current source and settings. The original file was not modified.');
  }

  const stats = preview === 'after' && result ? result.after : inspection?.stats;
  const statusIsError = /failed|blocked/i.test(status);

  return <>
    <div className="workspace-header"><div><h2>glTF / GLB optimizer</h2><p>Inspect the original GLB without rewriting it, then apply explicitly selected geometry and texture transforms.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="gltf-file">Binary GLB model</label><input id="gltf-file" type="file" disabled={busy} accept=".glb,model/gltf-binary" onChange={(event) => consumeFileInput(event.target, () => chooseFile(event.target.files?.[0]))} /><small>Inspection is read-only. External-resource .gltf packages are not accepted.</small></div>
      {source && inspection ? <>
        <div className="metric-row"><div className="metric"><span>Original bytes</span><strong>{formatBytes(source.byteLength)}</strong></div><div className="metric"><span>Meshes</span><strong>{inspection.stats.meshes}</strong></div><div className="metric"><span>Cameras</span><strong>{inspection.stats.cameras}</strong></div><div className="metric"><span>Animations</span><strong>{inspection.stats.animations}</strong></div><div className="metric"><span>Textures</span><strong>{inspection.stats.textures}</strong></div></div>
        <details style={{ marginTop: 16 }}><summary>Extension and texture preflight</summary><div className="notice" data-testid="gltf-extension-report"><strong>Extensions used:</strong> {inspection.extensionReport.used.join(', ') || 'none'}<br /><strong>Required:</strong> {inspection.extensionReport.required.join(', ') || 'none'}<br /><strong>Registered/preservable:</strong> {inspection.extensionReport.supported.join(', ') || 'none'}<br /><strong>Unknown/unregistered:</strong> {inspection.extensionReport.unsupported.join(', ') || 'none'}<br /><strong>Transform policy:</strong> {inspection.extensionReport.policy === 'blocked-unknown-extension' ? 'blocked to preserve unknown payloads' : 'registered extensions preserved through supported serializers'}<br /><strong>Image formats:</strong> {inspection.textureFormats.join(', ') || 'none detected'}</div>{inspection.transformBlockers.map((message) => <div className="notice" role="alert" key={message}>{message}</div>)}{inspection.previewBlockers.map((message) => <div className="notice" key={message}>{message}</div>)}</details>
        <div className="workspace-grid" style={{ marginTop: 18 }}><div className="field"><label htmlFor="gltf-ratio">Target polygon ratio · {Math.round(targetRatio * 100)}%</label><input id="gltf-ratio" type="range" min="0.05" max="1" step="0.05" value={targetRatio} onChange={(event) => changeTargetRatio(Number(event.target.value))} /><small>Below 100% is lossy. Settings changes cancel active work and invalidate previous output.</small></div><div className="field"><label htmlFor="gltf-texture">Maximum texture dimension</label><select id="gltf-texture" value={maxTextureDimension} onChange={(event) => changeTextureDimension(Number(event.target.value))}>{[512, 1024, 2048, 4096, 8192].map((size) => <option value={size} key={size}>{size} px</option>)}</select><small>Oversized PNG/JPEG/WebP images are resized only when the browser can re-encode the same MIME format.</small></div></div>
        <div className="button-row"><button className="action-button" type="button" disabled={busy || inspection.transformBlockers.length > 0} onClick={() => void optimize()}>{busy ? 'Optimizing locally…' : 'Optimize GLB'}</button>{busy ? <button className="action-button secondary" type="button" onClick={cancelOptimization}>Cancel optimization</button> : null}<button className="action-button secondary" type="button" disabled={!result || busy} onClick={download}>Download optimized GLB</button>{result ? <button className="action-button secondary" type="button" onClick={() => setPreview((value) => value === 'before' ? 'after' : 'before')}>Show {preview === 'before' ? 'after' : 'before'}</button> : null}<label className="check-item"><input type="checkbox" checked={wireframe} onChange={(event) => setWireframe(event.target.checked)} /><span>Wireframe</span></label></div>
        {busy ? <div style={{ marginTop: 14 }}><progress max={1} value={progress} style={{ width: '100%' }} aria-label="GLB optimization progress" /><small>{stage}</small></div> : null}
        {stats ? <div className="metric-row"><div className="metric"><span>View</span><strong>{preview}</strong></div><div className="metric"><span>Bytes</span><strong>{formatBytes(preview === 'after' && result ? result.outputBytes : source.byteLength)}</strong></div><div className="metric"><span>Triangles</span><strong>{stats.triangles.toLocaleString()}</strong></div><div className="metric"><span>Vertices</span><strong>{stats.vertices.toLocaleString()}</strong></div><div className="metric"><span>Cameras</span><strong>{stats.cameras}</strong></div></div> : null}
        {!previewBlocked ? <GltfViewport bytes={previewBytes} wireframe={wireframe} modelKey={modelKey} /> : <div className="notice" style={{ marginTop: 18 }}>Preview disabled because this model requires a decoder/transcoder not bundled by this build. The source remains untouched.</div>}
        {result ? <details style={{ marginTop: 16 }}><summary>Optimization report</summary><div className="notice"><strong>Settings:</strong> {Math.round(result.options.targetRatio * 100)}% geometry · {result.options.maxTextureDimension}px texture cap<br /><strong>Stages:</strong> {result.report.stages.join(' · ')}<br /><strong>Textures resized:</strong> {result.report.resizedTextures}<br /><strong>Camera count preserved:</strong> {result.report.cameraCountPreserved ? 'yes' : 'no'}<br /><strong>Animation count preserved:</strong> {result.report.animationCountPreserved ? 'yes' : 'no'}<br /><strong>Extensions:</strong> {result.report.extensionPreservation.supported.join(', ') || 'none'} preserved; unknown extensions {result.report.extensionPreservation.unsupported.length ? 'blocked before transformation' : 'none detected'}.</div>{result.report.skippedTextures.length ? <ul>{result.report.skippedTextures.map((item) => <li key={item}>{item}</li>)}</ul> : null}</details> : null}
      </> : null}
      <div className={`status-line ${statusIsError ? 'error' : source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
