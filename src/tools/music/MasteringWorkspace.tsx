/**
 * Audio Mastering workspace orchestrator.
 *
 * Owns the project history (document revisions), the DSP worker client, the
 * latest worker render, the timeline viewport, and the single live playback
 * graph. Child panels receive the document and return new revisions; the
 * worker turns each revision into the mix that playback and the timeline show.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { downloadBytes } from '../../lib/download';
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
  updateMasterRevision,
  type MasteringDocument,
  type MasteringProjectHistory,
  type SourcePlacement,
} from './mastering-project';
import { formatTime, messageOf, newId, type MasteringPanelContext } from './mastering-ui';
import MasteringTabs from './MasteringTabs';
import MasteringExportTab from './MasteringExportTab';
import MasteringProjectTab, { type AutosaveState } from './MasteringProjectTab';
import MasteringPresets from './MasteringPresets';
import { safeFileName } from './mastering-export';
import { MasteringStore, buildProjectBackup, isQuotaError, readProjectBackup, type StoredSession } from './mastering-persistence';
import MasteringEditTab from './MasteringEditTab';
import MasteringTimePitchTab from './MasteringTimePitchTab';
import MasteringRepairTab from './MasteringRepairTab';
import MasteringMasterTab from './MasteringMasterTab';
import MasteringSpectrogram from './MasteringSpectrogram';
import type { Spectrogram } from './dsp/spectrogram';
import MasteringMeters, { type MonitorState } from './MasteringMeters';
import masterWorkletUrl from './mastering-master.worklet.ts?worker&url';
import type { ListenSource, WorkletInbound, WorkletMeterMessage } from './mastering-worklet-protocol';
import type { MasterSettings } from './dsp/master-chain';

type PlaybackState = 'idle' | 'starting' | 'playing' | 'paused';
type PlaybackGraph = {
  session: number;
  context: AudioContext;
  source: AudioBufferSourceNode;
  /** Realtime master chain; null when AudioWorklet could not load (direct output fallback). */
  master: AudioWorkletNode | null;
  reference: AudioBufferSourceNode | null;
  pre: AnalyserNode;
  post: AnalyserNode;
  startedAt: number;
  offset: number;
  loopStart: number;
  loopEnd: number;
  /** Seconds the processed audio lags the source (chain latency), from worklet reports. */
  latencySeconds: number;
  raf: number | null;
};

/** Timeline position heard at a context time, accounting for loops and chain latency. */
function timelinePosition(graph: PlaybackGraph, contextTime: number, duration: number): number {
  let position = graph.offset + Math.max(0, contextTime - graph.startedAt - graph.latencySeconds);
  if (graph.source.loop && graph.loopEnd > graph.loopStart && position >= graph.loopEnd) {
    position = graph.loopStart + ((position - graph.loopStart) % (graph.loopEnd - graph.loopStart));
  }
  return Math.min(duration, position);
}

/** An AudioContext at the project rate avoids resampling on playback; browsers that refuse the rate get their default. */
function createPlaybackContext(sampleRate: number): AudioContext {
  try { return new AudioContext({ sampleRate, latencyHint: 'playback' }); } catch { return new AudioContext({ latencyHint: 'playback' }); }
}

/** Quiet period after the last edit before the session is written to browser storage. */
const AUTOSAVE_DELAY_MS = 1000;

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
  const [masterPreview, setMasterPreview] = useState<MasterSettings | null>(null);
  const [monitor, setMonitor] = useState<MonitorState>({ listen: 'processed', monitor: 'stereo', mono: false, matchLoudness: true, excursionThresholdDb: -1 });
  const [meters, setMeters] = useState<WorkletMeterMessage | null>(null);
  const [analysers, setAnalysers] = useState<{ pre: AnalyserNode; post: AnalyserNode } | null>(null);
  const [reference, setReference] = useState<{ name: string; buffer: AudioBuffer } | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [loudnessTarget, setLoudnessTarget] = useState(-14);
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [spectrogram, setSpectrogram] = useState<Spectrogram | null>(null);
  const [spectrogramLoading, setSpectrogramLoading] = useState(false);
  const clientRef = useRef<MasteringDspClient | null>(null);
  const graphRef = useRef<PlaybackGraph | null>(null);
  /** Timing of the most recent playback session, kept after stop so logged excursions still map to the timeline. */
  const lastGraphRef = useRef<PlaybackGraph | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const importRevisionRef = useRef(0);
  const [store, setStore] = useState<MasteringStore | null>(null);
  /** Identifies this tab's autosave session; restoring a session adopts its id. */
  const sessionIdRef = useRef(newId('session'));
  /** Original bytes of every loaded source, kept for autosave and backups. */
  const sourceFilesRef = useRef(new Map<string, Blob>());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [recovery, setRecovery] = useState<StoredSession | null>(null);
  const [autosave, setAutosave] = useState<AutosaveState>({ state: 'starting' });
  const [projectBusy, setProjectBusy] = useState(false);
  const shortcutsRef = useRef<HTMLDetailsElement | null>(null);

  const commitDocument = useCallback((next: MasteringDocument) => setHistory((current) => commitProjectRevision(current, next)), []);
  const updateView = useCallback((patch: Partial<Pick<MasteringDocument, 'selection' | 'playhead' | 'activeClipId'>>) => setHistory((current) => replaceProjectView(current, patch)), []);

  // The worklet always runs the live settings: a control being dragged, otherwise the committed ones.
  const liveMaster = masterPreview ?? document.master;
  const liveMasterRef = useRef(liveMaster);
  liveMasterRef.current = liveMaster;
  const monitorRef = useRef(monitor);
  monitorRef.current = monitor;

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

  // --- SECTION: autosave and recovery (ledger 18) ---

  useEffect(() => {
    let cancelled = false;
    let opened: MasteringStore | null = null;
    MasteringStore.open().then(async (value) => {
      opened = value;
      if (cancelled) { value.close(); return; }
      setStore(value);
      setAutosave({ state: 'idle' });
      try {
        const sessions = await value.listSessions();
        // Offer the newest session from another tab or an earlier visit, never this tab's own.
        const candidate = sessions.find((session) => session.id !== sessionIdRef.current && session.document.tracks.some((track) => track.clips.length));
        if (!cancelled && candidate) setRecovery(candidate);
      } catch { /* an unreadable session list only means nothing is offered */ }
    }).catch((error: unknown) => {
      if (!cancelled) setAutosave({ state: 'unavailable', message: messageOf(error) });
    });
    return () => { cancelled = true; opened?.close(); };
  }, []);

  /** Writes the current document now; queued behind any save already running. */
  const saveNow = useCallback(() => {
    if (!store) return;
    const snapshot = historyRef.current.present;
    const sessionId = sessionIdRef.current;
    const files = new Map(sourceFilesRef.current);
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (snapshot.tracks.some((track) => track.clips.length)) {
        await store.saveSession(sessionId, snapshot, files);
        await store.pruneSessions(sessionId);
        if (mountedRef.current) setAutosave({ state: 'saved', at: Date.now() });
      } else {
        await store.deleteSession(sessionId);
        if (mountedRef.current) setAutosave({ state: 'idle' });
      }
    }).catch((error: unknown) => {
      if (mountedRef.current) setAutosave(isQuotaError(error) ? { state: 'full' } : { state: 'unavailable', message: messageOf(error) });
    });
  }, [store]);

  // Saves after a quiet second. View-only changes (playhead, active clip) keep the same
  // references for everything listed here, so playback never triggers writes.
  const pendingSaveRef = useRef<number | null>(null);
  useEffect(() => {
    if (!store) return;
    pendingSaveRef.current = window.setTimeout(() => { pendingSaveRef.current = null; saveNow(); }, AUTOSAVE_DELAY_MS);
    return () => {
      if (pendingSaveRef.current !== null) window.clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    };
  }, [store, saveNow, document.sampleRate, document.sources, document.tracks, document.markers, document.regions, document.master, document.metadataEdits, document.selection]);

  // Closing, reloading, or backgrounding the tab (where mobile browsers may kill it) writes a
  // pending save at once; browsers let an IndexedDB transaction started here finish.
  useEffect(() => {
    const flush = () => {
      if (pendingSaveRef.current === null) return;
      window.clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
      saveNow();
    };
    const onVisibility = () => { if (window.document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    window.document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saveNow]);

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
      setStatus(`Could not render the timeline: ${messageOf(error)} Undo the last change to return to the previous version.`);
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

  // The spectrogram is analysed only while shown, once per new render; older results are ignored.
  useEffect(() => {
    const client = clientRef.current;
    if (!showSpectrogram || !render || !client || !render.mix.channels[0]?.length) { if (!render) setSpectrogram(null); return; }
    let cancelled = false;
    setSpectrogramLoading(true);
    client.spectrogram().then((result) => {
      if (!cancelled && mountedRef.current) setSpectrogram(result);
    }).catch((error: unknown) => {
      if (!cancelled && mountedRef.current) setStatus(`Could not draw the spectrogram: ${messageOf(error)}`);
    }).finally(() => {
      if (!cancelled && mountedRef.current) setSpectrogramLoading(false);
    });
    return () => { cancelled = true; };
  }, [render, showSpectrogram]);

  // --- SECTION: playback ---

  const releaseGraph = useCallback((graph: PlaybackGraph) => {
    if (graph.raf !== null) cancelAnimationFrame(graph.raf);
    graph.raf = null;
    for (const node of [graph.source, graph.reference]) {
      if (!node) continue;
      try { node.onended = null; node.stop(); } catch { /* source may already have ended */ }
    }
    if (graph.master) graph.master.port.onmessage = null;
    for (const node of [graph.source, graph.reference, graph.master, graph.pre, graph.post]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
    if (graph.context.state !== 'closed') void graph.context.close().catch(() => undefined);
    if (mountedRef.current) setAnalysers(null);
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
      if (mountedRef.current) updateView({ playhead: timelinePosition(graph, graph.context.currentTime, mixDuration) });
      graph.raf = requestAnimationFrame(tick);
    };
    graph.raf = requestAnimationFrame(tick);
  };

  const play = async () => {
    const mix = render?.mix;
    // While a render is pending the stored mix predates the latest edit.
    if (rendering || !mix || !mix.channels[0]?.length) {
      setStatus(hasAudio ? 'The timeline is still rendering. Try again in a moment.' : 'Add audio before starting playback.');
      return;
    }
    stopPlayback(false);
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const mixDuration = mix.channels[0].length / mix.sampleRate;
    const context = createPlaybackContext(mix.sampleRate);
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
    const pre = context.createAnalyser();
    const post = context.createAnalyser();
    for (const analyser of [pre, post]) { analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.75; }
    const graph: PlaybackGraph = { session, context, source, master: null, reference: null, pre, post, startedAt: 0, offset, loopStart: source.loopStart, loopEnd: source.loopEnd || mixDuration, latencySeconds: 0, raf: null };
    graphRef.current = graph;
    lastGraphRef.current = graph;
    setMeters(null);
    setPlaybackState('starting');
    setStatus('Starting local playback…');
    try {
      let workletError: string | null = null;
      try {
        await context.audioWorklet.addModule(masterWorkletUrl);
        graph.master = new AudioWorkletNode(context, 'mastering-master', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
      } catch (error) {
        workletError = messageOf(error);
      }
      if (graphRef.current !== graph || sessionRef.current !== session) { releaseGraph(graph); return; }
      source.connect(pre);
      if (graph.master) {
        const node = graph.master;
        node.port.onmessage = (event: MessageEvent<WorkletMeterMessage>) => {
          if (graphRef.current !== graph || !mountedRef.current) return;
          graph.latencySeconds = event.data.latencyFrames / context.sampleRate;
          setMeters(event.data);
        };
        node.port.postMessage({ type: 'settings', settings: liveMasterRef.current } satisfies WorkletInbound);
        node.port.postMessage({ type: 'monitor', ...monitorRef.current } satisfies WorkletInbound);
        source.connect(node, 0, 0);
        if (reference) {
          const referenceSource = context.createBufferSource();
          referenceSource.buffer = reference.buffer;
          referenceSource.connect(node, 0, 1);
          graph.reference = referenceSource;
        }
        node.connect(post);
      } else {
        source.connect(post);
      }
      post.connect(context.destination);
      await context.resume();
      if (graphRef.current !== graph || sessionRef.current !== session) { releaseGraph(graph); return; }
      graph.startedAt = context.currentTime;
      source.onended = () => {
        if (source.loop || graphRef.current !== graph || sessionRef.current !== session) return;
        graphRef.current = null;
        releaseGraph(graph);
        if (mountedRef.current) {
          setPlaybackState('idle');
          updateView({ playhead: mixDuration });
          setStatus('Playback finished and the audio graph was released.');
        }
      };
      source.start(0, offset);
      if (graph.reference && reference && offset < reference.buffer.duration) graph.reference.start(0, offset);
      setAnalysers({ pre, post });
      setPlaybackState('playing');
      setStatus(workletError
        ? `Playing without the master chain: this browser could not start the audio processor (${workletError}).`
        : loop ? 'Playing with loop on.' : 'Playing.');
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
    const pausedAt = timelinePosition(graph, graph.context.currentTime, duration);
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

  useEffect(() => {
    graphRef.current?.master?.port.postMessage({ type: 'settings', settings: liveMaster } satisfies WorkletInbound);
  }, [liveMaster]);

  useEffect(() => {
    graphRef.current?.master?.port.postMessage({ type: 'monitor', ...monitor } satisfies WorkletInbound);
  }, [monitor]);

  const setListen = (listen: ListenSource) => {
    setMonitor((current) => ({ ...current, listen }));
    const names: Record<ListenSource, string> = { processed: 'the processed master', original: 'the original mix', delta: 'only what the master chain changes', reference: 'the reference track' };
    setStatus(`Listening to ${names[listen]}${monitor.matchLoudness && listen !== 'processed' && listen !== 'delta' ? ', loudness-matched' : ''}.`);
  };

  const loadReference = async (file: File) => {
    setReferenceBusy(true);
    try {
      const decoded = await decodeAudioFile(file);
      if (!mountedRef.current) return;
      setReference({ name: file.name, buffer: decoded.buffer });
      setStatus(`Loaded ${file.name} as the reference. It joins playback the next time you press Play.`);
    } catch (error) {
      setStatus(`Could not open the reference: ${messageOf(error)}`);
    } finally {
      if (mountedRef.current) setReferenceBusy(false);
    }
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
    const blobs = new Map<string, Blob>();
    let projectRate = historyRef.current.present.sampleRate;
    // A newer import or a cleared project supersedes this batch; sources it already
    // handed to the worker would otherwise stay decoded there with no clip using them.
    const abandon = (extra?: string) => {
      for (const id of [...placements.map((placement) => placement.source.id), ...(extra ? [extra] : [])]) void client.releaseSource(id).catch(() => undefined);
    };
    try {
      for (const [index, file] of accepted.entries()) {
        setStatus(`Reading ${file.name} (${index + 1} of ${accepted.length})…`);
        try {
          const decoded = await decodeAudioFile(file);
          if (revision !== importRevisionRef.current || !mountedRef.current) { abandon(); return; }
          if (decoded.info.channelCount > 2) { skipped.push(`${file.name} (${decoded.info.channelCount} channels; tracks hold mono or stereo)`); continue; }
          const pcm = bufferToPcm(decoded.buffer);
          projectRate ??= pcm.sampleRate;
          if (pcm.sampleRate !== projectRate) setStatus(`Converting ${file.name} from ${pcm.sampleRate.toLocaleString()} Hz to the project rate of ${projectRate.toLocaleString()} Hz…`);
          const sourceId = newId('source');
          const loaded = await client.loadSource(sourceId, pcm, projectRate);
          if (revision !== importRevisionRef.current || !mountedRef.current) { abandon(sourceId); return; }
          infos[sourceId] = decoded.info;
          blobs.set(sourceId, file);
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
      for (const [id, blob] of blobs) sourceFilesRef.current.set(id, blob);
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
    sourceFilesRef.current = new Map();
    setRender(null);
    setConfirmClear(false);
    setStatus('Started a new empty project. Add audio to begin.');
  };

  // --- SECTION: reopening saved projects (ledgers 18, 81) ---

  /**
   * Replaces the project with a saved one: decodes each stored file under its original
   * source id, then swaps the document in. The current project stays intact until every
   * file has loaded, so a failed restore changes nothing.
   */
  const openProject = useCallback(async (saved: MasteringDocument, files: ReadonlyMap<string, Blob>, label: string, adoptSessionId?: string) => {
    const client = clientRef.current;
    if (!client) return;
    const revision = ++importRevisionRef.current;
    stopPlayback(false);
    setLoading(true);
    const previousIds = new Set(historyRef.current.present.sources.map((source) => source.id));
    const loadedIds: string[] = [];
    const infos: Record<string, AudioFileInfo> = {};
    let next = saved;
    const lengthChanges: string[] = [];
    try {
      for (const [index, source] of saved.sources.entries()) {
        const blob = files.get(source.id);
        if (!blob) throw new Error(`the audio for ${source.name} is missing.`);
        setStatus(`Reopening ${source.name} (${index + 1} of ${saved.sources.length})…`);
        const decoded = await decodeAudioFile(new File([blob], source.name, { lastModified: source.lastModified }));
        if (revision !== importRevisionRef.current || !mountedRef.current) return;
        const loaded = await client.loadSource(source.id, bufferToPcm(decoded.buffer), saved.sampleRate ?? decoded.buffer.sampleRate);
        loadedIds.push(source.id);
        if (revision !== importRevisionRef.current || !mountedRef.current) return;
        infos[source.id] = decoded.info;
        // Another browser's decoder can pad a compressed file differently; edits are timed in seconds, so record the new length and say so.
        if (loaded.frameCount !== source.frameCount) {
          lengthChanges.push(source.name);
          next = { ...next, sources: next.sources.map((item) => (item.id === source.id ? { ...item, frameCount: loaded.frameCount } : item)) };
        }
      }
      for (const id of previousIds) if (!next.sources.some((source) => source.id === id)) void client.releaseSource(id).catch(() => undefined);
      sourceFilesRef.current = new Map(next.sources.map((source) => [source.id, files.get(source.id)!]));
      if (adoptSessionId) sessionIdRef.current = adoptSessionId;
      setRecovery(null);
      setSourceInfos(infos);
      setHistory(createProjectHistory(next));
      const count = next.tracks.length;
      setStatus(`${label} ${count} track${count === 1 ? '' : 's'} and ${next.sources.length} audio file${next.sources.length === 1 ? '' : 's'}.${lengthChanges.length ? ` ${lengthChanges.join(', ')} decoded to a slightly different length in this browser; listen to edits near their ends.` : ''}`);
    } catch (error) {
      for (const id of loadedIds) if (!previousIds.has(id)) void client.releaseSource(id).catch(() => undefined);
      if (mountedRef.current) setStatus(`Could not reopen the project: ${messageOf(error)} Your current project is unchanged.`);
    } finally {
      if (revision === importRevisionRef.current && mountedRef.current) setLoading(false);
    }
  }, [stopPlayback]);

  const restoreSession = async () => {
    if (!store || !recovery) return;
    try {
      const files = await store.loadSources(recovery.id, recovery.document.sources.map((source) => source.id));
      await openProject(recovery.document, files, 'Restored your session:', recovery.id);
    } catch (error) { setStatus(`Could not restore the session: ${messageOf(error)}`); }
  };

  const discardSession = async () => {
    if (!recovery) return;
    const id = recovery.id;
    setRecovery(null);
    try {
      await store?.deleteSession(id);
      setStatus('Discarded the saved session.');
    } catch (error) { setStatus(`Could not discard the saved session: ${messageOf(error)}`); }
  };

  const saveBackup = async () => {
    setProjectBusy(true);
    try {
      const snapshot = historyRef.current.present;
      const bytes = await buildProjectBackup(snapshot, sourceFilesRef.current);
      const name = `${safeFileName((snapshot.sources[0]?.name ?? 'project').replace(/\.[^.]+$/, ''), 'project')} project.zip`;
      downloadBytes(bytes, name, 'application/zip');
      setStatus(`Saved ${name} with ${snapshot.sources.length} audio file${snapshot.sources.length === 1 ? '' : 's'}. Open it here to carry on later.`);
    } catch (error) { setStatus(`Could not save the backup: ${messageOf(error)}`); }
    finally { if (mountedRef.current) setProjectBusy(false); }
  };

  const restoreBackup = async (file: File) => {
    setProjectBusy(true);
    try {
      const backup = await readProjectBackup(file);
      await openProject(backup.document, backup.sources, `Opened ${file.name}:`);
    } catch (error) { setStatus(`Could not open ${file.name}: ${messageOf(error)}`); }
    finally { if (mountedRef.current) setProjectBusy(false); }
  };

  const onBackupFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    consumeFileInput(input, () => (file ? restoreBackup(file) : undefined));
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
      if (!mod && !event.altKey && event.key === '?') {
        event.preventDefault();
        const details = shortcutsRef.current;
        if (details) { details.open = true; details.scrollIntoView({ block: 'nearest' }); details.querySelector('summary')?.focus(); }
        return;
      }
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
      else if (event.key.toLowerCase() === 'a') { event.preventDefault(); setListen(monitor.listen === 'processed' ? 'original' : 'processed'); }
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
    rendering,
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
      {recovery && !hasAudio && <section className="mastering-recovery" aria-labelledby="mastering-recovery-heading">
        <div>
          <h3 id="mastering-recovery-heading">Pick up where you left off?</h3>
          <p>Your session from {new Date(recovery.savedAt).toLocaleString()} is saved on this device: {recovery.sourceNames.slice(0, 3).join(', ')}{recovery.sourceNames.length > 3 ? ` and ${recovery.sourceNames.length - 3} more` : ''}.</p>
        </div>
        <div className="button-row">
          <button type="button" className="mastering-primary" onClick={() => void restoreSession()} disabled={loading}>Restore session</button>
          <button type="button" onClick={() => void discardSession()} disabled={loading}>Discard it</button>
        </div>
      </section>}
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
          {!hasAudio && <label className={`mastering-file-button mastering-file-secondary${loading || projectBusy ? ' is-disabled' : ''}`}>
            Open project backup
            <input type="file" accept=".zip,application/zip" disabled={loading || projectBusy} onChange={onBackupFile} />
          </label>}
          {hasAudio && (confirmClear
            ? <button type="button" className="mastering-danger" onClick={clearProject}>Confirm new project</button>
            : <button type="button" onClick={() => setConfirmClear(true)} disabled={loading}>New project</button>)}
        </div>
      </div>

      {/* Transport, shortcuts, and timeline appear once there is audio to act on; an empty
          project shows only the ways to add some. */}
      {hasAudio && <>
      <div className="mastering-transport" aria-label="Audio transport">
        <button type="button" onClick={() => void play()} disabled={!canEdit || !mixReady || rendering || playbackState === 'playing' || playbackState === 'starting'}>{playbackState === 'paused' ? 'Resume' : 'Play'}</button>
        <button type="button" onClick={pause} disabled={playbackState !== 'playing'}>Pause</button>
        <button type="button" onClick={() => stopPlayback(true, true)} disabled={playbackState === 'idle' && playhead === 0}>Stop</button>
        <button type="button" onClick={() => seek(playhead - 1)} disabled={!canEdit}>−1 s</button>
        <button type="button" onClick={() => seek(playhead + 1)} disabled={!canEdit}>+1 s</button>
        <label className="mastering-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} disabled={!canEdit} /> Loop</label>
        <button type="button" onClick={undo} disabled={!history.past.length}>Undo</button>
        <button type="button" onClick={redo} disabled={!history.future.length}>Redo</button>
        <div className="mastering-listen" role="radiogroup" aria-label="Listen to">
          {([['processed', 'Processed'], ['original', 'Original'], ['delta', 'Difference'], ['reference', 'Reference']] as const).map(([value, label]) => <button key={value} type="button" role="radio"
            aria-checked={monitor.listen === value} disabled={value === 'reference' && !reference}
            title={value === 'reference' && !reference ? 'Load a reference track on the Meters tab first' : undefined}
            onClick={() => setListen(value)}>{label}</button>)}
        </div>
        {rendering && <span className="mastering-busy" role="status">Rendering…</span>}
        <output className="mastering-time" aria-label="Playhead time">{formatTime(playhead)}</output>
      </div>
      <details className="mastering-shortcuts" ref={shortcutsRef}>
        <summary>Keyboard shortcuts</summary>
        <dl>
          <div><dt>Space</dt><dd>Play or pause</dd></div>
          <div><dt>← / →</dt><dd>Seek 1 second</dd></div>
          <div><dt>Home / End</dt><dd>Jump to start or end</dd></div>
          <div><dt>Esc</dt><dd>Stop and return to start</dd></div>
          <div><dt>L</dt><dd>Loop on or off</dd></div>
          <div><dt>S</dt><dd>Split the selected clip at the playhead</dd></div>
          <div><dt>M</dt><dd>Add a marker at the playhead</dd></div>
          <div><dt>A</dt><dd>Switch between the processed master and the original</dd></div>
          <div><dt>+ / −</dt><dd>Zoom the timeline around the playhead</dd></div>
          <div><dt>Ctrl/⌘ + Z</dt><dd>Undo</dd></div>
          <div><dt>Ctrl/⌘ + Shift + Z or Ctrl + Y</dt><dd>Redo</dd></div>
          <div><dt>?</dt><dd>Show this list</dd></div>
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
      </>}

      {hasAudio && <label className="mastering-check mastering-spectrogram-toggle"><input type="checkbox" checked={showSpectrogram} onChange={(event) => setShowSpectrogram(event.target.checked)} /> Show spectrogram</label>}
      {hasAudio && showSpectrogram && <MasteringSpectrogram ctx={ctx} spectrogram={spectrogram} loading={spectrogramLoading}
        viewport={clampViewport(viewport, duration, document.sampleRate)} onSelect={updateSelection} onSeek={seek} />}

      {hasAudio && <MasteringTabs label="Workbench" tabs={[
        { id: 'edit', label: 'Edit', render: () => <MasteringEditTab ctx={ctx} sourceInfo={sourceInfo} onAddMarker={addMarker} /> },
        { id: 'arrange', label: 'Arrange', render: () => <MasteringArrangePanel document={document} playhead={playhead} disabled={!canEdit} onCommit={commitWithStatus} onStatus={setStatus} onActivateClip={(clipId) => updateView({ activeClipId: clipId })} onSplit={splitAtPlayhead} /> },
        { id: 'time', label: 'Time & pitch', render: () => <MasteringTimePitchTab ctx={ctx} /> },
        { id: 'repair', label: 'Repair', render: () => <MasteringRepairTab ctx={ctx} /> },
        { id: 'master', label: 'Master', render: () => <MasteringMasterTab ctx={ctx} master={document.master} onPreview={setMasterPreview}
          presets={<MasteringPresets store={store} master={document.master} disabled={!canEdit} onStatus={setStatus}
            onApply={(settings, name) => { setMasterPreview(null); commitWithStatus(updateMasterRevision(historyRef.current.present, settings), `Applied the preset "${name}".`); }} />}
          onCommit={(settings, message) => { setMasterPreview(null); commitWithStatus(updateMasterRevision(historyRef.current.present, settings), message); }} /> },
        { id: 'meters', label: 'Meters', render: () => <MasteringMeters meters={meters} playing={playbackState === 'playing'} pre={analysers?.pre ?? null} post={analysers?.post ?? null}
          monitor={monitor} onMonitorChange={(patch) => setMonitor((current) => ({ ...current, ...patch }))}
          target={loudnessTarget} onTargetChange={setLoudnessTarget}
          referenceName={reference?.name ?? null} referenceBusy={referenceBusy} onReferenceFile={(file) => void loadReference(file)}
          onClearReference={() => { setReference(null); if (monitor.listen === 'reference') setListen('processed'); setStatus('Removed the reference track.'); }}
          onResetMeters={() => { graphRef.current?.master?.port.postMessage({ type: 'resetMeters' } satisfies WorkletInbound); setMeters(null); setStatus('Meters reset.'); }}
          timelineAt={(time) => lastGraphRef.current ? timelinePosition(lastGraphRef.current, time, duration) : null}
          onJump={seek} /> },
        { id: 'export', label: 'Export', render: (active) => <MasteringExportTab ctx={ctx} active={active} /> },
        { id: 'project', label: 'Project', render: (active) => <MasteringProjectTab ctx={ctx} active={active} autosave={autosave} busy={projectBusy || loading}
          onSaveBackup={saveBackup} onRestoreBackup={restoreBackup} /> },
      ]} />}

      <p className={`status-line ${/^Could not|failed|could not start/i.test(status) ? 'error' : ''}`} role="status" aria-live="polite">{status}</p>
    </div>
  </>;
}
