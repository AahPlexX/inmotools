import { useMemo, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import GltfViewport from './GltfViewport';
import { optimizeGlb, type GltfOptimizeResult } from './gltf-engine';

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export default function GltfWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Uint8Array | null>(null);
  const [result, setResult] = useState<GltfOptimizeResult | null>(null);
  const [targetRatio, setTargetRatio] = useState(0.65);
  const [maxTextureDimension, setMaxTextureDimension] = useState(2048);
  const [preview, setPreview] = useState<'before' | 'after'>('before');
  const [wireframe, setWireframe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Choose a binary GLB model to inspect and optimize locally.');

  const previewBytes = useMemo(() => preview === 'after' && result ? result.bytes : source, [preview, result, source]);

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    setBusy(true); setFile(next); setResult(null); setPreview('before'); setStatus('Reading the GLB bytes locally…');
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      if (new DataView(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 12)).getUint32(0, true) !== 0x46546c67) throw new Error('This workspace currently requires a self-contained binary .glb file.');
      setSource(bytes);
      const baseline = await optimizeGlb(bytes, { targetRatio: 1, maxTextureDimension: 8192 });
      setResult(baseline);
      setStatus(`Loaded ${baseline.before.meshes} mesh${baseline.before.meshes === 1 ? '' : 'es'} · ${baseline.before.triangles.toLocaleString()} triangles locally.`);
    } catch (error) { setSource(null); setStatus(`GLB load failed: ${error instanceof Error ? error.message : 'unsupported model'}`); }
    finally { setBusy(false); }
  }

  async function optimize() {
    if (!source) return;
    setBusy(true); setStatus('Optimizing geometry and supported textures locally…');
    try {
      const optimized = await optimizeGlb(source, { targetRatio, maxTextureDimension });
      setResult(optimized); setPreview('after');
      const delta = optimized.inputBytes ? (1 - optimized.outputBytes / optimized.inputBytes) * 100 : 0;
      setStatus(`Optimization complete: ${optimized.after.triangles.toLocaleString()} triangles · ${formatBytes(optimized.outputBytes)} (${delta >= 0 ? `${delta.toFixed(1)}% smaller` : `${Math.abs(delta).toFixed(1)}% larger`}).`);
    } catch (error) { setStatus(`Optimization failed: ${error instanceof Error ? error.message : 'GLB processing error'}`); }
    finally { setBusy(false); }
  }

  function download() {
    if (!result || !file) return;
    downloadBytes(result.bytes, `${file.name.replace(/\.glb$/i, '')}.optimized.glb`, 'model/gltf-binary');
    setStatus('Downloaded the optimized GLB. The original file was not modified.');
  }

  return <>
    <div className="workspace-header"><div><h2>glTF / GLB optimizer</h2><p>Inspect a self-contained GLB, reduce geometry, resize supported textures, and compare the local result in an orbit viewport.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="gltf-file">Binary GLB model</label><input id="gltf-file" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void chooseFile(event.target.files?.[0])}/><small>External-resource .gltf packages are not accepted because a single-file picker cannot safely resolve their sidecar buffers/textures. Use a self-contained .glb.</small></div>

      {source && result ? <>
        <div className="workspace-grid" style={{ marginTop: 18 }}>
          <div className="field"><label htmlFor="gltf-ratio">Target polygon ratio · {Math.round(targetRatio * 100)}%</label><input id="gltf-ratio" type="range" min="0.05" max="1" step="0.05" value={targetRatio} onChange={(event) => setTargetRatio(Number(event.target.value))}/><small>Mesh simplification is lossy below 100%; use the viewport to inspect silhouette and topology changes.</small></div>
          <div className="field"><label htmlFor="gltf-texture">Maximum texture dimension</label><select id="gltf-texture" value={maxTextureDimension} onChange={(event) => setMaxTextureDimension(Number(event.target.value))}><option value="512">512 px</option><option value="1024">1024 px</option><option value="2048">2048 px</option><option value="4096">4096 px</option><option value="8192">8192 px</option></select><small>PNG/JPEG/WebP textures are locally resized/re-encoded to WebP when this browser supports the required decoder/encoder path.</small></div>
        </div>
        <div className="button-row"><button className="action-button" type="button" disabled={busy} onClick={() => void optimize()}>{busy ? 'Optimizing locally…' : 'Optimize GLB'}</button><button className="action-button secondary" type="button" disabled={!result} onClick={download}>Download GLB</button><button className="action-button secondary" type="button" onClick={() => setPreview((value) => value === 'before' ? 'after' : 'before')}>Show {preview === 'before' ? 'after' : 'before'}</button><label className="check-item"><input type="checkbox" checked={wireframe} onChange={(event) => setWireframe(event.target.checked)}/><span>Wireframe</span></label></div>

        <div className="metric-row"><div className="metric"><span>View</span><strong>{preview}</strong></div><div className="metric"><span>Bytes</span><strong>{formatBytes(preview === 'after' ? result.outputBytes : result.inputBytes)}</strong></div><div className="metric"><span>Meshes</span><strong>{(preview === 'after' ? result.after : result.before).meshes}</strong></div><div className="metric"><span>Triangles</span><strong>{(preview === 'after' ? result.after : result.before).triangles.toLocaleString()}</strong></div><div className="metric"><span>Vertices</span><strong>{(preview === 'after' ? result.after : result.before).vertices.toLocaleString()}</strong></div><div className="metric"><span>Textures</span><strong>{(preview === 'after' ? result.after : result.before).textures}</strong></div></div>
        <GltfViewport bytes={previewBytes} wireframe={wireframe}/>
      </> : null}
      <div className={`status-line ${source ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
