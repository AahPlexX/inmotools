/**
 * Flash drills: very short presentations, repeated with widening gaps.
 *
 * A flash drill shows a word or a small group of words for a set number of
 * milliseconds, clears the screen, and moves on. Durations below about 50 ms
 * are at the edge of what a display can render and what a reader can register,
 * so the tool refuses to pretend: a sub-frame duration is clamped to what the
 * refresh rate can actually show, and the drill records the duration it used.
 *
 * Drills are deterministic. A seeded generator produces the order and the
 * distractors, so the same drill can be repeated and scored.
 */

import { splitEmphasis, type EmphasisConfig } from './typography-engine';
import type { TokenRecord } from './sightline-types';

export interface DrillConfig {
  readonly flashMs: number;
  /** Words shown at once, 1–5. */
  readonly wordsPerFlash: number;
  /** Milliseconds of blank screen between flashes. */
  readonly gapMs: number;
  /** Number of flashes in the drill. */
  readonly flashCount: number;
  /** Show the item again after this many intervening items; 0 disables repeats. */
  readonly repeatAfter: number;
  /** Seed for the deterministic order. */
  readonly seed: number;
  /** Draw items from the weakest words in the vocabulary bank. */
  readonly preferWeakWords: boolean;
}

export const DEFAULT_DRILL: DrillConfig = {
  flashMs: 120,
  wordsPerFlash: 1,
  gapMs: 900,
  flashCount: 20,
  repeatAfter: 5,
  seed: 1,
  preferWeakWords: false,
};

/** Shortest presentation a 60 Hz display can hold for one frame. */
export const MIN_FLASH_MS = 17;
/** Presentation offered by the fastest preset, near the display floor. */
export const FASTEST_PRESET_MS = 33;
const MAX_FLASH_MS = 600;

export const clampFlashMs = (flashMs: number): number => {
  const requested = Math.round(flashMs);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_DRILL.flashMs;
  return Math.min(MAX_FLASH_MS, Math.max(MIN_FLASH_MS, requested));
};

export interface DrillItem {
  readonly text: string;
  readonly tokenIndex: number;
  readonly words: number;
}

export interface DrillFlash extends DrillItem {
  /** Position in the drill, from 0. */
  readonly position: number;
  readonly durationMs: number;
  /** Milliseconds of blank screen after this flash. */
  readonly gapMs: number;
  /** True when this flash repeats an item shown earlier in the drill. */
  readonly isRepeat: boolean;
  readonly startMs: number;
}

export interface DrillPlan {
  readonly flashes: readonly DrillFlash[];
  readonly totalMs: number;
  readonly flashMs: number;
  readonly items: number;
  readonly uniqueItems: number;
  /** True when the requested duration was raised to what the display can show. */
  readonly durationClamped: boolean;
}

/** Deterministic pseudo-random generator, so a drill can be repeated exactly. */
export const seededRandom = (seed: number): (() => number) => {
  let state = (Math.floor(seed) || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
};

/** Build the pool a drill draws from, grouping tokens into presentation units. */
export const drillItems = (
  tokens: readonly TokenRecord[],
  wordsPerFlash: number,
): DrillItem[] => {
  const size = Math.max(1, Math.min(5, Math.round(wordsPerFlash)));
  const items: DrillItem[] = [];
  for (let index = 0; index < tokens.length; index += size) {
    const slice = tokens.slice(index, index + size);
    const text = slice.map((token) => token.text).join(' ');
    if (text.trim().length === 0) continue;
    items.push({ text, tokenIndex: index, words: slice.length });
  }
  return items;
};

export interface DrillPlanOptions {
  /** Word-to-difficulty map used when weak words are preferred. */
  readonly weakWords?: ReadonlySet<string> | readonly string[];
}

export const buildDrillPlan = (
  tokens: readonly TokenRecord[],
  config: DrillConfig = DEFAULT_DRILL,
  options: DrillPlanOptions = {},
): DrillPlan => {
  const pool = drillItems(tokens, config.wordsPerFlash);
  if (pool.length === 0) {
    return { flashes: [], totalMs: 0, flashMs: clampFlashMs(config.flashMs), items: 0, uniqueItems: 0, durationClamped: false };
  }

  const weak = options.weakWords
    ? (options.weakWords instanceof Set ? options.weakWords : new Set(options.weakWords))
    : null;
  const preferred = config.preferWeakWords && weak
    ? pool.filter((item) => item.text.toLowerCase().split(' ').some((word) => weak.has(word)))
    : [];
  const source = preferred.length > 0 ? preferred : pool;

  const random = seededRandom(config.seed);
  const order: DrillItem[] = [];
  const desired = Math.max(1, Math.round(config.flashCount));
  while (order.length < desired) {
    const candidate = source[Math.floor(random() * source.length) % source.length]!;
    if (config.repeatAfter <= 0 && order.some((item) => item.tokenIndex === candidate.tokenIndex)) {
      if (order.length >= source.length) break;
      continue;
    }
    order.push(candidate);
    if (config.repeatAfter > 0 && order.length % Math.max(1, config.repeatAfter) === 0 && order.length < desired) {
      const earlier = order[Math.max(0, order.length - Math.max(1, config.repeatAfter))]!;
      order.push(earlier);
    }
  }

  const flashMs = clampFlashMs(config.flashMs);
  const gapMs = Math.max(0, Math.round(config.gapMs));
  const seen = new Set<number>();
  const flashes: DrillFlash[] = [];
  let cursor = 0;

  for (const item of order) {
    const isRepeat = seen.has(item.tokenIndex);
    seen.add(item.tokenIndex);
    flashes.push({
      ...item,
      position: flashes.length,
      durationMs: flashMs,
      gapMs,
      isRepeat,
      startMs: cursor,
    });
    cursor += flashMs + gapMs;
  }

  return {
    flashes,
    totalMs: cursor,
    flashMs,
    items: flashes.length,
    uniqueItems: seen.size,
    durationClamped: flashMs > Math.round(config.flashMs),
  };
};

export const DRILL_PRESETS: readonly { id: string; label: string; detail: string; config: Partial<DrillConfig> }[] = [
  { id: 'settle', label: 'Settle in', detail: '200 ms per flash with a long gap, for a first session.', config: { flashMs: 200, gapMs: 1400, wordsPerFlash: 1 } },
  { id: 'steady', label: 'Steady', detail: '120 ms per flash, one word at a time.', config: { flashMs: 120, gapMs: 900, wordsPerFlash: 1 } },
  { id: 'quick', label: 'Quick', detail: '80 ms per flash, one word at a time.', config: { flashMs: 80, gapMs: 700, wordsPerFlash: 1 } },
  { id: 'blink', label: 'Blink', detail: '50 ms per flash, at the edge of deliberate presentation.', config: { flashMs: 50, gapMs: 620, wordsPerFlash: 1 } },
  { id: 'subliminal', label: 'Two frames', detail: '33 ms, two frames on a 60 Hz panel, one word.', config: { flashMs: 33, gapMs: 600, wordsPerFlash: 1 } },
  { id: 'pairs', label: 'Word pairs', detail: '100 ms, two words per flash.', config: { flashMs: 100, gapMs: 800, wordsPerFlash: 2 } },
  { id: 'phrases', label: 'Phrases', detail: '150 ms, three words per flash.', config: { flashMs: 150, gapMs: 900, wordsPerFlash: 3 } },
];

export const presetById = (id: string): Partial<DrillConfig> =>
  DRILL_PRESETS.find((preset) => preset.id === id)?.config ?? DRILL_PRESETS[1]!.config;

export interface DrillRecallEntry {
  readonly position: number;
  readonly text: string;
  readonly expected: boolean;
}

/**
 * Recall check for a drill: the reader marks the items they recognised. The
 * score separates items that were shown once from items that were repeated.
 */
export const scoreRecall = (
  flashes: readonly DrillFlash[],
  recognised: ReadonlySet<number>,
): { correct: number; total: number; accuracy: number; firstTryAccuracy: number; repeatsCorrect: number; repeatsTotal: number } => {
  let correct = 0;
  let firstTryCorrect = 0;
  let firstTryTotal = 0;
  let repeatsCorrect = 0;
  let repeatsTotal = 0;
  for (const flash of flashes) {
    const hit = recognised.has(flash.position);
    if (hit) correct += 1;
    if (flash.isRepeat) {
      repeatsTotal += 1;
      if (hit) repeatsCorrect += 1;
    } else {
      firstTryTotal += 1;
      if (hit) firstTryCorrect += 1;
    }
  }
  const total = flashes.length;
  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    firstTryAccuracy: firstTryTotal === 0 ? 0 : Math.round((firstTryCorrect / firstTryTotal) * 1000) / 10,
    repeatsCorrect,
    repeatsTotal,
  };
};

/** Suggested reading rate for a drill item of the given length. */
export const flashEquivalentWpm = (flashMs: number, words: number): number => {
  const wordsPerFlash = Math.max(1, words);
  const perWord = clampFlashMs(flashMs) / wordsPerFlash;
  return Math.round(60_000 / perWord);
};

/** Emphasis split helper reused by the drill's on-screen stimulus. */
export const drillStimulus = (
  text: string,
  config?: EmphasisConfig,
): ReturnType<typeof splitEmphasis> => splitEmphasis(text, config);
