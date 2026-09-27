/**
 * Audio Mastering workspace orchestrator.
 *
 * Owns the project history (document revisions), the DSP worker client, the
 * latest worker render, the timeline viewport, and the single live playback
 * graph. Child panels receive the document and return new revisions; the
 * worker turns each revision into the mix that playback and the timeline show.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { consumeFileInput } from '../../lib/file-input';
import { clampSelection, type AudioEdit, type MasteringMarker, type MasteringRegion, type TimeSelection } from './mastering-engine';
import { bufferToPcm, decodeAudioFile, type AudioFileInfo } from './mastering-media';
import MasteringTimeline, { clampViewport, zoomViewport, type TimelineViewport } from './MasteringTimeline';
import MasteringArrangePanel from './MasteringArrangePanel';
import { MasteringDspClient } from './mastering-dsp-client';
import type { RenderResult } from './mastering-dsp-engine';
import {
  MAX_TRACKS,
  activeClip as findActiveClip,
  addSourceTracksRevision,
  appendAudioEditRevision,
  clipDurationSeconds,
  commitProjectRevision,
  createMasteringDocument,
  createProjectHistory,
  cropProjectRevision,
  deleteRangeRevision,
  estimateDocumentDuration,
  insertSilenceRevision,
  redoProjectRevision,
  replaceProjectView,
  resetClipEditsRevision,
  splitClipRevision,
  undoProjectRevision,
  type MasteringDocument,
  type MasteringProjectHistory,
  type SourcePlacement,
} from './mastering-project';
import { formatBytes, formatTime, messageOf, newId } from './mastering-ui';

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

const ACCEPTED_AUDIO = 'audio/*,.wav,.wave,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.aiff,.aif,.caf,.webm';

/**
 * Whether a focused control should keep a key for its own native behaviour.
 * Text fields keep everything; buttons keep Space/Enter; sliders, radios, and
 * tabs also keep arrows and Home/End. Other keys still reach the shortcuts.
 */
function shortcutBlockedBy(target: EventTarget | null, key: string): boolean {
  const element = target as HTMLElement | null;
  if (!element?.closest) return false;
  if (element.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = element.closest('input') as HTMLInputElement | null;
  if (input && !['range', 'checkbox', 'radio', 'button'].includes(input.type)) return true;
  const activation = key === ' ' || key === 'Spacebar' || key === 'Enter';
  const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(key);
  if (element.closest('input[type="range"], input[type="radio"], [role="tab"], [role="slider"]')) return activation || navigation;
  if (element.closest('button, input, a[href], summary')) return activation;
  return false;
}

export default function MasteringWorkspace() {
  const [history, setHistory] = useState<MasteringProjectHistory>(() => createProjectHistory());
  const historyRef = useRef(history);
  historyRef.current = history;
  const document = history.present;
  const { selection, playhead, markers, regions } = document;
  const [sourceInfos, setSourceInfos] = useState<Record<string, AudioFileInfo>>({});
  const [render, setRender] = useState<RenderResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [viewport, setViewport] = useState<TimelineViewport>({ startSeconds: 0, spanSeconds: 0 });
  const [markerName, setMarkerName] = useState('');
  const [regionName, setRegionName] = useState('');
  const [silenceDuration, setSilenceDuration] = useState(1);
  const [snapEditBoundaries, setSnapEditBoundaries] = useState(false);
  const [channelIndex, setChannelIndex] = useState(0);
  const [loop, setLoop] = useState(false);
  const [gainDb, setGainDb] = useState(0);
  const [peakTarget, setPeakTarget] = useState(-1);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [status, setStatus] = useState('Add one or more audio files to begin. Everything stays on this device.');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const clientRef = useRef<MasteringDspClient | null>(null);
  const graphRef = useRef<PlaybackGraph | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const importRevisionRef = useRef(0);

  const commitDocument = useCallback((next: MasteringDocument) => setHistory((current) => commitProjectRevision(current, next)), []);
  const updateView = useCallback((patch: Partial<Pick<MasteringDocument, 'selection' | 'playhead' | 'activeClipId'>>) => setHistory((current) => replaceProjectView(current, patch)), []);

  const duration = estimateDocumentDuration(document);
  const clip = findActiveClip(document);
  const clipInfo = clip ? render?.clips[clip.id] : undefined;
  const clipStart = clip?.startSeconds ?? 0;
  const clipEnd = clip ? clipStart + clipDurationSeconds(document, clip) : 0;
  const boundedSelection = useMemo(() => clampSelection(selection, duration), [selection, duration]);
  const activeChannelIndex = Math.min(channelIndex, Math.max(0, (clipInfo?.channelCount ?? 1) - 1));
  const hasAudio = document.tracks.some((track) => track.clips.length > 0);
  const canEdit = hasAudio && !loading;
  const mixReady = Boolean(render && render.mix.channels[0]?.length);

  // --- SECTION: worker lifecycle and rendering ---

  useEffect(() => {
    mountedRef.current = true;
    const client = new MasteringDspClient();
    clientRef.current = client;
    return () => {
      mountedRef.current = false;
      clientRef.current = null;
      client.dispose();
    };
  }, []);

  // Only placement/edit changes affect the mix; selection, playhead, and markers do not.
  const renderKey = useMemo(() => JSON.stringify({ rate: document.sampleRate, tracks: document.tracks }), [document.sampleRate, document.tracks]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    if (!hasAudio) { setRender(null); setRendering(false); return; }
    let cancelled = false;
    setRendering(true);
    client.render(historyRef.current.present).then((result) => {
      if (cancelled || !mountedRef.current || !result) return;
      setRender(result);
      setRendering(false);
    }).catch((error: unknown) => {
      if (cancelled || !mountedRef.current) return;
      setRendering(false);
      setStatus(`Could not render the timeline: ${messageOf(error)}`);
    });
    return () => { cancelled = true; };
  }, [renderKey, hasAudio]);

  useEffect(() => {
    setViewport((current) => current.spanSeconds <= 0 || current.spanSeconds > duration ? { startSeconds: 0, spanSeconds: duration } : clampViewport(current, duration, document.sampleRate));
  }, [duration, document.sampleRate]);

  // --- SECTION: playback ---

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
    if (resetPosition) updateView({ playhead: 0 });
    if (report) setStatus('Playback stopped and the audio graph was released.');
  }, [releaseGraph, updateView]);

  useEffect(() => () => { stopPlayback(false); }, [stopPlayback]);

  // A new render means the audio changed; the playing buffer would be stale.
  useEffect(() => {
    if (graphRef.current) stopPlayback(false);
  }, [render, stopPlayback]);

  const startTicker = (graph: PlaybackGraph, mixDuration: number) => {
    const tick = () => {
      if (graphRef.current !== graph || sessionRef.current !== graph.session) return;
      const elapsed = Math.max(0, graph.context.currentTime - graph.startedAt);
      let next = graph.offset + elapsed;
      if (graph.source.loop && graph.loopEnd > graph.loopStart) {
        if (next >= graph.loopEnd) next = graph.loopStart + ((next - graph.loopStart) % (graph.loopEnd - graph.loopStart));
      } else {
        next = Math.min(mixDuration, next);
      }
      if (mountedRef.current) updateView({ playhead: next });
      graph.raf = requestAnimationFrame(tick);
    };
    graph.raf = requestAnimationFrame(tick);
  };

  const play = async () => {
    const mix = render?.mix;
    if (!mix || !mix.channels[0]?.length) {
      setStatus(hasAudio ? 'The timeline is still rendering. Try again in a moment.' : 'Add audio before starting playback.');
      return;
    }
    stopPlayback(false);
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const mixDuration = mix.channels[0].length / mix.sampleRate;
    const context = new AudioContext();
    const buffer = context.createBuffer(mix.channels.length, mix.channels[0].length, mix.sampleRate);
    mix.channels.forEach((channel, index) => { const owned = new Float32Array(channel.length); owned.set(channel); buffer.copyToChannel(owned, index); });
    const source = context.createBufferSource();
    source.buffer = buffer;
    const selected = clampSelection(selection, mixDuration);
    const hasLoopRange = loop && selected.endSeconds - selected.startSeconds > 0.002;
    source.loop = loop;
    source.loopStart = hasLoopRange ? selected.startSeconds : 0;
    source.loopEnd = hasLoopRange ? selected.endSeconds : mixDuration;
    let offset = playhead >= mixDuration ? 0 : Math.max(0, playhead);
    if (hasLoopRange && (offset < source.loopStart || offset >= source.loopEnd)) offset = source.loopStart;
    source.connect(context.destination);
    const graph: PlaybackGraph = { session, context, source, startedAt: 0, offset, loopStart: source.loopStart, loopEnd: source.loopEnd || mixDuration, raf: null };
    graphRef.current = graph;
    setPlaybackState('starting');
    setStatus('Starting local playback…');
    try {
      await context.resume();
      if (graphRef.current !== graph || sessionRef.current !== session) { releaseGraph(graph); return; }
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
          updateView({ playhead: mixDuration });
          setStatus('Playback finished and the audio graph was released.');
        }
      };
      source.start(0, offset);
      setPlaybackState('playing');
      setStatus(loop ? 'Playing with loop on.' : 'Playing.');
      startTicker(graph, mixDuration);
    } catch (error) {
      if (graphRef.current === graph) graphRef.current = null;
      releaseGraph(graph);
      if (mountedRef.current && sessionRef.current === session) {
        setPlaybackState('idle');
        setStatus(`Playback could not start: ${messageOf(error)}`);
      }
    }
  };

  const pause = () => {
    const graph = graphRef.current;
    if (!graph || playbackState !== 'playing') return;
    let pausedAt = graph.offset + Math.max(0, graph.context.currentTime - graph.startedAt);
    if (graph.source.loop && graph.loopEnd > graph.loopStart && pausedAt >= graph.loopEnd) {
      pausedAt = graph.loopStart + ((pausedAt - graph.loopStart) % (graph.loopEnd - graph.loopStart));
    }
    sessionRef.current += 1;
    graphRef.current = null;
    releaseGraph(graph);
    updateView({ playhead: Math.min(duration, pausedAt) });
    setPlaybackState('paused');
    setStatus(`Paused at ${formatTime(pausedAt)}.`);
  };

  const seek = (seconds: number) => {
    const next = Math.min(duration, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    const wasActive = playbackState === 'playing' || playbackState === 'paused';
    stopPlayback(false);
    updateView({ playhead: next });
    setPlaybackState(wasActive ? 'paused' : 'idle');
  };

  // --- SECTION: import and project lifecycle (ledger 1, 4, 10) ---

  const importFiles = useCallback(async (files: File[]) => {
    const client = clientRef.current;
    if (!client || !files.length) return;
    const revision = ++importRevisionRef.current;
    stopPlayback(false);
    const free = MAX_TRACKS - historyRef.current.present.tracks.length;
    const accepted = files.slice(0, Math.max(0, free));
    const skipped: string[] = files.slice(accepted.length).map((file) => `${file.name} (track limit of ${MAX_TRACKS} reached)`);
    if (!accepted.length) { setStatus(`No files added: ${skipped.join('; ')}.`); return; }
    setLoading(true);
    const placements: SourcePlacement[] = [];
    const infos: Record<string, AudioFileInfo> = {};
    let projectRate = historyRef.current.present.sampleRate;
    try {
      for (const [index, file] of accepted.entries()) {
        setStatus(`Reading ${file.name} (${index + 1} of ${accepted.length})…`);
        try {
          const decoded = await decodeAudioFile(file);
          if (revision !== importRevisionRef.current || !mountedRef.current) return;
          if (decoded.info.channelCount > 2) { skipped.push(`${file.name} (${decoded.info.channelCount} channels; tracks hold mono or stereo)`); continue; }
          const pcm = bufferToPcm(decoded.buffer);
          projectRate ??= pcm.sampleRate;
          if (pcm.sampleRate !== projectRate) setStatus(`Converting ${file.name} from ${pcm.sampleRate.toLocaleString()} Hz to the project rate of ${projectRate.toLocaleString()} Hz…`);
          const sourceId = newId('source');
          const loaded = await client.loadSource(sourceId, pcm, projectRate);
          if (revision !== importRevisionRef.current || !mountedRef.current) return;
          infos[sourceId] = decoded.info;
          placements.push({
            source: {
              id: sourceId, name: file.name, sampleRate: decoded.info.sampleRate, channelCount: loaded.channelCount,
              frameCount: loaded.frameCount, fileSize: file.size, lastModified: file.lastModified, codec: decoded.info.codec,
            },
            trackId: newId('track'),
            clipId: newId('clip'),
          });
        } catch (error) {
          skipped.push(`${file.name} (${messageOf(error)})`);
        }
      }
      if (!placements.length) { setStatus(`Could not open audio: ${skipped.join('; ')}.`); return; }
      const next = addSourceTracksRevision(historyRef.current.present, placements);
      setSourceInfos((current) => ({ ...current, ...infos }));
      if (!historyRef.current.present.tracks.length) setHistory(createProjectHistory(next));
      else commitDocument(next);
      const added = placements.map((placement) => placement.source.name).join(', ');
      const first = infos[placements[0].source.id];
      const detail = placements.length === 1 && first ? `: ${first.codec}, ${first.channelCount} channel${first.channelCount === 1 ? '' : 's'}, ${first.sampleRate.toLocaleString()} Hz` : '';
      setStatus(`Loaded ${added}${detail}.${skipped.length ? ` Skipped ${skipped.join('; ')}.` : ''}`);
    } catch (error) {
      setStatus(`Could not open audio: ${messageOf(error)}`);
    } finally {
      if (revision === importRevisionRef.current && mountedRef.current) setLoading(false);
    }
  }, [commitDocument, stopPlayback]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    consumeFileInput(input, () => importFiles(files));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith('audio/') || /\.(wav|wave|mp3|flac|ogg|oga|opus|m4a|aac|aiff?|caf|webm)$/i.test(file.name));
    if (files.length) void importFiles(files);
    else setStatus('Drop audio files (WAV, MP3, FLAC, Ogg, M4A, AIFF and similar).');
  };

  const clearProject = () => {
    stopPlayback(false, true);
    importRevisionRef.current += 1;
    void clientRef.current?.releaseAll().catch(() => undefined);
    setHistory(createProjectHistory());
    setSourceInfos({});
    setRender(null);
    setConfirmClear(false);
    setStatus('Started a new empty project. Add audio to begin.');
  };

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  // --- SECTION: edits on the selected clip (ledger 11, 12, 20–25, 31) ---

  const updateSelection = (next: TimeSelection) => updateView({ selection: clampSelection(next, duration) });

  const commitWithStatus = (next: MasteringDocument, message: string) => {
    stopPlayback(false);
    commitDocument(next);
    setStatus(message);
  };

  const applyEdit = (edit: AudioEdit, label: string) => {
    if (!clip) return;
    const next = appendAudioEditRevision(document, edit);
    const after = findActiveClip(next);
    if (!after || after.edits.length === clip.edits.length) {
      setStatus('That range falls outside the selected clip or rounds to zero samples.');
      return;
    }
    commitWithStatus(next, label);
  };

  const resolveEditRange = async (range: TimeSelection): Promise<TimeSelection> => {
    const selected = clampSelection(range, duration);
    if (!snapEditBoundaries || !clip || !clientRef.current) return selected;
    const [start, end] = await clientRef.current.snap(historyRef.current.present, clip.id, [selected.startSeconds, selected.endSeconds]);
    return clampSelection({ startSeconds: start, endSeconds: end }, duration);
  };

  const cropRange = async (range: TimeSelection, label: string) => {
    try {
      const selected = await resolveEditRange(range);
      const current = historyRef.current.present;
      const next = cropProjectRevision(current, selected.startSeconds, selected.endSeconds);
      if (findActiveClip(next)?.edits.length === findActiveClip(current)?.edits.length) {
        setStatus('Choose a range inside the selected clip that keeps part of it.');
        return;
      }
      commitWithStatus(next, `${label} ${formatTime(selected.startSeconds)}–${formatTime(selected.endSeconds)}. Undo is available.`);
    } catch (error) { setStatus(messageOf(error)); }
  };

  const deleteSelection = async () => {
    try {
      const selected = await resolveEditRange(selection);
      const current = historyRef.current.present;
      const next = deleteRangeRevision(current, selected.startSeconds, selected.endSeconds);
      if (findActiveClip(next)?.edits.length === findActiveClip(current)?.edits.length) {
        setStatus('Choose part of the selected clip to delete. To remove the whole clip, use Delete clip.');
        return;
      }
      commitWithStatus(next, `Deleted ${formatTime(selected.startSeconds)}–${formatTime(selected.endSeconds)}. Undo is available.`);
    } catch (error) { setStatus(messageOf(error)); }
  };

  const snapSelectionToZero = async () => {
    if (!clip || !clientRef.current) return;
    try {
      const [start, end] = await clientRef.current.snap(historyRef.current.present, clip.id, [boundedSelection.startSeconds, boundedSelection.endSeconds]);
      const next = clampSelection({ startSeconds: start, endSeconds: end }, duration);
      updateView({ selection: next });
      setStatus(`Selection snapped to nearby zero crossings at ${formatTime(next.startSeconds)} and ${formatTime(next.endSeconds)}.`);
    } catch (error) { setStatus(messageOf(error)); }
  };

  const undo = () => {
    if (!history.past.length) return;
    stopPlayback(false);
    setHistory((current) => undoProjectRevision(current));
    setStatus('Undid the last change.');
  };

  const redo = () => {
    if (!history.future.length) return;
    stopPlayback(false);
    setHistory((current) => redoProjectRevision(current));
    setStatus('Redid the change.');
  };

  const addMarker = () => {
    if (!hasAudio) return;
    const label = markerName.trim() || `Marker ${markers.length + 1}`;
    const marker: MasteringMarker = { id: newId('marker'), label, seconds: Math.min(duration, Math.max(0, playhead)) };
    commitDocument({ ...document, markers: [...markers, marker] });
    setMarkerName('');
    setStatus(`Added ${marker.label} at ${formatTime(marker.seconds)}.`);
  };

  const addRegion = () => {
    if (!hasAudio || boundedSelection.endSeconds <= boundedSelection.startSeconds) {
      setStatus('Choose a non-empty selection before creating a region.');
      return;
    }
    const label = regionName.trim() || `Region ${regions.length + 1}`;
    const region: MasteringRegion = { id: newId('region'), label, startSeconds: boundedSelection.startSeconds, endSeconds: boundedSelection.endSeconds };
    commitDocument({ ...document, regions: [...regions, region] });
    setRegionName('');
    setStatus(`Added ${region.label} from ${formatTime(region.startSeconds)} to ${formatTime(region.endSeconds)}.`);
  };

  const renameMarker = (id: string, label: string) => {
    const nextLabel = label.trim();
    const current = markers.find((marker) => marker.id === id);
    if (!current || !nextLabel || current.label === nextLabel) return;
    commitDocument({ ...document, markers: markers.map((marker) => marker.id === id ? { ...marker, label: nextLabel } : marker) });
  };

  const renameRegion = (id: string, label: string) => {
    const nextLabel = label.trim();
    const current = regions.find((region) => region.id === id);
    if (!current || !nextLabel || current.label === nextLabel) return;
    commitDocument({ ...document, regions: regions.map((region) => region.id === id ? { ...region, label: nextLabel } : region) });
  };

  const insertSilenceAtPlayhead = () => {
    if (!clip || !Number.isFinite(silenceDuration) || silenceDuration <= 0) {
      setStatus('Enter a silence duration greater than zero.');
      return;
    }
    const next = insertSilenceRevision(document, playhead, silenceDuration);
    const insertion = findActiveClip(next)?.edits.at(-1);
    if (findActiveClip(next)?.edits.length === clip.edits.length || insertion?.type !== 'insertSilence') {
      setStatus('The silence rounds to zero samples at the project sample rate.');
      return;
    }
    commitWithStatus(next, `Inserted ${insertion.durationSeconds.toFixed(3)} seconds of silence at ${formatTime(clip.startSeconds + insertion.atSeconds)}.`);
  };

  const splitAtPlayhead = () => {
    if (!clip) return;
    const next = splitClipRevision(document, clip.id, playhead, newId('clip'));
    if (next.activeClipId === document.activeClipId) { setStatus('Move the playhead inside the selected clip to split it.'); return; }
    commitWithStatus(next, `Split ${clip.name} at ${formatTime(playhead)}.`);
  };

  // --- SECTION: keyboard shortcuts (ledger 7, 81) ---

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || shortcutBlockedBy(event.target, event.key)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (mod || event.altKey || !hasAudio || loading) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (playbackState === 'playing') pause();
        else if (playbackState !== 'starting') void play();
      } else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(playhead - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); seek(playhead + 1); }
      else if (event.key === 'Home') { event.preventDefault(); seek(0); }
      else if (event.key === 'End') { event.preventDefault(); seek(duration); }
      else if (event.key === 'Escape') { if (playbackState !== 'idle' || playhead !== 0) stopPlayback(true, true); }
      else if (event.key.toLowerCase() === 'l') { setLoop((current) => !current); setStatus('Loop toggled.'); }
      else if (event.key.toLowerCase() === 's') { event.preventDefault(); splitAtPlayhead(); }
      else if (event.key === 'm' || event.key === 'M') { event.preventDefault(); addMarker(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setViewport((current) => zoomViewport(current, 0.5, playhead, duration, document.sampleRate)); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setViewport((current) => zoomViewport(current, 2, playhead, duration, document.sampleRate)); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const sourceInfo = clip ? sourceInfos[clip.sourceId] : undefined;
  const metadata = sourceInfo?.metadata;
  const selectionInsideClip = clip && boundedSelection.endSeconds > boundedSelection.startSeconds
    && boundedSelection.startSeconds < clipEnd && boundedSelection.endSeconds > clipStart;

  return <>
    <div className="workspace-header mastering-header">
      <div><h2>Audio mastering workstation</h2><p>Arrange, edit, and audition local audio with sample-accurate tools. Files never leave this device.</p></div>
      <span className="mastering-local-badge">Local processing</span>
    </div>
    <div className="workspace-body mastering-workspace">
      <div
        className={`mastering-import${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div>
          <strong>{hasAudio ? `${document.tracks.length} of ${MAX_TRACKS} tracks in use` : 'Add audio'}</strong>
          <p>{hasAudio ? 'Add more files as new tracks, or drop them here. Files at other sample rates are converted to the project rate.' : 'Choose or drop one or more audio files. Each file becomes its own track. Nothing is uploaded.'}</p>
        </div>
        <div className="mastering-import-actions">
          <label className={`mastering-file-button${loading || document.tracks.length >= MAX_TRACKS ? ' is-disabled' : ''}`}>
            {loading ? 'Reading…' : hasAudio ? 'Add audio files' : 'Choose audio files'}
            <input type="file" multiple accept={ACCEPTED_AUDIO} disabled={loading || document.tracks.length >= MAX_TRACKS} onChange={onFileChange} />
          </label>
          {hasAudio && (confirmClear
            ? <button type="button" className="mastering-danger" onClick={clearProject}>Confirm new project</button>
            : <button type="button" onClick={() => setConfirmClear(true)} disabled={loading}>New project</button>)}
        </div>
      </div>

      <div className="mastering-transport" aria-label="Audio transport">
        <button type="button" onClick={() => void play()} disabled={!canEdit || !mixReady || playbackState === 'playing' || playbackState === 'starting'}>{playbackState === 'paused' ? 'Resume' : 'Play'}</button>
        <button type="button" onClick={pause} disabled={playbackState !== 'playing'}>Pause</button>
        <button type="button" onClick={() => stopPlayback(true, true)} disabled={playbackState === 'idle' && playhead === 0}>Stop</button>
        <button type="button" onClick={() => seek(playhead - 1)} disabled={!canEdit}>−1 s</button>
        <button type="button" onClick={() => seek(playhead + 1)} disabled={!canEdit}>+1 s</button>
        <label className="mastering-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} disabled={!canEdit} /> Loop</label>
        <button type="button" onClick={undo} disabled={!history.past.length}>Undo</button>
        <button type="button" onClick={redo} disabled={!history.future.length}>Redo</button>
        {rendering && <span className="mastering-busy" role="status">Rendering…</span>}
        <output className="mastering-time" aria-label="Playhead time">{formatTime(playhead)}</output>
      </div>
      <details className="mastering-shortcuts">
        <summary>Keyboard shortcuts</summary>
        <dl>
          <div><dt>Space</dt><dd>Play or pause</dd></div>
          <div><dt>← / →</dt><dd>Seek 1 second</dd></div>
          <div><dt>Home / End</dt><dd>Jump to start or end</dd></div>
          <div><dt>Esc</dt><dd>Stop and return to start</dd></div>
          <div><dt>L</dt><dd>Loop on or off</dd></div>
          <div><dt>S</dt><dd>Split the selected clip at the playhead</dd></div>
          <div><dt>M</dt><dd>Add a marker at the playhead</dd></div>
          <div><dt>+ / −</dt><dd>Zoom the timeline around the playhead</dd></div>
          <div><dt>Ctrl/⌘ + Z</dt><dd>Undo</dd></div>
          <div><dt>Ctrl/⌘ + Shift + Z or Ctrl + Y</dt><dd>Redo</dd></div>
          <div><dt>Ctrl/⌘ + wheel</dt><dd>Zoom at the pointer; Shift + wheel scrolls sideways</dd></div>
        </dl>
        <p>Shortcuts pause while you type in a field.</p>
      </details>

      <MasteringTimeline
        document={document}
        render={render}
        duration={duration}
        playhead={playhead}
        selection={boundedSelection}
        viewport={viewport}
        playing={playbackState === 'playing'}
        onViewportChange={setViewport}
        onSeek={seek}
        onSelect={updateSelection}
        onActivateClip={(clipId) => { updateView({ activeClipId: clipId }); }}
      />

      {hasAudio && <MasteringArrangePanel
        document={document}
        playhead={playhead}
        disabled={!canEdit}
        onCommit={commitWithStatus}
        onStatus={setStatus}
        onActivateClip={(clipId) => updateView({ activeClipId: clipId })}
        onSplit={splitAtPlayhead}
      />}

      <div className="mastering-columns">
        <section className="mastering-panel" aria-labelledby="selection-heading">
          <div className="mastering-panel-heading"><div><h3 id="selection-heading">Selection & precision edits</h3><p>Drag across the waveform or type exact times. Range edits change the selected clip{clip ? ` (${clip.name})` : ''}.</p></div></div>
          <div className="workspace-grid three">
            <div className="field"><label htmlFor="mastering-selection-start">Selection start (seconds)</label><input id="mastering-selection-start" type="number" min="0" max={duration} step="0.001" value={boundedSelection.startSeconds} onChange={(event) => updateSelection({ ...boundedSelection, startSeconds: Number(event.target.value) })} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="mastering-selection-end">Selection end (seconds)</label><input id="mastering-selection-end" type="number" min="0" max={duration} step="0.001" value={boundedSelection.endSeconds} onChange={(event) => updateSelection({ ...boundedSelection, endSeconds: Number(event.target.value) })} disabled={!canEdit} /></div>
            <div className="field"><span className="field-label">Duration</span><output className="mastering-readout">{(boundedSelection.endSeconds - boundedSelection.startSeconds).toFixed(3)} s</output></div>
          </div>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="mastering-marker-name">Marker name</label><input id="mastering-marker-name" type="text" value={markerName} onChange={(event) => setMarkerName(event.target.value)} placeholder={`Marker ${markers.length + 1}`} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="mastering-region-name">Region name</label><input id="mastering-region-name" type="text" value={regionName} onChange={(event) => setRegionName(event.target.value)} placeholder={`Region ${regions.length + 1}`} disabled={!canEdit} /></div>
          </div>
          <label className="mastering-check"><input type="checkbox" checked={snapEditBoundaries} onChange={(event) => setSnapEditBoundaries(event.target.checked)} disabled={!canEdit} /> Snap crop and delete boundaries to nearby zero crossings</label>
          <div className="button-row">
            <button type="button" onClick={() => void snapSelectionToZero()} disabled={!canEdit}>Snap selection to zero crossings</button>
            <button type="button" onClick={() => { updateView({ selection: { startSeconds: clipStart, endSeconds: clipEnd } }); setStatus(`Selected all of ${clip?.name ?? 'the clip'}.`); }} disabled={!canEdit || !clip}>Select whole clip</button>
            <button type="button" onClick={() => void cropRange(selection, 'Cropped to')} disabled={!canEdit || !selectionInsideClip}>Crop to selection</button>
            <button type="button" onClick={() => void cropRange({ startSeconds: selection.startSeconds, endSeconds: clipEnd }, 'Trimmed before selection, keeping')} disabled={!canEdit || !clip || boundedSelection.startSeconds <= clipStart || boundedSelection.startSeconds >= clipEnd}>Trim before selection</button>
            <button type="button" onClick={() => void cropRange({ startSeconds: clipStart, endSeconds: selection.endSeconds }, 'Trimmed after selection, keeping')} disabled={!canEdit || !clip || boundedSelection.endSeconds >= clipEnd || boundedSelection.endSeconds <= clipStart}>Trim after selection</button>
            <button type="button" onClick={() => void deleteSelection()} disabled={!canEdit || !selectionInsideClip}>Delete selection</button>
            <button type="button" onClick={addMarker} disabled={!canEdit}>Add marker at playhead</button>
            <button type="button" onClick={addRegion} disabled={!canEdit || boundedSelection.endSeconds <= boundedSelection.startSeconds}>Add region from selection</button>
          </div>
        </section>

        <section className="mastering-panel" aria-labelledby="level-heading">
          <div className="mastering-panel-heading"><div><h3 id="level-heading">Level operations</h3><p>Applies to the selected clip. Every operation stays reversible.</p></div></div>
          <div className="workspace-grid three">
            <div className="field"><label htmlFor="mastering-gain">Gain to apply (dB)</label><input id="mastering-gain" type="number" min="-60" max="24" step="0.1" value={gainDb} onChange={(event) => setGainDb(Number(event.target.value))} disabled={!canEdit} /></div>
            <div className="field"><label htmlFor="mastering-peak-target">Peak target (dBFS)</label><input id="mastering-peak-target" type="number" min="-60" max="0" step="0.1" value={peakTarget} onChange={(event) => setPeakTarget(Math.min(0, Number(event.target.value)))} disabled={!canEdit} /></div>
            <div className="field"><span className="field-label">Clip edits</span><output className="mastering-readout" aria-label="Clip edits">{clip?.edits.length ?? 0}</output></div>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => applyEdit({ type: 'gain', gainDb }, `Applied ${gainDb.toFixed(1)} dB gain. Undo is available.`)} disabled={!canEdit || gainDb === 0}>Apply gain</button>
            <button type="button" onClick={() => applyEdit({ type: 'normalizePeak', targetDbfs: peakTarget }, `Peak-normalized to ${peakTarget.toFixed(1)} dBFS. Undo is available.`)} disabled={!canEdit || !Number.isFinite(peakTarget)}>Normalize peak</button>
            <button type="button" onClick={() => { if (clip?.edits.length) commitWithStatus(resetClipEditsRevision(document), `Reset ${clip.name} to its original audio. Undo is available.`); }} disabled={!canEdit || !clip?.edits.length}>Reset clip edits</button>
          </div>
        </section>
      </div>

      <section className="mastering-panel mastering-utility-panel" aria-labelledby="utility-heading">
        <div className="mastering-panel-heading"><div><h3 id="utility-heading">Repair & channel utilities</h3><p>Quick fixes for the selected clip. Each one replays from the untouched source, so undo is exact.</p></div></div>
        <div className="workspace-grid three">
          <div className="field"><span className="field-label">DC offset by channel</span><output className="mastering-readout mastering-readout-wrap" aria-label="DC offset by channel">{clipInfo?.dcOffsets.length ? clipInfo.dcOffsets.map((offset, index) => `Ch ${index + 1}: ${offset.toExponential(3)}`).join(' · ') : '—'}</output></div>
          <div className="field"><span className="field-label">Working channels</span><output className="mastering-readout" aria-label="Working channels">{clipInfo?.channelCount ?? 0}</output></div>
          <div className="field"><label htmlFor="mastering-channel">Channel target</label><select id="mastering-channel" value={activeChannelIndex} onChange={(event) => setChannelIndex(Number(event.target.value))} disabled={!canEdit}>{Array.from({ length: clipInfo?.channelCount ?? 1 }, (_, index) => <option key={index} value={index}>Channel {index + 1}</option>)}</select></div>
        </div>
        <div className="workspace-grid">
          <div className="field"><label htmlFor="mastering-silence-duration">Silence duration (seconds)</label><input id="mastering-silence-duration" type="number" min="0.001" max="3600" step="0.001" value={silenceDuration} onChange={(event) => setSilenceDuration(Number(event.target.value))} disabled={!canEdit} /></div>
          <div className="field"><span className="field-label">Insertion point</span><output className="mastering-readout">{formatTime(playhead)}</output></div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => applyEdit({ type: 'removeDc' }, 'Removed the measured DC offset from each channel. Undo is available.')} disabled={!canEdit}>Remove DC offset</button>
          <button type="button" onClick={() => applyEdit({ type: 'invertPolarity' }, 'Inverted polarity on every channel. Undo is available.')} disabled={!canEdit}>Invert polarity</button>
          <button type="button" onClick={() => applyEdit({ type: 'reverse', startSeconds: boundedSelection.startSeconds, endSeconds: boundedSelection.endSeconds }, 'Reversed the selected range. Undo is available.')} disabled={!canEdit || !selectionInsideClip}>Reverse selection</button>
          <button type="button" onClick={() => applyEdit({ type: 'reverse', startSeconds: clipStart, endSeconds: clipEnd }, 'Reversed the whole clip. Undo is available.')} disabled={!canEdit || !clip}>Reverse whole clip</button>
          <button type="button" onClick={insertSilenceAtPlayhead} disabled={!canEdit || silenceDuration <= 0}>Insert silence at playhead</button>
          <button type="button" onClick={() => applyEdit({ type: 'swapStereo' }, 'Swapped left and right. Undo is available.')} disabled={!canEdit || clipInfo?.channelCount !== 2}>Swap L/R</button>
          <button type="button" onClick={() => applyEdit({ type: 'foldDownMono' }, 'Folded the clip down to mono. Undo is available.')} disabled={!canEdit || (clipInfo?.channelCount ?? 0) <= 1}>Fold down to mono</button>
          <button type="button" onClick={() => applyEdit({ type: 'extractChannel', channelIndex: activeChannelIndex }, `Kept only channel ${activeChannelIndex + 1}. Undo is available.`)} disabled={!canEdit || (clipInfo?.channelCount ?? 0) <= 1}>Extract channel</button>
          <button type="button" onClick={() => applyEdit({ type: 'dualMono', channelIndex: activeChannelIndex }, `Made dual mono from channel ${activeChannelIndex + 1}. Undo is available.`)} disabled={!canEdit}>Create dual mono</button>
        </div>
      </section>

      {sourceInfo && <section className="mastering-panel" aria-labelledby="source-heading">
        <div className="mastering-panel-heading"><div><h3 id="source-heading">Source inspector</h3><p>What the selected clip's original file contains, read locally.</p></div></div>
        <div className="metric-row">
          <div className="metric"><span>File</span><strong className="mastering-wrap">{sourceInfo.fileName}</strong></div>
          <div className="metric"><span>Codec</span><strong>{sourceInfo.codec}</strong></div>
          <div className="metric"><span>Duration</span><strong>{sourceInfo.durationSeconds.toFixed(2)} s</strong></div>
          <div className="metric"><span>Sample rate</span><strong>{sourceInfo.sampleRate.toLocaleString()} Hz</strong></div>
          <div className="metric"><span>Channels</span><strong>{sourceInfo.channelCount}</strong></div>
          <div className="metric"><span>Source size</span><strong>{formatBytes(sourceInfo.fileSize)}</strong></div>
          <div className="metric"><span>Artwork</span><strong>{metadata?.artworkCount ?? 0}</strong></div>
        </div>
        {document.sampleRate && sourceInfo.sampleRate !== document.sampleRate && <p className="help-text">Converted to the project rate of {document.sampleRate.toLocaleString()} Hz on import with a band-limited resampler.</p>}
        {(metadata?.title || metadata?.artist || metadata?.album || metadata?.genre) && <dl className="mastering-metadata">
          {metadata.title && <><dt>Title</dt><dd>{metadata.title}</dd></>}
          {metadata.artist && <><dt>Artist</dt><dd>{metadata.artist}</dd></>}
          {metadata.album && <><dt>Album</dt><dd>{metadata.album}</dd></>}
          {metadata.genre && <><dt>Genre</dt><dd>{metadata.genre}</dd></>}
        </dl>}
      </section>}

      {markers.length > 0 && <section className="mastering-panel" aria-labelledby="markers-heading">
        <div className="mastering-panel-heading"><div><h3 id="markers-heading">Markers</h3><p>Rename, jump to, or remove exact timeline points.</p></div></div>
        <div className="mastering-marker-list">{markers.map((marker, index) => <div key={marker.id}>
          <input type="text" aria-label={`Marker ${index + 1} name`} defaultValue={marker.label} onBlur={(event) => renameMarker(marker.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <button type="button" onClick={() => seek(marker.seconds)}>Jump {formatTime(marker.seconds)}</button>
          <button type="button" aria-label={`Remove ${marker.label || `marker ${index + 1}`}`} onClick={() => commitDocument({ ...document, markers: markers.filter((candidate) => candidate.id !== marker.id) })}>Remove</button>
        </div>)}</div>
      </section>}

      {regions.length > 0 && <section className="mastering-panel" aria-labelledby="regions-heading">
        <div className="mastering-panel-heading"><div><h3 id="regions-heading">Regions</h3><p>Named ranges restore the exact selection and playhead in one action.</p></div></div>
        <div className="mastering-region-list">{regions.map((region, index) => <div key={region.id}>
          <input type="text" aria-label={`Region ${index + 1} name`} defaultValue={region.label} onBlur={(event) => renameRegion(region.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <button type="button" onClick={() => { seek(region.startSeconds); updateView({ selection: { startSeconds: region.startSeconds, endSeconds: region.endSeconds }, playhead: region.startSeconds }); }}>Select {formatTime(region.startSeconds)}–{formatTime(region.endSeconds)}</button>
          <button type="button" aria-label={`Remove ${region.label || `region ${index + 1}`}`} onClick={() => commitDocument({ ...document, regions: regions.filter((candidate) => candidate.id !== region.id) })}>Remove</button>
        </div>)}</div>
      </section>}

      <p className={`status-line ${/^Could not|failed|could not start/i.test(status) ? 'error' : ''}`} role="status" aria-live="polite">{status}</p>
    </div>
  </>;
}
