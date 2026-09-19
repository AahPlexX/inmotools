/**
 * Sightline Velocity Studio — reading workspace.
 *
 * One screen covers the whole path from a local file to a finished export:
 * ingestion with a per-format report, a chapter navigator and page map, five
 * presentation engines, pacing and drill controls, a word bank, the local
 * reading history, bookmarks, highlights, margin notes, and the metadata-led
 * export studio.
 *
 * Everything runs in this browser tab. Documents are decoded here, sessions are
 * measured here, and every file is written here; the workspace never sends the
 * text, the timings, or the exports anywhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import {
  describeModel,
  extensionOf,
  ingestDocument,
  ingestPastedText,
  type IngestDependencies,
} from './ingest-router';
import {
  buildSchedule,
  clampWpm,
  frameAt,
  rateNote,
  remainingMs,
  RAMP_PRESETS,
  scheduleWpm,
  WPM_STEPS,
  type RampConfig,
  type Schedule,
} from './pacing-engine';
import { buildChunkSchedule, chunkStreamWpm, suggestedChunkWidth } from './chunk-engine';
import { FOCAL_ANCHOR_FRACTION, computeOrp, splitOrp } from './orp-engine';
import { splitEmphasis } from './typography-engine';
import { paletteById, samplePalette } from './gradient-engine';
import { ANCHOR_ACCENTS, applyDyslexiaSpacing, fontById, fontSizePx, themeById, themeVariables } from './palette-engine';
import { anchorScrollTop, pacerBoxes, pacerPosition, pageDurationMs, type PacerBox, type WordBox } from './pacer-engine';
import {
  buildColumnLayout,
  buildPeripheralSlides,
  columnEccentricityDegrees,
  columnFontSize,
  peripheralAdvice,
} from './peripheral-engine';
import { buildDrillPlan, flashEquivalentWpm, scoreRecall, type DrillPlan } from './drill-engine';
import { beatsInRange } from './metronome-engine';
import {
  buildSpeechPlan,
  chooseVoice,
  chunkStartTimes,
  detectSpeechSupport,
  tokenForCharOffset,
  type SpeechPlan,
} from './speech-engine';
import {
  advanceSession,
  createSession,
  pauseSession,
  resumeSession,
  sessionTick,
  summariseSession,
  suggestNextWpm,
  type SessionState,
  type SessionSummary,
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
  readDocument,
  summariseWarehouse,
  velocityByDay,
  type StoredDocument,
  type StoredSession,
} from './analytics-engine';
import {
  applyReview,
  buildClozeSet,
  collectVocabulary,
  DEFAULT_COLLECT,
  retentionRate,
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
  importState,
  progressFor,
  readState,
  removeBookmark,
  removeHighlight,
  removeNote,
  saveProgress,
  updateSettings,
  upsertNote,
  writeState,
  type DocumentProgress,
  type EngineId,
  type HighlightColor,
  type ReaderSettings,
  type SightlineState,
} from './sightline-store';
import { emptyDraft, draftFromModel, exportFileName, reconcileReadingLevel, suggestTags, type MetadataDraft } from './metadata-studio';
import { DEFAULT_DOCX_EXPORT } from './export-docx';
import { DEFAULT_EPUB_EXPORT } from './export-epub';
import { DEFAULT_HTML_EXPORT } from './export-html';
import { DEFAULT_PDF_EXPORT } from './export-pdf';
import { describeExports, planExport, type ExportId, type ExportInputs } from './export-plan';
import { BankPanel, DataPanel, DrillPanel, ExportPanel, LibraryPanel, LookPanel, PacePanel } from './SightlinePanels';
import type { DocumentModel, IngestDiagnostic, IngestResult, SourceFormat, TokenRecord } from './sightline-types';
import './sightline-fonts.css';
import './sightline-workspace.css';

const ENGINES: readonly { readonly id: EngineId; readonly label: string; readonly hint: string }[] = [
  { id: 'rsvp', label: 'Anchor RSVP', hint: 'One word at a time with its recognition point held on a fixed anchor.' },
  { id: 'chunk', label: 'Chunked stream', hint: 'One to five words per frame, kept together by phrase.' },
  { id: 'page', label: 'Full page', hint: 'The whole document with a pacer and an optional reading treatment.' },
  { id: 'peripheral', label: 'Peripheral columns', hint: 'Several columns at once; the eye takes in more per fixation.' },
  { id: 'drill', label: 'Flash drill', hint: 'Timed flashes that train recognition speed.' },
];

const PANELS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'pace', label: 'Reading' },
  { id: 'look', label: 'Appearance' },
  { id: 'drill', label: 'Training' },
  { id: 'bank', label: 'Word bank' },
  { id: 'marks', label: 'Library' },
  { id: 'data', label: 'Stats' },
  { id: 'export', label: 'Export' },
];

const PASTE_FORMATS: readonly { readonly id: SourceFormat; readonly label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'html', label: 'HTML' },
  { id: 'rtf', label: 'RTF' },
  { id: 'text', label: 'Plain text' },
];

const SAMPLE_DOCUMENT = `# Reading with a moving anchor

Speed reading is a skill with a speed limit. The eyes do less work than most
people assume: a trained reader makes four or five fixations a second, and each
fixation takes in a handful of letters either side of the point the eye lands
on. The tools here do not change the eye; they change what the page asks of it.

## What the anchor does

An anchored presentation holds one word — or one short phrase — still while the
rest of the document waits. Nothing moves except the words themselves, so the eye
stops sweeping across a line and stops returning to the start of the next.

## What the research shows

Comprehension is the price of speed once the material stops being familiar.
Published work on one-word presentation finds that readers keep up with ordinary
reading when the total time is the same, and that recall falls when the rate is
pushed past roughly four hundred words per minute on new material. Treat this as
a tool for reading more of what you already understand, and slow down when the
argument matters.
`;

const SAMPLE_LIBRARY = [
  { id: 'pace', label: 'Reading pace notes', text: SAMPLE_DOCUMENT },
  { id: 'technical', label: 'Technical systems primer', text: `# Technical systems primer

A reliable system separates input, transformation, state, and output. Each boundary should make failure visible instead of silently discarding work.

## Feedback loops

Short feedback loops help a reader notice a change, compare it with the intended result, and correct course before errors accumulate.` },
  { id: 'narrative', label: 'Short narrative', text: `# The morning route

Mara left early enough to take the long path beside the river. The slower route gave her time to notice which streets were already busy and which were still quiet.

## A small decision

At the bridge she changed direction, bought a newspaper, and carried it to the park where she could read without rushing.` },
] as const;
type SampleId = (typeof SAMPLE_LIBRARY)[number]['id'];

interface Status {
  readonly phase: 'idle' | 'working' | 'ready' | 'error';
  readonly message: string;
}

export default function SightlineWorkspace() {
  const [state, setState] = useState<SightlineState>(() => {
    if (typeof localStorage === 'undefined') return createDefaultState();
    try {
      return readState(localStorage);
    } catch {
      return createDefaultState();
    }
  });
  const settings = state.settings;

  const [model, setModel] = useState<DocumentModel | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ phase: 'idle', message: 'Choose a document, paste text, or load the sample.' });
  const [diagnostics, setDiagnostics] = useState<readonly IngestDiagnostic[]>([]);
  const [openDocuments, setOpenDocuments] = useState<readonly DocumentModel[]>([]);
  const [batchResults, setBatchResults] = useState<readonly { readonly name: string; readonly ok: boolean; readonly message: string }[]>([]);
  const [resume, setResume] = useState<DocumentProgress | undefined>(undefined);
  const [pasteText, setPasteText] = useState('');
  const [pasteFormat, setPasteFormat] = useState<SourceFormat>('markdown');
  const [sampleId, setSampleId] = useState<SampleId>('pace');
  const [dragging, setDragging] = useState(false);
  const [panel, setPanel] = useState('pace');
  const [engine, setEngine] = useState<EngineId>(settings.engine);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('amber');
  const [noteText, setNoteText] = useState('');
  const [bankMessage, setBankMessage] = useState('');

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [clock, setClock] = useState(0);
  const [tick, setTick] = useState<SessionTick | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [drillPlan, setDrillPlan] = useState<DrillPlan | null>(null);
  const [drillIndex, setDrillIndex] = useState(-1);
  const [drillRunning, setDrillRunning] = useState(false);
  const [recognised, setRecognised] = useState<ReadonlySet<number>>(() => new Set());
  const [stageWidth, setStageWidth] = useState(960);
  const [pacer, setPacer] = useState<{ current: PacerBox; glide: number } | null>(null);
  const [beatFlash, setBeatFlash] = useState(false);

  const [sessions, setSessions] = useState<readonly StoredSession[]>([]);
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [bank, setBank] = useState<readonly VocabularyEntry[]>([]);
  const [cloze, setCloze] = useState<readonly ClozeItem[]>([]);
  const [warehouseNote, setWarehouseNote] = useState('Reading history is kept in this browser only.');
  const [exportMessage, setExportMessage] = useState('');
  const [busyExport, setBusyExport] = useState<ExportId | null>(null);
  const [draft, setDraft] = useState<MetadataDraft>(emptyDraft);
  const [speech, setSpeech] = useState({ supported: false, boundaryEvents: false, reason: 'Checking whether this browser can speak…' });
  const [voices, setVoices] = useState<readonly string[]>([]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(0);
  const elapsedRef = useRef(0);
  const sessionRef = useRef<SessionState | null>(null);
  const seriesRef = useRef<number[]>([]);
  const timingsRef = useRef<TimedToken[]>([]);
  const lastWordRef = useRef<{ index: number; at: number } | null>(null);
  const markedRef = useRef<string[]>([]);
  const startedAtRef = useRef(0);
  const dbRef = useRef<IDBDatabase | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const speechRef = useRef<SpeechPlan | null>(null);

  const theme = themeById(settings.appearance.theme);
  const font = fontById(settings.appearance.font);
  const appearance = applyDyslexiaSpacing(settings.appearance);
  const accent = ANCHOR_ACCENTS.find((entry) => entry.id === appearance.anchorAccent) ?? ANCHOR_ACCENTS[0]!;
  const tokens: readonly TokenRecord[] = model?.tokens ?? [];
  const documentKey = model ? documentId(model) : '';

  /* ---------------------------------------------------------- persistence */

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      writeState(localStorage, state);
    } catch {
      // A full or blocked store must not stop the reader from reading.
    }
  }, [state]);

  const patch = useCallback((values: Partial<ReaderSettings>) => {
    setState((current) => updateSettings(current, values));
  }, []);

  useEffect(() => {
    setState((current) => (current.settings.engine === engine ? current : updateSettings(current, { engine })));
  }, [engine]);

  /* ------------------------------------------------------------ ingestion */

  const applyResult = useCallback(
    (result: IngestResult) => {
      if (!result.ok) {
        setStatus({ phase: 'error', message: result.message });
        setDiagnostics(result.diagnostics);
        return;
      }
      const loaded = result.model;
      setModel(loaded);
      setOpenDocuments((current) => [loaded, ...current.filter((entry) => documentId(entry) !== documentId(loaded))]);
      setDiagnostics(result.diagnostics);
      setStatus({ phase: 'ready', message: `${loaded.fileName}: ${describeModel(loaded)}` });
      setDraft(draftFromModel(loaded));
      setCloze([]);
      setSummary(null);
      setTick(null);
      setPlaying(false);
      setDrillRunning(false);
      setDrillPlan(null);
      positionRef.current = 0;
      elapsedRef.current = 0;
      sessionRef.current = null;
      setPosition(0);
      setClock(0);
      const key = documentId(loaded);
      const saved = state.progress.find((entry) => entry.documentId === key);
      setResume(saved && saved.tokenIndex > 0 && saved.tokenIndex < loaded.tokens.length ? saved : undefined);
    },
    [state.progress],
  );

  const ingestFiles = useCallback(
    async (files: FileList | readonly File[]) => {
      const batch = Array.from(files);
      if (batch.length === 0) return;
      let loaded = 0;
      let failed = 0;
      let activeFileName = '';
      const results: { name: string; ok: boolean; message: string }[] = [];
      for (const file of batch) {
        setStatus({ phase: 'working', message: `Reading ${file.name}…` });
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const isPdf = extensionOf(file.name) === 'pdf';
          const pdfModule = isPdf ? await import('./pdfjs-extractor') : null;
          if (pdfModule && !pdfModule.canDecodePdf()) {
            const message = 'This browser cannot run the local PDF decoder.';
            failed += 1;
            results.push({ name: file.name, ok: false, message });
            setStatus({ phase: 'error', message: `${file.name}: ${message}` });
            continue;
          }
          const dependencies: IngestDependencies = { onProgress: (message) => setStatus({ phase: 'working', message }), ...(pdfModule ? { pdf: pdfModule.createPdfJsExtractor() } : {}) };
          const result = await ingestDocument(bytes, file.name, { proseOnly: settings.proseOnly, includeNotes: settings.includeNotes }, dependencies);
          applyResult(result);
          if (result.ok) {
            loaded += 1;
            activeFileName = file.name;
            results.push({ name: file.name, ok: true, message: 'Ready' });
          } else {
            failed += 1;
            results.push({ name: file.name, ok: false, message: result.message });
          }
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : 'This document could not be read.';
          results.push({ name: file.name, ok: false, message });
          setStatus({ phase: 'error', message: `${file.name}: ${message}` });
        }
      }
      setBatchResults(results);
      if (batch.length > 1 && loaded > 0) {
        const failureNote = failed > 0 ? ` ${failed} failed.` : '';
        setStatus({ phase: 'ready', message: `${loaded} of ${batch.length} documents opened. ${activeFileName} is active.${failureNote}` });
      }
    },
    [applyResult, settings.includeNotes, settings.proseOnly],
  );

  const pasteIngest = useCallback(async () => {
    applyResult(await ingestPastedText(pasteText, {
      format: pasteFormat,
      label: `Pasted ${pasteFormat} text`,
      proseOnly: settings.proseOnly,
      includeNotes: settings.includeNotes,
      title: pasteText.trimStart().replace(/^#+\s*/, '').split('\n')[0]?.slice(0, 80),
    }));
  }, [applyResult, pasteFormat, pasteText, settings.includeNotes, settings.proseOnly]);

  const readClipboard = useCallback(async () => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.readText !== 'function') {
      setStatus({ phase: 'error', message: 'This browser does not let a page read the clipboard. Paste into the box instead.' });
      return;
    }
    try {
      const text = await clipboard.readText();
      if (text.trim().length === 0) {
        setStatus({ phase: 'error', message: 'The clipboard held no text.' });
        return;
      }
      setPasteText(text);
      applyResult(await ingestPastedText(text, { format: pasteFormat, label: 'Clipboard text' }));
    } catch {
      setStatus({ phase: 'error', message: 'The browser blocked the clipboard read. Paste into the box instead.' });
    }
  }, [applyResult, pasteFormat]);

  const loadSample = useCallback(async (requestedId: SampleId = sampleId) => {
    const sample = SAMPLE_LIBRARY.find((entry) => entry.id === requestedId) ?? SAMPLE_LIBRARY[0];
    applyResult(await ingestPastedText(sample.text, { format: 'markdown', label: sample.label }));
  }, [applyResult, sampleId]);

  const onPickFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) void ingestFiles(files);
      event.target.value = '';
    },
    [ingestFiles],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files.length > 0) {
        void ingestFiles(event.dataTransfer.files);
        return;
      }
      const text = event.dataTransfer.getData('text/plain');
      if (text.trim().length > 0) {
        setPasteText(text);
        setStatus({ phase: 'ready', message: 'Dropped text captured. Press “Read the pasted text” to open it.' });
      }
    },
    [ingestFiles],
  );

  /* ------------------------------------------------------- reading engines */

  const tokenSchedule: Schedule = useMemo(() => buildSchedule(tokens, settings.pacing), [tokens, settings.pacing]);
  const chunked = useMemo(
    () => (engine === 'chunk' && tokens.length > 0 ? buildChunkSchedule(tokens, settings.chunk, settings.pacing) : null),
    [engine, settings.chunk, settings.pacing, tokens],
  );
  const activeSchedule = chunked ? chunked.schedule : tokenSchedule;
  const streamLength = chunked ? chunked.chunks.length : tokens.length;
  const tokenIndexForStream = useCallback(
    (index: number): number => (chunked ? (chunked.chunks[index]?.startToken ?? 0) : Math.min(index, Math.max(0, tokens.length - 1))),
    [chunked, tokens.length],
  );
  const streamIndexForToken = useCallback(
    (tokenIndex: number): number => {
      if (!chunked) return Math.min(Math.max(0, tokenIndex), Math.max(0, tokens.length - 1));
      const found = chunked.chunks.findIndex((chunk) => tokenIndex >= chunk.startToken && tokenIndex < chunk.endToken);
      return found >= 0 ? found : Math.max(0, chunked.chunks.length - 1);
    },
    [chunked, tokens.length],
  );
  const streamText = useCallback(
    (index: number): string => (chunked ? (chunked.chunks[index]?.text ?? '') : (tokens[index]?.text ?? '')),
    [chunked, tokens],
  );

  const currentStreamIndex = Math.min(Math.max(0, position), Math.max(0, streamLength - 1));
  const currentTokenIndex = tokenIndexForStream(currentStreamIndex);
  const currentToken = tokens[currentTokenIndex];
  const currentWord = streamText(currentStreamIndex);

  const chapter = useMemo(() => {
    if (!model || model.chapters.length === 0) return undefined;
    const paragraphIndex = currentToken?.paragraphIndex ?? 0;
    return [...model.chapters].reverse().find((entry) => entry.paragraphStart <= paragraphIndex) ?? model.chapters[0];
  }, [currentToken, model]);

  const sentenceRange = useMemo(() => {
    if (!model || !currentToken) return null;
    const node = model.sentences[currentToken.sentenceIndex];
    if (!node) return null;
    return { start: node.tokenStart, end: Math.max(node.tokenStart, node.tokenEnd - 1) };
  }, [currentToken, model]);

  const highlightedTokens = useMemo(() => {
    const map = new Map<number, HighlightColor>();
    for (const highlight of state.highlights) {
      for (let index = highlight.startToken; index <= highlight.endToken; index += 1) map.set(index, highlight.color);
    }
    return map;
  }, [state.highlights]);

  /* ------------------------------------------------------------ playback */

  const currentTokenIndexRef = useRef(currentTokenIndex);
  currentTokenIndexRef.current = currentTokenIndex;
  const chapterIndexRef = useRef(chapter?.index ?? 0);
  chapterIndexRef.current = chapter?.index ?? 0;
  const activeScheduleRef = useRef(activeSchedule);
  activeScheduleRef.current = activeSchedule;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const tokenIndexForStreamRef = useRef(tokenIndexForStream);
  tokenIndexForStreamRef.current = tokenIndexForStream;
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const persistProgress = useCallback(
    (wpm: number) => {
      if (!model) return;
      setState((current) => saveProgress(current, {
        documentId: documentId(model),
        title: model.metadata.title || model.fileName,
        format: model.format,
        tokenIndex: currentTokenIndexRef.current,
        tokenCount: tokensRef.current.length,
        chapterIndex: chapterIndexRef.current,
        wpm,
      }));
    },
    [model],
  );

  const finishSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session || !model) return;
    const finished = summariseSession(session);
    setSummary(finished);
    const stored: StoredSession = { ...finished, series: [...seriesRef.current].slice(-600), slowWords: [] };
    const database = dbRef.current;
    if (database) {
      await putSession(database, stored);
      const existing = await readDocument(database, documentId(model));
      const rollup = mergeDocumentRollup(existing.value, stored);
      await putDocument(database, rollup);
      setDocuments((current) => [rollup, ...current.filter((entry) => entry.id !== rollup.id)]);
    }
    setSessions((current) => [stored, ...current.filter((entry) => entry.id !== stored.id)]);
    const collected = collectVocabulary(timingsRef.current, {
      ...DEFAULT_COLLECT,
      markedWords: markedRef.current,
      now: Date.now(),
    });
    if (collected.length > 0) {
      setBank((current) => {
        let merged: VocabularyEntry[] = [...current];
        for (const entry of collected) {
          const existing = merged.find((item) => item.word.toLowerCase() === entry.word.toLowerCase());
          merged = existing
            ? merged.map((item) => (item.word === existing.word
              ? { ...item, seen: item.seen + entry.seen, weight: Math.max(item.weight, entry.weight) }
              : item))
            : [...merged, entry];
        }
        return merged.sort((left, right) => right.weight - left.weight || left.word.localeCompare(right.word)).slice(0, 500);
      });
      if (database) await putVocabularyEntries(database, collected);
    }
    persistProgress(finished.averageWpm);
    const next = suggestNextWpm(session, settings.pacing.wpm);
    setStatus((current) => ({
      phase: 'ready',
      message: `${stripSessionNote(current.message)} Session: ${finished.tokensRead.toLocaleString('en-US')} words at ${finished.averageWpm.toLocaleString('en-US')} wpm in ${formatClock(finished.elapsedMs)}. ${
        next === settings.pacing.wpm ? 'That matched the requested rate.' : `Next target: ${next} wpm.`
      }`,
    }));
  }, [model, persistProgress, settings.pacing.wpm]);
  const finishSessionRef = useRef(finishSession);
  finishSessionRef.current = finishSession;

  const stop = useCallback((reason: 'pause' | 'end') => {
    setPlaying(false);
    if (sessionRef.current) sessionRef.current = pauseSession(sessionRef.current);
    if (reason === 'end') void finishSessionRef.current();
    else persistProgress(scheduleWpm(activeScheduleRef.current));
  }, [persistProgress]);

  const start = useCallback(() => {
    if (tokensRef.current.length === 0 || engineRef.current === 'drill') return;
    if (positionRef.current >= streamLength) {
      positionRef.current = 0;
      elapsedRef.current = 0;
      setPosition(0);
      setClock(0);
    }
    if (!sessionRef.current && model) {
      sessionRef.current = createSession(model);
      seriesRef.current = [];
      timingsRef.current = [];
      lastWordRef.current = null;
    } else if (sessionRef.current) {
      sessionRef.current = resumeSession(sessionRef.current);
    }
    setPlaying(true);
  }, [model, streamLength]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let lastTickAt = 0;
    const beganAt = performance.now() - elapsedRef.current;
    const step = (now: number) => {
      const schedule = activeScheduleRef.current;
      const elapsedMs = now - beganAt;
      const current = frameAt(schedule, elapsedMs);
      if (!current || schedule.frames.length === 0) {
        elapsedRef.current = 0;
        setPlaying(false);
        void finishSessionRef.current();
        return;
      }
      if (current.tokenIndex !== positionRef.current) {
        const at = Date.now();
        const previous = lastWordRef.current;
        const documentIndex = tokenIndexForStreamRef.current(current.tokenIndex);
        if (previous && tokensRef.current[previous.index]) {
          timingsRef.current.push({ token: tokensRef.current[previous.index]!, durationMs: Math.max(1, at - previous.at) });
        }
        lastWordRef.current = { index: documentIndex, at };
        const session = sessionRef.current;
        if (session) {
          sessionRef.current = advanceSession(session, tokensRef.current.length, {
            tokenIndex: documentIndex,
            at,
            wpm: scheduleWpm(schedule),
          });
        }
        positionRef.current = current.tokenIndex;
        setPosition(current.tokenIndex);
      }
      if (now - lastTickAt > 250) {
        lastTickAt = now;
        elapsedRef.current = elapsedMs;
        setClock(elapsedMs);
        const session = sessionRef.current;
        if (session) {
          const reading = sessionTick(session, tokensRef.current.length, Date.now());
          setTick(reading);
          seriesRef.current = [...seriesRef.current, reading.wpm].slice(-600);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seekToken = useCallback(
    (tokenIndex: number) => {
      const streamIndex = streamIndexForToken(Math.min(Math.max(0, tokenIndex), Math.max(0, tokens.length - 1)));
      positionRef.current = streamIndex;
      setPosition(streamIndex);
      const target = activeSchedule.frames.find((entry) => entry.tokenIndex === streamIndex);
      if (target) {
        elapsedRef.current = target.startMs;
        setClock(target.startMs);
      }
    },
    [activeSchedule.frames, streamIndexForToken, tokens.length],
  );

  const stepBy = useCallback(
    (delta: number) => {
      setPlaying(false);
      seekToken(currentTokenIndexRef.current + delta);
    },
    [seekToken],
  );

  const rewindSentence = useCallback(() => {
    setPlaying(false);
    if (sentenceRange) seekToken(sentenceRange.start);
  }, [seekToken, sentenceRange]);

  /* ------------------------------------------------------------ warehouse */

  const refreshWarehouse = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const opened = await openWarehouse(window);
    if (!opened.ok || !opened.value) {
      setWarehouseNote(opened.message ?? 'The local database is unavailable in this browser.');
      return;
    }
    dbRef.current = opened.value;
    const [storedSessions, storedDocuments, storedVocabulary] = await Promise.all([
      readAllSessions(opened.value),
      readAllDocuments(opened.value),
      readAllVocabulary(opened.value),
    ]);
    if (storedSessions.value) setSessions([...storedSessions.value].sort((left, right) => right.startedAt - left.startedAt));
    if (storedDocuments.value) setDocuments([...storedDocuments.value].sort((left, right) => right.updatedAt - left.updatedAt));
    if (storedVocabulary.value) {
      setBank([...storedVocabulary.value].sort((left, right) => right.weight - left.weight || left.word.localeCompare(right.word)));
    }
    setWarehouseNote('Sessions, documents, and vocabulary are stored with IndexedDB in this browser. Nothing is uploaded.');
  }, []);

  useEffect(() => {
    void refreshWarehouse();
    return () => {
      dbRef.current?.close();
      dbRef.current = null;
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio && audio.state !== 'closed') void audio.close();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [refreshWarehouse]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
      setSpeech({
        supported: false,
        boundaryEvents: false,
        reason: 'This browser has no speech synthesis. The visual metronome and the pacer still work.',
      });
      return undefined;
    }
    const support = detectSpeechSupport(window);
    setSpeech({ supported: support.supported, boundaryEvents: support.boundaryEvents, reason: support.reason });
    if (!support.supported) return undefined;
    const load = () => setVoices(window.speechSynthesis.getVoices().map((voice) => voice.name));
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  /* ------------------------------------------------------------- metronome */

  useEffect(() => {
    if (!settings.metronomeEnabled || settings.metronome.channel === 'visual') return undefined;
    const AudioContextCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return undefined;
    if (!audioRef.current) audioRef.current = new AudioContextCtor();
    const context = audioRef.current;
    void context.resume();
    const config = settings.metronome;
    let cursor = context.currentTime * 1000;
    const tick = () => {
      const horizon = context.currentTime * 1000 + 400;
      const beats = beatsInRange(config, horizon, cursor);
      for (const beat of beats) {
        if (config.channel !== 'visual') {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = beat.accent ? config.toneHz * 1.5 : config.toneHz;
          const at = beat.atMs / 1000;
          gain.gain.setValueAtTime(config.volume, at);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + config.clickMs / 1000);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(at);
          oscillator.stop(at + config.clickMs / 1000);
        }
      }
      const last = beats[beats.length - 1];
      if (last) cursor = last.atMs + 1;
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [settings.metronome, settings.metronomeEnabled]);

  useEffect(() => {
    if (!settings.metronomeEnabled || settings.metronome.channel === 'audio') return undefined;
    const interval = Math.max(60, 60_000 / settings.metronome.bpm);
    const timer = window.setInterval(() => {
      setBeatFlash(true);
      window.setTimeout(() => setBeatFlash(false), Math.min(180, interval * 0.5));
    }, interval);
    return () => window.clearInterval(timer);
  }, [settings.metronome.bpm, settings.metronome.channel, settings.metronomeEnabled]);

  /* ---------------------------------------------------------------- speech */

  useEffect(() => {
    const synthesis = typeof window === 'undefined' ? undefined : window.speechSynthesis;
    if (!synthesis) return undefined;
    const speaking = playing && settings.speechEnabled && speech.supported;
    if (!speaking) {
      synthesis.cancel();
      speechRef.current = null;
      return undefined;
    }
    const plan = buildSpeechPlan(tokensRef.current, {
      wpm: settings.pacing.wpm,
      fromToken: currentTokenIndexRef.current,
    });
    speechRef.current = plan;
    const voice = chooseVoice(synthesis.getVoices(), {
      language: model?.metadata.language || 'en',
      preferred: settings.ttsVoiceName ? [settings.ttsVoiceName] : [],
    });
    let cancelled = false;
    const speak = (index: number) => {
      if (cancelled || index >= plan.chunks.length) return;
      const chunk = plan.chunks[index]!;
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = plan.rate;
      if (voice) utterance.voice = voice;
      utterance.onboundary = (event) => {
        if (!boundaryEventsRef.current) return;
        seekToken(tokenForCharOffset(chunk, event.charIndex));
      };
      utterance.onend = () => speak(index + 1);
      synthesis.speak(utterance);
    };
    speak(0);
    let timer = 0;
    if (!speech.boundaryEvents) {
      // The highlight follows the plan's own timing when the voice does not
      // report word boundaries, which several platforms do not.
      const starts = chunkStartTimes(plan.chunks);
      const began = performance.now();
      timer = window.setInterval(() => {
        const elapsedMs = performance.now() - began;
        let index = 0;
        for (let cursor = 0; cursor < starts.length; cursor += 1) {
          if (starts[cursor]! <= elapsedMs) index = cursor;
          else break;
        }
        const chunk = plan.chunks[index];
        if (!chunk) return;
        const within = Math.min(
          Math.max(0, chunk.tokenOffsets.length - 1),
          Math.floor(((elapsedMs - starts[index]!) / Math.max(1, chunk.estimatedMs)) * chunk.tokenOffsets.length),
        );
        seekToken(chunk.startToken + within);
      }, 120);
    }
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      synthesis.cancel();
    };
  }, [model?.metadata.language, playing, seekToken, settings.pacing.wpm, settings.speechEnabled, settings.ttsVoiceName, speech.boundaryEvents, speech.supported, tokens]);

  const boundaryEventsRef = useRef(speech.boundaryEvents);
  boundaryEventsRef.current = speech.boundaryEvents;

  /* ---------------------------------------------------------- drill engine */

  const weakWords = useMemo(() => bank.map((entry) => entry.word), [bank]);
  const recognisedRef = useRef<ReadonlySet<number>>(new Set());
  recognisedRef.current = recognised;

  const runDrill = useCallback(() => {
    if (tokens.length === 0) return;
    const plan = buildDrillPlan(tokens, settings.drill, { weakWords });
    setDrillPlan(plan);
    setRecognised(new Set());
    setDrillIndex(-1);
    if (plan.flashes.length === 0) {
      setStatus({ phase: 'error', message: 'There is not enough text in this document to build a drill.' });
      return;
    }
    setPlaying(false);
    setDrillRunning(true);
  }, [settings.drill, tokens, weakWords]);

  useEffect(() => {
    if (!drillRunning || !drillPlan) return undefined;
    let cancelled = false;
    let timer = 0;
    const run = (index: number) => {
      if (cancelled) return;
      if (index >= drillPlan.flashes.length) {
        const score = scoreRecall(drillPlan.flashes, recognisedRef.current);
        const words = drillPlan.flashes.reduce((total, flash) => total + flash.words, 0);
        const synthetic: SessionState = {
          ...createSession(model!),
          elapsedMs: drillPlan.totalMs,
          tokensRead: words,
          position: 0,
          peakWpm: flashEquivalentWpm(drillPlan.flashMs, settings.drill.wordsPerFlash),
          paused: true,
        };
        setSummary({ ...summariseSession(synthetic), tokensRead: words, averageWpm: flashEquivalentWpm(drillPlan.flashMs, settings.drill.wordsPerFlash) });
        if (model) persistProgress(flashEquivalentWpm(drillPlan.flashMs, settings.drill.wordsPerFlash));
        setDrillRunning(false);
        setDrillIndex(-1);
        setStatus((current) => ({
          phase: 'ready',
          message: `${stripSessionNote(current.message)} Drill: ${score.correct} of ${score.total} recognised (${score.accuracy}%), first pass at ${score.firstTryAccuracy}%.`,
        }));
        return;
      }
      setDrillIndex(index);
      const flash = drillPlan.flashes[index]!;
      timer = window.setTimeout(() => run(index + 1), Math.max(60, flash.durationMs + flash.gapMs));
    };
    run(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [drillPlan, drillRunning, model, persistProgress, settings.drill.wordsPerFlash]);

  const markRecognised = useCallback(() => {
    setRecognised((current) => (drillIndex < 0 ? current : new Set([...current, drillIndex])));
  }, [drillIndex]);

  const drillScore = useMemo(() => (drillPlan ? scoreRecall(drillPlan.flashes, recognised) : null), [drillPlan, recognised]);

  /* ------------------------------------------------------------ page pacer */

  useEffect(() => {
    if (engine !== 'page' || !model) return undefined;
    const scroller = scrollerRef.current;
    const stage = stageRef.current;
    if (!scroller || !stage) return undefined;
    const element = stage.querySelector<HTMLElement>(`[data-word="${currentTokenIndex}"]`);
    if (!element) return undefined;
    const bounds = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const box: WordBox = {
      x: rect.left - bounds.left + scroller.scrollLeft,
      y: rect.top - bounds.top + scroller.scrollTop,
      width: rect.width,
      height: rect.height,
      word: tokens[currentTokenIndex]?.text ?? '',
    };
    const [pacerBox] = pacerBoxes([box]);
    if (pacerBox) {
      setPacer({
        current: { ...pacerPosition(pacerBox, undefined, 0, settings.pacer), newLine: true },
        glide: appearance.reduceMotion ? 0 : settings.pacer.glideSeconds * 1000,
      });
    }
    if (playing) {
      scroller.scrollTo({
        top: anchorScrollTop(box.y, scroller.clientHeight, settings.pacer),
        behavior: appearance.reduceMotion ? 'auto' : 'smooth',
      });
    }
    return undefined;
  }, [appearance.reduceMotion, currentTokenIndex, engine, model, playing, settings.pacer, tokens]);

  /* ------------------------------------------------------------------ look */

  const themeStyle = useMemo(() => ({
    ...themeVariables(appearance),
    '--sightline-word-size': `${fontSizePx(appearance, 22)}px`,
    '--sightline-page-size': `${fontSizePx(appearance, 19)}px`,
    '--sightline-anchor': `${FOCAL_ANCHOR_FRACTION * 100}%`,
    fontFamily: font.stack,
  }) as React.CSSProperties, [appearance, font.stack]);

  const gradientPalette = paletteById(settings.gradientPalette);
  const renderWord = useCallback(
    (token: TokenRecord, paragraphTokens: readonly TokenRecord[], inParagraph: number) => {
      const parts = settings.emphasis.level > 1
        ? splitEmphasis(token.text, settings.emphasis)
        : { lead: token.text, strong: '', rest: '' };
      const colour = settings.gradient.intensity > 0
        ? samplePalette(gradientPalette, paragraphTokens.length <= 1 ? 0 : inParagraph / (paragraphTokens.length - 1))
        : undefined;
      const highlighted = highlightedTokens.get(token.index);
      const state = token.index === currentTokenIndex ? 'true' : undefined;
      return (
        <span
          key={token.index}
          className="sightline-page-word"
          data-word={token.index}
          data-current={state}
          data-highlight={highlighted}
          style={colour ? { color: colour } : undefined}
        >
          {parts.lead ? (
            <span className="sightline-page-token" data-current={state} data-highlight={highlighted}>
              {parts.lead}
            </span>
          ) : null}
          {parts.strong ? (
            <span className="sightline-page-token" data-emphasis="strong" data-current={state} data-highlight={highlighted}>
              {parts.strong}
            </span>
          ) : null}
          {parts.rest ? (
            <span className="sightline-page-token" data-emphasis="rest" data-current={state} data-highlight={highlighted}>
              {parts.rest}
            </span>
          ) : null}
        </span>
      );
    },
    [currentTokenIndex, gradientPalette, highlightedTokens, settings.emphasis, settings.gradient.intensity],
  );

  /* ---------------------------------------------------------- peripheral */

  const columnLayout = useMemo(
    () => (engine === 'peripheral' ? buildColumnLayout(stageWidth, settings.peripheral) : []),
    [engine, settings.peripheral, stageWidth],
  );
  const eccentricity = useMemo(
    () => columnEccentricityDegrees(columnLayout.map((column) => column.centreFraction), stageWidth),
    [columnLayout, stageWidth],
  );
  const peripheralSlides = useMemo(
    () => (engine === 'peripheral' && tokens.length > 0 ? buildPeripheralSlides(tokens.length, settings.peripheral, 0) : []),
    [engine, settings.peripheral, tokens.length],
  );
  const currentSlide = useMemo(() => {
    if (peripheralSlides.length === 0) return undefined;
    return [...peripheralSlides].reverse().find((slide) => slide.startToken <= currentTokenIndex) ?? peripheralSlides[0];
  }, [currentTokenIndex, peripheralSlides]);
  const columnTextSize = columnFontSize(Math.max(120, stageWidth * (columnLayout[0]?.widthFraction ?? 0.3)), settings.peripheral.columnChars);
  const slideDuration = currentSlide
    ? pageDurationMs(currentSlide.columns.flatMap((column) => column.tokens.map((index) => tokens[index]?.text ?? '')), settings.pacing.wpm)
    : 0;

  /* --------------------------------------------------------------- exports */

  const exportInputs: ExportInputs = useMemo(() => ({
    ...(model ? { model } : {}),
    draft,
    html: DEFAULT_HTML_EXPORT,
    pdf: DEFAULT_PDF_EXPORT,
    epub: DEFAULT_EPUB_EXPORT,
    docx: DEFAULT_DOCX_EXPORT,
    sessions: [...sessions],
    documents: [...documents],
    vocabulary: [...bank],
    state,
  }), [bank, documents, draft, model, sessions, state]);

  const exportRows = useMemo(() => describeExports(model, exportInputs), [exportInputs, model]);

  const runExport = useCallback(
    async (id: ExportId) => {
      setBusyExport(id);
      setExportMessage('');
      try {
        const planned = await planExport(id, exportInputs);
        if (planned.definition.extension === 'pdf' || planned.definition.extension === 'epub' || planned.definition.extension === 'docx') {
          downloadBytes(planned.bytes, planned.fileName, planned.mediaType);
        } else {
          downloadText(new TextDecoder().decode(planned.bytes), planned.fileName, planned.mediaType);
        }
        setExportMessage(`${planned.fileName} written, ${planned.bytes.byteLength.toLocaleString('en-US')} bytes.`);
      } catch (error) {
        setExportMessage(error instanceof Error ? error.message : 'That export could not be written.');
      } finally {
        setBusyExport(null);
      }
    },
    [exportInputs],
  );

  const importReaderState = useCallback((payload: string) => {
    const parsed = importState(stateRef.current, payload);
    setState(parsed.state);
    setExportMessage(parsed.message);
  }, []);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (drillRunning && (event.key === ' ' || event.key === 'Enter' || event.key === 'r')) {
        event.preventDefault();
        markRecognised();
        return;
      }
      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (playing) stop('pause');
          else start();
          break;
        case 'ArrowRight':
          event.preventDefault();
          stepBy(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          stepBy(-1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          stepBy(-25);
          break;
        case 'ArrowDown':
          event.preventDefault();
          stepBy(25);
          break;
        case '[':
          patch({ pacing: { ...settings.pacing, ramp: null, wpm: clampWpm(settings.pacing.wpm - 25) } });
          break;
        case ']':
          patch({ pacing: { ...settings.pacing, ramp: null, wpm: clampWpm(settings.pacing.wpm + 25) } });
          break;
        case 'b':
          setState((current) => addBookmark(current, {
            tokenIndex: currentTokenIndexRef.current,
            label: `Word ${(currentTokenIndexRef.current + 1).toLocaleString('en-US')}`,
            chapterIndex: chapterIndexRef.current,
          }));
          break;
        case 'h':
          if (sentenceRange) {
            setState((current) => addHighlight(current, { startToken: sentenceRange.start, endToken: sentenceRange.end, color: highlightColor }));
          }
          break;
        case 'w':
          if (currentToken) {
            const word = currentToken.text.replace(/[^A-Za-z'-]/g, '');
            markedRef.current = [...markedRef.current, word].filter((entry) => entry.length > 1);
            setStatus((current) => ({ ...current, message: `${stripSessionNote(current.message)} Marked “${word}” for the word bank.` }));
          }
          break;
        case 'r':
          rewindSentence();
          break;
        case 'Escape':
          stop('pause');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentToken, drillRunning, highlightColor, markRecognised, patch, playing, rewindSentence, sentenceRange, settings.pacing, start, stepBy, stop]);

  /* ------------------------------------------------------------ resize watch */

  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setStageWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [model]);

  /* --------------------------------------------------------------- derived */

  const totalWords = tokens.length;
  const progressFraction = totalWords === 0 ? 0 : Math.min(1, (currentTokenIndex + 1) / totalWords);
  const remainingText = tick ? remainingMs(activeSchedule, clock) : Math.max(0, activeSchedule.totalMs - clock);
  const measuredRate = chunked ? chunkStreamWpm(chunked.chunks, chunked.schedule) : scheduleWpm(activeSchedule);
  const savedPosition = model ? progressFor(state, documentKey) : undefined;
  const notesHere = state.notes.filter((note) => Math.abs(note.tokenIndex - currentTokenIndex) <= 1);
  const warehouseSummary = useMemo(
    () => summariseWarehouse([...sessions], [...documents], bank.length),
    [bank.length, documents, sessions],
  );
  const velocity = useMemo(() => velocityByDay([...sessions]), [sessions]);
  const engineDetail = ENGINES.find((entry) => entry.id === engine)?.hint ?? '';

  const bankActions = useMemo(() => ({
    collect: () => {
      const collected = collectVocabulary(timingsRef.current, { ...DEFAULT_COLLECT, markedWords: markedRef.current });
      if (collected.length === 0) {
        setBankMessage('No word was slow enough to collect yet; read for a minute first.');
        return;
      }
      setBankMessage(`Collected ${collected.length} word${collected.length === 1 ? '' : 's'} that took longer than your median.`);
      setBank((current) => {
        let merged: VocabularyEntry[] = [...current];
        for (const entry of collected) {
          const existing = merged.find((item) => item.word.toLowerCase() === entry.word.toLowerCase());
          merged = existing
            ? merged.map((item) => (item.word === existing.word ? { ...item, seen: item.seen + entry.seen, weight: Math.max(item.weight, entry.weight) } : item))
            : [...merged, entry];
        }
        return merged.sort((left, right) => right.weight - left.weight || left.word.localeCompare(right.word));
      });
      void (async () => {
        if (dbRef.current) await putVocabularyEntries(dbRef.current, collected);
      })();
    },
    mark: (word: string) => {
      const cleaned = word.replace(/[^A-Za-z'-]/g, '');
      if (cleaned.length < 2) return;
      markedRef.current = [...markedRef.current, cleaned];
      setBankMessage(`Marked “${cleaned}” for the word bank.`);
      const existing = bank.find((entry) => entry.word.toLowerCase() === cleaned.toLowerCase());
      const entry: VocabularyEntry = existing
        ? { ...existing, seen: existing.seen + 1, weight: existing.weight + 2, lastSeenAt: Date.now() }
        : {
          word: cleaned,
          seen: 1,
          correct: 0,
          averageMs: 0,
          weight: 3,
          addedAt: Date.now(),
          lastSeenAt: Date.now(),
          dueAt: Date.now(),
          intervalDays: 1,
        };
      setBank((current) => (existing ? current.map((item) => (item.word === existing.word ? entry : item)) : [...current, entry]));
      void (async () => {
        if (dbRef.current) await putVocabularyEntries(dbRef.current, [entry]);
      })();
    },
    cloze: () => {
      if (!model) return;
      const items = buildClozeSet(bank, model.tokens, model.sentences, 8);
      setCloze(items);
      setBankMessage(items.length === 0
        ? 'The bank words do not appear in an identifiable sentence yet.'
        : `Cloze drill built with ${items.length} blank${items.length === 1 ? '' : 's'}.`);
    },
    remove: (word: string) => {
      setBank((current) => current.filter((entry) => entry.word !== word));
      void (async () => {
        if (dbRef.current) await deleteVocabularyWord(dbRef.current, word);
      })();
    },
    review: (word: string, correct: boolean) => {
      const existing = bank.find((entry) => entry.word === word);
      if (!existing) return;
      const updated = applyReview({ entry: existing, correct });
      setBank((current) => current.map((entry) => (entry.word === word ? updated : entry)));
      void (async () => {
        if (dbRef.current) await putVocabularyEntries(dbRef.current, [updated]);
      })();
    },
  }), [bank, model]);

  const panelContent = useMemo(() => {
    switch (panel) {
      case 'pace':
        return (
          <PacePanel
            settings={settings}
            patch={patch}
            disabled={!model}
            onPreset={(wpm) => patch({ pacing: { ...settings.pacing, ramp: null, wpm } })}
            onRamp={(ramp: RampConfig | null) => patch({ pacing: { ...settings.pacing, ramp } })}
            metronomeSupported={typeof AudioContext !== 'undefined' || typeof window !== 'undefined'}
            speechSupport={speech}
            voices={voices}
          />
        );
      case 'look':
        return (
          <LookPanel
            settings={settings}
            patch={patch}
            disabled={!model}
            stageWidth={stageWidth}
            eccentricityDegrees={eccentricity.length > 0 ? Math.max(...eccentricity) : 0}
            advisory={columnLayout.length > 0 ? peripheralAdvice(columnLayout, stageWidth) : 'Open the peripheral view to measure column geometry.'}
          />
        );
      case 'drill':
        return (
          <DrillPanel
            settings={settings}
            patch={patch}
            disabled={!model}
            weakWordCount={bank.length}
            summary={summary}
            running={drillRunning}
            onStart={runDrill}
            onStop={() => {
              setDrillRunning(false);
              setDrillIndex(-1);
            }}
            plan={drillPlan
              ? {
                flashes: drillPlan.flashes.length,
                items: drillPlan.uniqueItems,
                totalMs: drillPlan.totalMs,
                clamped: drillPlan.durationClamped,
              }
              : null}
          />
        );
      case 'bank':
        return (
          <BankPanel
            bank={bank}
            cloze={cloze}
            now={Date.now()}
            message={bankMessage}
            onCollect={bankActions.collect}
            onMarkCurrent={() => bankActions.mark(currentToken?.text ?? '')}
            onBuildCloze={bankActions.cloze}
            onRemove={bankActions.remove}
            onReview={bankActions.review}
          />
        );
      case 'marks':
        return (
          <LibraryPanel
            bookmarks={state.bookmarks}
            highlightColor={highlightColor}
            onColor={setHighlightColor}
            onJump={(tokenIndex) => seekToken(tokenIndex)}
            onRemoveBookmark={(id) => setState((current) => removeBookmark(current, id))}
            onRemoveHighlight={(id) => setState((current) => removeHighlight(current, id))}
            onRemoveNote={(id) => setState((current) => removeNote(current, id))}
            highlights={state.highlights}
            notes={state.notes}
            progress={state.progress}
            currentDocumentId={documentKey}
            onInspect={(_id, tokenIndex) => seekToken(tokenIndex)}
          />
        );
      case 'data':
        return (
          <DataPanel
            summary={warehouseSummary}
            sessions={sessions}
            velocity={velocity}
            vocabularySize={bank.length}
            storageNote={warehouseNote}
            onClear={() => {
              void (async () => {
                if (dbRef.current) {
                  const result = await clearWarehouse(dbRef.current);
                  if (!result.ok) {
                    setWarehouseNote(result.message ?? 'The local reading history could not be cleared.');
                    return;
                  }
                }
                setSessions([]);
                setDocuments([]);
                setBank([]);
                setCloze([]);
                setWarehouseNote('The saved session history, document history, and word bank were cleared from this browser.');
              })();
            }}
          />
        );
      default:
        return (
          <ExportPanel
            draft={draft}
            onDraft={(values) => setDraft((current) => ({ ...current, ...values }))}
            onAddTag={(tag) => setDraft((current) => ({
              ...current,
              tags: [...current.tags, tag].filter((entry, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === entry.toLowerCase()) === index).slice(0, 40),
            }))}
            onRemoveTag={(tag) => setDraft((current) => ({ ...current, tags: current.tags.filter((entry) => entry !== tag) }))}
            onSuggestTags={() => {
              if (!model) return;
              const suggested = suggestTags(model);
              setDraft((current) => ({ ...current, tags: [...new Set([...current.tags, ...suggested])].slice(0, 40) }));
            }}
            onMeasuredLevel={() => {
              if (!model) return;
              setDraft((current) => reconcileReadingLevel({ ...current, readingLevel: '' }, model));
            }}
            model={model}
            rows={exportRows}
            busy={busyExport}
            message={exportMessage}
            onDownload={(id) => void runExport(id)}
            onImportState={(payload) => importReaderState(payload)}
            filePreview={exportFileName(draft, 'weighted', 'pdf')}
            onExportState={() => downloadText(exportState(state), exportFileName(draft, 'state', 'json'), 'application/json')}
            state={state}
          />
        );
    }
  }, [
    bank,
    bankActions,
    bankMessage,
    busyExport,
    cloze,
    columnLayout,
    currentToken,
    documentKey,
    draft,
    drillPlan,
    drillRunning,
    eccentricity,
    exportMessage,
    exportRows,
    highlightColor,
    model,
    panel,
    patch,
    runDrill,
    runExport,
    seekToken,
    sessions,
    settings,
    speech,
    stageWidth,
    state,
    summary,
    velocity,
    voices,
    warehouseNote,
    warehouseSummary,
  ]);

  /* ------------------------------------------------------------------ view */

  return (
    <div
      className={`sightline${dragging ? ' sightline--dragging' : ''}`}
      data-testid="sightline-velocity"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <section
        className={`sightline-card sightline-source${dragging ? ' sightline-source--dragging' : ''}`}
        aria-labelledby="sightline-source-heading"
        data-testid="sightline-dropzone"
      >
        <div className="sightline-row sightline-row--between">
          <div>
            <h2 id="sightline-source-heading">{model ? 'Document' : 'Start here'}</h2>
            <p className="sightline-note">{model ? 'Reading is ready. Source and import options stay available when needed.' : 'Open, drop, paste, or choose a sample. Nothing is uploaded.'}</p>
          </div>
          {model ? <span className="sightline-badge">Drop documents here to add more</span> : null}
        </div>
        {model ? (
          <div className="sightline-document-bar" data-testid="sightline-document-bar">
            <div>
              <strong data-testid="sightline-document-title">{model.metadata.title || model.fileName}</strong>
              <span>{model.metrics.words.toLocaleString('en-US')} words · about {Math.max(1, Math.ceil(model.metrics.words / settings.pacing.wpm))} min at {settings.pacing.wpm} wpm</span>
            </div>
            {openDocuments.length > 1 ? (
              <label className="sightline-field sightline-field--inline">
                <span>Open document</span>
                <select data-testid="sightline-document-switcher" value={documentKey} onChange={(event) => {
                  const next = openDocuments.find((entry) => documentId(entry) === event.target.value);
                  if (next) applyResult({ ok: true, model: next, diagnostics: next.diagnostics });
                }}>
                  {openDocuments.map((entry) => <option key={documentId(entry)} value={documentId(entry)}>{entry.fileName}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        {!model ? <div className="sightline-drop sightline-start-here" data-testid="sightline-start-here"><strong>Drop documents here</strong><span>PDF, EPUB, DOCX, Markdown, HTML, RTF, or text</span></div> : null}
        <details className="sightline-source-details" data-testid="sightline-source-details" open={!model}>
          <summary>{model ? 'Source and import options' : 'Open or paste content'}</summary>
        <div className="sightline-row sightline-row--wrap">
          <label className="sightline-button sightline-button--file sightline-button--primary">
            <span>Open a document</span>
            <input
              type="file"
              data-testid="sightline-file"
              multiple
              accept=".pdf,.epub,.docx,.md,.markdown,.html,.htm,.txt,.rtf,text/plain,text/markdown,text/html,application/pdf,application/epub+zip"
              onChange={onPickFile}
            />
          </label>
          <label className="sightline-field sightline-field--inline">
            <span>Sample</span>
            <select value={sampleId} data-testid="sightline-sample-select" onChange={(event) => { const next = event.target.value as SampleId; setSampleId(next); void loadSample(next); }}>
              {SAMPLE_LIBRARY.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
            </select>
          </label>
          <button type="button" className="sightline-button" data-testid="sightline-sample" onClick={() => void loadSample()}>
            Load the sample passage
          </button>
          <details className="sightline-inline-details" data-testid="sightline-clipboard">
            <summary>Clipboard option</summary>
            <button type="button" className="sightline-button sightline-button--small" onClick={() => void readClipboard()}>Read clipboard text</button>
          </details>
          <label className="sightline-row sightline-row--inline">
            <input
              type="checkbox"
              checked={settings.proseOnly}
              data-testid="sightline-prose-only"
              onChange={(event) => patch({ proseOnly: event.target.checked })}
            />
            <span>Prose only</span>
          </label>
          <label className="sightline-row sightline-row--inline">
            <input
              type="checkbox"
              checked={settings.includeNotes}
              data-testid="sightline-include-notes"
              onChange={(event) => patch({ includeNotes: event.target.checked })}
            />
            <span>Include footnotes</span>
          </label>
        </div>
        <label className="sightline-field">
          <span>Or paste text directly</span>
          <textarea
            rows={3}
            value={pasteText}
            data-testid="sightline-paste"
            placeholder="Paste an article, a chapter, or a paragraph…"
            onChange={(event) => setPasteText(event.target.value)}
          />
        </label>
        <div className="sightline-row sightline-row--wrap">
          <label className="sightline-field sightline-field--inline">
            <span>Pasted text is</span>
            <select value={pasteFormat} data-testid="sightline-paste-format" onChange={(event) => setPasteFormat(event.target.value as SourceFormat)}>
              {PASTE_FORMATS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="sightline-button"
            disabled={pasteText.trim().length === 0}
            data-testid="sightline-ingest-paste"
            onClick={() => void pasteIngest()}
          >
            Read the pasted text
          </button>
        </div>
        </details>
        <p className="sightline-note" data-testid="sightline-status" role="status" aria-live="polite">
          {status.message}
        </p>
        {batchResults.length > 1 ? (
          <ul className="sightline-batch-results" data-testid="sightline-batch-results">
            {batchResults.map((entry) => <li key={entry.name}><span><strong>{entry.name}</strong> — {entry.ok ? 'Ready' : entry.message}</span></li>)}
          </ul>
        ) : null}
        {resume ? (
          <div className="sightline-row" data-testid="sightline-resume">
            <span className="sightline-note">
              This document was left at word {resume.tokenIndex.toLocaleString('en-US')} of{' '}
              {resume.tokenCount.toLocaleString('en-US')}.
            </span>
            <button type="button" className="sightline-button sightline-button--small" onClick={() => seekToken(resume.tokenIndex)}>
              Jump there
            </button>
            <button type="button" className="sightline-button sightline-button--small" onClick={() => setResume(undefined)}>
              Start from the top
            </button>
          </div>
        ) : null}
        {diagnostics.length > 0 ? (
          <details className="sightline-diagnostic-details" data-testid="sightline-diagnostic-details">
            <summary>{diagnostics.some((entry) => entry.level === 'error') ? 'Some content could not be read' : 'Import details'}</summary>
            <ul className="sightline-diagnostics" data-testid="sightline-diagnostics">
              {diagnostics.slice(0, 8).map((entry, index) => (
                <li key={`${entry.code}-${index}`} className={`sightline-diagnostic sightline-diagnostic--${entry.level}`}>
                  <span>{entry.message}</span>
                  <span className="sightline-note">{entry.code}{entry.detail ? ` · ${entry.detail}` : ''}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {model ? (
          <>
          <dl className="sightline-facts" data-testid="sightline-report">

            <div>
              <dt>Words</dt>
              <dd>{model.metrics.words.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Sentences</dt>
              <dd>{model.metrics.sentences.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Paragraphs</dt>
              <dd>{model.metrics.paragraphs.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Reading grade</dt>
              <dd>{Math.round(model.metrics.fleschKincaidGrade * 10) / 10} Flesch–Kincaid</dd>
            </div>
          </dl>
          <details className="sightline-technical-details" data-testid="sightline-technical-details">
            <summary>Technical document details</summary>
            <dl className="sightline-facts">
              <div><dt>Format</dt><dd>{model.format}</dd></div>
              <div><dt>Size</dt><dd>{model.byteLength.toLocaleString('en-US')} bytes</dd></div>
              <div><dt>Encoding</dt><dd>{model.encoding}</dd></div>
              <div><dt>Decoded in</dt><dd>{model.ingestMs} ms</dd></div>
            </dl>
          </details>
          </>
        ) : null}
      </section>

      {model ? (
        <details className="sightline-card sightline-contents-details" data-testid="sightline-contents-details">
          <summary id="sightline-navigator-heading">Contents · {model.chapters.length} sections</summary>
          <ol className="sightline-chapter-list" data-testid="sightline-chapters">
            {model.chapters.map((entry) => (
              <li key={entry.index} className={`sightline-chapter sightline-chapter--level-${entry.level}`}>
                <button
                  type="button"
                  className="sightline-link"
                  data-testid={`sightline-chapter-${entry.index}`}
                  onClick={() => {
                    setPlaying(false);
                    seekToken(model.paragraphs[entry.paragraphStart]?.tokenStart ?? 0);
                  }}
                >
                  {entry.title}
                </button>
                <button
                  type="button"
                  className="sightline-button sightline-button--small"
                  aria-label={`Go to ${entry.title}`}
                  onClick={() => {
                    setPlaying(false);
                    seekToken(model.paragraphs[entry.paragraphStart]?.tokenStart ?? 0);
                  }}
                >
                  Go
                </button>
                <span className="sightline-note">
                  {' '}
                  {entry.wordCount.toLocaleString('en-US')} words{entry.page ? ` · page ${entry.page}` : ''}
                </span>
              </li>
            ))}
          </ol>
          {model.pages && model.pages.length > 0 ? (
            <details className="sightline-pages" data-testid="sightline-page-map">
              <summary>
                {model.pages.length} pages · {model.pages.filter((page) => page.characters === 0).length} with no extractable text
              </summary>
              <ul className="sightline-page-list">
                {model.pages.map((page) => (
                  <li key={page.pageNumber}>
                    Page {page.pageNumber}: {(page.width / 72).toFixed(2)}in × {(page.height / 72).toFixed(2)}in
                    {page.rotation !== 0 ? `, rotated ${page.rotation}°` : ''} · {page.characters.toLocaleString('en-US')} characters
                    {page.characters === 0 ? ' (no text layer; OCR is not part of this tool)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </details>
      ) : null}

      <div className="sightline-main">
        <section className="sightline-surface" style={themeStyle} aria-labelledby="sightline-reader-heading" data-testid="sightline-reader">
          <h2 id="sightline-reader-heading" className="sightline-visually-hidden">
            Reading surface
          </h2>
          <div className="sightline-surface-toolbar">
            <div className="sightline-row sightline-row--wrap" role="tablist" aria-label="Presentation engine">
              {ENGINES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={engine === entry.id}
                  className={`sightline-chip${engine === entry.id ? ' sightline-chip--on' : ''}`}
                  title={entry.hint}
                  disabled={!model}
                  data-testid={`sightline-engine-${entry.id}`}
                  onClick={() => {
                    setEngine(entry.id);
                    setPlaying(false);
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="sightline-row sightline-row--wrap sightline-cockpit" data-testid="sightline-cockpit">
              <button
                type="button"
                className="sightline-button sightline-button--primary"
                disabled={!model || engine === 'drill'}
                data-testid="sightline-play"
                onClick={() => {
                  if (playing) stop('pause');
                  else start();
                }}
              >
                {playing ? 'Pause' : 'Read'}
              </button>
              <button type="button" className="sightline-button" disabled={!model} data-testid="sightline-step-back" onClick={() => stepBy(-1)}>
                ◀ word
              </button>
              <button type="button" className="sightline-button" disabled={!model} data-testid="sightline-step-forward" onClick={() => stepBy(1)}>
                word ▶
              </button>
              <button
                type="button"
                className="sightline-button"
                disabled={!model}
                data-testid="sightline-bookmark"
                onClick={() =>
                  setState((current) => addBookmark(current, {
                    tokenIndex: currentTokenIndex,
                    label: `Word ${(currentTokenIndex + 1).toLocaleString('en-US')}`,
                    chapterIndex: chapter?.index ?? 0,
                  }))}
              >
                Bookmark
              </button>
              <label className="sightline-field sightline-field--cockpit">
                <span>Speed</span>
                <input type="number" min={60} max={1200} step={10} value={settings.pacing.wpm} disabled={!model} data-testid="sightline-cockpit-wpm" onChange={(event) => patch({ pacing: { ...settings.pacing, ramp: null, wpm: clampWpm(Number(event.target.value)) } })} />
              </label>
            </div>
          </div>

          <div className="sightline-reader-body">
            <div
              className="sightline-stage"
              ref={stageRef}
              data-testid="sightline-stage"
              data-engine={engine}
              tabIndex={0}
              aria-label="Reading stage. Space starts and pauses reading."
              onKeyDown={(event) => {
                if (event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                if (playing) stop('pause');
                else start();
              }}
            >
              {!model ? (
                <p className="sightline-empty" data-testid="sightline-empty">
                  No document is open yet. Open a file, paste text, or load the sample passage above; the reader, the drills, and
                  the exports all start from there.
                </p>
              ) : engine === 'rsvp' || engine === 'chunk' ? (
                <div
                  className={`sightline-marker sightline-marker-${appearance.focalMarker}`}
                  data-testid={engine === 'chunk' ? 'sightline-chunk' : 'sightline-rsvp'}
                >
                  {appearance.focalMarker === 'brackets' ? (
                    <>
                      <span className="sightline-bracket sightline-bracket--left" aria-hidden="true" />
                      <span className="sightline-bracket sightline-bracket--right" aria-hidden="true" />
                    </>
                  ) : null}
                  {appearance.focalMarker === 'dot' ? <span className="sightline-dot" aria-hidden="true" /> : null}
                  {appearance.focalMarker === 'box' ? <span className="sightline-box" aria-hidden="true" /> : null}
                  <p className="sightline-current" data-testid="sightline-word">
                    <span className="sightline-rsvp-line">
                      <span className="sightline-rsvp-left">
                        {rsvpParts(currentWord, chunked ? chunked.chunks[currentStreamIndex] : null, tokens)[0]}
                        <span className="sightline-rsvp-anchor" style={{ color: accent.color }}>
                          {rsvpParts(currentWord, chunked ? chunked.chunks[currentStreamIndex] : null, tokens)[1]}
                        </span>
                      </span>
                      <span className="sightline-rsvp-right">
                        {rsvpParts(currentWord, chunked ? chunked.chunks[currentStreamIndex] : null, tokens)[2]}
                      </span>
                    </span>
                  </p>
                  <p className="sightline-note" data-testid="sightline-position">
                    word {(currentTokenIndex + 1).toLocaleString('en-US')} of {totalWords.toLocaleString('en-US')}
                    {chapter ? ` · ${chapter.title}` : ''}
                    {chunked ? ` · frame ${(currentStreamIndex + 1).toLocaleString('en-US')} of ${chunked.chunks.length.toLocaleString('en-US')}` : ''}
                  </p>
                  <p className="sightline-note" data-testid="sightline-engine-note">
                    {engineDetail}
                  </p>
                </div>
              ) : engine === 'page' ? (
                <div className="sightline-page-scroll" ref={scrollerRef} data-testid="sightline-page" tabIndex={0} role="region" aria-label="Full-page reading text">
                  {pacer ? (
                    <span
                      className={`sightline-pacer sightline-pacer--${settings.pacer.shape}`}
                      data-testid="sightline-pacer"
                      style={{
                        left: pacer.current.x,
                        top: pacer.current.y,
                        width: pacer.current.width,
                        height: pacer.current.height,
                        transitionDuration: `${pacer.glide}ms`,
                      }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="sightline-pacer sightline-pacer--idle" data-testid="sightline-pacer" aria-hidden="true" />
                  )}
                  {model.paragraphs.map((paragraph) => {
                    const paragraphTokens = tokens.slice(paragraph.tokenStart, paragraph.tokenEnd);
                    return (
                      <p
                        key={paragraph.index}
                        className={`sightline-paragraph sightline-paragraph--${paragraph.kind}`}
                        data-testid="sightline-paragraph"
                      >
                        {paragraphTokens.map((token, index) => renderWord(token, paragraphTokens, index))}
                      </p>
                    );
                  })}
                </div>
              ) : engine === 'peripheral' ? (
                <div className="sightline-peripheral" data-testid="sightline-peripheral">
                  <div className="sightline-columns" style={{ fontSize: `${columnTextSize}px` }}>
                    {columnLayout.map((column, columnIndex) => (
                      <div
                        key={column.index}
                        className={`sightline-column sightline-peripheral-column${settings.peripheral.edgeFade && !appearance.reduceMotion ? ' sightline-column--fade' : ''}`}
                        style={{
                          left: `${column.leftFraction * 100}%`,
                          width: `${column.widthFraction * 100}%`,
                          transform: `translateY(${column.offsetPx}px)`,
                        }}
                        data-testid={`sightline-column-${columnIndex}`}
                      >
                        {(currentSlide?.columns[columnIndex]?.tokens ?? []).map((tokenIndex) => {
                          const token = tokens[tokenIndex];
                          if (!token) return null;
                          return (
                            <span key={token.index} className="sightline-column-word" data-current={token.index === currentTokenIndex ? 'true' : undefined}>
                              {token.text}{' '}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="sightline-note sightline-peripheral-note" data-testid="sightline-peripheral-note">
                    {columnLayout.length} columns, about {columnLayout.length * settings.peripheral.wordsPerColumn} words per view,{' '}
                    {(slideDuration / 1000).toFixed(1)} seconds at {settings.pacing.wpm} wpm. Outer column eccentricity{' '}
                    {Math.round(eccentricity.length > 0 ? Math.max(...eccentricity) : 0)}°.{' '}
                    {columnLayout.length > 0 ? peripheralAdvice(columnLayout, stageWidth) : ''}
                  </p>
                </div>
              ) : (
                <div className="sightline-drill-stage" data-testid="sightline-drill-stage">
                  {drillRunning && drillIndex >= 0 && drillPlan ? (
                    <>
                      <p className="sightline-drill-card" data-testid="sightline-drill-card">
                        {drillPlan.flashes[drillIndex]?.text}
                      </p>
                      <p className="sightline-note" data-testid="sightline-drill-progress">
                        flash {drillIndex + 1} of {drillPlan.flashes.length} · press Space, Enter, or R for each item you recognised
                      </p>
                      <button
                        type="button"
                        className="sightline-button sightline-button--primary"
                        data-testid="sightline-drill-recognise"
                        onClick={markRecognised}
                      >
                        I recognised it
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="sightline-empty">
                        Flash drills show one item at a time at a fixed exposure. Set the exposure in the Drill panel, then run a
                        drill; every item you recognise counts toward the rate it reports.
                      </p>
                      {drillScore ? (
                        <p className="sightline-note" data-testid="sightline-drill-result">
                          Recognised {drillScore.correct} of {drillScore.total} ({drillScore.accuracy}%), first pass{' '}
                          {drillScore.firstTryAccuracy}%, about{' '}
                          {flashEquivalentWpm(
                            drillPlan?.flashMs ?? settings.drill.flashMs,
                            settings.drill.wordsPerFlash,
                          ).toLocaleString('en-US')}{' '}
                          words per minute.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="sightline-scrub">
              <label className="sightline-field sightline-field--scrub">
                <span className="sightline-visually-hidden">Reading position</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalWords - 1)}
                  value={currentTokenIndex}
                  disabled={!model}
                  data-testid="sightline-scrub"
                  onChange={(event) => {
                    setPlaying(false);
                    seekToken(Number(event.target.value));
                  }}
                />
              </label>
              <p className="sightline-note sightline-progress-labels" data-testid="sightline-scrub-labels">
                {Math.round(progressFraction * 100)}% · word {currentTokenIndex.toLocaleString('en-US')} of{' '}
                {totalWords.toLocaleString('en-US')}
              </p>
            </div>

            <dl className="sightline-metrics" data-testid="sightline-metrics">
              <div className="sightline-metric">
                <dt>Live rate</dt>
                <dd data-testid="sightline-live-wpm">{tick ? tick.wpm.toLocaleString('en-US') : 0} wpm</dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>{formatClock(tick ? tick.elapsedMs : clock)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>{formatClock(remainingText)}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{Math.round(progressFraction * 100)}%</dd>
              </div>
              <div>
                <dt>Chapter</dt>
                <dd>{chapter?.title ?? '—'}</dd>
              </div>
            </dl>
            <p className="sightline-note" data-testid="sightline-rate-note-stage">
              {measuredRate.toLocaleString('en-US')} words per minute is what this schedule delivers. {rateNote(settings.pacing.wpm)}
              {chunked
                ? ` A ${settings.chunk.wordsPerChunk}-word frame is what the phrase-policy split decided; about ${suggestedChunkWidth(settings.pacing.wpm)} words per frame is usual at this rate.`
                : ''}
            </p>

            <div className="sightline-note-field">
              <label className="sightline-field">
                <span>Margin note on word {(currentTokenIndex + 1).toLocaleString('en-US')}</span>
                <textarea
                  rows={2}
                  value={noteText}
                  data-testid="sightline-note-input"
                  placeholder="What did this passage actually say?"
                  onChange={(event) => setNoteText(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="sightline-button"
                disabled={noteText.trim().length === 0}
                data-testid="sightline-note-save"
                onClick={() => {
                  setState((current) => upsertNote(current, { tokenIndex: currentTokenIndex, text: noteText.trim() }));
                  setNoteText('');
                }}
              >
                Save note to this word
              </button>
              {notesHere.length > 0 ? (
                <ul className="sightline-note-list" data-testid="sightline-note-here">
                  {notesHere.map((note) => (
                    <li key={note.id}>{note.text}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {savedPosition && savedPosition.documentId === documentKey ? (
              <p className="sightline-note" data-testid="sightline-resume-badge">
                Saved position: word {savedPosition.tokenIndex.toLocaleString('en-US')} of{' '}
                {savedPosition.tokenCount.toLocaleString('en-US')} at {savedPosition.wpm} wpm.
              </p>
            ) : null}

            <p className="sightline-note" data-testid="sightline-style-summary">
              {theme.label} · {font.label} · {settings.pacing.wpm} wpm · {engine} engine ·{' '}
              {settings.appearance.dyslexiaSpacing ? 'wide-tracked spacing' : 'default spacing'} ·{' '}
              {settings.metronomeEnabled ? `metronome ${settings.metronome.bpm} BPM` : 'metronome off'} ·{' '}
              {settings.speechEnabled ? 'speech on' : 'speech off'} · emphasis level {settings.emphasis.level}
            </p>
            {state.bookmarks.length + state.highlights.length + state.notes.length > 0 ? (
              <ul className="sightline-list" data-testid="sightline-marks-strip">
                {[...state.highlights].slice(-4).map((highlight) => (
                  <li key={highlight.id}>
                    <button type="button" className="sightline-link" onClick={() => seekToken(highlight.startToken)}>
                      {highlight.color} highlight
                    </button>{' '}
                    words {highlight.startToken + 1}–{highlight.endToken + 1}
                  </li>
                ))}
                {[...state.bookmarks].slice(-4).map((bookmark) => (
                  <li key={bookmark.id}>
                    <button type="button" className="sightline-link" onClick={() => seekToken(bookmark.tokenIndex)}>
                      Bookmark
                    </button>{' '}
                    {bookmark.label} · word {bookmark.tokenIndex + 1}
                  </li>
                ))}
                {[...state.notes].slice(-4).map((note) => (
                  <li key={note.id}>
                    <button type="button" className="sightline-link" onClick={() => seekToken(note.tokenIndex)}>
                      Note
                    </button>{' '}
                    word {note.tokenIndex + 1}: {note.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {beatFlash ? <span className="sightline-beat" aria-hidden="true" data-testid="sightline-beat" /> : null}
            <p className="sightline-visually-hidden" aria-live="polite">
              {currentWord ? `Now reading ${currentWord}` : ''}
            </p>
          </div>
        </section>

        <aside className="sightline-panels" aria-label="Reading controls">
          <div className="sightline-basic-controls" data-testid="sightline-basic-controls">
            <strong>Basic controls</strong>
            <span className="sightline-note">Use the reading cockpit for the actions needed during a session.</span>
          </div>
          <details className="sightline-settings-details" data-testid="sightline-settings-details">
            <summary>Advanced controls</summary>
          <div className="sightline-tabs" role="tablist" aria-label="Control panel">
            {PANELS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                id={`sightline-control-tab-${entry.id}`}
                role="tab"
                aria-selected={panel === entry.id}
                aria-controls="sightline-control-panel"
                className={`sightline-tab${panel === entry.id ? ' sightline-tab--on' : ''}`}
                data-testid={`sightline-panel-${entry.id}`}
                onClick={() => setPanel(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div id="sightline-control-panel" role="tabpanel" aria-labelledby={`sightline-control-tab-${panel}`} className="sightline-panel-body">{panelContent}</div>
          </details>
        </aside>
      </div>

      <details className="sightline-card sightline-evidence-details" data-testid="sightline-evidence-details">
        <summary id="sightline-evidence-heading">What this can and cannot do</summary>
        <ul className="sightline-limits">
          <li>Documents are decoded in this browser; a scanned PDF with no text layer needs OCR elsewhere first, and this tool does not do OCR.</li>
          <li>
            Rate and comprehension trade off against each other. Published work finds most readers hold comprehension near their
            natural rate and lose it as the rate climbs past roughly 400 words per minute on unfamiliar material.
          </li>
          <li>Punctuation and paragraph pauses are on by default, because the pauses carry meaning that speed alone does not.</li>
          <li>DOCX equations and images arrive as text placeholders, and EPUB structure is rebuilt from the package spine.</li>
          <li>Nothing here measures eye movement, and nothing is uploaded: sessions, notes, and vocabulary stay in this browser.</li>
        </ul>
      </details>
    </div>
  );
}

/** Split a frame into the text before the anchor letter, the letter, and the rest. */
function rsvpParts(
  text: string,
  chunk: { readonly startToken: number; readonly anchorOffset: number } | null,
  tokens: readonly TokenRecord[],
): [string, string, string] {
  if (text.length === 0) return ['', '—', ''];
  let anchor = computeOrp(text);
  if (chunk) {
    const anchorWord = tokens[chunk.startToken + chunk.anchorOffset]?.text ?? '';
    const offset = anchorWord.length > 0 ? text.indexOf(anchorWord) : -1;
    if (offset >= 0) anchor = offset + computeOrp(anchorWord);
  }
  const parts = splitOrp(text, Math.min(Math.max(0, anchor), text.length - 1));
  return [parts.before, parts.anchor, parts.after];
}

const SESSION_NOTE_PATTERN = / (Session|Drill|Cloze|Marked|No word|Dropped|Reading)\b[^.]*\.?$/;

function stripSessionNote(message: string): string {
  return message.replace(SESSION_NOTE_PATTERN, '').trim();
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
