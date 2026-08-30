import { useEffect, useMemo, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import { exportPacketRange, inspectLocalMedia, snapTrimRange, type MediaInspection } from './video-engine';

function formatSeconds(value: number) {
  if (!Number.isFinite(value)) return '—';
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function extensionForMime(type: string) {
  if (type.includes('webm')) return 'webm';
  if (type.includes('quicktime')) return 'mov';
  return 'mp4';
}

export default function VideoWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<MediaInspection | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [requestedStart, setRequestedStart] = useState(0);
  const [requestedEnd, setRequestedEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Choose a local video file to inspect verified keyframes.');

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const snapped = useMemo(() => {
    if (!inspection?.video?.keyframes.length) return null;
    try { return snapTrimRange(requestedStart, requestedEnd, inspection.video.keyframes, inspection.duration); }
    catch { return null; }
  }, [inspection, requestedEnd, requestedStart]);

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(next);
    setFile(next); setPreviewUrl(url); setInspection(null); setBusy(true); setStatus('Reading container metadata and verifying video keyframes locally…');
    try {
      const result = await inspectLocalMedia(next);
      if (!result.video) throw new Error('No video track was found in this file.');
      if (!result.video.keyframes.length) throw new Error('No verified video keyframes were found.');
      setInspection(result);
      setRequestedStart(0);
      setRequestedEnd(result.duration);
      setStatus(`Ready: ${result.video.keyframes.length.toLocaleString()} verified keyframe${result.video.keyframes.length === 1 ? '' : 's'} found without decoding/re-encoding the video.`);
    } catch (error) {
      setInspection(null);
      setStatus(`Inspection failed: ${error instanceof Error ? error.message : 'unsupported media file'}`);
    } finally { setBusy(false); }
  }

  async function exportSlice() {
    if (!file || !inspection || !snapped) return;
    setBusy(true);
    setStatus('Copying encoded packets into a new compatible container locally…');
    try {
      const blob = await exportPacketRange(file, snapped);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const base = file.name.replace(/\.[^.]+$/, '') || 'video';
      const extension = extensionForMime(blob.type);
      downloadBytes(bytes, `${base}.${snapped.start.toFixed(3)}-${snapped.end.toFixed(3)}.${extension}`, blob.type || 'application/octet-stream');
      setStatus(`Exported ${formatSeconds(snapped.start)}–${formatSeconds(snapped.end)} by encoded-packet passthrough. No video or audio decoder/encoder path was used.`);
    } catch (error) {
      setStatus(`Lossless packet export failed: ${error instanceof Error ? error.message : 'unsupported codec/container combination'}`);
    } finally { setBusy(false); }
  }

  return <>
    <div className="workspace-header"><div><h2>Lossless keyframe video slicer</h2><p>Trim compatible local video by copying encoded packets, with boundaries disclosed before export.</p></div></div>
    <div className="workspace-body">
      <div className="notice"><strong>Lossless means no decode/re-encode.</strong> Video boundaries snap to verified keyframes so complete GOPs are preserved. The exported range can therefore be wider than the range you requested.</div>
      <div className="field" style={{ marginTop: 18 }}><label htmlFor="video-file">Video file</label><input id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(event) => void chooseFile(event.target.files?.[0])}/><small>MP4, MOV, and WebM are inspected locally. Export only proceeds when a compatible output container can preserve the source codecs.</small></div>

      {previewUrl ? <video src={previewUrl} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 420, marginTop: 18, borderRadius: 'var(--radius-sm)', background: '#000' }}/>: null}

      {inspection?.video ? <>
        <div className="metric-row"><div className="metric"><span>Duration</span><strong>{formatSeconds(inspection.duration)}</strong></div><div className="metric"><span>Video codec</span><strong>{inspection.video.codecString ?? inspection.video.codec}</strong></div><div className="metric"><span>Frame size</span><strong>{inspection.video.width}×{inspection.video.height}</strong></div><div className="metric"><span>Keyframes</span><strong>{inspection.video.keyframes.length}</strong></div>{inspection.audio ? <div className="metric"><span>Audio</span><strong>{inspection.audio.codecString ?? inspection.audio.codec}</strong></div> : null}</div>

        <div className="workspace-grid" style={{ marginTop: 20 }}>
          <div className="field"><label htmlFor="trim-start">Requested start (seconds)</label><input id="trim-start" type="number" min="0" max={inspection.duration} step="0.001" value={requestedStart} onChange={(event) => setRequestedStart(Number(event.target.value))}/><input aria-label="Requested start timeline" type="range" min="0" max={inspection.duration} step="0.001" value={Math.min(requestedStart, inspection.duration)} onChange={(event) => setRequestedStart(Number(event.target.value))}/></div>
          <div className="field"><label htmlFor="trim-end">Requested end (seconds)</label><input id="trim-end" type="number" min="0" max={inspection.duration} step="0.001" value={requestedEnd} onChange={(event) => setRequestedEnd(Number(event.target.value))}/><input aria-label="Requested end timeline" type="range" min="0" max={inspection.duration} step="0.001" value={Math.min(requestedEnd, inspection.duration)} onChange={(event) => setRequestedEnd(Number(event.target.value))}/></div>
        </div>

        <div aria-label="Verified keyframe timeline" style={{ position: 'relative', height: 46, marginTop: 14, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface-strong)' }}>
          {inspection.video.keyframes.slice(0, 500).map((keyframe) => <span key={keyframe} aria-hidden="true" style={{ position: 'absolute', left: `${inspection.duration ? (keyframe / inspection.duration) * 100 : 0}%`, top: 8, bottom: 8, width: 1, background: 'var(--muted)' }}/>) }
          {snapped ? <><span aria-hidden="true" style={{ position: 'absolute', left: `${(snapped.start / inspection.duration) * 100}%`, top: 2, bottom: 2, width: 3, background: 'var(--signal)' }}/><span aria-hidden="true" style={{ position: 'absolute', left: `${(snapped.end / inspection.duration) * 100}%`, top: 2, bottom: 2, width: 3, background: 'var(--signal)' }}/></> : null}
        </div>
        <small>Thin marks show up to the first 500 verified keyframes; emphasized marks show the current snapped boundaries.</small>

        {snapped ? <div className="workspace-grid" style={{ marginTop: 18 }}><div className="notice"><strong>Requested</strong><br/>{formatSeconds(snapped.requestedStart)} → {formatSeconds(snapped.requestedEnd)}</div><div className="notice"><strong>Packet-safe export</strong><br/>{formatSeconds(snapped.start)} → {formatSeconds(snapped.end)}<br/><small>{snapped.startAdjusted || snapped.endAdjusted ? 'Boundary adjustment required to preserve complete video GOPs.' : 'Requested boundaries are already packet-safe.'}</small></div></div> : <div className="notice" style={{ marginTop: 18 }}>The current start/end selection cannot form a complete keyframe-safe range.</div>}

        <div className="button-row"><button className="action-button" type="button" disabled={busy || !snapped} onClick={() => void exportSlice()}>{busy ? 'Working locally…' : 'Export lossless packet slice'}</button></div>
      </> : null}
      <div className={`status-line ${inspection ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
