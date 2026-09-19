import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/opendyslexic/400.css';
import Chart from 'chart.js/auto';
import confetti from 'canvas-confetti';
import Papa from 'papaparse';
import { downloadBlob, downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import './typing-styles.css';

import {
  computeMetrics,
  extendTarget,
  finish,
  generateDrill,
  ghostSeries,
  initState,
  isTargetCompleted,
  ngramLatencies,
  perKeyStats,
  pressKey,
  round,
  weakKeys,
  wpmSeries,
  type EngineState,
  type ErrorMode,
  type KeystrokeEvent,
} from './typing-engine';
import {
  CODE_SNIPPETS,
  ENGLISH_TOP_1000,
  LANGUAGE_POOLS,
  LAYOUTS,
  findLayout,
  homeRowAnchors,
  type CorpusMode,
  type Language,
  type LayoutId,
  type Quote,
} from './typing-corpora';
import {
  clearAllTests,
  dailyActivity,
  deleteTest,
  filterStoredTests,
  findPersonalBest,
  listTests,
  readPreference,
  rollingWpm,
  saveTest,
  writePreference,
  type StoredTest,
} from './typing-storage';
import {
  certificatePdf,
  EMPTY_EXPORT_METADATA,
  keystrokesToCsv,
  parseImportedTests,
  sessionMarkdown,
  suggestFilename,
  testToJson,
  testsToCsv,
  testsToJson,
  type ExportMetadata,
} from './typing-export';
import { classifyKeystrokeSound, createAudioController, type SwitchProfile, type AudioController } from './typing-audio';
import { buildTargetText, buildZenChunk, normalizeDurationValue, type DurationMode } from './typing-target';

// -------------------- reducer wiring --------------------

interface EngineAction {
  type: 'press' | 'reset' | 'finish' | 'restart' | 'extend';
  key?: string;
  text?: string;
  code?: string;
  t?: number;
  initial?: EngineState;
  reason?: 'aborted' | 'completed' | 'failed';
}

function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'press':
      return pressKey(state, action.key ?? '', action.code ?? '', action.t ?? performance.now());
    case 'reset':
    case 'restart':
      return action.initial ?? state;
    case 'finish':
      return finish(state, action.reason ?? 'aborted', action.t ?? performance.now());
    case 'extend':
      return extendTarget(state, action.text ?? '');
    default:
      return state;
  }
}

// -------------------- configuration types --------------------

type CaretStyle = 'line' | 'block' | 'underline' | 'box' | 'pulse' | 'ghost';
type ThemeId = 'light' | 'nord' | 'dracula' | 'matrix' | 'paper' | 'cyberpunk' | 'gruvbox' | 'monokai' | 'oled' | 'high-contrast';
type FontId = 'system' | 'dyslexic' | 'hyperlegible' | 'jetbrains' | 'fira' | 'roboto';

interface Config {
  language: Language;
  layout: LayoutId;
  mode: CorpusMode;
  durationMode: DurationMode;
  durationValue: number; // seconds (time), words (word count), quote length index, etc.
  quoteLength: Quote['length'];
  caret: CaretStyle;
  theme: ThemeId;
  font: FontId;
  fontSize: number; // px
  errorMode: ErrorMode;
  allowExtras: boolean;
  caseSensitive: boolean;
  blurUntilFocus: boolean;
  hideStatsDuringTest: boolean;
  audioProfile: SwitchProfile;
  audioVolume: number;
  metronomeOn: boolean;
  metronomeBpm: number;
  ariaLive: boolean;
  ghostEnabled: boolean;
  pacerWpm: number;
  pacerEnabled: boolean;
  customText: string;
  codeIndex: number;
}

const DEFAULT_CONFIG: Config = {
  language: 'english',
  layout: 'qwerty',
  mode: 'words-1000',
  durationMode: 'time',
  durationValue: 30,
  quoteLength: 'medium',
  caret: 'line',
  theme: 'light',
  font: 'jetbrains',
  fontSize: 22,
  errorMode: 'strict',
  allowExtras: true,
  caseSensitive: true,
  blurUntilFocus: false,
  hideStatsDuringTest: false,
  audioProfile: 'off',
  audioVolume: 0.35,
  metronomeOn: false,
  metronomeBpm: 90,
  ariaLive: true,
  ghostEnabled: true,
  pacerWpm: 80,
  pacerEnabled: false,
  customText: '',
  codeIndex: 0,
};

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'paper', label: 'Paper' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'oled', label: 'OLED Black' },
  { id: 'high-contrast', label: 'High-Contrast' },
];

const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: 'jetbrains', label: 'JetBrains Mono' },
  { id: 'fira', label: 'Fira Code' },
  { id: 'roboto', label: 'Roboto Mono' },
  { id: 'hyperlegible', label: 'Atkinson Hyperlegible' },
  { id: 'dyslexic', label: 'OpenDyslexic' },
  { id: 'system', label: 'System UI' },
];

const CARET_OPTIONS: { id: CaretStyle; label: string }[] = [
  { id: 'line', label: 'Line' },
  { id: 'block', label: 'Block' },
  { id: 'underline', label: 'Underline' },
  { id: 'box', label: 'Box' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'ghost', label: 'Ghost' },
];

const CORPUS_MODE_VALUES: readonly CorpusMode[] = ['words-200','words-1000','words-5000','punctuation','numbers','code','medical','legal','kids','quote','zen','custom'];
const DURATION_MODE_VALUES: readonly DurationMode[] = ['time','words','quote','zen','certification'];
const QUOTE_LENGTH_VALUES: readonly Quote['length'][] = ['short','medium','long','thicc'];
const ERROR_MODE_VALUES: readonly ErrorMode[] = ['strict','master','forgiving','confidence'];
const SWITCH_PROFILE_VALUES: readonly SwitchProfile[] = ['off','mx-blue','mx-red','mx-brown','holy-panda','topre','typewriter'];

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
}
function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function normalizeSavedConfig(value: unknown): Config {
  const saved = value != null && typeof value === 'object' ? value as Partial<Record<keyof Config, unknown>> : {};
  let durationMode = oneOf(saved.durationMode, DURATION_MODE_VALUES, DEFAULT_CONFIG.durationMode);
  let mode = oneOf(saved.mode, CORPUS_MODE_VALUES, DEFAULT_CONFIG.mode);
  const durationCandidate = typeof saved.durationValue === 'number' && Number.isFinite(saved.durationValue) ? saved.durationValue : DEFAULT_CONFIG.durationValue;
  const language = typeof saved.language === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGE_POOLS, saved.language) ? saved.language as Language : DEFAULT_CONFIG.language;
  const layout = typeof saved.layout === 'string' && LAYOUTS.some((item) => item.id === saved.layout) ? saved.layout as LayoutId : DEFAULT_CONFIG.layout;
  const customText = typeof saved.customText === 'string' ? saved.customText : DEFAULT_CONFIG.customText;
  const codeIndex = Math.trunc(boundedNumber(saved.codeIndex, DEFAULT_CONFIG.codeIndex, 0, Math.max(0, CODE_SNIPPETS.length - 1)));

  if (durationMode === 'quote') mode = 'quote';
  else if (durationMode === 'zen') mode = 'zen';
  else if (mode === 'quote') durationMode = 'quote';
  else if (mode === 'zen') durationMode = 'zen';
  if (mode === 'custom' && !customText.replace(/\t/g, '    ').trim()) mode = DEFAULT_CONFIG.mode;

  return {
    language, layout,
    mode,
    durationMode,
    durationValue: normalizeDurationValue(durationMode, durationCandidate),
    quoteLength: oneOf(saved.quoteLength, QUOTE_LENGTH_VALUES, DEFAULT_CONFIG.quoteLength),
    caret: oneOf(saved.caret, CARET_OPTIONS.map((item) => item.id), DEFAULT_CONFIG.caret),
    theme: oneOf(saved.theme, THEME_OPTIONS.map((item) => item.id), DEFAULT_CONFIG.theme),
    font: oneOf(saved.font, FONT_OPTIONS.map((item) => item.id), DEFAULT_CONFIG.font),
    fontSize: Math.round(boundedNumber(saved.fontSize, DEFAULT_CONFIG.fontSize, 16, 40)),
    errorMode: oneOf(saved.errorMode, ERROR_MODE_VALUES, DEFAULT_CONFIG.errorMode),
    allowExtras: booleanValue(saved.allowExtras, DEFAULT_CONFIG.allowExtras),
    caseSensitive: booleanValue(saved.caseSensitive, DEFAULT_CONFIG.caseSensitive),
    blurUntilFocus: booleanValue(saved.blurUntilFocus, DEFAULT_CONFIG.blurUntilFocus),
    hideStatsDuringTest: booleanValue(saved.hideStatsDuringTest, DEFAULT_CONFIG.hideStatsDuringTest),
    audioProfile: oneOf(saved.audioProfile, SWITCH_PROFILE_VALUES, DEFAULT_CONFIG.audioProfile),
    audioVolume: boundedNumber(saved.audioVolume, DEFAULT_CONFIG.audioVolume, 0, 1),
    metronomeOn: booleanValue(saved.metronomeOn, DEFAULT_CONFIG.metronomeOn),
    metronomeBpm: Math.round(boundedNumber(saved.metronomeBpm, DEFAULT_CONFIG.metronomeBpm, 40, 300)),
    ariaLive: booleanValue(saved.ariaLive, DEFAULT_CONFIG.ariaLive),
    ghostEnabled: booleanValue(saved.ghostEnabled, DEFAULT_CONFIG.ghostEnabled),
    pacerWpm: Math.round(boundedNumber(saved.pacerWpm, DEFAULT_CONFIG.pacerWpm, 20, 220)),
    pacerEnabled: booleanValue(saved.pacerEnabled, DEFAULT_CONFIG.pacerEnabled),
    customText,
    codeIndex,
  };
}

// -------------------- helpers --------------------

function classifyDuration(cfg: Config): { mode: 'time' | 'words' | 'quote' | 'zen' | 'certification'; value: number } {
  if (cfg.durationMode === 'certification') return { mode: 'certification', value: 300 };
  return { mode: cfg.durationMode, value: cfg.durationValue };
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(1, '0')}:${String(rem).padStart(2, '0')}`;
}

function trapDialogKeyboard(event: React.KeyboardEvent<HTMLDivElement>, onClose: () => void): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// -------------------- workspace component --------------------

export default function TypingWorkspace() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 2147483647));
  const [target, setTarget] = useState<string>(() => buildTargetText(DEFAULT_CONFIG, 12345));
  const [engine, dispatch] = useReducer(reducer, target, (text) => initState(text, {
    errorMode: DEFAULT_CONFIG.errorMode,
    allowExtraChars: DEFAULT_CONFIG.allowExtras,
    caseSensitive: DEFAULT_CONFIG.caseSensitive,
  }));
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState<number>(performance.now());
  const [history, setHistory] = useState<StoredTest[]>([]);
  const [filterTagText, setFilterTagText] = useState('');
  const filterTags = useMemo(() => filterTagText.split(',').map((tag) => tag.trim()).filter(Boolean), [filterTagText]);
  const visibleHistory = useMemo(() => filterStoredTests(history, filterTags.length > 0 ? { tags: filterTags } : {}), [history, filterTags]);
  const [personalBest, setPersonalBest] = useState<StoredTest | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [customTextModalOpen, setCustomTextModalOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [configHydrated, setConfigHydrated] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [pauseUntilFocus, setPauseUntilFocus] = useState(false);

  const audioRef = useRef<AudioController | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const wpmChartRef = useRef<HTMLCanvasElement | null>(null);
  const historyChartRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const histChartRef = useRef<Chart | null>(null);
  const milestoneRef = useRef<Set<number>>(new Set());
  const zenChunkRef = useRef(0);

  const totalDurationMs = useMemo(() => {
    if (config.durationMode === 'time') return config.durationValue * 1000;
    if (config.durationMode === 'certification') return 300 * 1000;
    return 0;
  }, [config.durationMode, config.durationValue]);

  // Load history + preferences on mount.
  useEffect(() => {
    void (async () => {
      try {
        const saved = await readPreference<unknown>('config', null);
        if (saved) {
          const restored = normalizeSavedConfig(saved);
          const restoredTarget = buildTargetText(restored, seed);
          setConfig(restored);
          setTarget(restoredTarget);
          dispatch({ type: 'reset', initial: initState(restoredTarget, {
            errorMode: restored.errorMode,
            allowExtraChars: restored.allowExtras,
            caseSensitive: restored.caseSensitive,
          }) });
        }
        const rows = await listTests();
        setHistory(rows);
      } catch { /* IndexedDB unavailable, keep defaults */ }
      finally { setConfigHydrated(true); }
    })();
    audioRef.current = createAudioController(DEFAULT_CONFIG.audioProfile);
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // Persist configuration whenever it changes.
  useEffect(() => {
    if (!configHydrated) return;
    void writePreference('config', normalizeSavedConfig(config)).catch(() => undefined);
  }, [config, configHydrated]);

  // Rebuild the audio profile when it changes.
  useEffect(() => {
    audioRef.current?.setSwitch(config.audioProfile);
    audioRef.current?.setVolume(config.audioVolume);
    if (config.metronomeOn) audioRef.current?.startMetronome(config.metronomeBpm);
    else audioRef.current?.stopMetronome();
  }, [config.audioProfile, config.audioVolume, config.metronomeOn, config.metronomeBpm]);

  const personalBestQuery = useMemo(() => {
    const dur = classifyDuration(config);
    return {
      mode: config.mode,
      durationMode: dur.mode,
      durationValue: dur.value,
      language: config.language,
      layout: config.layout,
      quoteLength: config.durationMode === 'quote' ? config.quoteLength : undefined,
    };
  }, [config.mode, config.durationMode, config.durationValue, config.language, config.layout, config.quoteLength]);

  // Refresh the personal-best pacer when its comparison family changes.
  useEffect(() => {
    if (!configHydrated) return;
    let cancelled = false;
    void findPersonalBest(personalBestQuery).then((pb) => {
      if (!cancelled) setPersonalBest(pb ?? null);
    });
    return () => { cancelled = true; };
  }, [configHydrated, personalBestQuery]);

  // Wall-clock tick while a test is running.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  // Time-mode auto-finish.
  useEffect(() => {
    if (!running || totalDurationMs === 0) return;
    if (engine.startedAt == null) return;
    const elapsed = now - engine.startedAt;
    if (elapsed >= totalDurationMs) {
      dispatch({ type: 'finish', reason: 'completed', t: engine.startedAt + totalDurationMs });
    }
  }, [running, now, engine.startedAt, totalDurationMs]);

  // Finite non-timed modes finish as soon as the target is cleanly completed.
  useEffect(() => {
    if (!running || engine.finished || totalDurationMs !== 0 || config.durationMode === 'zen') return;
    if (!isTargetCompleted(engine)) return;
    const lastEvent = engine.events[engine.events.length - 1];
    dispatch({ type: 'finish', reason: 'completed', t: lastEvent?.t ?? performance.now() });
  }, [running, engine, totalDurationMs, config.durationMode]);

  // Zen mode replenishes the active target before the typist reaches its end.
  useEffect(() => {
    if (!running || engine.finished || config.durationMode !== 'zen') return;
    if (engine.targetText.length - engine.cursor >= 320) return;
    zenChunkRef.current += 1;
    const chunk = buildZenChunk(config.language, seed + zenChunkRef.current);
    const extension = `${engine.targetText.endsWith(' ') ? '' : ' '}${chunk}`;
    setTarget((current) => current + extension);
    dispatch({ type: 'extend', text: extension });
  }, [running, engine.finished, engine.targetText, engine.cursor, config.durationMode, config.language, seed]);

  // Milestone cues mark quarter-progress without changing typing state.
  useEffect(() => {
    if (!running || engine.finished || config.audioProfile === 'off') return;
    const progress = totalDurationMs > 0 && engine.startedAt != null
      ? Math.min(1, Math.max(0, (now - engine.startedAt) / totalDurationMs))
      : Math.min(1, engine.cursor / Math.max(1, engine.targetText.length));
    for (const threshold of [0.25, 0.5, 0.75]) {
      if (progress >= threshold && !milestoneRef.current.has(threshold)) {
        milestoneRef.current.add(threshold);
        audioRef.current?.playMilestone();
        break;
      }
    }
  }, [running, engine.finished, engine.startedAt, engine.cursor, engine.targetText.length, now, totalDurationMs, config.audioProfile]);

  // Watch for engine.finished transition.
  useEffect(() => {
    if (engine.finished && running) {
      setRunning(false);
      const metrics = computeMetrics(engine);
      if (config.audioProfile !== 'off') {
        if (engine.finishReason === 'failed') audioRef.current?.playFail();
        else if (engine.finishReason === 'completed') audioRef.current?.playCompletion();
      }
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (!reducedMotion && metrics.netWpm > 0 && engine.finishReason === 'completed') {
        confetti({ particleCount: 90, spread: 78, origin: { y: 0.4 } });
      }
      setStatusText(`Test ${engine.finishReason ?? 'ended'}: ${metrics.netWpm} WPM, ${metrics.accuracy}% accuracy.`);
      setSaveModalOpen(true);
    }
  }, [engine.finished, engine.finishReason, running, config.audioProfile]);

  // Live WPM chart: create once, then update data in place on each sample tick.
  useEffect(() => {
    if (!wpmChartRef.current) return;
    chartRef.current = new Chart(wpmChartRef.current, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { title: { display: true, text: 'Words per minute' }, beginAtZero: true },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const samples = wpmSeries(engine, now);
    const ghost = config.ghostEnabled && personalBest?.keystrokes ? ghostSeries(personalBest.keystrokes) : [];
    const datasets: Chart['data']['datasets'] = [
      { label: 'WPM', data: samples.map((s) => s.wpm), borderColor: '#2a3d63', backgroundColor: 'rgba(42,61,99,0.15)', tension: 0.25, fill: true, pointRadius: 0 },
      { label: 'Raw WPM', data: samples.map((s) => s.rawWpm), borderColor: '#8892a6', backgroundColor: 'transparent', borderDash: [4, 4], tension: 0.15, pointRadius: 0 },
    ];
    if (ghost.length > 0) {
      const g = ghost.map((p) => {
        const minutes = p.seconds / 60;
        return minutes > 0 ? round((p.correctChars / 5) / minutes) : 0;
      });
      datasets.push({ label: 'Personal Best (ghost)', data: g, borderColor: '#7dd39b', backgroundColor: 'transparent', tension: 0.15, pointRadius: 0 });
    }
    if (config.pacerEnabled) {
      datasets.push({ label: `Pacer ${config.pacerWpm} WPM`, data: samples.map(() => config.pacerWpm), borderColor: '#d97706', backgroundColor: 'transparent', borderDash: [2, 4], tension: 0, pointRadius: 0 });
    }
    chart.data.labels = samples.map((s) => `${s.seconds}s`);
    chart.data.datasets = datasets;
    chart.update('none');
  }, [engine, now, personalBest, config.ghostEnabled, config.pacerEnabled, config.pacerWpm]);

  // Historical trend chart.
  useEffect(() => {
    if (!historyChartRef.current) return;
    const sorted = visibleHistory.slice().sort((a, b) => a.savedAt - b.savedAt);
    const labels = sorted.map((t, i) => (t.savedAt ? new Date(t.savedAt).toLocaleDateString() : String(i + 1)));
    const wpm = sorted.map((t) => t.netWpm);
    const acc = sorted.map((t) => t.accuracy);
    const rollingFor = (size: number) => wpm.map((_, i) => {
      const window = wpm.slice(Math.max(0, i - size + 1), i + 1);
      return round(window.reduce((a, b) => a + b, 0) / window.length);
    });
    const rolling10 = rollingFor(10);
    const rolling50 = rollingFor(50);
    const allTime = wpm.map((_, i) => round(wpm.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1)));
    if (histChartRef.current) histChartRef.current.destroy();
    histChartRef.current = new Chart(historyChartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Net WPM', data: wpm, borderColor: '#2a3d63', backgroundColor: 'transparent', pointRadius: 2 },
          { label: 'Rolling 10-test avg', data: rolling10, borderColor: '#7dd39b', backgroundColor: 'transparent', pointRadius: 0 },
          { label: 'Rolling 50-test avg', data: rolling50, borderColor: '#6b7280', backgroundColor: 'transparent', borderDash: [6, 3], pointRadius: 0 },
          { label: 'All-time avg', data: allTime, borderColor: '#7c3aed', backgroundColor: 'transparent', borderDash: [2, 3], pointRadius: 0 },
          { label: 'Accuracy %', data: acc, borderColor: '#d97706', backgroundColor: 'transparent', yAxisID: 'y2', pointRadius: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { position: 'left', beginAtZero: true, title: { display: true, text: 'WPM' } },
          y2: { position: 'right', beginAtZero: true, max: 100, title: { display: true, text: 'Accuracy %' }, grid: { drawOnChartArea: false } },
        },
      },
    });
    return () => {
      histChartRef.current?.destroy();
      histChartRef.current = null;
    };
  }, [visibleHistory]);

  const metrics = useMemo(() => computeMetrics(engine, now), [engine, now]);
  const layoutDef = useMemo(() => findLayout(config.layout), [config.layout]);
  const homeAnchors = useMemo(() => homeRowAnchors(layoutDef), [layoutDef]);
  const keyStats = useMemo(() => perKeyStats(engine.events), [engine.events]);
  const bigrams = useMemo(() => ngramLatencies(engine.events, 2).slice(0, 12), [engine.events]);
  const trigrams = useMemo(() => ngramLatencies(engine.events, 3).slice(0, 12), [engine.events]);
  const weak = useMemo(() => weakKeys(engine.events, 6), [engine.events]);

  const rebuildTarget = useCallback((patchCfg?: Partial<Config>) => {
    const cfg = { ...config, ...(patchCfg ?? {}) };
    const nextSeed = Math.floor(Math.random() * 2147483647);
    const nextText = buildTargetText(cfg, nextSeed);
    setSeed(nextSeed);
    setTarget(nextText);
    dispatch({ type: 'reset', initial: initState(nextText, {
      errorMode: cfg.errorMode,
      allowExtraChars: cfg.allowExtras,
      caseSensitive: cfg.caseSensitive,
    }) });
    setRunning(false);
    milestoneRef.current.clear();
    zenChunkRef.current = 0;
    setStatusText('New text ready.');
  }, [config]);

  const applyConfig = useCallback((patch: Partial<Config>) => {
    const normalized: Partial<Config> = { ...patch };
    if (patch.durationMode !== undefined) {
      normalized.durationValue = normalizeDurationValue(patch.durationMode, patch.durationValue ?? config.durationValue);
    }
    if (patch.durationMode === 'quote') normalized.mode = 'quote';
    if (patch.durationMode === 'zen') normalized.mode = 'zen';
    if (patch.durationMode !== undefined && patch.durationMode !== 'quote' && patch.durationMode !== 'zen'
        && patch.mode === undefined && (config.mode === 'quote' || config.mode === 'zen')) {
      normalized.mode = DEFAULT_CONFIG.mode;
    }
    if (patch.mode === 'quote' && patch.durationMode === undefined) normalized.durationMode = 'quote';
    if (patch.mode === 'zen' && patch.durationMode === undefined) normalized.durationMode = 'zen';
    if (patch.mode && patch.mode !== 'quote' && patch.mode !== 'zen' && patch.durationMode === undefined
        && (config.durationMode === 'quote' || config.durationMode === 'zen')) {
      normalized.durationMode = 'time';
      normalized.durationValue = normalizeDurationValue('time', patch.durationValue ?? config.durationValue);
    }
    setConfig((c) => ({ ...c, ...normalized }));
    if ('mode' in normalized || 'durationMode' in normalized || 'durationValue' in normalized || 'quoteLength' in normalized || 'language' in normalized || 'codeIndex' in normalized || 'customText' in normalized) {
      rebuildTarget(normalized);
    }
    if ('errorMode' in normalized || 'allowExtras' in normalized || 'caseSensitive' in normalized) {
      dispatch({ type: 'reset', initial: initState(target, {
        errorMode: (normalized.errorMode ?? config.errorMode),
        allowExtraChars: (normalized.allowExtras ?? config.allowExtras),
        caseSensitive: (normalized.caseSensitive ?? config.caseSensitive),
      }) });
    }
  }, [config, rebuildTarget, target]);

  // Global key handler on the canvas.
  const handleKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (running) dispatch({ type: 'finish', reason: 'aborted' });
      setRunning(false);
      setStatusText('Test aborted.');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      rebuildTarget();
      return;
    }
    if (engine.finished) return;
    const t = performance.now();
    const commitsExpectedCharacter = e.key.length === 1 || (e.key === 'Enter' && engine.targetText[engine.cursor] === '\n');
    if (!running && commitsExpectedCharacter) {
      setRunning(true);
      setStatusText('Test started.');
    }
    e.preventDefault();
    const sound = classifyKeystrokeSound(e.key, engine.targetText[engine.cursor], config.caseSensitive);
    dispatch({ type: 'press', key: e.key, code: e.code, t });
    if (config.audioProfile !== 'off' && sound) audioRef.current?.playKeystroke(sound);
  }, [engine.finished, engine.targetText, engine.cursor, rebuildTarget, running, config.audioProfile, config.caseSensitive]);

  const restart = useCallback(() => {
    rebuildTarget();
  }, [rebuildTarget]);

  const abort = useCallback(() => {
    if (running && !engine.finished) dispatch({ type: 'finish', reason: 'aborted' });
    setRunning(false);
  }, [running, engine.finished]);

  // Save flow — invoked from the finish modal.
  const handleSave = useCallback(async (meta: ExportMetadata, options: { includeKeystrokes: boolean }) => {
    const dur = classifyDuration(config);
    const stored: StoredTest = {
      savedAt: Date.now(),
      mode: config.mode,
      durationMode: dur.mode,
      durationValue: dur.value,
      quoteLength: config.durationMode === 'quote' ? config.quoteLength : undefined,
      language: config.language,
      layout: config.layout,
      targetText: target,
      finishReason: engine.finishReason ?? 'aborted',
      netWpm: metrics.netWpm,
      grossWpm: metrics.grossWpm,
      rawCpm: metrics.rawCpm,
      accuracy: metrics.accuracy,
      consistency: metrics.consistency,
      elapsedMs: metrics.elapsedMs,
      correctChars: metrics.correctChars,
      incorrectChars: metrics.incorrectChars,
      missedChars: metrics.missedChars,
      extraChars: metrics.extraChars,
      tags: meta.tags,
      notes: meta.notes,
      keystrokes: options.includeKeystrokes ? engine.events : undefined,
    };
    await saveTest(stored);
    setHistory(await listTests());
    setPersonalBest(await findPersonalBest(personalBestQuery) ?? null);
    setSaveModalOpen(false);
    setStatusText('Test saved to local history.');
  }, [config, engine, metrics, target, personalBestQuery]);

  const handleExportSingle = useCallback(async (format: 'csv' | 'json' | 'pdf' | 'keystrokes', meta: ExportMetadata) => {
    const dur = classifyDuration(config);
    const currentTest: StoredTest = {
      savedAt: Date.now(),
      mode: config.mode,
      durationMode: dur.mode,
      durationValue: dur.value,
      quoteLength: config.durationMode === 'quote' ? config.quoteLength : undefined,
      language: config.language,
      layout: config.layout,
      targetText: target,
      finishReason: engine.finishReason ?? 'aborted',
      netWpm: metrics.netWpm,
      grossWpm: metrics.grossWpm,
      rawCpm: metrics.rawCpm,
      accuracy: metrics.accuracy,
      consistency: metrics.consistency,
      elapsedMs: metrics.elapsedMs,
      correctChars: metrics.correctChars,
      incorrectChars: metrics.incorrectChars,
      missedChars: metrics.missedChars,
      extraChars: metrics.extraChars,
      tags: [],
      notes: '',
      keystrokes: engine.events,
    };
    if (format === 'csv') downloadText(testsToCsv([currentTest], meta), suggestFilename('csv', 'test'), 'text/csv;charset=utf-8');
    if (format === 'json') downloadText(testToJson(currentTest, meta), suggestFilename('json', 'test'), 'application/json');
    if (format === 'pdf') downloadBlob(certificatePdf(currentTest, meta), suggestFilename('pdf', 'test'));
    if (format === 'keystrokes') downloadText(keystrokesToCsv(currentTest.keystrokes ?? []), suggestFilename('csv', 'test').replace('.csv', '-keystrokes.csv'), 'text/csv;charset=utf-8');
    setStatusText(`Exported ${format === 'keystrokes' ? 'keystroke CSV' : format.toUpperCase()} for this test.`);
  }, [config, engine, metrics, target]);

  const handleExportHistory = useCallback(async (format: 'csv' | 'json' | 'md', meta: ExportMetadata) => {
    const stamp = suggestFilename(format === 'md' ? 'md' : (format as 'csv' | 'json'), 'history');
    if (format === 'csv') downloadText(testsToCsv(visibleHistory, meta), stamp, 'text/csv;charset=utf-8');
    if (format === 'json') downloadText(testsToJson(visibleHistory, meta), stamp, 'application/json');
    if (format === 'md') downloadText(sessionMarkdown(visibleHistory, meta), stamp, 'text/markdown;charset=utf-8');
    setStatusText(`Exported ${format === 'md' ? 'Markdown' : format.toUpperCase()} history.`);
  }, [visibleHistory]);

  // Import handlers.
  const importJson = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { tests, skipped } = parseImportedTests(parsed);
      for (const record of tests) await saveTest(record);
      setHistory(await listTests());
      setPersonalBest(await findPersonalBest(personalBestQuery) ?? null);
      const skippedText = skipped > 0 ? ` Skipped ${skipped} invalid record${skipped === 1 ? '' : 's'}.` : '';
      setStatusText(`Imported ${tests.length} test${tests.length === 1 ? '' : 's'}.${skippedText}`);
    } catch (err) {
      setStatusText(`Import failed: ${(err as Error).message}`);
    }
  }, [personalBestQuery]);

  const importCsvDictionary = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      const words = parsed.data.flat().map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
      if (words.length === 0) throw new Error('No words found in CSV.');
      const custom = words.join(' ');
      applyConfig({ mode: 'custom', customText: custom });
      setStatusText(`Loaded ${words.length} custom words.`);
    } catch (err) {
      setStatusText(`Dictionary import failed: ${(err as Error).message}`);
    }
  }, [applyConfig]);

  // Weak-key drill launcher.
  const launchDrill = useCallback(() => {
    const w = weak.length > 0 ? weak : ['e', 'r', 't'];
    const drill = generateDrill({
      weakKeys: w,
      wordPool: config.language === 'english' ? ENGLISH_TOP_1000 : LANGUAGE_POOLS[config.language],
      targetLength: 220,
      seed: Math.floor(Math.random() * 2147483647),
    });
    if (!drill) {
      setStatusText('Not enough data yet to build a drill.');
      return;
    }
    applyConfig({ mode: 'custom', customText: drill });
    setStatusText(`Drill ready targeting weak keys: ${w.join(', ')}.`);
  }, [applyConfig, config.language, weak]);

  const heatmap = useMemo(() => buildHeatmap(keyStats, layoutDef.rows), [keyStats, layoutDef.rows]);

  // Rolling averages and activity reflect the same visible tag-filtered history used for exports.
  const rolling = useMemo(() => rollingWpm(visibleHistory), [visibleHistory]);
  const daily = useMemo(() => dailyActivity(visibleHistory).slice(-30), [visibleHistory]);
  const durationRemainingMs = totalDurationMs && engine.startedAt != null ? Math.max(0, totalDurationMs - (now - engine.startedAt)) : totalDurationMs;

  // Blur-until-focus effect handler.
  useEffect(() => {
    if (!config.blurUntilFocus) { setPauseUntilFocus(false); return; }
    setPauseUntilFocus(true);
  }, [config.blurUntilFocus, target]);

  return (
    <div className={`tw-root`} data-theme={config.theme} data-font={config.font}
      style={{ ['--tw-font-size' as string]: `${config.fontSize}px` }}>
      <div className="tw-visually-hidden" aria-live="polite" role="status">{config.ariaLive ? statusText : ''}</div>

      {/* Configuration toolbar */}
      <div className="tw-toolbar" role="region" aria-label="Test configuration">
        <label>
          Mode
          <select value={config.mode} onChange={(e) => applyConfig({ mode: e.target.value as CorpusMode })}>
            <option value="words-200">Top 200 words</option>
            <option value="words-1000">Top 1,000 words</option>
            <option value="words-5000">Top 5,000 words</option>
            <option value="punctuation">Punctuation</option>
            <option value="numbers">Numbers &amp; symbols</option>
            <option value="code">Programmer code</option>
            <option value="medical">Medical transcription</option>
            <option value="legal">Legal transcription</option>
            <option value="kids">Kids academy</option>
            <option value="quote">Literature quote</option>
            <option value="zen">Zen (infinite)</option>
            <option value="custom">Custom text</option>
          </select>
        </label>
        <label>
          Duration
          <select value={config.durationMode} onChange={(e) => applyConfig({ durationMode: e.target.value as DurationMode })}>
            <option value="time">Time</option>
            <option value="words">Words</option>
            <option value="quote">Quote</option>
            <option value="zen">Zen</option>
            <option value="certification">5-min certification</option>
          </select>
        </label>
        {config.durationMode === 'time' && (
          <label>
            Seconds
            <select value={config.durationValue} onChange={(e) => applyConfig({ durationValue: Number(e.target.value) })}>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>120s</option>
            </select>
          </label>
        )}
        {config.durationMode === 'words' && (
          <label>
            Words
            <select value={config.durationValue} onChange={(e) => applyConfig({ durationValue: Number(e.target.value) })}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        )}
        {config.durationMode === 'quote' && (
          <label>
            Length
            <select value={config.quoteLength} onChange={(e) => applyConfig({ quoteLength: e.target.value as Quote['length'] })}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
              <option value="thicc">Thicc</option>
            </select>
          </label>
        )}
        <label>
          Language
          <select value={config.language} onChange={(e) => applyConfig({ language: e.target.value as Language })}>
            {Object.keys(LANGUAGE_POOLS).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>
          Layout
          <select value={config.layout} onChange={(e) => applyConfig({ layout: e.target.value as LayoutId })}>
            {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label>
          Errors
          <select value={config.errorMode} onChange={(e) => applyConfig({ errorMode: e.target.value as ErrorMode })}>
            <option value="strict">Strict</option>
            <option value="master">Master (instant fail)</option>
            <option value="forgiving">Forgiving</option>
            <option value="confidence">Confidence (no backspace)</option>
          </select>
        </label>
        {config.mode === 'code' && (
          <label>
            Snippet
            <select value={config.codeIndex} onChange={(e) => applyConfig({ codeIndex: Number(e.target.value) })}>
              {CODE_SNIPPETS.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
            </select>
          </label>
        )}
        {config.mode === 'custom' && (
          <button type="button" className="subtle" onClick={() => setCustomTextModalOpen(true)}>Paste text</button>
        )}
        <button type="button" onClick={restart}>New text</button>
        <button type="button" className="subtle" onClick={abort} disabled={!running}>Abort</button>
        <button type="button" className="subtle" onClick={launchDrill}>Weak-key drill</button>
        <button type="button" className="subtle" onClick={() => setExportModalOpen(true)}>Export…</button>
      </div>

      {/* Live stats */}
      {!(config.hideStatsDuringTest && running && !engine.finished) && (
        <div className="tw-stats-strip" aria-label="Live typing metrics">
          <div className="tw-stat"><h3>Net WPM</h3><p>{metrics.netWpm}</p><small>Gross {metrics.grossWpm}</small></div>
          <div className="tw-stat"><h3>Accuracy</h3><p>{metrics.accuracy}%</p><small>{metrics.incorrectChars} errors</small></div>
          <div className="tw-stat"><h3>Consistency</h3><p>{metrics.consistency}%</p><small>Higher is smoother</small></div>
          <div className="tw-stat"><h3>Raw CPM</h3><p>{metrics.rawCpm}</p><small>{metrics.correctChars + metrics.incorrectChars + metrics.extraChars} chars</small></div>
          <div className="tw-stat"><h3>Timer</h3><p>{formatMs(totalDurationMs ? durationRemainingMs : metrics.elapsedMs)}</p><small>{totalDurationMs ? 'Remaining' : 'Elapsed'}</small></div>
        </div>
      )}

      {/* Typing canvas */}
      <div
        ref={canvasRef}
        className={`tw-canvas ${config.blurUntilFocus && pauseUntilFocus ? 'blur-mode' : ''}`}
        tabIndex={0}
        role="textbox"
        aria-label="Typing test canvas. Type the visible text. Press Escape to abort or Tab for a new sample."
        aria-multiline="true"
        style={{ fontSize: `${config.fontSize}px` }}
        onKeyDown={handleKey}
        onFocus={() => setPauseUntilFocus(false)}
      >
        {renderCells(engine, config.caret)}
        {pauseUntilFocus && <span className="tw-visually-hidden">Focus the canvas to begin.</span>}
      </div>

      {/* Panels */}
      <div className="tw-panels">
        <div className="tw-panel">
          <h3>WPM curve</h3>
          <div className="tw-chart"><canvas ref={wpmChartRef} role="img" aria-label="Live net WPM, raw WPM, personal-best ghost, and target pace chart" /></div>
        </div>
        <div className="tw-panel">
          <h3>Keyboard heatmap ({layoutDef.label})</h3>
          <VirtualKeyboard layout={layoutDef} heat={heatmap.heat} errors={heatmap.errors} />
          <div className="tw-ergo-hint" aria-label="Finger discipline reminder">
            <span>⌂</span>
            <span>Anchor left index on <strong>{homeAnchors.left}</strong>, right index on <strong>{homeAnchors.right}</strong>. Weak keys this session: <strong>{weak.length > 0 ? weak.join(', ') : '—'}</strong>.</span>
          </div>
        </div>
        <div className="tw-panel">
          <h3>Bigram latency (ms)</h3>
          <NgramTable rows={bigrams} />
        </div>
        <div className="tw-panel">
          <h3>Trigram latency (ms)</h3>
          <NgramTable rows={trigrams} />
        </div>
        <div className="tw-panel">
          <h3>Per-key summary</h3>
          <KeyStatsTable rows={keyStats.slice(0, 12)} />
        </div>
        <div className="tw-panel">
          <h3>Personal best / pacer</h3>
          <p style={{ margin: 0 }}>
            {personalBest ? (
              <>Best {personalBest.netWpm} WPM · {personalBest.accuracy}% acc · {new Date(personalBest.savedAt).toLocaleDateString()}</>
            ) : (
              <>No comparable personal best yet.</>
            )}
          </p>
          <label style={{ display: 'block', marginTop: '0.4rem' }}>
            <input type="checkbox" checked={config.ghostEnabled} onChange={(e) => setConfig((c) => ({ ...c, ghostEnabled: e.target.checked }))} /> Show ghost pacer
          </label>
          <label style={{ display: 'block' }}>
            <input type="checkbox" checked={config.pacerEnabled} onChange={(e) => setConfig((c) => ({ ...c, pacerEnabled: e.target.checked }))} /> Target-WPM pacer
          </label>
          {config.pacerEnabled && (
            <label>
              Pacer WPM
              <input
                type="number" min={20} max={220} value={config.pacerWpm}
                onChange={(e) => { if (Number.isFinite(e.currentTarget.valueAsNumber)) setConfig((c) => ({ ...c, pacerWpm: e.currentTarget.valueAsNumber })); }}
                onBlur={() => setConfig((c) => ({ ...c, pacerWpm: Math.round(boundedNumber(c.pacerWpm, DEFAULT_CONFIG.pacerWpm, 20, 220)) }))}
              />
            </label>
          )}
        </div>
        <div className="tw-panel">
          <h3>Comfort &amp; accessibility</h3>
          <label>
            Theme
            <select value={config.theme} onChange={(e) => setConfig((c) => ({ ...c, theme: e.target.value as ThemeId }))}>
              {THEME_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label>
            Font
            <select value={config.font} onChange={(e) => setConfig((c) => ({ ...c, font: e.target.value as FontId }))}>
              {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label>
            Font size
            <input type="range" min={16} max={40} step={1} value={config.fontSize} onChange={(e) => setConfig((c) => ({ ...c, fontSize: Number(e.target.value) }))} />
            <span>{config.fontSize}px</span>
          </label>
          <label>
            Caret
            <select value={config.caret} onChange={(e) => setConfig((c) => ({ ...c, caret: e.target.value as CaretStyle }))}>
              {CARET_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={config.blurUntilFocus} onChange={(e) => setConfig((c) => ({ ...c, blurUntilFocus: e.target.checked }))} /> Blur canvas until focused (zen)
          </label>
          <label>
            <input type="checkbox" checked={config.hideStatsDuringTest} onChange={(e) => setConfig((c) => ({ ...c, hideStatsDuringTest: e.target.checked }))} /> Hide stats while typing
          </label>
          <label>
            <input type="checkbox" checked={config.ariaLive} onChange={(e) => setConfig((c) => ({ ...c, ariaLive: e.target.checked }))} /> Screen-reader announcements
          </label>
          <label>
            <input type="checkbox" checked={config.caseSensitive} onChange={(e) => applyConfig({ caseSensitive: e.target.checked })} /> Case sensitive
          </label>
          <label>
            <input type="checkbox" checked={config.allowExtras} onChange={(e) => applyConfig({ allowExtras: e.target.checked })} /> Allow extra characters
          </label>
        </div>
        <div className="tw-panel">
          <h3>Sensory feedback</h3>
          <label>
            Switch
            <select value={config.audioProfile} onChange={(e) => setConfig((c) => ({ ...c, audioProfile: e.target.value as SwitchProfile }))}>
              <option value="off">Off</option>
              <option value="mx-blue">Cherry MX Blue</option>
              <option value="mx-red">Cherry MX Red</option>
              <option value="mx-brown">Cherry MX Brown</option>
              <option value="holy-panda">Holy Panda</option>
              <option value="topre">Topre Capacitive</option>
              <option value="typewriter">Vintage Typewriter</option>
            </select>
          </label>
          <label>
            Volume
            <input type="range" min={0} max={1} step={0.05} value={config.audioVolume} onChange={(e) => setConfig((c) => ({ ...c, audioVolume: Number(e.target.value) }))} />
          </label>
          <label>
            <input type="checkbox" checked={config.metronomeOn} onChange={(e) => setConfig((c) => ({ ...c, metronomeOn: e.target.checked }))} /> Metronome
          </label>
          {config.metronomeOn && (
            <label>
              BPM
              <input
                type="number" min={40} max={300} value={config.metronomeBpm}
                onChange={(e) => { if (Number.isFinite(e.currentTarget.valueAsNumber)) setConfig((c) => ({ ...c, metronomeBpm: e.currentTarget.valueAsNumber })); }}
                onBlur={() => setConfig((c) => ({ ...c, metronomeBpm: Math.round(boundedNumber(c.metronomeBpm, DEFAULT_CONFIG.metronomeBpm, 40, 300)) }))}
              />
            </label>
          )}
        </div>
      </div>

      {/* History */}
      <section className="tw-panel" aria-label="Session history">
        <h3>History &amp; longitudinal analytics</h3>
        <div className="tw-history-controls">
          <label>
            Filter by tag
            <input type="text" placeholder="e.g. morning,code" value={filterTagText} onChange={(e) => setFilterTagText(e.target.value)} />
          </label>
          <button className="subtle" type="button" onClick={async () => setHistory(await listTests())}>Refresh</button>
          <label className="subtle" style={{ padding: '0.35rem 0.6rem', border: '1px solid #b6bfce', borderRadius: 8 }}>
            Import JSON
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
          </label>
          <label className="subtle" style={{ padding: '0.35rem 0.6rem', border: '1px solid #b6bfce', borderRadius: 8 }}>
            Load CSV dictionary
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsvDictionary(f); e.target.value = ''; }} />
          </label>
          <button className="subtle" type="button" onClick={() => setConfirmClear(true)}>Clear history…</button>
        </div>
        <div className="tw-stats-strip">
          <div className="tw-stat"><h3>{filterTags.length > 0 ? 'Matching tests' : 'Total tests'}</h3><p>{visibleHistory.length}</p></div>
          <div className="tw-stat"><h3>10-test avg</h3><p>{round(rolling.last10)}</p></div>
          <div className="tw-stat"><h3>50-test avg</h3><p>{round(rolling.last50)}</p></div>
          <div className="tw-stat"><h3>All-time avg</h3><p>{round(rolling.allTime)}</p></div>
        </div>
        <div className="tw-chart" style={{ marginTop: '0.5rem' }}><canvas ref={historyChartRef} role="img" aria-label="Typing history chart with net WPM, 10-test, 50-test, all-time averages, and accuracy" /></div>
        <PagedTable
          columns={[
            { key: 'saved', label: 'Saved' },
            { key: 'mode', label: 'Mode' },
            { key: 'wpm', label: 'WPM' },
            { key: 'accuracy', label: 'Acc' },
            { key: 'consistency', label: 'Cons' },
            { key: 'tags', label: 'Tags' },
            { key: 'actions', label: 'Actions' },
          ]}
          rows={visibleHistory}
          pageSize={24}
          caption="Saved typing tests"
          rowKey={(test, index) => String(test.id ?? (String(test.savedAt) + '-' + index))}
          renderCell={(test, columnKey) => {
            if (columnKey === 'saved') return new Date(test.savedAt).toLocaleString();
            if (columnKey === 'mode') return test.mode;
            if (columnKey === 'wpm') return test.netWpm;
            if (columnKey === 'accuracy') return `${test.accuracy}%`;
            if (columnKey === 'consistency') return `${test.consistency}%`;
            if (columnKey === 'tags') return test.tags.join(', ');
            if (columnKey === 'actions') {
              return (
                <button type="button" className="subtle" onClick={async () => {
                  if (test.id != null) {
                    await deleteTest(test.id);
                    setHistory(await listTests());
                    setPersonalBest(await findPersonalBest(personalBestQuery) ?? null);
                    setStatusText('Test deleted from local history.');
                  }
                }}>Delete</button>
              );
            }
            return null;
          }}
        />
        <p style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#4b5468' }}>Daily activity (last 30 active days): {daily.length}</p>
      </section>

      {/* Save modal */}
      {saveModalOpen && (
        <SaveTestModal
          onCancel={() => setSaveModalOpen(false)}
          onSave={handleSave}
          onExport={handleExportSingle}
          summary={metrics}
          canCertificate={engine.finishReason === 'completed'}
        />
      )}

      {exportModalOpen && (
        <ExportHistoryModal
          onCancel={() => setExportModalOpen(false)}
          onExport={handleExportHistory}
          tags={filterTagText}
        />
      )}

      {customTextModalOpen && (
        <CustomTextModal
          value={config.customText}
          onCancel={() => setCustomTextModalOpen(false)}
          onApply={(text) => { setCustomTextModalOpen(false); applyConfig({ mode: 'custom', customText: text }); }}
        />
      )}

      {confirmClear && (
        <div className="tw-modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="tw-clear-history-title" aria-describedby="tw-clear-history-description" onKeyDown={(event) => trapDialogKeyboard(event, () => setConfirmClear(false))}>
          <div className="tw-modal">
            <h3 id="tw-clear-history-title">Clear local test history?</h3>
            <p id="tw-clear-history-description">This removes every locally stored test from this browser. Exports are not affected.</p>
            <div className="row">
              <button autoFocus type="button" className="subtle" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button type="button" onClick={async () => {
                await clearAllTests();
                setHistory([]);
                setPersonalBest(null);
                setConfirmClear(false);
                setStatusText('Local test history cleared.');
              }}>Clear history</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------- rendering helpers --------------------

function renderCells(state: EngineState, caret: CaretStyle): ReactNode[] {
  const out: ReactNode[] = [];
  state.cells.forEach((cell, idx) => {
    if (idx === state.cursor && !state.finished) {
      out.push(<span key={`caret-${idx}`} className={`tw-caret style-${caret}`} aria-hidden="true" />);
    }
    const rendered = cell.expected === ' ' ? '\u00A0' : cell.expected === '' ? (cell.typed || '\u00A0') : cell.expected;
    const displayed = cell.state === 'incorrect' && cell.typed ? (cell.typed === ' ' ? '_' : cell.typed) : rendered;
    out.push(
      <span key={idx} className={`tw-char ${cell.state}`}>{displayed}</span>
    );
  });
  if (state.cursor >= state.cells.length && !state.finished) {
    out.push(<span key="caret-tail" className={`tw-caret style-${caret}`} aria-hidden="true" />);
  }
  return out;
}

interface HeatmapResult { heat: Map<string, number>; errors: Set<string> }

function buildHeatmap(stats: ReturnType<typeof perKeyStats>, rows: { keys: string[] }[]): HeatmapResult {
  const heat = new Map<string, number>();
  const errors = new Set<string>();
  const allKeys = new Set<string>();
  rows.forEach((r) => r.keys.forEach((k) => allKeys.add(k)));
  const maxPresses = Math.max(1, ...stats.map((s) => s.presses));
  for (const s of stats) {
    heat.set(s.key, s.presses / maxPresses);
    if (s.errors > 0 && s.errors / s.presses > 0.2) errors.add(s.key);
  }
  return { heat, errors };
}

function VirtualKeyboard({ layout, heat, errors }: { layout: ReturnType<typeof findLayout>; heat: Map<string, number>; errors: Set<string> }) {
  return (
    <div className="tw-keyboard" role="img" aria-label={`On-screen ${layout.label} keyboard with typing heatmap.`}>
      {layout.rows.map((row, i) => (
        <div key={i} className="tw-keyboard-row">
          {row.keys.map((k) => {
            const h = heat.get(k) ?? heat.get(k.toLowerCase()) ?? 0;
            const bucket = h > 0.8 ? 5 : h > 0.6 ? 4 : h > 0.4 ? 3 : h > 0.2 ? 2 : h > 0 ? 1 : 0;
            const isErr = errors.has(k) || errors.has(k.toLowerCase());
            const cls = ['tw-key'];
            if (k === ' ') cls.push('space');
            if (bucket > 0) cls.push(`heat-${bucket}`);
            if (isErr) cls.push('error');
            const finger = layout.fingers[k] ?? layout.fingers[k.toLowerCase()];
            return (
              <div key={`${i}-${k}`} className={cls.join(' ')} title={finger ? `Finger: ${finger}` : k}>
                {k === ' ' ? '⎵' : k}
                {finger ? <span className="finger">{finger}</span> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function NgramTable({ rows }: { rows: ReturnType<typeof ngramLatencies> }) {
  if (rows.length === 0) return <p style={{ margin: 0, color: '#4b5468', fontSize: '0.85rem' }}>Finish a test to see analytics.</p>;
  return (
    <table>
      <thead><tr><th>Gram</th><th>Mean</th><th>Median</th><th>Count</th><th>Acc</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.gram}><td><code>{r.gram.replace(/\s/g, '␠')}</code></td><td>{r.meanMs}</td><td>{r.medianMs}</td><td>{r.count}</td><td>{r.accuracy}%</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function KeyStatsTable({ rows }: { rows: ReturnType<typeof perKeyStats> }) {
  if (rows.length === 0) return <p style={{ margin: 0, color: '#4b5468', fontSize: '0.85rem' }}>No data yet.</p>;
  return (
    <table>
      <thead><tr><th>Key</th><th>Presses</th><th>Errors</th><th>Interval</th><th>Acc</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}><td><code>{r.key === ' ' ? '␠' : r.key}</code></td><td>{r.presses}</td><td>{r.errors}</td><td>{r.meanIntervalMs}</td><td>{r.accuracy}%</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// -------------------- modals --------------------

function SaveTestModal({ onCancel, onSave, onExport, summary, canCertificate }: {
  onCancel: () => void;
  onSave: (meta: ExportMetadata, options: { includeKeystrokes: boolean }) => void | Promise<void>;
  onExport: (format: 'csv' | 'json' | 'pdf' | 'keystrokes', meta: ExportMetadata) => void | Promise<void>;
  summary: ReturnType<typeof computeMetrics>;
  canCertificate: boolean;
}) {
  const [meta, setMeta] = useState<ExportMetadata>({ ...EMPTY_EXPORT_METADATA, includeKeystrokes: true });
  const [tagInput, setTagInput] = useState('');
  return (
    <div className="tw-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tw-test-result-title" onKeyDown={(event) => trapDialogKeyboard(event, onCancel)}>
      <div className="tw-modal">
        <h3 id="tw-test-result-title">Test result</h3>
        <div className="tw-summary">
          <div><strong>{summary.netWpm}</strong><br /><small>Net WPM</small></div>
          <div><strong>{summary.accuracy}%</strong><br /><small>Accuracy</small></div>
          <div><strong>{summary.consistency}%</strong><br /><small>Consistency</small></div>
          <div><strong>{summary.incorrectChars}</strong><br /><small>Errors</small></div>
        </div>
        <label htmlFor="tw-result-typist">Typist name</label>
        <input id="tw-result-typist" autoFocus type="text" value={meta.typistName} onChange={(e) => setMeta((m) => ({ ...m, typistName: e.target.value }))} />
        <label htmlFor="tw-result-organization">Organization / classroom</label>
        <input id="tw-result-organization" type="text" value={meta.organization} onChange={(e) => setMeta((m) => ({ ...m, organization: e.target.value }))} />
        <label htmlFor="tw-result-certified-by">Certified by (proctor)</label>
        <input id="tw-result-certified-by" type="text" value={meta.certifiedBy} onChange={(e) => setMeta((m) => ({ ...m, certifiedBy: e.target.value }))} />
        <label htmlFor="tw-result-tag">Tags (Enter to add)</label>
        <div className="tw-tags-input">
          {meta.tags.map((t) => (
            <span key={t} className="tw-tag">{t} <button type="button" aria-label={`Remove tag ${t}`} title={`Remove tag ${t}`} onClick={() => setMeta((m) => ({ ...m, tags: m.tags.filter((tt) => tt !== t) }))}>×</button></span>
          ))}
          <input
            id="tw-result-tag"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = tagInput.trim().replace(/,+$/,'');
                if (v && !meta.tags.includes(v)) setMeta((m) => ({ ...m, tags: [...m.tags, v] }));
                setTagInput('');
              }
            }}
            placeholder="add tag"
          />
        </div>
        <label htmlFor="tw-result-notes">Notes</label>
        <textarea id="tw-result-notes" value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} />
        <label>
          <input type="checkbox" checked={meta.includeKeystrokes} onChange={(e) => setMeta((m) => ({ ...m, includeKeystrokes: e.target.checked }))} /> Save raw keystroke log
        </label>
        <div className="row">
          <button type="button" className="subtle" onClick={onCancel}>Discard</button>
          <button type="button" className="subtle" onClick={() => void onExport('csv', meta)}>Export CSV</button>
          <button type="button" className="subtle" onClick={() => void onExport('json', meta)}>Export JSON</button>
          <button type="button" className="subtle" onClick={() => void onExport('keystrokes', meta)}>Export keystrokes</button>
          {canCertificate ? <button type="button" className="subtle" onClick={() => void onExport('pdf', meta)}>PDF certificate</button> : null}
          <button type="button" onClick={() => void onSave(meta, { includeKeystrokes: meta.includeKeystrokes })}>Save</button>
        </div>
      </div>
    </div>
  );
}

function ExportHistoryModal({ onCancel, onExport, tags }: {
  onCancel: () => void;
  onExport: (format: 'csv' | 'json' | 'md', meta: ExportMetadata) => void | Promise<void>;
  tags: string;
}) {
  const [meta, setMeta] = useState<ExportMetadata>({ ...EMPTY_EXPORT_METADATA });
  const [tagInput, setTagInput] = useState('');
  return (
    <div className="tw-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tw-export-history-title" onKeyDown={(event) => trapDialogKeyboard(event, onCancel)}>
      <div className="tw-modal">
        <h3 id="tw-export-history-title">Export history</h3>
        <p style={{ marginTop: 0, fontSize: '0.85rem' }}>{tags ? `Filter by tags: ${tags}` : 'Exports every saved test.'}</p>
        <label htmlFor="tw-history-typist">Typist name</label>
        <input id="tw-history-typist" autoFocus type="text" value={meta.typistName} onChange={(e) => setMeta((m) => ({ ...m, typistName: e.target.value }))} />
        <label htmlFor="tw-history-organization">Organization</label>
        <input id="tw-history-organization" type="text" value={meta.organization} onChange={(e) => setMeta((m) => ({ ...m, organization: e.target.value }))} />
        <label htmlFor="tw-history-certified-by">Certified by</label>
        <input id="tw-history-certified-by" type="text" value={meta.certifiedBy} onChange={(e) => setMeta((m) => ({ ...m, certifiedBy: e.target.value }))} />
        <label htmlFor="tw-history-tag">Global tags to add (Enter to add)</label>
        <div className="tw-tags-input">
          {meta.tags.map((t) => (
            <span key={t} className="tw-tag">{t} <button type="button" aria-label={`Remove tag ${t}`} title={`Remove tag ${t}`} onClick={() => setMeta((m) => ({ ...m, tags: m.tags.filter((tt) => tt !== t) }))}>×</button></span>
          ))}
          <input
            id="tw-history-tag"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = tagInput.trim();
                if (v && !meta.tags.includes(v)) setMeta((m) => ({ ...m, tags: [...m.tags, v] }));
                setTagInput('');
              }
            }}
          />
        </div>
        <label htmlFor="tw-history-notes">Notes</label>
        <textarea id="tw-history-notes" value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} />
        <label>
          <input type="checkbox" checked={meta.includeKeystrokes} onChange={(e) => setMeta((m) => ({ ...m, includeKeystrokes: e.target.checked }))} /> Include raw keystrokes in JSON export
        </label>
        <div className="row">
          <button type="button" className="subtle" onClick={onCancel}>Cancel</button>
          <button type="button" className="subtle" onClick={() => void onExport('csv', meta)}>Export CSV</button>
          <button type="button" className="subtle" onClick={() => void onExport('md', meta)}>Export Markdown</button>
          <button type="button" onClick={() => void onExport('json', meta)}>Export JSON</button>
        </div>
      </div>
    </div>
  );
}

function CustomTextModal({ value, onCancel, onApply }: { value: string; onCancel: () => void; onApply: (text: string) => void }) {
  const [text, setText] = useState(value);
  const usableText = text.replace(/\t/g, '    ').trim();
  return (
    <div className="tw-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tw-custom-text-title" onKeyDown={(event) => trapDialogKeyboard(event, onCancel)}>
      <div className="tw-modal">
        <h3 id="tw-custom-text-title">Paste or edit custom text</h3>
        <p style={{ marginTop: 0, fontSize: '0.85rem' }}>Everything stays in this browser. Longer passages can be used for extended practice.</p>
        <label htmlFor="tw-custom-text-input">Custom text</label>
        <textarea id="tw-custom-text-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 240 }} />
        {!usableText ? <p role="status" style={{ fontSize: '0.8rem', color: '#6b7280' }}>Enter at least one non-whitespace character.</p> : null}
        <div className="row">
          <button type="button" className="subtle" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!usableText} onClick={() => onApply(text)}>Use this text</button>
        </div>
      </div>
    </div>
  );
}

// Utility export for tests.
export const __internal = { buildTargetText, buildHeatmap };
