import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { consumeFileInput } from '../../lib/file-input';
import {
  applyEdits,
  buildPeakEnvelope,
  clampSelection,
  findZeroCrossing,
  measureDcOffset,
  pcmDuration,
  type AudioEdit,
  type MasteringMarker,
  type MasteringRegion,
  type PcmAudio,
  type TimeSelection,
} from './mastering-engine';
import { bufferToPcm, decodeAudioFile, type AudioFileInfo } from './mastering-media';
import MasteringWaveform from './MasteringWaveform';

type PlaybackState = 'idle' | 'starting' | 'playing' | 'paused';
type PlaybackGraph = {
  session: number;
  context: AudioContext;
  source: AudioBufferSourceNode;
  startedAt: number;
  offset: number;
  loopStart: number;
  loopEnd: number;
  raf: number | null;
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error || 'unknown error');
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe % 60).toFixed(3).padStart(6, '0')}`;
};

export default function MasteringWorkspace() {
  const [sourcePcm, setSourcePcm] = useState<PcmAudio | null>(null);
  const [sourceInfo, setSourceInfo] = useState<AudioFileInfo | null>(null);
  const [edits, setEdits] = useState<AudioEdit[]>([]);
  const [redoEdits, setRedoEdits] = useState<AudioEdit[]>([]);
  const [selection, setSelection] = useState<TimeSelection>({ startSeconds: 0, endSeconds: 0 });
  const [markers, setMarkers] = useState<MasteringMarker[]>([]);
  const [regions, setRegions] = useState<MasteringRegion[]>([]);
  const [markerName, setMarkerName] = useState('');
  const [regionName, setRegionName] = useState('');
  const [silenceDuration, setSilenceDuration] = useState(1);
  const [channelIndex, setChannelIndex] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [loop, setLoop] = useState(false);
  const [gainDb, setGainDb] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [status, setStatus] = useState('Open an audio file to begin. Source audio stays on this device.');
  const [loading, setLoading] = useState(false);
  const graphRef = useRef<PlaybackGraph | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const importRevisionRef = useRef(0);

  const currentPcm = useMemo(() => sourcePcm ? applyEdits(sourcePcm, edits) : null, [sourcePcm, edits]);
  const duration = currentPcm ? pcmDuration(currentPcm) : 0;
  const peaks = useMemo(() => currentPcm ? buildPeakEnvelope(currentPcm, 1200) : [], [currentPcm]);
  const boundedSelection = useMemo(() => clampSelection(selection, duration), [selection, duration]);
  const dcOffsets = useMemo(() => currentPcm ? measureDcOffset(currentPcm) : [], [currentPcm]);
  const activeChannelIndex = Math.min(channelIndex, Math.max(0, (currentPcm?.channels.length ?? 1) - 1));

  const releaseGraph = useCallback((graph: PlaybackGraph) => {
    if (graph.raf !== null) cancelAnimationFrame(graph.raf);
    graph.raf = null;
    try { graph.source.onended = null; graph.source.stop(); } catch { /* source may already have ended */ }
    try { graph.source.disconnect(); } catch { /* already disconnected */ }
    if (graph.context.state !== 'closed') void graph.context.close().catch(() => undefined);
  }, []);

  const stopPlayback = useCallback((report = true, resetPosition = false) => {
    sessionRef.current += 1;
    const graph = graphRef.current;
    graphRef.current = null;
    if (graph) releaseGraph(graph);
    if (!mountedRef.current) return;
    setPlaybackState('idle');
    if (resetPosition) setPlayhead(0);
    if (report) setStatus('Playback stopped and the audio graph was released.');
  }, [releaseGraph]);

  useEffect(() => () => {
    mountedRef.current = false;
    stopPlayback(false);
  }, [stopPlayback]);

  useEffect(() => {
    setSelection((current) => clampSelection(current, duration));
    setPlayhead((current) => Math.min(duration, Math.max(0, current)));
  }, [duration]);

  const loadFile = useCallback(async (file: File) => {
    const revision = ++importRevisionRef.current;
    stopPlayback(false, true);
    setLoading(true);
    setStatus(`Reading ${file.name} locally…`);
    try {
      const decoded = await decodeAudioFile(file);
      if (revision !== importRevisionRef.current || !mountedRef.current) return;
      const pcm = bufferToPcm(decoded.buffer);
      setSourcePcm(pcm);
      setSourceInfo(decoded.info);
      setEdits([]);
      setRedoEdits([]);
      setMarkers([]);
      setRegions([]);
      setSelection({ startSeconds: 0, endSeconds: decoded.buffer.duration });
      setPlayhead(0);
      setStatus(`Loaded ${file.name}: ${decoded.info.codec}, ${decoded.info.channelCount} channel${decoded.info.channelCount === 1 ? '' : 's'}, ${decoded.info.sampleRate.toLocaleString()} Hz.`);
    } catch (error) {
      if (revision === importRevisionRef.current && mountedRef.current) {
        setSourcePcm(null);
        setSourceInfo(null);
        setEdits([]);
        setRedoEdits([]);
        setMarkers([]);
        setRegions([]);
        setSelection({ startSeconds: 0, endSeconds: 0 });
        setStatus(`Could not open audio: ${messageOf(error)}`);
      }
    } finally {
      if (revision === importRevisionRef.current && mountedRef.current) setLoading(false);
    }
  }, [stopPlayback]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    consumeFileInput(input, () => file ? loadFile(file) : undefined);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const updateSelection = (next: TimeSelection) => setSelection(clampSelection(next, duration));

  const applyEdit = (edit: AudioEdit, label: string) => {
    if (!currentPcm) return;
    stopPlayback(false);
    setEdits((current) => [...current, edit]);
    setRedoEdits([]);
    setStatus(label);
  };

  const cropToSelection = () => {
    const selected = clampSelection(selection, duration);
    if (!currentPcm || selected.endSeconds - selected.startSeconds <= 0) {
      setStatus('Choose a non-empty range before cropping.');
      return;
    }
    applyEdit({ type: 'crop', startSeconds: selected.startSeconds, endSeconds: selected.endSeconds }, `Cropped to ${formatTime(selected.startSeconds)}–${formatTime(selected.endSeconds)}. Undo remains available.`);
    setMarkers((current) => current
      .filter((marker) => marker.seconds >= selected.startSeconds && marker.seconds <= selected.endSeconds)
      .map((marker) => ({ ...marker, seconds: marker.seconds - selected.startSeconds })));
    setRegions((current) => current.flatMap((region) => {
      const startSeconds = Math.max(region.startSeconds, selected.startSeconds);
      const endSeconds = Math.min(region.endSeconds, selected.endSeconds);
      return endSeconds > startSeconds ? [{ ...region, startSeconds: startSeconds - selected.startSeconds, endSeconds: endSeconds - selected.startSeconds }] : [];
    }));
    setSelection({ startSeconds: 0, endSeconds: selected.endSeconds - selected.startSeconds });
    setPlayhead(0);
  };

  const snapSelectionToZero = () => {
    if (!currentPcm || !currentPcm.channels[0]?.length) return;
    const first = currentPcm.channels[0];
    const startIndex = findZeroCrossing(first, Math.round(boundedSelection.startSeconds * currentPcm.sampleRate));
    const endIndex = findZeroCrossing(first, Math.min(first.length - 1, Math.round(boundedSelection.endSeconds * currentPcm.sampleRate)));
    const next = clampSelection({ startSeconds: startIndex / currentPcm.sampleRate, endSeconds: endIndex / currentPcm.sampleRate }, duration);
    setSelection(next);
    setStatus(`Selection snapped to nearby zero crossings at ${formatTime(next.startSeconds)} and ${formatTime(next.endSeconds)}.`);
  };

  const undoEdit = () => {
    if (!edits.length) return;
    stopPlayback(false);
    const edit = edits[edits.length - 1];
    setEdits((current) => current.slice(0, -1));
    setRedoEdits((current) => [...current, edit]);
    setStatus('Undid the most recent audio edit.');
  };

  const redoEdit = () => {
    if (!redoEdits.length) return;
    stopPlayback(false);
    const edit = redoEdits[redoEdits.length - 1];
    setRedoEdits((current) => current.slice(0, -1));
    setEdits((current) => [...current, edit]);
    setStatus('Redid the most recently undone audio edit.');
  };

  const resetEdits = () => {
    if (!edits.length && !redoEdits.length) return;
    stopPlayback(false, true);
    setEdits([]);
    setRedoEdits([]);
    setSelection({ startSeconds: 0, endSeconds: sourcePcm ? pcmDuration(sourcePcm) : 0 });
    setStatus('All applied audio edits were reset to the imported source.');
  };

  const addMarker = () => {
    if (!currentPcm) return;
    const label = markerName.trim() || `Marker ${markers.length + 1}`;
    const marker: MasteringMarker = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `marker-${Date.now()}-${markers.length}`,
      label,
      seconds: Math.min(duration, Math.max(0, playhead)),
    };
    setMarkers((current) => [...current, marker]);
    setMarkerName('');
    setStatus(`Added ${marker.label} at ${formatTime(marker.seconds)}.`);
  };

  const addRegion = () => {
    if (!currentPcm || boundedSelection.endSeconds <= boundedSelection.startSeconds) {
      setStatus('Choose a non-empty selection before creating a region.');
      return;
    }
    const label = regionName.trim() || `Region ${regions.length + 1}`;
    const region: MasteringRegion = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `region-${Date.now()}-${regions.length}`,
      label,
      startSeconds: boundedSelection.startSeconds,
      endSeconds: boundedSelection.endSeconds,
    };
    setRegions((current) => [...current, region]);
    setRegionName('');
    setStatus(`Added ${region.label} from ${formatTime(region.startSeconds)} to ${formatTime(region.endSeconds)}.`);
  };

  const insertSilenceAtPlayhead = () => {
    if (!currentPcm || !Number.isFinite(silenceDuration) || silenceDuration <= 0) {
      setStatus('Enter a silence duration greater than zero.');
      return;
    }
    const at = Math.min(duration, Math.max(0, playhead));
    applyEdit({ type: 'insertSilence', atSeconds: at, durationSeconds: silenceDuration }, `Inserted ${silenceDuration.toFixed(3)} seconds of silence at ${formatTime(at)}.`);
    setMarkers((current) => current.map((marker) => marker.seconds >= at ? { ...marker, seconds: marker.seconds + silenceDuration } : marker));
    setRegions((current) => current.map((region) => ({
      ...region,
      startSeconds: region.startSeconds >= at ? region.startSeconds + silenceDuration : region.startSeconds,
      endSeconds: region.endSeconds >= at ? region.endSeconds + silenceDuration : region.endSeconds,
    })));
    setSelection((current) => ({
      startSeconds: current.startSeconds >= at ? current.startSeconds + silenceDuration : current.startSeconds,
      endSeconds: current.endSeconds >= at ? current.endSeconds + silenceDuration : current.endSeconds,
    }));
    setPlayhead(at + silenceDuration);
  };

  const startTicker = (graph: PlaybackGraph) => {
    const tick = () => {
      if (graphRef.current !== graph || sessionRef.current !== graph.session) return;
      const elapsed = Math.max(0, graph.context.currentTime - graph.startedAt);
      let next = graph.offset + elapsed;
      if (loop && graph.loopEnd > graph.loopStart) {
        const loopDuration = graph.loopEnd - graph.loopStart;
        if (next >= graph.loopEnd) next = graph.loopStart + ((next - graph.loopStart) % loopDuration);
      } else {
        next = Math.min(duration, next);
      }
      if (mountedRef.current) setPlayhead(next);
      graph.raf = requestAnimationFrame(tick);
    };
    graph.raf = requestAnimationFrame(tick);
  };

  const play = async () => {
    if (!currentPcm || duration <= 0) {
      setStatus('Open an audio file before starting playback.');
      return;
    }
    stopPlayback(false);
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const context = new AudioContext();
    const buffer = context.createBuffer(currentPcm.channels.length, currentPcm.channels[0].length, currentPcm.sampleRate);
    currentPcm.channels.forEach((channel, index) => { const owned = new Float32Array(channel.length); owned.set(channel); buffer.copyToChannel(owned, index); });
    const source = context.createBufferSource();
    source.buffer = buffer;
    const selected = clampSelection(selection, duration);
    const hasLoopRange = loop && selected.endSeconds - selected.startSeconds > 0.002;
    source.loop = loop;
    source.loopStart = hasLoopRange ? selected.startSeconds : 0;
    source.loopEnd = hasLoopRange ? selected.endSeconds : duration;
    let offset = playhead >= duration ? 0 : Math.max(0, playhead);
    if (hasLoopRange && (offset < source.loopStart || offset >= source.loopEnd)) offset = source.loopStart;
    source.connect(context.destination);
    const graph: PlaybackGraph = {
      session,
      context,
      source,
      startedAt: 0,
      offset,
      loopStart: source.loopStart,
      loopEnd: source.loopEnd || duration,
      raf: null,
    };
    graphRef.current = graph;
    setPlaybackState('starting');
    setStatus('Starting the local Web Audio graph…');
    try {
      await context.resume();
      if (graphRef.current !== graph || sessionRef.current !== session) {
        releaseGraph(graph);
        return;
      }
      graph.startedAt = context.currentTime;
      source.onended = () => {
        if (source.loop || graphRef.current !== graph || sessionRef.current !== session) return;
        graphRef.current = null;
        if (graph.raf !== null) cancelAnimationFrame(graph.raf);
        graph.raf = null;
        try { source.disconnect(); } catch { /* already disconnected */ }
        if (context.state !== 'closed') void context.close().catch(() => undefined);
        if (mountedRef.current) {
          setPlaybackState('idle');
          setPlayhead(duration);
          setStatus('Playback complete and the audio graph was released.');
        }
      };
      source.start(0, offset);
      setPlaybackState('playing');
      setStatus(loop ? 'Playing locally with loop enabled.' : 'Playing locally through the browser Web Audio engine.');
      startTicker(graph);
    } catch (error) {
      if (graphRef.current === graph) graphRef.current = null;
      releaseGraph(graph);
      if (mountedRef.current && sessionRef.current === session) {
        setPlaybackState('idle');
        setStatus(`Audio playback failed: ${messageOf(error)}`);
      }
    }
  };

  const pause = () => {
    const graph = graphRef.current;
    if (!graph || playbackState !== 'playing') return;
    let pausedAt = graph.offset + Math.max(0, graph.context.currentTime - graph.startedAt);
    if (loop && graph.loopEnd > graph.loopStart && pausedAt >= graph.loopEnd) {
      pausedAt = graph.loopStart + ((pausedAt - graph.loopStart) % (graph.loopEnd - graph.loopStart));
    }
    sessionRef.current += 1;
    graphRef.current = null;
    releaseGraph(graph);
    setPlayhead(Math.min(duration, pausedAt));
    setPlaybackState('paused');
    setStatus(`Paused at ${formatTime(pausedAt)}. Playback resources were released.`);
  };

  const seek = (seconds: number) => {
    const next = Math.min(duration, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    const wasPlaying = playbackState === 'playing';
    stopPlayback(false);
    setPlayhead(next);
    setPlaybackState(wasPlaying ? 'paused' : playbackState === 'paused' ? 'paused' : 'idle');
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (!currentPcm || loading) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (playbackState === 'playing') pause();
        else if (playbackState !== 'starting') void play();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(playhead - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(playhead + 1);
      } else if (event.key === 'Escape') {
        if (playbackState !== 'idle' || playhead !== 0) stopPlayback(true, true);
      } else if (event.key.toLowerCase() === 'l') {
        setLoop((current) => !current);
        setStatus('Loop mode toggled from the keyboard.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const metadata = sourceInfo?.metadata;
  const canEdit = Boolean(currentPcm) && !loading;

  return <>
    <div className="workspace-header mastering-header">
      <div><h2>Audio mastering workstation</h2><p>Local waveform editing, restoration, mastering, telemetry, and export—built up in verified production slices.</p></div>
      <span className="mastering-local-badge">Local processing</span>
    </div>
    <div className="workspace-body mastering-workspace">
      <div
        className="mastering-import"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div><strong>{sourceInfo ? sourceInfo.fileName : 'Open audio'}</strong><p>{sourceInfo ? 'Replace the source at any time; applied edits remain isolated from the original file.' : 'Choose or drop a local audio file. Nothing is uploaded.'}</p></div>
        <label className="mastering-file-button">{loading ? 'Reading…' : sourceInfo ? 'Replace audio' : 'Choose audio'}<input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.oga,.m4a,.aac,.aiff,.aif" disabled={loading} onChange={onFileChange} /></label>
      </div>

      <div className="mastering-transport" aria-label="Audio transport">
        <button type="button" onClick={() => void play()} disabled={!canEdit || playbackState === 'playing' || playbackState === 'starting'}>{playbackState === 'paused' ? 'Resume' : 'Play'}</button>
        <button type="button" onClick={pause} disabled={playbackState !== 'playing'}>Pause</button>
        <button type="button" onClick={() => stopPlayback(true, true)} disabled={playbackState === 'idle' && playhead === 0}>Stop</button>
        <button type="button" onClick={() => seek(playhead - 1)} disabled={!canEdit}>−1 s</button>
        <button type="button" onClick={() => seek(playhead + 1)} disabled={!canEdit}>+1 s</button>
        <label className="mastering-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} disabled={!canEdit} /> Loop</label>
        <output className="mastering-time" aria-label="Playhead time">{formatTime(playhead)}</output>
      </div>
      <p className="mastering-shortcuts"><strong>Keyboard:</strong> Space play/pause · ←/→ seek 1 second · L loop · Esc stop. Shortcuts pause while a form control is focused.</p>

      <MasteringWaveform peaks={peaks} duration={duration} playhead={playhead} selection={boundedSelection} markers={markers} regions={regions} onSeek={seek} onSelect={updateSelection} />

      <div className="mastering-columns">
        <section className="mastering-panel" aria-labelledby="selection-heading">
          <div className="mastering-panel-heading"><div><h3 id="selection-heading">Selection & precision edits</h3><p>Drag on the waveform or type exact times. Pointer gestures are never required.</p></div></div>
          <div className="workspace-grid three">
            <div className="field"><label htmlFor="mastering-selection-start">Start (seconds)</label><input id="mastering-selection-start" type="number" min="0" max={duration} step="0.001" value={boundedSelection.startSeconds} onChange={(event) => updateSelection({ ...boundedSelection, startSeconds: Number(event.target.value) })} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="mastering-selection-end">End (seconds)</label><input id="mastering-selection-end" type="number" min="0" max={duration} step="0.001" value={boundedSelection.endSeconds} onChange={(event) => updateSelection({ ...boundedSelection, endSeconds: Number(event.target.value) })} disabled={!canEdit} /></div>
            <div className="field"><span className="field-label">Duration</span><output className="mastering-readout">{(boundedSelection.endSeconds - boundedSelection.startSeconds).toFixed(3)} s</output></div>
          </div>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="mastering-marker-name">Marker name</label><input id="mastering-marker-name" type="text" value={markerName} onChange={(event) => setMarkerName(event.target.value)} placeholder={`Marker ${markers.length + 1}`} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="mastering-region-name">Region name</label><input id="mastering-region-name" type="text" value={regionName} onChange={(event) => setRegionName(event.target.value)} placeholder={`Region ${regions.length + 1}`} disabled={!canEdit} /></div>
          </div>
          <div className="button-row">
            <button type="button" onClick={snapSelectionToZero} disabled={!canEdit}>Snap to zero crossings</button>
            <button type="button" onClick={cropToSelection} disabled={!canEdit || boundedSelection.endSeconds <= boundedSelection.startSeconds}>Crop to selection</button>
            <button type="button" onClick={addMarker} disabled={!canEdit}>Add marker at playhead</button>
            <button type="button" onClick={addRegion} disabled={!canEdit || boundedSelection.endSeconds <= boundedSelection.startSeconds}>Add region from selection</button>
          </div>
        </section>

        <section className="mastering-panel" aria-labelledby="level-heading">
          <div className="mastering-panel-heading"><div><h3 id="level-heading">Level operations</h3><p>Applied operations remain reversible in this project session.</p></div></div>
          <div className="workspace-grid three">
            <div className="field"><label htmlFor="mastering-gain">Gain (dB)</label><input id="mastering-gain" type="number" min="-60" max="24" step="0.1" value={gainDb} onChange={(event) => setGainDb(Number(event.target.value))} disabled={!canEdit} /></div>
            <div className="field"><span className="field-label">Applied operations</span><output className="mastering-readout" aria-label="Applied operations">{edits.length}</output></div>
            <div className="field"><span className="field-label">Redo available</span><output className="mastering-readout" aria-label="Redo available">{redoEdits.length}</output></div>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => applyEdit({ type: 'gain', gainDb }, `Applied ${gainDb.toFixed(1)} dB gain. Undo remains available.`)} disabled={!canEdit || gainDb === 0}>Apply gain</button>
            <button type="button" onClick={() => applyEdit({ type: 'normalizePeak', targetDbfs: -1 }, 'Peak-normalized to −1.0 dBFS. Undo remains available.')} disabled={!canEdit}>Normalize peak to −1 dBFS</button>
            <button type="button" onClick={undoEdit} disabled={!edits.length}>Undo edit</button>
            <button type="button" onClick={redoEdit} disabled={!redoEdits.length}>Redo edit</button>
            <button type="button" onClick={resetEdits} disabled={!edits.length && !redoEdits.length}>Reset audio edits</button>
          </div>
        </section>
      </div>

      <section className="mastering-panel mastering-utility-panel" aria-labelledby="utility-heading">
        <div className="mastering-panel-heading"><div><h3 id="utility-heading">Repair & channel utilities</h3><p>Fast reversible transforms for common restoration and delivery fixes. Every apply operation replays from the immutable source.</p></div></div>
        <div className="workspace-grid three">
          <div className="field"><span className="field-label">DC offset by channel</span><output className="mastering-readout mastering-readout-wrap" aria-label="DC offset by channel">{dcOffsets.length ? dcOffsets.map((offset, index) => `Ch ${index + 1}: ${offset.toExponential(3)}`).join(' · ') : '—'}</output></div>
          <div className="field"><span className="field-label">Working channels</span><output className="mastering-readout" aria-label="Working channels">{currentPcm?.channels.length ?? 0}</output></div>
          <div className="field"><label htmlFor="mastering-channel">Channel target</label><select id="mastering-channel" value={activeChannelIndex} onChange={(event) => setChannelIndex(Number(event.target.value))} disabled={!canEdit}>{currentPcm?.channels.map((_, index) => <option key={index} value={index}>Channel {index + 1}</option>)}</select></div>
        </div>
        <div className="workspace-grid">
          <div className="field"><label htmlFor="mastering-silence-duration">Silence duration (seconds)</label><input id="mastering-silence-duration" type="number" min="0.001" max="3600" step="0.001" value={silenceDuration} onChange={(event) => setSilenceDuration(Number(event.target.value))} disabled={!canEdit} /></div>
          <div className="field"><span className="field-label">Insertion point</span><output className="mastering-readout">{formatTime(playhead)}</output></div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => applyEdit({ type: 'removeDc' }, 'Removed measured per-channel DC offset. Undo remains available.')} disabled={!canEdit}>Remove DC offset</button>
          <button type="button" onClick={() => applyEdit({ type: 'invertPolarity' }, 'Inverted polarity on every working channel. Undo remains available.')} disabled={!canEdit}>Invert polarity</button>
          <button type="button" onClick={() => applyEdit({ type: 'reverse', startSeconds: boundedSelection.startSeconds, endSeconds: boundedSelection.endSeconds }, 'Reversed the selected audio range. Undo remains available.')} disabled={!canEdit || boundedSelection.endSeconds <= boundedSelection.startSeconds}>Reverse selection</button>
          <button type="button" onClick={() => applyEdit({ type: 'reverse', startSeconds: 0, endSeconds: duration }, 'Reversed the complete working audio. Undo remains available.')} disabled={!canEdit}>Reverse whole audio</button>
          <button type="button" onClick={insertSilenceAtPlayhead} disabled={!canEdit || silenceDuration <= 0}>Insert silence at playhead</button>
          <button type="button" onClick={() => applyEdit({ type: 'swapStereo' }, 'Swapped the left and right channels. Undo remains available.')} disabled={!canEdit || currentPcm?.channels.length !== 2}>Swap L/R</button>
          <button type="button" onClick={() => applyEdit({ type: 'foldDownMono' }, 'Folded the working audio down to mono. Undo remains available.')} disabled={!canEdit || (currentPcm?.channels.length ?? 0) <= 1}>Fold down to mono</button>
          <button type="button" onClick={() => applyEdit({ type: 'extractChannel', channelIndex: activeChannelIndex }, `Extracted channel ${activeChannelIndex + 1}. Undo remains available.`)} disabled={!canEdit}>Extract channel</button>
          <button type="button" onClick={() => applyEdit({ type: 'dualMono', channelIndex: activeChannelIndex }, `Created dual mono from channel ${activeChannelIndex + 1}. Undo remains available.`)} disabled={!canEdit}>Create dual mono</button>
        </div>
      </section>

      {sourceInfo && <section className="mastering-panel" aria-labelledby="source-heading">
        <div className="mastering-panel-heading"><div><h3 id="source-heading">Source inspector</h3><p>Technical and descriptive metadata read from the local source.</p></div></div>
        <div className="metric-row">
          <div className="metric"><span>Codec</span><strong>{sourceInfo.codec}</strong></div>
          <div className="metric"><span>Duration</span><strong>{sourceInfo.durationSeconds.toFixed(2)} s</strong></div>
          <div className="metric"><span>Sample rate</span><strong>{sourceInfo.sampleRate.toLocaleString()} Hz</strong></div>
          <div className="metric"><span>Channels</span><strong>{sourceInfo.channelCount}</strong></div>
          <div className="metric"><span>Source size</span><strong>{formatBytes(sourceInfo.fileSize)}</strong></div>
          <div className="metric"><span>Artwork</span><strong>{metadata?.artworkCount ?? 0}</strong></div>
        </div>
        {(metadata?.title || metadata?.artist || metadata?.album) && <dl className="mastering-metadata">
          {metadata.title && <><dt>Title</dt><dd>{metadata.title}</dd></>}
          {metadata.artist && <><dt>Artist</dt><dd>{metadata.artist}</dd></>}
          {metadata.album && <><dt>Album</dt><dd>{metadata.album}</dd></>}
          {metadata.genre && <><dt>Genre</dt><dd>{metadata.genre}</dd></>}
        </dl>}
      </section>}

      {markers.length > 0 && <section className="mastering-panel" aria-labelledby="markers-heading">
        <div className="mastering-panel-heading"><div><h3 id="markers-heading">Markers</h3><p>Rename, jump to, or remove exact timeline points.</p></div></div>
        <div className="mastering-marker-list">{markers.map((marker, index) => <div key={marker.id}>
          <input type="text" aria-label={`Marker ${index + 1} name`} value={marker.label} onChange={(event) => setMarkers((current) => current.map((candidate) => candidate.id === marker.id ? { ...candidate, label: event.target.value } : candidate))} />
          <button type="button" onClick={() => seek(marker.seconds)}>Jump {formatTime(marker.seconds)}</button>
          <button type="button" aria-label={`Remove ${marker.label || `marker ${index + 1}`}`} onClick={() => setMarkers((current) => current.filter((candidate) => candidate.id !== marker.id))}>Remove</button>
        </div>)}</div>
      </section>}

      {regions.length > 0 && <section className="mastering-panel" aria-labelledby="regions-heading">
        <div className="mastering-panel-heading"><div><h3 id="regions-heading">Regions</h3><p>Named ranges can restore the exact selection and playhead in one action.</p></div></div>
        <div className="mastering-region-list">{regions.map((region, index) => <div key={region.id}>
          <input type="text" aria-label={`Region ${index + 1} name`} value={region.label} onChange={(event) => setRegions((current) => current.map((candidate) => candidate.id === region.id ? { ...candidate, label: event.target.value } : candidate))} />
          <button type="button" onClick={() => { setSelection({ startSeconds: region.startSeconds, endSeconds: region.endSeconds }); seek(region.startSeconds); }}>Select {formatTime(region.startSeconds)}–{formatTime(region.endSeconds)}</button>
          <button type="button" aria-label={`Remove ${region.label || `region ${index + 1}`}`} onClick={() => setRegions((current) => current.filter((candidate) => candidate.id !== region.id))}>Remove</button>
        </div>)}</div>
      </section>}

      <p className={`status-line ${/^Could not|failed/i.test(status) ? 'error' : ''}`} role="status" aria-live="polite">{status}</p>
    </div>
  </>;
}

