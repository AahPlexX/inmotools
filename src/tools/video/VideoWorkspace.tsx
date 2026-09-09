import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import { adjacentKeyframe, exportPacketRange, inspectLocalMedia, snapTrimRange, type MediaInspection, type SnappedRange } from './video-engine';
import { consumeFileInput } from '../../lib/file-input';

const KEYFRAME_PAGE_SIZE = 100;
type BusyKind = 'inspection' | 'preview' | 'export' | null;

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

function trackLabel(track: { number: number; name: string | null; languageCode: string }) {
  const details = [track.name, track.languageCode && track.languageCode !== 'und' ? track.languageCode : null].filter(Boolean).join(' · ');
  return `Track ${track.number}${details ? ` · ${details}` : ''}`;
}

export default function VideoWorkspace() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const operationRevisionRef = useRef(0);
  const sourceRevisionRef = useRef(0);
  const sourceUrlRef = useRef('');
  const selectedPreviewUrlRef = useRef('');

  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<MediaInspection | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [requestedStart, setRequestedStart] = useState(0);
  const [requestedEnd, setRequestedEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [busyKind, setBusyKind] = useState<BusyKind>(null);
  const [progress, setProgress] = useState(0);
  const [keyframePage, setKeyframePage] = useState(0);
  const [status, setStatus] = useState('Choose a local video file to inspect verified keyframes.');

  useEffect(() => () => {
    abortRef.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (selectedPreviewUrlRef.current) URL.revokeObjectURL(selectedPreviewUrlRef.current);
  }, []);

  const videoTrack = inspection?.videos.find((track) => track.id === selectedVideoId) ?? inspection?.videos[0] ?? null;
  const snapped = useMemo(() => {
    if (!inspection || !videoTrack?.keyframes.length) return null;
    try {
      return snapTrimRange(requestedStart, requestedEnd, videoTrack.keyframes, inspection.duration);
    } catch {
      return null;
    }
  }, [inspection, requestedEnd, requestedStart, videoTrack]);
  const keyframePageCount = Math.max(1, Math.ceil((videoTrack?.keyframes.length ?? 0) / KEYFRAME_PAGE_SIZE));
  const visibleKeyframes = (videoTrack?.keyframes ?? []).slice(keyframePage * KEYFRAME_PAGE_SIZE, (keyframePage + 1) * KEYFRAME_PAGE_SIZE);
  const omittedVideos = inspection?.videos.filter((track) => track.id !== selectedVideoId) ?? [];
  const omittedAudios = inspection?.audios.filter((track) => track.id !== selectedAudioId) ?? [];

  function replaceSourceUrl(next: string) {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = next;
    setSourcePreviewUrl(next);
  }

  function replaceSelectedPreviewUrl(next: string) {
    if (selectedPreviewUrlRef.current) URL.revokeObjectURL(selectedPreviewUrlRef.current);
    selectedPreviewUrlRef.current = next;
    setSelectedPreviewUrl(next);
  }

  function invalidateSelection(message = 'Track or trim selection changed. Rebuild the selected-track preview before relying on it.') {
    operationRevisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyKind(null);
    setProgress(0);
    replaceSelectedPreviewUrl('');
    if (inspection) setStatus(message);
  }

  function cancelCurrent() {
    const kind = busyKind;
    operationRevisionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyKind(null);
    setProgress(0);
    setStatus(`${kind === 'inspection' ? 'Inspection' : kind === 'preview' ? 'Selected-track preview' : 'Export'} canceled.`);
  }

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    operationRevisionRef.current += 1;
    const revision = operationRevisionRef.current;
    const sourceRevision = ++sourceRevisionRef.current;
    abortRef.current?.abort();
    replaceSourceUrl('');
    replaceSelectedPreviewUrl('');
    setFile(next);
    setInspection(null);
    setSelectedVideoId(null);
    setSelectedAudioId(null);
    setBusyKind('inspection');
    setProgress(0);
    setStatus('Reading all media tracks and verifying video keyframes locally…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await inspectLocalMedia(next, { signal: controller.signal });
      if (controller.signal.aborted || revision !== operationRevisionRef.current || sourceRevision !== sourceRevisionRef.current) return;
      if (!result.videos.length) throw new Error('No video track was found in this file.');
      const preferred = result.videos.find((track) => track.id === result.primaryVideoId) ?? result.videos[0];
      if (!preferred.keyframes.length) throw new Error('No verified video keyframes were found on the primary video track.');
      setInspection(result);
      setSelectedVideoId(preferred.id);
      setSelectedAudioId(result.primaryAudioId);
      setRequestedStart(0);
      setRequestedEnd(result.duration);
      setPlayhead(0);
      setKeyframePage(0);
      replaceSourceUrl(URL.createObjectURL(next));
      setStatus(`Ready: ${result.videos.length} video track${result.videos.length === 1 ? '' : 's'} and ${result.audios.length} audio track${result.audios.length === 1 ? '' : 's'} inventoried. ${preferred.keyframes.length.toLocaleString()} verified keyframes on the selected video track.`);
    } catch (error) {
      if (revision !== operationRevisionRef.current) return;
      setInspection(null);
      replaceSourceUrl('');
      setStatus(error instanceof DOMException && error.name === 'AbortError'
        ? 'Inspection canceled.'
        : `Inspection failed: ${error instanceof Error ? error.message : 'unsupported media file'}`);
    } finally {
      if (revision === operationRevisionRef.current) {
        if (abortRef.current === controller) abortRef.current = null;
        setBusyKind(null);
      }
    }
  }

  function chooseVideo(id: number) {
    const track = inspection?.videos.find((item) => item.id === id);
    if (!track) return;
    invalidateSelection();
    setSelectedVideoId(id);
    setRequestedStart(0);
    setRequestedEnd(inspection?.duration ?? 0);
    setKeyframePage(0);
    setStatus(`Video track ${track.number} selected with ${track.keyframes.length.toLocaleString()} verified keyframes. Build a selected-track preview to verify the exact remuxed track choice.`);
  }

  function chooseAudio(id: number | null) {
    invalidateSelection();
    setSelectedAudioId(id);
    const track = inspection?.audios.find((item) => item.id === id);
    setStatus(id === null ? 'Audio omitted from the current selection.' : `${trackLabel(track ?? { number: 0, name: null, languageCode: 'und' })} selected for preview/export.`);
  }

  function setBoundary(which: 'start' | 'end', value: number) {
    invalidateSelection('Trim boundaries changed. Rebuild the selected-track preview before relying on it.');
    if (which === 'start') setRequestedStart(value);
    else setRequestedEnd(value);
  }

  function seek(time: number) {
    const target = Math.max(0, Math.min(inspection?.duration ?? 0, time));
    setPlayhead(target);
    if (videoRef.current) videoRef.current.currentTime = target;
  }

  function moveKeyframe(direction: 'previous' | 'next') {
    if (!videoTrack) return;
    const target = adjacentKeyframe(videoTrack.keyframes, playhead, direction);
    if (target !== null) seek(target);
  }

  async function buildSelectedPreview() {
    if (!file || !inspection || !snapped || selectedVideoId === null) return;
    const capturedFile = file;
    const capturedRange: SnappedRange = { ...snapped };
    const capturedVideoId = selectedVideoId;
    const capturedAudioId = selectedAudioId;
    const revision = ++operationRevisionRef.current;
    abortRef.current?.abort();
    replaceSelectedPreviewUrl('');
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyKind('preview');
    setProgress(0);
    setStatus('Building an exact packet-remuxed preview for the selected tracks and snapped range…');
    try {
      const blob = await exportPacketRange(capturedFile, capturedRange, {
        videoTrackId: capturedVideoId,
        audioTrackId: capturedAudioId,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted || revision !== operationRevisionRef.current) return;
      replaceSelectedPreviewUrl(URL.createObjectURL(blob));
      setStatus(`Selected-track preview ready for video track ${videoTrack?.number ?? '?'}${capturedAudioId === null ? ' with no audio' : ` and audio track ${inspection.audios.find((track) => track.id === capturedAudioId)?.number ?? '?'}`}.`);
    } catch (error) {
      if (revision !== operationRevisionRef.current) return;
      setStatus(error instanceof DOMException && error.name === 'AbortError'
        ? 'Selected-track preview canceled.'
        : `Selected-track preview failed: ${error instanceof Error ? error.message : 'unsupported codec/container combination'}`);
    } finally {
      if (revision === operationRevisionRef.current) {
        if (abortRef.current === controller) abortRef.current = null;
        setBusyKind(null);
      }
    }
  }

  async function exportSlice() {
    if (!file || !inspection || !snapped || selectedVideoId === null) return;
    const capturedFile = file;
    const capturedRange: SnappedRange = { ...snapped };
    const capturedVideoId = selectedVideoId;
    const capturedAudioId = selectedAudioId;
    const revision = ++operationRevisionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyKind('export');
    setProgress(0);
    setStatus('Copying the captured encoded track selection into a compatible container locally…');
    try {
      const blob = await exportPacketRange(capturedFile, capturedRange, {
        videoTrackId: capturedVideoId,
        audioTrackId: capturedAudioId,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (controller.signal.aborted || revision !== operationRevisionRef.current) return;
      const base = capturedFile.name.replace(/\.[^.]+$/, '') || 'video';
      const extension = extensionForMime(blob.type);
      downloadBytes(bytes, `${base}.${capturedRange.start.toFixed(3)}-${capturedRange.end.toFixed(3)}.${extension}`, blob.type || 'application/octet-stream');
      setStatus(`Exported ${formatSeconds(capturedRange.start)}–${formatSeconds(capturedRange.end)} from video track ${videoTrack?.number ?? '?'}${capturedAudioId === null ? ' without audio' : ` with audio track ${inspection.audios.find((track) => track.id === capturedAudioId)?.number ?? '?'}`}. Rotation and supported track metadata were copied; no decoder/encoder path was used.`);
    } catch (error) {
      if (revision !== operationRevisionRef.current) return;
      setStatus(error instanceof DOMException && error.name === 'AbortError'
        ? 'Export canceled.'
        : `Lossless packet export failed: ${error instanceof Error ? error.message : 'unsupported codec/container combination'}`);
    } finally {
      if (revision === operationRevisionRef.current) {
        if (abortRef.current === controller) abortRef.current = null;
        setBusyKind(null);
      }
    }
  }

  return <>
    <div className="workspace-header"><div><h2>Lossless keyframe video slicer</h2><p>Trim compatible local video by copying encoded packets, with track and boundary choices disclosed before export.</p></div></div>
    <div className="workspace-body">
      <div className="notice"><strong>Lossless means no decode/re-encode.</strong> Video boundaries snap to verified keyframes so complete GOPs are preserved. Non-selected tracks are intentionally omitted and shown below before export.</div>
      <div className="notice" data-testid="video-preview-policy" style={{ marginTop: 12 }}><strong>Preview policy.</strong> The source preview plays the original file, so the browser may choose its preferred video/audio tracks. The selected-track preview is generated separately by packet-remuxing exactly the chosen video track, chosen audio track (or none), and current snapped range. Use that selected-track preview when verifying what the export will contain.</div>
      <div className="field" style={{ marginTop: 18 }}><label htmlFor="video-file">Video file</label><input id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(event) => consumeFileInput(event.target, () => chooseFile(event.target.files?.[0]))}/></div>

      {sourcePreviewUrl ? <section style={{ marginTop: 18 }}><h3>Source preview</h3><video ref={videoRef} src={sourcePreviewUrl} aria-label="Source media preview" controls playsInline preload="metadata" onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)} style={{ display: 'block', width: '100%', maxHeight: 420, borderRadius: 'var(--radius-sm)', background: '#000' }}/></section> : null}
      {selectedPreviewUrl ? <section style={{ marginTop: 18 }}><h3>Selected-track preview</h3><video src={selectedPreviewUrl} aria-label="Selected-track preview" controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 420, borderRadius: 'var(--radius-sm)', background: '#000' }}/></section> : null}

      {inspection && videoTrack ? <>
        <div className="metric-row"><div className="metric"><span>Duration</span><strong>{formatSeconds(inspection.duration)}</strong></div><div className="metric"><span>Video tracks</span><strong>{inspection.videos.length}</strong></div><div className="metric"><span>Audio tracks</span><strong>{inspection.audios.length}</strong></div><div className="metric"><span>Selected keyframes</span><strong>{videoTrack.keyframes.length}</strong></div><div className="metric"><span>Rotation</span><strong>{videoTrack.rotation}°</strong></div></div>

        <div className="workspace-grid" style={{ marginTop: 18 }}><div className="field"><label htmlFor="video-track">Video track retained</label><select id="video-track" value={selectedVideoId ?? ''} onChange={(event) => chooseVideo(Number(event.target.value))}>{inspection.videos.map((track) => <option key={track.id} value={track.id}>{trackLabel(track)} · {track.codecString ?? track.codec} · {track.width}×{track.height} · {track.rotation}° · {track.keyframes.length} keyframes</option>)}</select></div><div className="field"><label htmlFor="audio-track">Audio track retained</label><select id="audio-track" value={selectedAudioId ?? 'none'} onChange={(event) => chooseAudio(event.target.value === 'none' ? null : Number(event.target.value))}><option value="none">No audio</option>{inspection.audios.map((track) => <option key={track.id} value={track.id}>{trackLabel(track)} · {track.codecString ?? track.codec} · {track.sampleRate ?? '?'} Hz · {track.numberOfChannels ?? '?'} ch</option>)}</select></div></div>

        <div className="notice" data-testid="video-track-report" style={{ marginTop: 14 }}><strong>Track preservation report.</strong><br/><strong>Retained video:</strong> {trackLabel(videoTrack)} · {videoTrack.rotation}° rotation metadata.<br/><strong>Retained audio:</strong> {selectedAudioId === null ? 'none' : trackLabel(inspection.audios.find((track) => track.id === selectedAudioId) ?? { number: 0, name: null, languageCode: 'und' })}.<br/><strong>Omitted video:</strong> {omittedVideos.length ? omittedVideos.map(trackLabel).join(', ') : 'none'}.<br/><strong>Omitted audio:</strong> {omittedAudios.length ? omittedAudios.map(trackLabel).join(', ') : 'none'}.<br/><strong>Unsupported/other input tracks:</strong> {inspection.otherTracks.length ? inspection.otherTracks.map((track) => `${track.type} ${track.number}${track.name ? ` · ${track.name}` : ''}`).join(', ') : 'none detected'}. Other track types are not written by this slicer.</div>

        <div className="button-row"><button className="action-button secondary" type="button" onClick={() => moveKeyframe('previous')} disabled={adjacentKeyframe(videoTrack.keyframes, playhead, 'previous') === null}>Previous keyframe</button><button className="action-button secondary" type="button" onClick={() => moveKeyframe('next')} disabled={adjacentKeyframe(videoTrack.keyframes, playhead, 'next') === null}>Next keyframe</button><button className="action-button secondary" type="button" onClick={() => setBoundary('start', playhead)}>Set In at playhead</button><button className="action-button secondary" type="button" onClick={() => setBoundary('end', playhead)}>Set Out at playhead</button>{snapped ? <><button className="action-button secondary" type="button" onClick={() => seek(snapped.start)}>Preview snapped In</button><button className="action-button secondary" type="button" onClick={() => seek(snapped.end)}>Preview snapped Out</button></> : null}</div>

        <div className="workspace-grid" style={{ marginTop: 16 }}><div className="field"><label htmlFor="trim-start">Requested start (seconds)</label><input id="trim-start" type="number" min="0" max={inspection.duration} step="0.001" value={requestedStart} onChange={(event) => setBoundary('start', Number(event.target.value))}/></div><div className="field"><label htmlFor="trim-end">Requested end (seconds)</label><input id="trim-end" type="number" min="0" max={inspection.duration} step="0.001" value={requestedEnd} onChange={(event) => setBoundary('end', Number(event.target.value))}/></div></div>

        {snapped ? <div className="workspace-grid" style={{ marginTop: 16 }}><div className="notice"><strong>Requested</strong><br/>{formatSeconds(snapped.requestedStart)} → {formatSeconds(snapped.requestedEnd)}</div><div className="notice"><strong>Packet-safe export</strong><br/>{formatSeconds(snapped.start)} → {formatSeconds(snapped.end)}<br/><small>{snapped.startAdjusted || snapped.endAdjusted ? 'Adjusted to verified keyframes.' : 'Requested boundaries are already packet-safe.'}</small></div></div> : <div className="notice" style={{ marginTop: 16 }}>The current In/Out selection cannot form a complete keyframe-safe range.</div>}

        <h3 style={{ marginTop: 22 }}>Verified keyframes</h3><div className="result-table-wrap" tabIndex={0} aria-label="Verified keyframe list"><table><thead><tr><th scope="col">#</th><th scope="col">Timestamp</th><th scope="col">Action</th></tr></thead><tbody>{visibleKeyframes.map((keyframe, index) => <tr key={keyframe}><td>{keyframePage * KEYFRAME_PAGE_SIZE + index + 1}</td><td>{formatSeconds(keyframe)}</td><td><button type="button" className="action-button secondary" onClick={() => seek(keyframe)}>Seek</button></td></tr>)}</tbody></table></div>
        {keyframePageCount > 1 ? <div className="button-row" role="group" aria-label="Keyframe pages"><button type="button" className="action-button secondary" disabled={keyframePage === 0} onClick={() => setKeyframePage((page) => Math.max(0, page - 1))}>Previous keyframes</button><span>Page {keyframePage + 1} of {keyframePageCount}</span><button type="button" className="action-button secondary" disabled={keyframePage >= keyframePageCount - 1} onClick={() => setKeyframePage((page) => Math.min(keyframePageCount - 1, page + 1))}>Next keyframes</button></div> : null}

        {busyKind ? <div style={{ marginTop: 16 }}><progress max={1} value={progress} style={{ width: '100%' }} aria-label={`${busyKind} progress`}/><div className="button-row"><button className="action-button secondary" type="button" onClick={cancelCurrent}>Cancel {busyKind === 'inspection' ? 'inspection' : busyKind === 'preview' ? 'preview' : 'export'}</button></div></div> : <div className="button-row"><button className="action-button secondary" type="button" disabled={!snapped} onClick={() => void buildSelectedPreview()}>Build selected-track preview</button><button className="action-button" type="button" disabled={!snapped} onClick={() => void exportSlice()}>Export lossless packet slice</button></div>}
      </> : busyKind === 'inspection' ? <div className="button-row"><button className="action-button secondary" type="button" onClick={cancelCurrent}>Cancel inspection</button></div> : null}
      <div className={`status-line ${inspection ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
