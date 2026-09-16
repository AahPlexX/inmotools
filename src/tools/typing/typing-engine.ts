// Typing Workstation core engine
// Deterministic, dependency-free arithmetic and analytics for keystroke input.
// All timing is captured with performance.now() in the UI layer and forwarded
// as microsecond-precision timestamps into the reducer here.

export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra' | 'missed';

export interface CharCell {
  /** Original expected character (empty string when this is an "extra" typed cell). */
  expected: string;
  /** Actual character typed by the user, or '' when still pending. */
  typed: string;
  state: CharState;
  /** performance.now() timestamp of the keystroke that resolved this cell, if any. */
  t?: number;
}

export interface KeystrokeEvent {
  /** performance.now() timestamp in ms. */
  t: number;
  /** KeyboardEvent.key value (single character, 'Backspace', 'Enter'). */
  key: string;
  /** KeyboardEvent.code value (physical key). */
  code: string;
  /** true if the key committed the currently-expected character. */
  correct: boolean;
  /** Character index into the flat expected text at the moment of press. */
  index: number;
  /** Expected character at that index (may be '' for extras). */
  expected: string;
}

export type ErrorMode = 'strict' | 'master' | 'forgiving' | 'confidence';

export interface EngineOptions {
  /** Behavior when the user types the wrong key. */
  errorMode: ErrorMode;
  /** When true, the engine advances past the current char even on wrong keystroke. */
  freeMovement: boolean;
  /** Whether Backspace is honored. */
  allowBackspace: boolean;
  /** Whether "extra" characters beyond the expected width are appended visibly. */
  allowExtraChars: boolean;
  /** Case-sensitive matching. Off for kids/casual, on for code/legal/medical. */
  caseSensitive: boolean;
}

export interface EngineState {
  targetText: string;
  cells: CharCell[];
  events: KeystrokeEvent[];
  /** Zero-based index of the next expected cell. */
  cursor: number;
  startedAt: number | null;
  endedAt: number | null;
  finished: boolean;
  finishReason: 'completed' | 'failed' | 'aborted' | null;
  /** Number of keystrokes counted for accuracy denominator (excludes Backspace). */
  totalKeystrokes: number;
  /** Number of correct keystrokes. */
  correctKeystrokes: number;
  /** Number of incorrect keystrokes. */
  incorrectKeystrokes: number;
  /** Number of "extra" characters beyond target width. */
  extraKeystrokes: number;
  /** Number of missed characters (skipped in free-movement mode). */
  missedChars: number;
  /** Total number of Backspace presses used. */
  backspaces: number;
  options: EngineOptions;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  errorMode: 'strict',
  freeMovement: false,
  allowBackspace: true,
  allowExtraChars: true,
  caseSensitive: true,
};

export function initState(targetText: string, options: Partial<EngineOptions> = {}): EngineState {
  const opts: EngineOptions = { ...DEFAULT_OPTIONS, ...options };
  // Forgiving mode allows advancement past errors.
  if (opts.errorMode === 'forgiving') opts.freeMovement = true;
  // Confidence mode disables backspace.
  if (opts.errorMode === 'confidence') opts.allowBackspace = false;
  const cells: CharCell[] = Array.from(targetText, (ch) => ({
    expected: ch,
    typed: '',
    state: 'pending',
  }));
  return {
    targetText,
    cells,
    events: [],
    cursor: 0,
    startedAt: null,
    endedAt: null,
    finished: false,
    finishReason: null,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    incorrectKeystrokes: 0,
    extraKeystrokes: 0,
    missedChars: 0,
    backspaces: 0,
    options: opts,
  };
}

export function extendTarget(state: EngineState, extension: string): EngineState {
  if (state.finished || extension.length === 0) return state;
  const appended = Array.from(extension, (ch) => ({ expected: ch, typed: '', state: 'pending' as const }));
  return {
    ...state,
    targetText: state.targetText + extension,
    cells: [...state.cells, ...appended],
  };
}

function normalize(ch: string, sensitive: boolean): string {
  return sensitive ? ch : ch.toLocaleLowerCase();
}

export function pressKey(state: EngineState, key: string, code: string, t: number): EngineState {
  if (state.finished) return state;
  const opts = state.options;

  // Backspace handling.
  if (key === 'Backspace') {
    if (!opts.allowBackspace) return { ...state, backspaces: state.backspaces + 1 };
    const current = state.cells[state.cursor];
    if (current?.state === 'incorrect' && current.expected !== '') {
      const cells = state.cells.slice();
      cells[state.cursor] = { ...current, typed: '', state: 'pending', t: undefined };
      return { ...state, cells, backspaces: state.backspaces + 1 };
    }
    if (state.cursor === 0) return state;
    const next = { ...state, cells: state.cells.slice(), cursor: state.cursor - 1, backspaces: state.backspaces + 1 };
    const idx = next.cursor;
    const cell = next.cells[idx];
    if (cell) {
      // If this is a synthetic "extra" cell, drop it entirely.
      if (cell.expected === '' && cell.state === 'extra') {
        next.cells.splice(idx, 1);
      } else {
        next.cells[idx] = { ...cell, typed: '', state: 'pending', t: undefined };
      }
    }
    return next;
  }

  const expectedBeforeInput = state.cells[state.cursor]?.expected;
  const committedKey = key === 'Enter' && expectedBeforeInput === '\n' ? '\n' : key;

  if (key === 'Enter' && committedKey !== '\n') {
    // Enter finishes a finite target if the cursor is already at its end.
    if (state.cursor >= state.cells.length && !state.finished) {
      return finish(state, 'completed', t);
    }
    return state;
  }

  // Ignore modifier / non-character keys.
  if (committedKey.length !== 1) return state;

  const startedAt = state.startedAt ?? t;
  const events = state.events.slice();
  const cells = state.cells.slice();
  let cursor = state.cursor;
  let correctKeystrokes = state.correctKeystrokes;
  let incorrectKeystrokes = state.incorrectKeystrokes;
  let extraKeystrokes = state.extraKeystrokes;
  let missedChars = state.missedChars;
  const totalKeystrokes = state.totalKeystrokes + 1;

  const targetCell = cells[cursor];
  if (targetCell === undefined) {
    // Beyond the visible cells — treat as extra beyond target completion.
    const extraIndex = cursor;
    if (opts.allowExtraChars) {
      cells.push({ expected: '', typed: committedKey, state: 'extra', t });
      extraKeystrokes += 1;
      cursor += 1;
    }
    events.push({ t, key, code, correct: false, index: extraIndex, expected: '' });
    return { ...state, startedAt, events, cells, cursor, extraKeystrokes, totalKeystrokes };
  }

  const expected = targetCell.expected;
  const match = normalize(committedKey, opts.caseSensitive) === normalize(expected, opts.caseSensitive);
  events.push({ t, key, code, correct: match, index: cursor, expected });

  if (match) {
    cells[cursor] = { ...targetCell, typed: committedKey, state: 'correct', t };
    correctKeystrokes += 1;
    cursor += 1;
  } else {
    // Master mode fails the whole test on any wrong keystroke.
    if (opts.errorMode === 'master') {
      cells[cursor] = { ...targetCell, typed: committedKey, state: 'incorrect', t };
      incorrectKeystrokes += 1;
      return finish(
        { ...state, startedAt, events, cells, cursor, incorrectKeystrokes, totalKeystrokes },
        'failed',
        t
      );
    }

    if (opts.freeMovement) {
      // Missed the expected char and moved forward.
      cells[cursor] = { ...targetCell, typed: committedKey, state: 'incorrect', t };
      incorrectKeystrokes += 1;
      missedChars += 1;
      cursor += 1;
    } else if (opts.errorMode === 'strict') {
      // Strict mode records the error at the current character and waits for correction.
      cells[cursor] = { ...targetCell, typed: committedKey, state: 'incorrect', t };
      incorrectKeystrokes += 1;
    } else {
      // Confidence mode advances but intentionally does not allow Backspace.
      cells[cursor] = { ...targetCell, typed: committedKey, state: 'incorrect', t };
      incorrectKeystrokes += 1;
      cursor += 1;
    }
  }

  return {
    ...state,
    startedAt,
    events,
    cells,
    cursor,
    totalKeystrokes,
    correctKeystrokes,
    incorrectKeystrokes,
    extraKeystrokes,
    missedChars,
  };
}

/**
 * Returns true when the visible target has been fully and correctly typed.
 * Used by the UI to auto-finish word / quote mode.
 */
export function isCleanlyCompleted(state: EngineState): boolean {
  const original = state.targetText.length;
  if (state.cursor < original) return false;
  return state.cells.slice(0, original).every((c) => c.state === 'correct');
}

/**
 * Returns true once a finite target has been completed according to the active
 * correction mode. Strict mode requires a clean target; modes that explicitly
 * allow forward movement complete once the original target has been traversed.
 */
export function isTargetCompleted(state: EngineState): boolean {
  const original = state.targetText.length;
  if (state.cursor < original) return false;
  if (state.options.errorMode === 'strict') return isCleanlyCompleted(state);
  return true;
}

export function finish(state: EngineState, reason: 'completed' | 'failed' | 'aborted', t: number): EngineState {
  if (state.finished) return state;
  return { ...state, finished: true, finishReason: reason, endedAt: t };
}

// ----------------------------------------------------------------------------
// Metrics
// ----------------------------------------------------------------------------

const STANDARD_WORD = 5;

export interface Metrics {
  elapsedMs: number;
  grossWpm: number;
  netWpm: number;
  rawCpm: number;
  accuracy: number;
  consistency: number;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
}

export function computeMetrics(state: EngineState, nowT?: number): Metrics {
  const start = state.startedAt ?? nowT ?? 0;
  const end = state.endedAt ?? nowT ?? start;
  const elapsedMs = Math.max(0, end - start);
  const minutes = elapsedMs / 60000;
  const correctPresses = state.correctKeystrokes;
  const incorrectPresses = state.incorrectKeystrokes;
  const total = correctPresses + incorrectPresses + state.extraKeystrokes;
  const finalCorrectChars = state.cells
    .slice(0, state.targetText.length)
    .filter((cell) => cell.state === 'correct').length;
  const grossWpm = minutes > 0 ? (total / STANDARD_WORD) / minutes : 0;
  const netWpm = minutes > 0 ? (finalCorrectChars / STANDARD_WORD) / minutes : 0;
  const rawCpm = minutes > 0 ? total / minutes : 0;
  const accuracyDen = total;
  const accuracy = accuracyDen > 0 ? (correctPresses / accuracyDen) * 100 : 0;
  const consistency = keystrokeConsistency(state.events);
  return {
    elapsedMs,
    grossWpm: round(grossWpm),
    netWpm: round(netWpm),
    rawCpm: round(rawCpm),
    accuracy: round(accuracy),
    consistency: round(consistency),
    correctChars: finalCorrectChars,
    incorrectChars: incorrectPresses,
    extraChars: state.extraKeystrokes,
    missedChars: state.missedChars,
  };
}

export function round(n: number, digits = 2): number {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

/**
 * Instant WPM samples at 1-second resolution over the test window.
 * Returns [{ seconds, wpm, rawWpm, errorsInWindow }].
 */
export interface WpmSample {
  seconds: number;
  wpm: number;
  rawWpm: number;
  errorsInWindow: number;
}

export function wpmSeries(state: EngineState, endT?: number): WpmSample[] {
  const start = state.startedAt;
  if (start == null) return [];
  const end = state.endedAt ?? endT ?? start;
  const totalSecs = Math.max(1, Math.ceil((end - start) / 1000));
  const buckets: { correct: number; total: number; errors: number }[] = [];
  for (let i = 0; i < totalSecs; i += 1) buckets.push({ correct: 0, total: 0, errors: 0 });
  for (const e of state.events) {
    if (e.key.length !== 1) continue;
    const s = Math.min(totalSecs - 1, Math.max(0, Math.floor((e.t - start) / 1000)));
    const b = buckets[s]!;
    b.total += 1;
    if (e.correct) b.correct += 1;
    else b.errors += 1;
  }
  const samples: WpmSample[] = [];
  let cumulativeCorrect = 0;
  let cumulativeTotal = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    const b = buckets[i]!;
    cumulativeCorrect += b.correct;
    cumulativeTotal += b.total;
    const seconds = i + 1;
    const minutes = seconds / 60;
    const wpm = (cumulativeCorrect / STANDARD_WORD) / minutes;
    const rawWpm = (cumulativeTotal / STANDARD_WORD) / minutes;
    samples.push({ seconds, wpm: round(wpm), rawWpm: round(rawWpm), errorsInWindow: b.errors });
  }
  return samples;
}

/**
 * Consistency score: 100 - (coefficient of variation of per-second WPM * 100), clamped to [0,100].
 */
export function keystrokeConsistency(events: KeystrokeEvent[]): number {
  const perSec = new Map<number, number>();
  const start = events[0]?.t ?? 0;
  for (const e of events) {
    if (e.key.length !== 1) continue;
    const s = Math.floor((e.t - start) / 1000);
    perSec.set(s, (perSec.get(s) ?? 0) + 1);
  }
  const values = Array.from(perSec.values());
  if (values.length < 2) return values.length === 1 ? 100 : 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, (1 - cv) * 100));
}

// ----------------------------------------------------------------------------
// N-gram latency analytics
// ----------------------------------------------------------------------------

export interface NgramLatency {
  gram: string;
  count: number;
  meanMs: number;
  medianMs: number;
  errors: number;
  accuracy: number;
}

export function ngramLatencies(events: KeystrokeEvent[], n: 2 | 3 | 4 = 2): NgramLatency[] {
  const map = new Map<string, { latencies: number[]; errors: number; hits: number }>();
  const chars = events.filter((e) => e.key.length === 1);
  for (let i = 0; i + n - 1 < chars.length; i += 1) {
    const gram = chars.slice(i, i + n).map((c) => c.expected || c.key).join('');
    const last = chars[i + n - 1]!;
    const first = chars[i]!;
    const dt = last.t - first.t;
    if (dt < 0 || dt > 5000) continue; // skip pauses > 5s
    const bucket = map.get(gram) ?? { latencies: [], errors: 0, hits: 0 };
    bucket.latencies.push(dt);
    bucket.hits += 1;
    if (chars.slice(i, i + n).some((c) => !c.correct)) bucket.errors += 1;
    map.set(gram, bucket);
  }
  const out: NgramLatency[] = [];
  for (const [gram, data] of map) {
    const sorted = data.latencies.slice().sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
    out.push({
      gram,
      count: data.hits,
      meanMs: round(mean),
      medianMs: round(median),
      errors: data.errors,
      accuracy: data.hits > 0 ? round(((data.hits - data.errors) / data.hits) * 100) : 0,
    });
  }
  return out.sort((a, b) => b.meanMs - a.meanMs);
}

// ----------------------------------------------------------------------------
// Per-key stats + weak keys
// ----------------------------------------------------------------------------

export interface KeyStat {
  key: string;
  presses: number;
  errors: number;
  meanIntervalMs: number;
  accuracy: number;
}

export function perKeyStats(events: KeystrokeEvent[]): KeyStat[] {
  const bucket = new Map<string, { presses: number; errors: number; intervals: number[]; last: number | null }>();
  let lastT: number | null = null;
  for (const e of events) {
    if (e.key.length !== 1) continue;
    const k = (e.expected || e.key).toLowerCase();
    const b = bucket.get(k) ?? { presses: 0, errors: 0, intervals: [], last: null };
    b.presses += 1;
    if (!e.correct) b.errors += 1;
    if (lastT != null) {
      const dt = e.t - lastT;
      if (dt >= 0 && dt < 3000) b.intervals.push(dt);
    }
    bucket.set(k, b);
    lastT = e.t;
  }
  const stats: KeyStat[] = [];
  for (const [key, b] of bucket) {
    const mean = b.intervals.length > 0 ? b.intervals.reduce((a, c) => a + c, 0) / b.intervals.length : 0;
    stats.push({
      key,
      presses: b.presses,
      errors: b.errors,
      meanIntervalMs: round(mean),
      accuracy: b.presses > 0 ? round(((b.presses - b.errors) / b.presses) * 100) : 0,
    });
  }
  return stats.sort((a, b) => a.accuracy - b.accuracy || b.meanIntervalMs - a.meanIntervalMs);
}

export function weakKeys(events: KeystrokeEvent[], limit = 6): string[] {
  const stats = perKeyStats(events).filter((s) => s.presses >= 3);
  const weak = stats.slice().sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return b.meanIntervalMs - a.meanIntervalMs;
  });
  return weak.slice(0, limit).map((s) => s.key);
}

// ----------------------------------------------------------------------------
// Drill generator — build practice strings weighted by weak keys/bigrams.
// ----------------------------------------------------------------------------

export interface DrillOptions {
  weakKeys: string[];
  wordPool: string[];
  targetLength: number;
  seed?: number;
}

// Small deterministic PRNG so drills can be reproduced from a seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDrill(opts: DrillOptions): string {
  const rng = mulberry32(opts.seed ?? Math.floor(Date.now() % 2147483647));
  const weak = opts.weakKeys.map((k) => k.toLowerCase()).filter((k) => /^[a-z0-9]$/.test(k));
  const pool = opts.wordPool.filter((w) => typeof w === 'string' && w.length > 0);
  if (pool.length === 0) return '';
  const scored = pool
    .map((w) => {
      const lower = w.toLowerCase();
      let score = 1;
      for (const k of weak) {
        const occurrences = lower.split(k).length - 1;
        score += occurrences * 3;
      }
      return { word: w, score };
    })
    .sort((a, b) => b.score - a.score);
  // Take the top quartile of drill-relevant words then shuffle.
  const topCount = Math.max(8, Math.ceil(scored.length / 4));
  const top = scored.slice(0, topCount);
  const chosen: string[] = [];
  let running = 0;
  while (running < opts.targetLength && chosen.length < 400) {
    const w = top[Math.floor(rng() * top.length)]!.word;
    chosen.push(w);
    running += w.length + 1;
  }
  return chosen.join(' ').slice(0, Math.max(opts.targetLength, 1));
}

// ----------------------------------------------------------------------------
// Word generator (from a frequency word list).
// ----------------------------------------------------------------------------

export function generateWords(pool: string[], count: number, seed?: number): string {
  if (pool.length === 0) return '';
  const rng = mulberry32(seed ?? Math.floor((Date.now() * 9301) % 2147483647));
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < count; i += 1) {
    let candidate = pool[Math.floor(rng() * pool.length)]!;
    let guard = 0;
    while (candidate === last && guard < 5) {
      candidate = pool[Math.floor(rng() * pool.length)]!;
      guard += 1;
    }
    last = candidate;
    out.push(candidate);
  }
  return out.join(' ');
}

// ----------------------------------------------------------------------------
// Deterministic ghost playback: given a KeystrokeEvent log, return per-second
// progress in "correct characters" so a pacer can draw a comparison line.
// ----------------------------------------------------------------------------

export interface GhostSample {
  seconds: number;
  correctChars: number;
}

export function ghostSeries(events: KeystrokeEvent[]): GhostSample[] {
  if (events.length === 0) return [];
  const start = events[0]!.t;
  const end = events[events.length - 1]!.t;
  const totalSecs = Math.max(1, Math.ceil((end - start) / 1000));
  const samples: GhostSample[] = [];
  let correct = 0;
  let cursor = 0;
  for (let s = 1; s <= totalSecs; s += 1) {
    const cutoff = start + s * 1000;
    while (cursor < events.length && events[cursor]!.t <= cutoff) {
      const ev = events[cursor]!;
      if (ev.key.length === 1 && ev.correct) correct += 1;
      cursor += 1;
    }
    samples.push({ seconds: s, correctChars: correct });
  }
  return samples;
}
