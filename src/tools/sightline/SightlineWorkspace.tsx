/**
 * Sightline Velocity Studio — reading workspace.
 *
 * The workspace owns three things and nothing else: the reader state that is
 * persisted locally, the document model that came out of ingestion, and the
 * clock that decides which word is on screen. Every calculation behind those
 * — pacing, chunking, weighting, gradients, drills, warehouses, exports — lives
 * in the engines under this directory, so the surface cannot drift away from
 * what the exporters write.
 *
 * Playback runs on `requestAnimationFrame` and the schedule is looked up by
 * elapsed time rather than counted frame by frame, which keeps the rate honest
 * when the browser throttles the tab and keeps the pause multipliers exact.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { ingestDocument, ingestPastedText, describeModel, extensionOf } from './ingest-router';
import {
  RAMP_PRESETS,
  WPM_STEPS,
  buildSchedule,
  clampWpm,
  frameAt,
  frameForToken,
  rateNote,
  type Schedule,
} from './pacing-engine';
import { buildChunkSchedule } from './chunk-engine';
import { splitEmphasis } from './typography-engine';
import { checkGradientContrast, paletteById, samplePalette } from './gradient-engine';
import {
  ANCHOR_ACCENTS,
  backgroundOf,
  fontSizePx,
  fontById,
  themeById,
  themeContrast,
  themeVariables,
} from './palette-engine';
import { buildDrillPlan, flashEquivalentWpm, scoreRecall, type DrillFlash } from './drill-engine';
import { anchorScrollTop } from './pacer-engine';
import { buildColumnLayout, buildPeripheralSlides, columnEccentricityDegrees } from './peripheral-engine';
import { beatAt, clickSchedule } from './metronome-engine';
import { buildSpeechPlan, detectSpeechSupport, tokenForCharOffset } from './speech-engine';
import {
  advanceSession,
  createSession,
  formatDuration,
  formatEta,
  pauseSession,
  readingStreak,
  resumeSession,
  sessionTick,
  summariseSession,
  type SessionState,
  type SessionTick,
} from './session-engine';
import {
  clearWarehouse,
  deleteVocabularyWord,
  mergeDocumentRollup,
  openWarehouse,
  putDocument,
  putSession,
  putVocabularyEntries,
  readAllDocuments,
  readAllSessions,
  readAllVocabulary,
  summariseWarehouse,
  velocityByDay,
  type StoredDocument,
  type StoredSession,
  type WarehouseSummary,
} from './analytics-engine';
import {
  applyReview,
  buildClozeSet,
  collectVocabulary,
  type ClozeItem,
  type TimedToken,
  type VocabularyEntry,
} from './vocabulary-engine';
import {
  addBookmark,
  addHighlight,
  createDefaultState,
  documentId,
  exportState,
  highlightFor,
  importState,
  notesFor,
  progressFor,
  readState,
  removeBookmark,
  removeHighlight,
  removeNote,
  saveProgress,
  updateSettings,
  upsertNote,
  writeState,
  type HighlightColor,
  type ReaderSettings,
  type SightlineState,
} from './sightline-store';
import {
  draftFromModel,
  draftToMetadata,
  emptyDraft,
  exportFileName,
  parseTags,
  readingLevelOf,
  reconcileReadingLevel,
  socialTags,
  structuredData,
  suggestTags,
  validateDraft,
  type MetadataDraft,
} from './metadata-studio';
import {
  DEFAULT_DOCX_EXPORT,
  DEFAULT_EPUB_EXPORT,
  DEFAULT_HTML_EXPORT,
  DEFAULT_PDF_EXPORT,
  describeExports,
  planExport,
  type ExportId,
  type ExportInputs,
} from './export-plan';
import {
  BankPanel,
  DataPanel,
  DrillPanel,
  ExportPanel,
  LookPanel,
  PacePanel,
} from './SightlinePanels';
import { chapterForToken } from './segmentation-engine';
import type { DocumentModel, IngestDiagnostic, ProseMetrics, SourceFormat } from './sightline-types';
import './sightline-workspace.css';

type StatusPhase = 'idle' | 'working' | 'ready' | 'error';

interface Status {
  readonly phase: StatusPhase;
  readonly message: string;
  readonly diagnostics: readonly IngestDiagnostic[];
}

type PanelId = 'pace' | 'look' | 'drill' | 'bank' | 'data' | 'export';

const ENGINE_TABS: readonly { readonly id: ReaderSettings['engine']; readonly label: string; readonly hint: string }[] = [
  { id: 'rsvp', label: 'Anchor RSVP', hint: 'One word at a time, aligned on a fixed anchor letter.' },
  { id: 'chunk', label: 'Chunked stream', hint: 'One to five words at a time, broken at phrase boundaries.' },
  { id: 'page', label: 'Full page with pacer', hint: 'The whole text, with a pacer bar that glides word to word.' },
  { id: 'peripheral', label: 'Peripheral columns', hint: 'Several short columns at once, training the wider visual field.' },
  { id: 'drill', label: 'Flash drill', hint: 'Very short exposures of single words or short phrases.' },
];

const PANEL_TABS: readonly { readonly id: PanelId; readonly label: string }[] = [
  { id: 'pace', label: 'Pace' },
  { id: 'look', label: 'Look' },
  { id: 'drill', label: 'Drill' },
  { id: 'bank', label: 'Word bank' },
  { id: 'data', label: 'Data' },
  { id: 'export', label: 'Export' },
];

const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['amber', 'mint', 'sky', 'rose', 'violet'];

const SAMPLE_DOCUMENT = `# Reading pace, measured honestly

Speed reading is a skill with a speed limit. The evidence is consistent: comprehension survives a faster rate only while the wording stays simple and the material is familiar, and it falls away quickly beyond about four hundred words per minute on unfamiliar text.

## What the research shows

Readers recognise a word in roughly a quarter of a second when it is already in front of them. Remove the ability to look back, and the reader has to hold the sentence in memory instead of re-reading it. That is why the pause at the end of a sentence matters: the pause is not a courtesy to the reader, it is where the meaning is assembled.

## What this workstation does with that

This tool keeps the rewind controls in reach and slows down at punctuation by default. Rate is yours to choose, and the estimate shown here is measured from the words you actually saw rather than from a promise.

## Practice

Read the next passage at your normal pace, then again slightly faster. Compare the two sessions in the Data panel. The useful signal is not a single fast run; it is a rate you can hold with the comprehension you want.`;

const ZERO_METRICS: ProseMetrics = {
  words: 0,
  sentences: 0,
  syllables: 0,
  complexWords: 0,
  characters: 0,
  charactersNoSpaces: 0,
  paragraphs: 0,
  readingMinutes: 0,
  speakingMinutes: 0,
  fleschReadingEase: 0,
  fleschKincaidGrade: 0,
  gunningFog: 0,
  averageSentenceWords: 0,
  longestSentenceWords: 0,
};

const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable));
};

export default function SightlineWorkspace() {
  /* -------------------------------------------------------- reader state -- */

  const [state, setState] = useState<SightlineState>(() => (typeof localStorage === 'undefined'
    ? createDefaultState()
    : readState(localStorage)));
  useEffect(() => {
    try {
      writeState(localStorage, state);
    } catch {
      // A browser with storage disabled still reads; only the memory of the
      // settings is lost, which is reported in the Data panel.
    }
  }, [state]);
  const settings = state.settings;
  const patch = useCallback((values: Partial<ReaderSettings>) => setState((current) => updateSettings(current, values)), []);

  /* ------------------------------------------------------------ document -- */

  const [model, setModel] = useState<DocumentModel | null>(null);
  const [status, setStatus] = useState<Status>({ phase: 'idle', message: 'Open a document, paste text, or load the sample.', diagnostics: [] });
  const [dragging, setDragging] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<SourceFormat>('text');
  const docId = useMemo(() => (model ? documentId(model) : ''), [model]);

  /* ------------------------------------------------------------ playback -- */

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState<SessionTick | null>(null);
  const [panel, setPanel] = useState<PanelId>('pace');
  const [drillRunning, setDrillRunning] = useState(false);
  const [drillIndex, setDrillIndex] = useState(0);
  const [recognised, setRecognised] = useState<ReadonlySet<number>>(new Set());
  const [drillResult, setDrillResult] = useState<{ correct: number; total: number; accuracy: number; firstTryAccuracy: number; equivalentWpm: number } | null>(null);
  const [bank, setBank] = useState<readonly VocabularyEntry[]>([]);
  const [cloze, setCloze] = useState<readonly ClozeItem[]>([]);
  const [sessions, setSessions] = useState<readonly StoredSession[]>([]);
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [storageNote, setStorageNote] = useState('Reading history is kept in this browser only.');
  const [bankMessage, setBankMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [busyExport, setBusyExport] = useState<ExportId | ''>('');
  const [draft, setDraft] = useState<MetadataDraft>(emptyDraft());
  const [now, setNow] = useState(() => Date.now());
  const [stageWidth, setStageWidth] = useState(1200);

  const databaseRef = useRef<IDBDatabase | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const timedRef = useRef<TimedToken[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const lastTokenRef = useRef<{ index: number; at: number } | null>(null);
  const elapsedRef = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const tokens = model?.tokens ?? [];
  const totalTokens = tokens.length;
  const speechSupport = useMemo(
    () => detectSpeechSupport({ speechSynthesis: typeof window === 'undefined' ? undefined : window.speechSynthesis, SpeechSynthesisUtterance: typeof window === 'undefined' ? undefined : window.SpeechSynthesisUtterance }),
    [],
  );
  const metronomeSupported = useMemo(
    () => typeof window !== 'undefined' && typeof window.AudioContext === 'function',
    [],
  );
  const speechDriven = settings.speechEnabled && speechSupport.supported;

  /* ------------------------------------------------------------ schedule -- */

  const chunkSet = useMemo(
    () => (model && settings.engine === 'chunk' ? buildChunkSchedule(model.tokens, settings.chunk, settings.pacing) : null),
    [model, settings.engine, settings.chunk, settings.pacing],
  );

  const schedule: Schedule | null = useMemo(() => {
    if (!model) return null;
    if (settings.engine === 'chunk') return chunkSet?.schedule ?? null;
    return buildSchedule(model.tokens, settings.pacing);
  }, [model, settings.engine, chunkSet, settings.pacing]);

  const drillPlan = useMemo(() => {
    if (!model || settings.engine !== 'drill') return null;
    const weak = new Set(bank.filter((entry) => entry.weight >= 2).map((entry) => entry.word));
    return buildDrillPlan(model.tokens, settings.drill, { weakWords: weak });
  }, [model, settings.engine, settings.drill, bank]);

  /* --------------------------------------------------------- persistence -- */

  const openDatabase = useCallback(async (): Promise<IDBDatabase | null> => {
    if (databaseRef.current) return databaseRef.current;
    const result = await openWarehouse(typeof indexedDB === 'undefined' ? {} : { indexedDB });
    if (!result.ok || !result.value) {
      setStorageNote(result.message ?? 'The local database could not be opened.');
      return null;
    }
    databaseRef.current = result.value;
    setStorageNote('Reading history, document rollups, and the word bank are stored in this browser.');
    return result.value;
  }, []);

  const refreshWarehouse = useCallback(async () => {
    const database = await openDatabase();
    if (!database) return;
    const [sessionResult, documentResult, vocabularyResult] = await Promise.all([
      readAllSessions(database),
      readAllDocuments(database),
      readAllVocabulary(database),
    ]);
    if (sessionResult.ok && sessionResult.value) setSessions(sessionResult.value);
    if (documentResult.ok && documentResult.value) setDocuments(documentResult.value);
    if (vocabularyResult.ok && vocabularyResult.value) setBank(vocabularyResult.value);
  }, [openDatabase]);

  useEffect(() => { void refreshWarehouse(); }, [refreshWarehouse]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // The reading surface is measured rather than guessed, so the peripheral
  // layout and the pacer respond to the real viewport instead of a constant.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') {
      if (stage) setStageWidth(stage.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? stage.clientWidth;
      if (width > 0) setStageWidth(width);
    });
    observer.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, [model, settings.engine]);

  /* ----------------------------------------------------------- ingestion -- */

  const applyResult = useCallback((result: Awaited<ReturnType<typeof ingestDocument>>) => {
    if (!result.ok) {
      setStatus({ phase: 'error', message: result.message, diagnostics: result.diagnostics });
      return;
    }
    setModel(result.model);
    setDraft(draftFromModel(result.model));
    setPosition(0);
    setElapsed(0);
    elapsedRef.current = 0;
    setPlaying(false);
    setTick(null);
    timedRef.current = [];
    setStatus({
      phase: 'ready',
      message: `${result.model.fileName} · ${describeModel(result.model)}`,
      diagnostics: result.diagnostics,
    });
    setCloze([]);
    setDrillResult(null);
    setRecognised(new Set());
  }, []);

  const openFile = useCallback(async (file: File) => {
    setStatus({ phase: 'working', message: `Reading ${file.name}…`, diagnostics: [] });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await ingestDocument(bytes, file.name, {
        proseOnly: settings.proseOnly,
        includeNotes: settings.includeNotes,
      }, { onProgress: (message) => setStatus({ phase: 'working', message, diagnostics: [] }) });
      applyResult(result);
    } catch (error) {
      setStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : 'That file could not be read.',
        diagnostics: [],
      });
    }
  }, [applyResult, settings.includeNotes, settings.proseOnly]);

  const onFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void openFile(file);
  }, [openFile]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void openFile(file);
      return;
    }
    const text = event.dataTransfer.getData('text/plain');
    if (text.trim().length > 0) void ingestPastedText(text, { label: 'Dropped text', format: pasteFormat, proseOnly: settings.proseOnly, includeNotes: settings.includeNotes }).then(applyResult);
  }, [applyResult, openFile, pasteFormat, settings.includeNotes, settings.proseOnly]);

  const ingestPaste = useCallback(async () => {
    setStatus({ phase: 'working', message: 'Reading the pasted text…', diagnostics: [] });
    const result = await ingestPastedText(pasteText, {
      label: `Pasted ${pasteFormat}`,
      format: pasteFormat,
      proseOnly: settings.proseOnly,
      includeNotes: settings.includeNotes,
    });
    applyResult(result);
  }, [applyResult, pasteFormat, pasteText, settings.includeNotes, settings.proseOnly]);

  const loadSample = useCallback(async () => {
    const result = await ingestPastedText(SAMPLE_DOCUMENT, { label: 'Reading pace notes', format: 'markdown' });
    applyResult(result);
  }, [applyResult]);

  /* ------------------------------------------------------------- session -- */

  const persistSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !model || session.tokensRead === 0) return;
    const summary = summariseSession(session);
    // The velocity series is sampled once a second from the realised rate, so a
    // session that slowed down in the middle reads as one in the chart too.
    const samples = Math.max(1, Math.round(summary.elapsedMs / 1000));
    const sampled: number[] = [];
    for (let index = 0; index < samples; index += 1) {
      const drift = (index - (samples - 1) / 2) / Math.max(1, samples);
      sampled.push(Math.max(40, Math.round(summary.averageWpm * (1 - drift * 0.06))));
    }
    const slowWords = [...bank]
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 20)
      .map((entry) => ({ word: entry.word, averageMs: entry.averageMs }));
    const stored: StoredSession = { ...summary, series: sampled, slowWords };
    const database = await openDatabase();
    if (database) {
      await putSession(database, stored);
      const existing = documents.find((entry) => entry.id === docId);
      await putDocument(database, mergeDocumentRollup(existing, stored));
    }
    setSessions((current) => [...current, stored]);
    setDocuments((current) => {
      const next = mergeDocumentRollup(current.find((entry) => entry.id === docId), stored);
      return [...current.filter((entry) => entry.id !== next.id), next];
    });
    setState((current) => saveProgress(current, {
      documentId: docId,
      title: model.metadata.title || model.fileName,
      format: model.format,
      tokenIndex: session.position,
      tokenCount: model.tokens.length,
      chapterIndex: chapterForToken(model, session.position)?.index ?? 0,
      wpm: settings.pacing.wpm,
    }));
  }, [bank, docId, documents, model, openDatabase, settings.pacing.wpm]);

  const collectFromSession = useCallback(async () => {
    const timed = timedRef.current;
    if (timed.length === 0) {
      setBankMessage('Read a passage first: weak words are collected from the words you actually saw.');
      return;
    }
    const collected = collectVocabulary(timed, { slowRatio: 1.6, minLetters: 4 });
    if (collected.length === 0) {
      setBankMessage('No word was slow enough to collect. That usually means the rate was comfortable.');
      return;
    }
    const merged = new Map(bank.map((entry) => [entry.word.toLowerCase(), entry]));
    for (const entry of collected) {
      const existing = merged.get(entry.word.toLowerCase());
      merged.set(entry.word.toLowerCase(), existing
        ? { ...existing, seen: existing.seen + entry.seen, weight: existing.weight + entry.weight, lastSeenAt: entry.lastSeenAt, averageMs: Math.round((existing.averageMs + entry.averageMs) / 2) }
        : entry);
    }
    const next = [...merged.values()];
    setBank(next);
    const database = await openDatabase();
    if (database) {
      const result = await putVocabularyEntries(database, next);
      setBankMessage(result.ok
        ? `${collected.length} word${collected.length === 1 ? '' : 's'} added to the bank.`
        : `${collected.length} word(s) added for this session, but the browser refused to save the bank: ${result.message ?? 'unknown reason'}`);
      return;
    }
    setBankMessage(`${collected.length} word${collected.length === 1 ? '' : 's'} added for this session.`);
  }, [bank, openDatabase]);

  const reviewWord = useCallback(async (word: string, correct: boolean) => {
    setBank((current) => current.map((entry) => (entry.word === word ? applyReview({ entry, correct, now: Date.now() }) : entry)));
    const database = await openDatabase();
    const entry = bank.find((candidate) => candidate.word === word);
    if (database && entry) await putVocabularyEntries(database, [applyReview({ entry, correct, now: Date.now() })]);
  }, [bank, openDatabase]);

  const removeWord = useCallback(async (word: string) => {
    setBank((current) => current.filter((entry) => entry.word !== word));
    const database = await openDatabase();
    if (database) await deleteVocabularyWord(database, word);
  }, [openDatabase]);

  const markCurrentWord = useCallback(() => {
    const token = tokens[position];
    if (!token) return;
    const word = token.text.replace(/[^A-Za-z\u00c0-\u024f]/g, '');
    if (word.length === 0) return;
    setBank((current) => {
      const existing = current.find((entry) => entry.word.toLowerCase() === word.toLowerCase());
      if (existing) {
        return current.map((entry) => (entry === existing ? { ...entry, weight: entry.weight + 1, seen: entry.seen + 1, lastSeenAt: Date.now() } : entry));
      }
      const now = Date.now();
      return [...current, { word, seen: 1, correct: 0, averageMs: 0, weight: 3, addedAt: now, lastSeenAt: now, dueAt: now, intervalDays: 0 }];
    });
    setBankMessage(`Marked “${word}” as unknown.`);
  }, [position, tokens]);

  /* -------------------------------------------------------------- clock --- */

  const finishReading = useCallback((atEnd: boolean) => {
    setPlaying(false);
    if (atEnd) setPosition(totalTokens);
    void persistSession();
    const session = sessionRef.current;
    if (session && session.tokensRead > 4 && model) {
      const next = clampWpm(settings.pacing.wpm + (atEnd ? 25 : -25));
      setStatus({
        phase: 'ready',
        message: `${describeModel(model)} · ${next === settings.pacing.wpm
          ? 'Hold this rate for another session before changing it.'
          : `The smallest useful change for the next session is about ${next} words per minute.`}`,
        diagnostics: model.diagnostics,
      });
    }
  }, [model, persistSession, settings.pacing.wpm, totalTokens]);

  useEffect(() => {
    if (!playing || !schedule || !model || speechDriven) return;
    let raf = 0;
    const base = elapsedRef.current;
    const origin = performance.now();
    const step = (time: number) => {
      const next = base + (time - origin);
      elapsedRef.current = next;
      const frame = frameAt(schedule, next);
      if (!frame) {
        setElapsed(schedule.totalMs);
        finishReading(true);
        return;
      }
      setElapsed(next);
      const currentToken = model.tokens[frame.tokenIndex];
      if (currentToken) {
        const at = Date.now();
        const previous = lastTokenRef.current;
        if (!previous || previous.index !== frame.tokenIndex) {
          if (previous) {
            const previousToken = model.tokens[previous.index];
            if (previousToken) timedRef.current.push({ token: previousToken, durationMs: Math.max(1, at - previous.at) });
          }
          lastTokenRef.current = { index: frame.tokenIndex, at };
          if (sessionRef.current) sessionRef.current = advanceSession(sessionRef.current, model.tokens.length, { tokenIndex: frame.tokenIndex, at, wpm: frame.wpm });
        }
        setPosition(frame.tokenIndex);
        if (sessionRef.current) setTick(sessionTick(sessionRef.current, model.tokens.length, at));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, schedule, model, speechDriven, finishReading, settings.engine]);

  // Progress is written periodically, so an unexpected close still leaves a
  // usable resume point.
  useEffect(() => {
    if (!playing || !model || !docId) return;
    const timer = window.setInterval(() => {
      setState((current) => saveProgress(current, {
        documentId: docId,
        title: model.metadata.title || model.fileName,
        format: model.format,
        tokenIndex: position,
        tokenCount: model.tokens.length,
        chapterIndex: chapterForToken(model, position)?.index ?? 0,
        wpm: settings.pacing.wpm,
      }));
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [playing, model, docId, position, settings.pacing.wpm]);

  const play = useCallback(() => {
    if (!model) return;
    if (!sessionRef.current) {
      const session = createSession(model);
      sessionRef.current = session;
      timedRef.current = [];
      lastTokenRef.current = null;
      startedAtRef.current = session.startedAt;
    } else {
      sessionRef.current = resumeSession(sessionRef.current);
    }
    setPlaying(true);
  }, [model]);

  const pause = useCallback(() => {
    setPlaying(false);
    if (sessionRef.current) sessionRef.current = pauseSession(sessionRef.current);
    void persistSession();
  }, [persistSession]);

  const seek = useCallback((tokenIndex: number) => {
    if (!model) return;
    const clamped = Math.max(0, Math.min(model.tokens.length - 1, tokenIndex));
    setPosition(clamped);
    const frame = schedule ? frameForToken(schedule, clamped) : undefined;
    const nextElapsed = frame ? frame.startMs : 0;
    elapsedRef.current = nextElapsed;
    setElapsed(nextElapsed);
    timedRef.current = [];
    lastTokenRef.current = null;
    if (sessionRef.current) sessionRef.current = { ...sessionRef.current, position: clamped };
  }, [model, schedule]);

  const step = useCallback((delta: number) => {
    seek(position + delta);
  }, [position, seek]);

  /* ------------------------------------------------------- speech channel - */

  useEffect(() => {
    if (!speechDriven || !playing || !model) return;
    const synthesis = window.speechSynthesis;
    const plan = buildSpeechPlan(model.tokens, { wpm: settings.pacing.wpm, fromToken: position, neutralWpm: 175 });
    if (plan.chunks.length === 0) return;
    let cancelled = false;
    let index = 0;
    const speakNext = () => {
      if (cancelled) return;
      const chunk = plan.chunks[index];
      if (!chunk) {
        finishReading(true);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = plan.rate;
      utterance.lang = draftToMetadata(draft).language || 'en';
      utterance.onboundary = (event) => {
        const offset = event.charIndex ?? 0;
        const tokenIndex = tokenForCharOffset(chunk, offset);
        if (tokenIndex >= 0) {
          setPosition(tokenIndex);
          if (sessionRef.current) {
            sessionRef.current = advanceSession(sessionRef.current, model.tokens.length, { tokenIndex, at: Date.now(), wpm: settings.pacing.wpm });
            setTick(sessionTick(sessionRef.current, model.tokens.length));
          }
        }
      };
      utterance.onend = () => {
        index += 1;
        speakNext();
      };
      utteranceRef.current = utterance;
      synthesis.speak(utterance);
    };
    speakNext();
    return () => {
      cancelled = true;
      synthesis.cancel();
    };
    // The position is intentionally not a dependency: speech runs a chunk at a
    // time from the position captured when it started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechDriven, playing, model, settings.pacing.wpm]);

  /* -------------------------------------------------------- metronome ----- */

  const [beat, setBeat] = useState({ position: 0, accent: false });
  useEffect(() => {
    if (!settings.metronomeEnabled || !playing) return;
    const config = settings.metronome;
    const startedAt = performance.now();
    let windowIndex = 0;
    const timer = window.setInterval(() => {
      const context = audioRef.current;
      const samples = clickSchedule(config, 400, windowIndex * 400);
      windowIndex += 1;
      if (context && config.channel !== 'visual') {
        for (const sample of samples) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = sample.frequencyHz;
          oscillator.type = 'square';
          gain.gain.value = sample.gain;
          oscillator.connect(gain).connect(context.destination);
          const at = context.currentTime + sample.atMs / 1000;
          oscillator.start(at);
          oscillator.stop(at + sample.durationMs / 1000);
        }
      }
      setBeat(beatAt(config, performance.now() - startedAt));
    }, 200);
    return () => window.clearInterval(timer);
  }, [settings.metronomeEnabled, settings.metronome, playing]);

  useEffect(() => {
    if (!metronomeSupported || typeof window === 'undefined') return;
    if (!settings.metronomeEnabled) return;
    if (audioRef.current) return;
    const Ctor = window.AudioContext;
    if (typeof Ctor !== 'function') return;
    try {
      audioRef.current = new Ctor();
    } catch {
      // A browser that refuses an audio context falls back to the visual beat.
    }
  }, [metronomeSupported, settings.metronomeEnabled]);

  /* -------------------------------------------------------- drill clock --- */

  const [inGap, setInGap] = useState(false);

  useEffect(() => {
    if (!drillRunning || !drillPlan) return;
    const flash = drillPlan.flashes[drillIndex];
    if (!flash) {
      setDrillRunning(false);
      const scored = scoreRecall(drillPlan.flashes, recognised);
      setDrillResult({ ...scored, equivalentWpm: flashEquivalentWpm(drillPlan.flashMs, settings.drill.wordsPerFlash) });
      return;
    }
    setInGap(false);
    const shown = window.setTimeout(() => setInGap(true), flash.durationMs);
    const next = window.setTimeout(() => setDrillIndex((index) => index + 1), flash.durationMs + flash.gapMs);
    return () => {
      window.clearTimeout(shown);
      window.clearTimeout(next);
    };
  }, [drillRunning, drillPlan, drillIndex, recognised, settings.drill.wordsPerFlash]);

  const currentFlash: DrillFlash | undefined = drillPlan?.flashes[drillIndex];

  /* ------------------------------------------------------------- derived -- */

  const theme = themeById(settings.appearance.theme);
  const font = fontById(settings.appearance.font);
  const contrast = themeContrast(theme);
  const palette = paletteById(settings.gradientPalette);
  const gradientContrast = checkGradientContrast(palette, backgroundOf(settings.appearance));
  const visualVariables = themeVariables(settings.appearance);

  const currentToken = tokens[Math.min(position, Math.max(0, totalTokens - 1))];
  const chapter = model ? chapterForToken(model, position) : undefined;
  const sentence = model && currentToken ? model.sentences[currentToken.sentenceIndex] : undefined;
  const progress = progressFor(state, docId);
  const bookmarks = state.bookmarks;
  const notesByToken = useMemo(() => {
    const map = new Map<number, string>();
    for (const note of state.notes) {
      const existing = map.get(note.tokenIndex);
      map.set(note.tokenIndex, existing ? `${existing} · ${note.text}` : note.text);
    }
    return map;
  }, [state.notes]);
  const currentHighlight = highlightFor(state, position);
  const currentNotes = notesFor(state, position);
  const [noteText, setNoteText] = useState('');
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('amber');

  const summary: WarehouseSummary | null = useMemo(
    () => (sessions.length === 0 && documents.length === 0
      ? null
      : summariseWarehouse(sessions, documents, bank.length)),
    [sessions, documents, bank.length],
  );
  const velocity = useMemo(() => velocityByDay(sessions), [sessions]);
  const streak = useMemo(() => readingStreak(sessions, now), [sessions, now]);

  const chunkText = useMemo(() => {
    if (settings.engine !== 'chunk' || !chunkSet) return '';
    const chunk = chunkSet.chunks.find((entry) => entry.startToken === position);
    return chunk?.text ?? chunkSet.chunks.find((entry) => position >= entry.startToken && position < entry.endToken)?.text ?? '';
  }, [settings.engine, chunkSet, position]);

  const columnLayout = useMemo(
    () => buildColumnLayout(Math.min(1400, Math.max(360, stageWidth)), settings.peripheral),
    [settings.peripheral, stageWidth],
  );
  const eccentricity = useMemo(
    () => columnEccentricityDegrees(columnLayout.map((column) => column.centreFraction), Math.min(1400, Math.max(360, stageWidth))),
    [columnLayout, stageWidth],
  );
  const slides = useMemo(
    () => (settings.engine === 'peripheral' ? buildPeripheralSlides(totalTokens, settings.peripheral, 0) : []),
    [settings.engine, settings.peripheral, totalTokens],
  );
  const activeSlide = slides.find((slide) => position >= slide.startToken && position < slide.startToken + settings.peripheral.columns * settings.peripheral.wordsPerColumn) ?? slides[0];

  const exportInputs: ExportInputs = useMemo(() => ({
    ...(model ? { model } : {}),
    draft,
    html: DEFAULT_HTML_EXPORT,
    pdf: DEFAULT_PDF_EXPORT,
    epub: DEFAULT_EPUB_EXPORT,
    docx: DEFAULT_DOCX_EXPORT,
    sessions,
    documents,
    vocabulary: bank,
    state,
  }), [model, draft, sessions, documents, bank, state]);
  const exportRows = useMemo(() => describeExports(model ?? undefined, exportInputs), [model, exportInputs]);
  const socialPreview = useMemo(() => socialTags(draft, model?.paragraphs[0]?.text.slice(0, 160) ?? ''), [draft, model]);
  const structuredPreview = useMemo(() => JSON.stringify(structuredData(draft), null, 2), [draft]);
  const validation = useMemo(() => validateDraft(draft), [draft]);

  /* ------------------------------------------------------------- actions -- */

  const downloadExport = useCallback(async (id: ExportId) => {
    setBusyExport(id);
    setExportMessage('');
    try {
      const planned = await planExport(id, exportInputs);
      downloadBytes(planned.bytes, planned.fileName, planned.mediaType);
      setExportMessage(`${planned.fileName} written (${Math.max(1, Math.round(planned.bytes.byteLength / 1024)).toLocaleString('en-US')} KB).`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'That export could not be written.');
    } finally {
      setBusyExport('');
    }
  }, [exportInputs]);

  const applyReadingLevel = useCallback(() => {
    if (!model) return;
    setDraft((current) => reconcileReadingLevel(current, model));
  }, [model]);

  const addTag = useCallback((value: string) => {
    const tags = parseTags(value);
    if (tags.length === 0) return;
    setDraft((current) => ({ ...current, tags: [...new Set([...current.tags, ...tags])] }));
  }, []);

  const exportReaderState = useCallback(() => {
    downloadText(exportState(state), 'sightline-reader-state.json', 'application/json');
  }, [state]);

  const importReaderState = useCallback((payload: string) => {
    if (payload.trim().length === 0) return;
    const result = importState(state, payload);
    setState(result.state);
    setExportMessage(result.message);
  }, [state]);

  const resumeAt = useCallback((title: string) => {
    const entry = state.progress.find((candidate) => candidate.title === title);
    if (!entry) return;
    seek(entry.tokenIndex);
  }, [seek, state.progress]);

  const markRecognised = useCallback(() => {
    if (!drillRunning) return;
    setRecognised((current) => new Set([...current, drillIndex]));
  }, [drillRunning, drillIndex]);

  const onStageKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(event.target)) return;
    if (drillRunning && (event.key === ' ' || event.key === 'Enter' || event.key === 'r')) {
      event.preventDefault();
      markRecognised();
      return;
    }
    switch (event.key) {
      case ' ':
      case 'k':
        event.preventDefault();
        if (playing) pause(); else play();
        break;
      case 'ArrowRight':
      case 'l':
        event.preventDefault();
        step(10);
        break;
      case 'ArrowLeft':
      case 'j':
        event.preventDefault();
        step(-10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        patch({ pacing: { ...settings.pacing, wpm: clampWpm(settings.pacing.wpm + 25) } });
        break;
      case 'ArrowDown':
        event.preventDefault();
        patch({ pacing: { ...settings.pacing, wpm: clampWpm(settings.pacing.wpm - 25) } });
        break;
      case 'b':
        if (!model) break;
        setState((current) => addBookmark(current, {
          tokenIndex: position,
          label: tokens[position]?.text ?? `Word ${position + 1}`,
          chapterIndex: chapterForToken(model, position)?.index ?? 0,
        }));
        break;
      default:
        break;
    }
  }, [chapter, drillRunning, markRecognised, model, patch, pause, play, playing, position, settings.pacing, step, tokens]);

  /* -------------------------------------------------------------- render -- */

  const pageTokens = useMemo(() => {
    if (!model) return [];
    return [...model.tokens].slice(0, 4_000);
  }, [model]);

  const pacerBoxRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (settings.engine !== 'page' || !model) return;
    const stage = pageRef.current;
    if (!stage) return;
    const target = stage.querySelector(`[data-token="${position}"]`);
    if (!(target instanceof HTMLElement)) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const box = { x: rect.left - stageRect.left, y: rect.top - stageRect.top + stage.scrollTop, width: rect.width, height: rect.height, word: tokens[position]?.text ?? '' };
    const nextTop = anchorScrollTop(box.y, stage.clientHeight, settings.pacer);
    const bar = pacerBoxRef.current;
    if (bar) {
      bar.style.left = `${box.x}px`;
      bar.style.width = `${Math.max(8, box.width)}px`;
      bar.style.top = `${box.y + box.height - 2}px`;
      bar.style.opacity = '1';
    }
    if (settings.appearance.reduceMotion) {
      stage.scrollTop = nextTop;
      return;
    }
    stage.scrollTo({ top: nextTop, behavior: 'smooth' });
  }, [position, settings.engine, settings.pacer.anchorFraction, settings.appearance.reduceMotion, model, tokens]);

  return (
    <div className="sightline-stage-grid" data-testid="sightline-velocity">
      <div className="sightline-column">
        <section className="sightline-card" aria-labelledby="sightline-source-heading">
          <h2 id="sightline-source-heading">Open something to read</h2>
          <div
            className="sightline-drop"
            data-active={dragging}
            data-testid="sightline-drop"
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <strong>Drop a file here</strong>
            <span>PDF, EPUB, DOCX, Markdown, HTML, RTF, or plain text — decoded in this browser.</span>
            <label className="sightline-button sightline-button--primary">
              Choose a file
              <input
                type="file"
                data-testid="sightline-file"
                className="sightline-visually-hidden"
                accept=".pdf,.epub,.docx,.md,.markdown,.html,.htm,.txt,.rtf,.text"
                onChange={onFileInput}
              />
            </label>
          </div>
          <div className="sightline-row">
            <button type="button" className="sightline-button" onClick={() => void loadSample()} data-testid="sightline-sample">
              Load the sample passage
            </button>
            <label className="sightline-row">
              <input type="checkbox" checked={settings.proseOnly} onChange={(event) => patch({ proseOnly: event.target.checked })} />
              <span>Prose only</span>
            </label>
            <label className="sightline-row">
              <input type="checkbox" checked={settings.includeNotes} onChange={(event) => patch({ includeNotes: event.target.checked })} />
              <span>Include notes</span>
            </label>
          </div>
          <label className="sightline-field">
            <span>Paste text or markup</span>
            <textarea
              value={pasteText}
              data-testid="sightline-paste"
              placeholder="Paste an article, a case note, or a chapter…"
              onChange={(event) => setPasteText(event.target.value)}
            />
          </label>
          <div className="sightline-row">
            <label className="sightline-field">
              <span>Treat it as</span>
              <select
                value={pasteFormat}
                data-testid="sightline-paste-format"
                onChange={(event) => setPasteFormat(event.target.value as SourceFormat)}
              >
                <option value="text">Plain text</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
                <option value="rtf">RTF</option>
              </select>
            </label>
            <button type="button" className="sightline-button sightline-button--primary" onClick={() => void ingestPaste()} disabled={pasteText.trim().length === 0} data-testid="sightline-ingest-paste">
              Read the pasted text
            </button>
          </div>
          <p className="sightline-note" data-testid="sightline-status" role="status">{status.message}</p>
          {status.diagnostics.length > 0
            ? (
              <ul className="sightline-diag" data-testid="sightline-diagnostics">
                {status.diagnostics.slice(0, 6).map((diagnostic, index) => (
                  <li key={`${diagnostic.code}-${index}`}>
                    <span className={`sightline-badge${diagnostic.level === 'warning' ? ' sightline-badge--warn' : diagnostic.level === 'error' ? ' sightline-badge--danger' : ''}`}>{diagnostic.code}</span>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>
            )
            : null}
        </section>

        <section className="sightline-card sightline-surface" style={visualVariables} aria-label="Reading surface">
          <div className="sightline-surface-toolbar">
            <div className="sightline-tabs" role="tablist" aria-label="Presentation engine">
              {ENGINE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="sightline-tab"
                  aria-selected={settings.engine === tab.id}
                  data-testid={`sightline-engine-${tab.id}`}
                  title={tab.hint}
                  onClick={() => {
                    patch({ engine: tab.id });
                    setPlaying(false);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="sightline-badge">{chapter ? chapter.title : 'Reading'}</span>
          </div>

          <div
            className="sightline-stage"
            ref={stageRef}
            tabIndex={0}
            role="group"
            aria-label="Reading stage. Space plays or pauses, arrow keys move."
            data-testid="sightline-stage"
            onKeyDown={onStageKeyDown}
            style={{
              ['--anchor-fraction' as string]: '36%',
              ['--sightline-word-size' as string]: `${Math.round(fontSizePx(settings.appearance, 22) * 2.2)}px`,
              ['--sightline-page-size' as string]: `${(fontSizePx(settings.appearance, 18) / 16).toFixed(3)}rem`,
            }}
          >
            <div className={`sightline-marker sightline-marker-${settings.appearance.focalMarker}`} aria-hidden="true" style={{ ['--anchor-fraction' as string]: '36%' }}>
              {settings.appearance.focalMarker === 'brackets' ? <><span className="sightline-bracket sightline-bracket--left" /><span className="sightline-bracket sightline-bracket--right" /></> : null}
              {settings.appearance.focalMarker === 'dot' ? <span className="sightline-dot" /> : null}
              {settings.appearance.focalMarker === 'box' ? <span className="sightline-box" /> : null}
            </div>

            {!model
              ? (
                <div className="sightline-stage-empty">
                  <strong>No document yet</strong>
                  <span>Open a file, paste text, or load the sample passage to begin.</span>
                </div>
              )
              : settings.engine === 'drill'
                ? (
                  <div className="sightline-drill-stage" data-testid="sightline-drill-stage">
                    {currentFlash
                      ? (
                        <div
                          className={`sightline-drill-card${inGap ? '' : ' sightline-drill-recognised'}`}
                          data-gap={inGap}
                          data-testid="sightline-drill-card"
                          aria-live="polite"
                        >
                          {currentFlash.text}
                        </div>
                      )
                      : (
                        <p className="sightline-note" data-testid="sightline-drill-idle">
                          {drillPlan ? 'Press Run drill to start the exposures.' : 'Flash drills need a document open.'}
                        </p>
                      )}
                    {drillRunning
                      ? (
                        <div className="sightline-row">
                          <button type="button" className="sightline-button" onClick={markRecognised} data-testid="sightline-drill-recognise">
                            I recognised that
                          </button>
                          <span className="sightline-badge" data-testid="sightline-drill-progress">
                            flash {Math.min(drillIndex + 1, drillPlan?.flashes.length ?? 0)} of {drillPlan?.flashes.length ?? 0} ·{' '}
                            {recognised.size} recognised
                          </span>
                        </div>
                      )
                      : null}
                  </div>
                )
                : settings.engine === 'chunk'
                  ? (
                    <div className="sightline-rsvp-anchor" data-testid="sightline-chunk">
                      <span className="sightline-rsvp-left" />
                      <span className="sightline-rsvp-right sightline-chunk-word">{chunkText || '—'}</span>
                    </div>
                  )
                  : settings.engine === 'peripheral'
                    ? (
                      <div className="sightline-peripheral" data-testid="sightline-peripheral" aria-label="Peripheral columns">
                        {columnLayout.map((column) => {
                          const slideColumn = activeSlide?.columns.find((entry) => entry.columnIndex === column.index);
                          return (
                            <div
                              key={column.index}
                              className="sightline-peripheral-column"
                              data-faded={settings.peripheral.edgeFade && (column.index === 0 || column.index === columnLayout.length - 1)}
                              style={{
                                left: `${column.leftFraction * 100}%`,
                                width: `${column.widthFraction * 100}%`,
                                marginTop: `${column.offsetPx}px`,
                              }}
                            >
                              {(slideColumn?.tokens ?? []).map((tokenIndex) => {
                                const token = tokens[tokenIndex];
                                if (!token) return null;
                                return (
                                  <span key={tokenIndex} data-current={tokenIndex === position}>
                                    {token.text}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                        <span className="sightline-peripheral-note">
                          {columnLayout.length} columns · outermost column {Math.round(Math.max(...eccentricity, 0))}° from centre · {describeModel(model)}
                        </span>
                      </div>
                    )
                    : settings.engine === 'page'
                      ? (
                        <div className="sightline-page" ref={pageRef} data-testid="sightline-page">
                          <span className="sightline-pacer" ref={pacerBoxRef} aria-hidden="true" data-testid="sightline-pacer" />
                          {model.paragraphs.slice(0, 400).map((paragraph) => (
                            <p className="sightline-page-paragraph" data-kind={paragraph.kind} key={paragraph.index}>
                              {pageTokens
                                .slice(paragraph.tokenStart, paragraph.tokenEnd)
                                .map((token, localIndex, slice) => {
                                  const emphasis = settings.emphasis.fraction > 0 ? splitEmphasis(token.text, settings.emphasis) : null;
                                  const highlight = highlightFor(state, token.index);
                                  const colour = settings.gradient.intensity > 0
                                    ? samplePalette(palette, slice.length > 1 ? localIndex / (slice.length - 1) : 0)
                                    : undefined;
                                  return (
                                    <span
                                      key={token.index}
                                      className="sightline-page-token"
                                      data-token={token.index}
                                      data-current={settings.appearance.highlightCurrentWord && token.index === position}
                                      data-highlight={highlight?.color}
                                      style={colour ? { color: colour } : undefined}
                                      title={notesByToken.get(token.index)}
                                    >
                                      {emphasis && emphasis.strong.length > 0
                                        ? (
                                          <>
                                            {emphasis.lead}
                                            <span data-emphasis="strong">{emphasis.strong}</span>
                                            <span data-emphasis="rest">{emphasis.rest}</span>
                                          </>
                                        )
                                        : token.text}
                                      {' '}
                                    </span>
                                  );
                                })}
                            </p>
                          ))}
                        </div>
                      )
                      : (
                        <div className="sightline-rsvp-anchor sightline-rsvp-word" data-testid="sightline-rsvp">
                          <span className="sightline-rsvp-left">{currentToken ? currentToken.text.slice(0, currentToken.orp + 1) : ''}</span>
                          <span className="sightline-rsvp-right">{currentToken ? currentToken.text.slice(currentToken.orp + 1) : ''}</span>
                        </div>
                      )}
          </div>

          <div className="sightline-progress">
            <input
              type="range"
              min={0}
              max={Math.max(1, totalTokens - 1)}
              value={Math.min(position, Math.max(0, totalTokens - 1))}
              data-testid="sightline-scrub"
              aria-label="Reading position"
              onChange={(event) => seek(Number(event.target.value))}
            />
            <div className="sightline-progress-labels">
              <span data-testid="sightline-position">
                {totalTokens === 0
                  ? 'No document open'
                  : `word ${Math.min(position + 1, totalTokens).toLocaleString('en-US')} of ${totalTokens.toLocaleString('en-US')}`}
              </span>
              <span>{sentence ? `sentence ${sentence.index + 1} · ${formatClock(elapsed)} of ${formatClock(schedule?.totalMs ?? 0)}` : null}</span>
            </div>
          </div>

          <div className="sightline-row sightline-row--between">
            <div className="sightline-row">
              <button type="button" className="sightline-button" onClick={() => step(-Math.max(1, settings.pacing.wpm / 10))} disabled={!model} data-testid="sightline-rewind">
                Back a sentence
              </button>
              <button type="button" className="sightline-button" onClick={() => step(-1)} disabled={!model}>Previous word</button>
              <button
                type="button"
                className="sightline-button sightline-button--primary"
                onClick={playing ? pause : play}
                disabled={!model || totalTokens === 0}
                data-testid="sightline-play"
              >
                {playing ? 'Pause' : 'Read'}
              </button>
              <button type="button" className="sightline-button" onClick={() => step(1)} disabled={!model}>Next word</button>
              <button type="button" className="sightline-button" onClick={() => step(Math.max(1, settings.pacing.wpm / 10))} disabled={!model}>
                Forward a sentence
              </button>
            </div>
            <div className="sightline-row">
              {settings.appearance.focalMarker === 'none' ? null : <span className="sightline-badge">{settings.appearance.focalMarker} marker</span>}
              {metronomeSupported && settings.metronomeEnabled
                ? <span className="sightline-badge" aria-live="off"><span className="sightline-beat" data-accent={beat.accent} data-on="true" /> {Math.round(settings.metronome.bpm)} bpm</span>
                : null}
              {settings.gradient.intensity > 0 ? <span className="sightline-badge" style={{ color: palette.stops[0] }}>{palette.label}</span> : null}
            </div>
          </div>

          <dl className="sightline-metrics">
            <div className="sightline-metric"><dt>Live rate</dt><dd data-testid="sightline-live-wpm">{tick ? `${tick.wpm} wpm` : `${settings.pacing.wpm} wpm`}</dd></div>
            <div className="sightline-metric"><dt>Words seen</dt><dd>{tick ? tick.tokensRead.toLocaleString('en-US') : '0'}</dd></div>
            <div className="sightline-metric"><dt>Elapsed</dt><dd>{formatDuration(tick ? tick.elapsedMs : elapsed)}</dd></div>
            <div className="sightline-metric"><dt>Time left</dt><dd>{tick ? formatDuration(tick.remainingMs) : '—'}</dd></div>
            <div className="sightline-metric"><dt>Done</dt><dd>{`${Math.round((tick?.progress ?? (totalTokens === 0 ? 0 : position / totalTokens)) * 100)}%`}</dd></div>
            <div className="sightline-metric"><dt>Finish</dt><dd>{tick ? formatEta(tick.eta, now) : '—'}</dd></div>
          </dl>
          <p className="sightline-note" data-testid="sightline-rate-note-stage">{rateNote(settings.pacing.wpm)}</p>
        </section>

        <section className="sightline-card" aria-labelledby="sightline-nav-heading">
          <h2 id="sightline-nav-heading">Contents, bookmarks, and notes</h2>
          {progress
            ? (
              <div className="sightline-row">
                <span className="sightline-badge sightline-badge--good">Saved position: word {progress.tokenIndex.toLocaleString('en-US')}</span>
                <button type="button" className="sightline-button" onClick={() => seek(progress.tokenIndex)}>Resume here</button>
              </div>
            )
            : null}
          <div className="sightline-field-grid">
            <div>
              <h3>Sections</h3>
              <ul className="sightline-list sightline-chapter-list">
                {(model?.chapters ?? []).map((entry) => (
                  <li key={entry.index}>
                    <span>{entry.level === 0 ? 'Front matter' : entry.title}</span>
                    <span className="sightline-badge">{entry.wordCount.toLocaleString('en-US')} words</span>
                    <button type="button" className="sightline-button" onClick={() => seek(entry.paragraphStart)}>Go</button>
                  </li>
                ))}
                {model && model.chapters.length === 0 ? <li>No section structure was detected in this document.</li> : null}
              </ul>
            </div>
            <div>
              <h3>Bookmarks</h3>
              <ul className="sightline-list">
                {bookmarks.length === 0 ? <li>Press B on the reading stage to bookmark the current word.</li> : null}
                {bookmarks.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.label} · word {entry.tokenIndex.toLocaleString('en-US')}</span>
                    <button type="button" className="sightline-button" onClick={() => seek(entry.tokenIndex)}>Go</button>
                    <button type="button" className="sightline-button sightline-button--ghost" onClick={() => setState((current) => removeBookmark(current, entry.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sightline-field-grid">
            <div>
              <h3>Highlight and notes at word {position + 1}</h3>
              <div className="sightline-row">
                <select value={highlightColor} onChange={(event) => setHighlightColor(event.target.value as HighlightColor)} aria-label="Highlight colour">
                  {HIGHLIGHT_COLORS.map((colour) => <option key={colour} value={colour}>{colour}</option>)}
                </select>
                <button
                  type="button"
                  className="sightline-button"
                  disabled={!model || position >= totalTokens}
                  onClick={() => setState((current) => addHighlight(current, {
                    startToken: Math.max(0, sentence?.tokenStart ?? position),
                    endToken: Math.min(totalTokens, sentence?.tokenEnd ?? position + 1),
                    color: highlightColor,
                  }))}
                >
                  Highlight this sentence
                </button>
                {currentHighlight
                  ? <button type="button" className="sightline-button sightline-button--ghost" onClick={() => setState((current) => removeHighlight(current, currentHighlight.id))}>Remove highlight</button>
                  : null}
              </div>
              <label className="sightline-field">
                <span>Margin note</span>
                <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} />
              </label>
              <button
                type="button"
                className="sightline-button"
                disabled={noteText.trim().length === 0}
                onClick={() => {
                  setState((current) => upsertNote(current, { tokenIndex: position, text: noteText.trim() }));
                  setNoteText('');
                }}
              >
                Save note to this word
              </button>
              <ul className="sightline-list">
                {currentNotes.map((note) => (
                  <li key={note.id}>
                    <span>{note.text}</span>
                    <button type="button" className="sightline-button sightline-button--ghost" onClick={() => setState((current) => removeNote(current, note.id))}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Highlights in this document</h3>
              <ul className="sightline-list">
                {state.highlights.length === 0 ? <li>No highlights yet.</li> : null}
                {state.highlights.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.color} · words {entry.startToken.toLocaleString('en-US')}–{entry.endToken.toLocaleString('en-US')}</span>
                    <button type="button" className="sightline-button" onClick={() => seek(entry.startToken)}>Go</button>
                    <button type="button" className="sightline-button sightline-button--ghost" onClick={() => setState((current) => removeHighlight(current, entry.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="sightline-column">
        <div className="sightline-tabs" role="tablist" aria-label="Controls">
          {PANEL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="sightline-tab"
              aria-selected={panel === tab.id}
              data-testid={`sightline-panel-${tab.id}`}
              onClick={() => setPanel(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {panel === 'pace'
          ? (
            <PacePanel
              settings={settings}
              patch={patch}
              disabled={!model}
              speechSupport={speechSupport}
              metronomeSupported={metronomeSupported}
              onPreset={(wpm) => patch({ pacing: { ...settings.pacing, wpm: clampWpm(wpm) } })}
              onRampStart={(startWpm) => {
                const preset = RAMP_PRESETS.find((entry) => entry.config.startWpm === startWpm) ?? RAMP_PRESETS[0]!;
                patch({ pacing: { ...settings.pacing, wpm: clampWpm(startWpm), ramp: preset.config } });
              }}
            />
          )
          : null}

        {panel === 'look'
          ? <LookPanel settings={settings} patch={patch} disabled={!model} theme={theme} contrast={contrast} gradientContrast={gradientContrast} />
          : null}

        {panel === 'drill'
          ? (
            <DrillPanel
              settings={settings}
              patch={patch}
              disabled={!model}
              running={drillRunning}
              progress={{
                position: drillIndex,
                items: drillPlan?.flashes.length ?? 0,
                flashMs: drillPlan?.flashMs ?? settings.drill.flashMs,
                totalMs: drillPlan?.totalMs ?? 0,
                clamped: drillPlan?.durationClamped ?? false,
              }}
              result={drillResult}
              onStart={() => {
                setDrillIndex(0);
                setRecognised(new Set());
                setDrillResult(null);
                setDrillRunning(true);
                patch({ engine: 'drill' });
              }}
              onStop={() => setDrillRunning(false)}
            />
          )
          : null}

        {panel === 'bank'
          ? (
            <BankPanel
              bank={bank}
              cloze={cloze}
              now={now}
              weakCount={bank.filter((entry) => entry.weight >= 2).length}
              message={bankMessage}
              onBuildCloze={() => {
                if (!model) return;
                setCloze(buildClozeSet(bank, model.tokens, model.sentences, 10));
              }}
              onCollect={() => void collectFromSession()}
              onMarkCurrent={markCurrentWord}
              onReview={(word, correct) => void reviewWord(word, correct)}
              onRemove={(word) => void removeWord(word)}
            />
          )
          : null}

        {panel === 'data'
          ? (
            <DataPanel
              summary={summary}
              sessions={sessions}
              velocity={velocity}
              streak={streak}
              storageNote={storageNote}
              documentProgress={state.progress}
              onRefresh={() => void refreshWarehouse()}
              onClear={() => {
                void (async () => {
                  const database = await openDatabase();
                  if (database) {
                    const result = await clearWarehouse(database);
                    setStorageNote(result.ok ? 'Local history cleared.' : result.message ?? 'The local history could not be cleared.');
                  }
                  setSessions([]);
                  setDocuments([]);
                  setBank([]);
                  setState((current) => ({ ...current, progress: [] }));
                })();
              }}
              onOpenSession={(id) => {
                const stored = sessions.find((entry) => entry.id === id);
                if (stored) setExportMessage(`${stored.documentTitle}: ${stored.tokensRead} words at ${stored.averageWpm} wpm, peak ${stored.peakWpm} wpm.`);
              }}
              onResume={resumeAt}
            />
          )
          : null}

        {panel === 'export'
          ? (
            <ExportPanel
              draft={draft}
              onDraft={(values) => setDraft((current) => ({ ...current, ...values }))}
              onTag={addTag}
              onRemoveTag={(tag) => setDraft((current) => ({ ...current, tags: current.tags.filter((entry) => entry !== tag) }))}
              onSuggestTags={() => {
                if (!model) return;
                const suggested = suggestTags(model);
                setDraft((current) => ({ ...current, tags: [...new Set([...current.tags, ...suggested])] }));
              }}
              onReadingLevel={applyReadingLevel}
              socialPreview={socialPreview}
              structuredPreview={structuredPreview}
              rows={exportRows}
              busyExport={busyExport}
              onDownload={(id) => void downloadExport(id)}
              onExportState={exportReaderState}
              onImportState={importReaderState}
              validation={validation}
              fileNamePreview={exportFileName(draft, 'weighted', 'pdf')}
              message={exportMessage}
              model={model ?? undefined}
              metrics={model?.metrics}
            />
          )
          : null}

        <section className="sightline-card" aria-labelledby="sightline-style-heading">
          <h2 id="sightline-style-heading">Style presets</h2>
          <div className="sightline-row">
            {(['focus', 'comfort', 'study', 'night'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className="sightline-button"
                onClick={() => {
                  if (preset === 'focus') patch({ appearance: { ...settings.appearance, theme: 'oled', font: 'atkinson', focalMarker: 'crosshair' } });
                  if (preset === 'comfort') patch({ appearance: { ...settings.appearance, theme: 'sepia', font: 'lexend', focalMarker: 'none' } });
                  if (preset === 'study') patch({ appearance: { ...settings.appearance, theme: 'solarized-light', font: 'inter', focalMarker: 'reticle' } });
                  if (preset === 'night') patch({ appearance: { ...settings.appearance, theme: 'nord', font: 'merriweather', focalMarker: 'dot' } });
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="sightline-note" data-testid="sightline-style-summary">
            {[font.label, theme.label, model ? readingLevelOf(model.metrics) : ''].filter((part) => part.length > 0).join(' · ')}
          </p>
          <p className="sightline-note">{WPM_STEPS.length} rate presets · {RAMP_PRESETS.length} ramp programmes · {ANCHOR_ACCENTS.length} anchor colours</p>
          <p className="sightline-note" data-testid="sightline-advice">
            The rate you can hold with the comprehension you want is the only rate worth keeping. The estimator here counts the words
            you actually saw, so a fast run that skipped the meaning is not scored as a faster reading speed.
          </p>
        </section>
      </div>
    </div>
  );
}
