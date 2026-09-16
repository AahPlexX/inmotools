/**
 * Pacing maths for every presentation engine.
 *
 * Every engine that shows words over time — single-word RSVP, lexical chunks,
 * flash drills — asks this module how long a token stays on screen. The rules
 * are deliberately explicit and testable:
 *
 * - A base duration comes from the reading rate: `60000 / wpm` milliseconds per
 *   word.
 * - Break pauses are multiples of that base duration. Sentence, clause and
 *   paragraph boundaries take longer than ordinary word gaps, because a reader
 *   who is not allowed to re-read needs a moment to consolidate the phrase they
 *   just finished. Sentence pauses are what makes rapid presentation usable at
 *   all; without them comprehension collapses even when word recognition does
 *   not.
 * - Velocity compensation lengthens long and multi-syllable words and shortens
 *   very short ones, so the time each word receives tracks the work it takes to
 *   recognise it rather than being flat per word.
 * - The ramp trainer increases the rate in steps while the reader continues, so
 *   the pace moves toward a target instead of jumping there.
 */

import type { BreakKind, TokenRecord } from './sightline-types';

export type CompensatorMode = 'none' | 'length' | 'syllable';

export interface RampConfig {
  /** Rate at the start of the ramp. */
  readonly startWpm: number;
  /** Rate added at every step. */
  readonly stepWpm: number;
  /** Number of tokens read at each step before the rate increases. */
  readonly everyTokens: number;
  /** Rate the ramp stops at. */
  readonly ceilingWpm: number;
}

export interface PacingConfig {
  /** Base rate in words per minute. */
  readonly wpm: number;
  /** Whether sentence, clause, and paragraph boundaries take extra time. */
  readonly respectBreaks: boolean;
  /** Multiplier applied after a full stop, question mark, or exclamation mark. */
  readonly periodMultiplier: number;
  /** Multiplier applied after a comma, semicolon, colon, or dash. */
  readonly clauseMultiplier: number;
  /** Multiplier applied at the end of a paragraph. */
  readonly paragraphMultiplier: number;
  /** Multiplier applied at the end of a chapter or section. */
  readonly chapterMultiplier: number;
  /** How word length or syllable count stretches the base duration. */
  readonly compensator: CompensatorMode;
  /** Optional automatic rate increase during reading. */
  readonly ramp: RampConfig | null;
}

export interface Frame {
  /** Index of the first token in the document model. */
  readonly tokenIndex: number;
  readonly text: string;
  /** Milliseconds from the start of the schedule until this frame appears. */
  readonly startMs: number;
  /** Milliseconds from the start of the schedule until this frame is replaced. */
  readonly endMs: number;
  /** On-screen time for the words themselves. */
  readonly durationMs: number;
  /** Rest added after the words, from punctuation and paragraph boundaries. */
  readonly pauseMs: number;
  /** Effective rate used for this frame, after the ramp. */
  readonly wpm: number;
  readonly breakAfter: BreakKind;
}

export interface Schedule {
  readonly frames: readonly Frame[];
  /** Total time in milliseconds, including the pause after the last frame. */
  readonly totalMs: number;
  /** Fastest rate the schedule reached, which is where a ramp ends. */
  readonly peakWpm: number;
  /** Slowest rate the schedule used. */
  readonly startWpm: number;
}

export const DEFAULT_PACING: PacingConfig = {
  wpm: 300,
  respectBreaks: true,
  periodMultiplier: 2.5,
  clauseMultiplier: 1.8,
  paragraphMultiplier: 2,
  chapterMultiplier: 3.2,
  compensator: 'syllable',
  ramp: null,
};

/** Average letters per English word, used to normalise length compensation. */
export const BASELINE_WORD_LETTERS = 4.7;
/** Average syllables per English word, used to normalise syllable compensation. */
export const BASELINE_WORD_SYLLABLES = 1.5;

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const clampWpm = (wpm: number): number => clamp(Math.round(wpm) || 0, 40, 1600);

/** Milliseconds one word receives at the given rate. */
export const baseDurationMs = (wpm: number): number => 60_000 / clampWpm(wpm);

/**
 * The multiplier a word receives for the work of recognising it. Short and
 * frequent words are recognised in a single fixation, so they are presented for
 * less time; long and multi-syllable words are presented for more.
 */
export const compensationFactor = (
  token: Pick<TokenRecord, 'letters' | 'syllables'>,
  mode: CompensatorMode,
): number => {
  if (mode === 'none') return 1;
  if (mode === 'length') {
    const letters = Math.max(1, token.letters);
    return clamp(letters / BASELINE_WORD_LETTERS, 0.55, 2.4);
  }
  const syllables = Math.max(1, token.syllables || 1);
  return clamp(syllables / BASELINE_WORD_SYLLABLES, 0.6, 2.6);
};

/** The multiplier applied after a word, from the boundary that follows it. */
export const breakMultiplier = (kind: BreakKind, config: PacingConfig): number => {
  if (!config.respectBreaks) return 1;
  switch (kind) {
    case 'clause': return config.clauseMultiplier;
    case 'sentence': return config.periodMultiplier;
    case 'paragraph': return config.paragraphMultiplier;
    case 'chapter': return config.chapterMultiplier;
    default: return 1;
  }
};

/** The rate in use at a given position in the document when a ramp is active. */
export const rampedWpm = (config: PacingConfig, tokenPosition: number): number => {
  const ramp = config.ramp;
  if (!ramp) return clampWpm(config.wpm);
  const every = Math.max(1, Math.round(ramp.everyTokens));
  const steps = Math.floor(Math.max(0, tokenPosition) / every);
  const ceiling = Math.max(ramp.startWpm, ramp.ceilingWpm);
  return clampWpm(Math.min(ceiling, ramp.startWpm + steps * ramp.stepWpm));
};

/** Duration in milliseconds for one token, including any pause after it. */
export const frameDuration = (
  token: Pick<TokenRecord, 'letters' | 'syllables' | 'breakAfter'>,
  config: PacingConfig,
  position = 0,
): { durationMs: number; pauseMs: number; wpm: number } => {
  const wpm = rampedWpm(config, position);
  const base = baseDurationMs(wpm);
  const durationMs = Math.round(base * compensationFactor(token, config.compensator));
  const pauseMs = Math.round(base * (breakMultiplier(token.breakAfter, config) - 1));
  return { durationMs, pauseMs, wpm };
};

export interface ScheduleOptions {
  /** First token to include, for resuming or drilling a passage. */
  readonly fromToken?: number;
  /** Last token to include, exclusive. */
  readonly toToken?: number;
}

export const buildSchedule = (
  tokens: readonly TokenRecord[],
  config: PacingConfig = DEFAULT_PACING,
  options: ScheduleOptions = {},
): Schedule => {
  const from = clamp(Math.round(options.fromToken ?? 0), 0, tokens.length);
  const to = clamp(Math.round(options.toToken ?? tokens.length), from, tokens.length);
  const frames: Frame[] = [];
  let cursor = 0;
  let previousWpm = clampWpm(config.ramp ? config.ramp.startWpm : config.wpm);

  for (let index = from; index < to; index += 1) {
    const token = tokens[index]!;
    const timing = frameDuration(token, config, index - from);
    frames.push({
      tokenIndex: index,
      text: token.text,
      startMs: cursor,
      endMs: cursor + timing.durationMs + timing.pauseMs,
      durationMs: timing.durationMs,
      pauseMs: timing.pauseMs,
      wpm: timing.wpm,
      breakAfter: token.breakAfter,
    });
    cursor += timing.durationMs + timing.pauseMs;
    previousWpm = timing.wpm;
  }

  const wpmValues = frames.map((frame) => frame.wpm);
  return {
    frames,
    totalMs: cursor,
    peakWpm: wpmValues.length > 0 ? Math.max(...wpmValues) : previousWpm,
    startWpm: wpmValues.length > 0 ? wpmValues[0]! : previousWpm,
  };
};

/** Realised rate in words per minute for a schedule, from its own contents. */
export const scheduleWpm = (schedule: Schedule): number => {
  if (schedule.frames.length === 0 || schedule.totalMs <= 0) return 0;
  return Math.round((schedule.frames.length * 60_000) / schedule.totalMs);
};

/** Milliseconds of reading still ahead of a position in the schedule. */
export const remainingMs = (schedule: Schedule, elapsedMs: number): number => {
  const frame = frameAt(schedule, elapsedMs);
  if (!frame) return 0;
  return Math.max(0, schedule.totalMs - frame.startMs);
};

/** The frame showing at a point in time, or null once the schedule is over. */
export const frameAt = (schedule: Schedule, elapsedMs: number): Frame | undefined => {
  const frames = schedule.frames;
  if (frames.length === 0 || elapsedMs < 0 || elapsedMs >= schedule.totalMs) return undefined;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle]!.endMs <= elapsedMs) low = middle + 1;
    else high = middle;
  }
  return frames[low];
};

/** Alias kept for readability at call sites that think in terms of frames. */
export const frameForToken = (
  schedule: Schedule,
  tokenIndex: number,
): Frame | undefined => schedule.frames.find((frame) => frame.tokenIndex === tokenIndex);

export interface RampPreset {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly config: RampConfig;
}

export const RAMP_PRESETS: readonly RampPreset[] = [
  {
    id: 'gentle',
    label: 'Gentle start',
    detail: 'Begins below a natural rate and adds 10 words per minute every 150 words.',
    config: { startWpm: 180, stepWpm: 10, everyTokens: 150, ceilingWpm: 450 },
  },
  {
    id: 'steady',
    label: 'Steady climb',
    detail: 'Begins at a natural rate and adds 15 words per minute every 200 words.',
    config: { startWpm: 220, stepWpm: 15, everyTokens: 200, ceilingWpm: 600 },
  },
  {
    id: 'push',
    label: 'Push',
    detail: 'Begins at a working rate and adds 25 words per minute every 250 words.',
    config: { startWpm: 300, stepWpm: 25, everyTokens: 250, ceilingWpm: 800 },
  },
];

/** Rates offered by the speed control, in words per minute. */
export const WPM_STEPS: readonly number[] = [
  100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000,
];

/** Description of the evidence behind the rate, shown beside the control. */
export const rateNote = (wpm: number): string => {
  if (wpm <= 250) return 'At or below a natural silent reading rate.';
  if (wpm <= 360) return 'Above a natural reading rate; comprehension is usually held with sentence pauses in place.';
  if (wpm <= 405) return 'Fast enough that comprehension typically starts to fall for many readers.';
  return 'Skimming rates: expect recall of detail to drop even when the words are all seen.';
};
