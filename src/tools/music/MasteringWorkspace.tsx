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
import { clampSelection, type AudioEdit, type MasteringMarker, type TimeSelection } from './mastering-engine';
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
  createProjectHistory,
  estimateDocumentDuration,
  redoProjectRevision,
  replaceProjectView,
  splitClipRevision,
  undoProjectRevision,
  type MasteringDocument,
  type MasteringProjectHistory,
  type SourcePlacement,
} from './mastering-project';
import { formatTime, messageOf, newId, type MasteringPanelContext } from './mastering-ui';
import MasteringTabs from './MasteringTabs';
import MasteringEditTab from './MasteringEditTab';
import MasteringTimePitchTab from './MasteringTimePitchTab';
import MasteringRepairTab from './MasteringRepairTab';

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
  const { selection, playhead } = document;
  const [sourceInfos, setSourceInfos] = useState<Record<string, AudioFileInfo>>({});
  const [render, setRender] = useState<RenderResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [viewport, setViewport] = useState<TimelineViewport>({ startSeconds: 0, spanSeconds: 0 });
  const [loop, setLoop] = useState(false);
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

  // A view that showed the whole project keeps showing all of it as the length
  // changes; a zoomed view keeps its position and is only clamped.
  const previousDurationRef = useRef(0);
  useEffect(() => {
    const previous = previousDurationRef.current;
    previousDurationRef.current = duration;
    setViewport((current) => {
      const showedAll = current.spanSeconds <= 0 || (current.startSeconds <= 1e-9 && current.spanSeconds >= previous - 1e-9);
      return showedAll || current.spanSeconds > duration ? { startSeconds: 0, spanSeconds: duration } : clampViewport(current, duration, document.sampleRate);
    });
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

  // Playback is not stopped here: the render effect stops it once the new mix
  // exists, so edits that do not change audio (markers, names) never interrupt listening.
  const commitWithStatus = (next: MasteringDocument, message: string) => {
    commitDocument(next);
    setStatus(message);
  };

  const applyEdit = (edit: AudioEdit, label: string) => {
    const current = historyRef.current.present;
    const before = findActiveClip(current);
    if (!before) return;
    const next = appendAudioEditRevision(current, edit);
    const after = findActiveClip(next);
    if (!after || after.edits.length === before.edits.length) {
      setStatus('That range falls outside the selected clip or rounds to zero samples.');
      return;
    }
    commitWithStatus(next, label);
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

  const addMarker = (name = '') => {
    if (!hasAudio) return;
    const current = historyRef.current.present;
    const label = name.trim() || `Marker ${current.markers.length + 1}`;
    const marker: MasteringMarker = { id: newId('marker'), label, seconds: Math.min(duration, Math.max(0, current.playhead)) };
    commitDocument({ ...current, markers: [...current.markers, marker] });
    setStatus(`Added ${marker.label} at ${formatTime(marker.seconds)}.`);
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
  const ctx: MasteringPanelContext = {
    document,
    latestDocument: () => historyRef.current.present,
    clip,
    clipInfo,
    clipStart,
    clipEnd,
    duration,
    playhead,
    selection: boundedSelection,
    render,
    canEdit,
    client: clientRef.current,
    commit: commitWithStatus,
    applyEdit,
    setStatus,
    updateView,
    seek,
  };

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

      {hasAudio && <MasteringTabs label="Workbench" tabs={[
        { id: 'edit', label: 'Edit', render: () => <MasteringEditTab ctx={ctx} sourceInfo={sourceInfo} onAddMarker={addMarker} /> },
        { id: 'arrange', label: 'Arrange', render: () => <MasteringArrangePanel document={document} playhead={playhead} disabled={!canEdit} onCommit={commitWithStatus} onStatus={setStatus} onActivateClip={(clipId) => updateView({ activeClipId: clipId })} onSplit={splitAtPlayhead} /> },
        { id: 'time', label: 'Time & pitch', render: () => <MasteringTimePitchTab ctx={ctx} /> },
        { id: 'repair', label: 'Repair', render: () => <MasteringRepairTab ctx={ctx} /> },
      ]} />}

      <p className={`status-line ${/^Could not|failed|could not start/i.test(status) ? 'error' : ''}`} role="status" aria-live="polite">{status}</p>
    </div>
  </>;
}
