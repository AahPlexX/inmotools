/**
 * Speech pacing.
 *
 * Reading aloud from the browser's own speech synthesiser is the one pacing
 * channel that guarantees every word is spoken at a controlled rate. Two things
 * have to be handled honestly:
 *
 * 1. Not every engine reports word boundaries. Chromium and Edge fire a
 *    `boundary` event per word, Firefox fires them for sentence boundaries, and
 *    several mobile implementations do not fire them at all. Where boundaries
 *    are missing the highlight is driven by estimated timings instead, and the
 *    interface says which mode is in use rather than pretending to be exact.
 * 2. The synthesis rate is a multiplier, not a rate in words per minute. The
 *    mapping below assumes a neutral voice reads about 175 words per minute,
 *    which is the figure this tool measured against its own baseline, and the
 *    reader can correct for a voice that differs.
 *
 * No audio leaves the browser: `speechSynthesis` is part of the platform.
 */

import type { TokenRecord } from './sightline-types';

/** Words per minute a neutral voice reads at rate 1. */
export const NEUTRAL_SPEECH_WPM = 175;
/** Range a compliant implementation supports, per the speech synthesis spec. */
export const MIN_RATE = 0.1;
export const MAX_RATE = 10;

export const clampRate = (rate: number): number => {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 100) / 100));
};

/** Synthesis rate for a target reading rate in words per minute. */
export const rateForWpm = (wpm: number, neutralWpm = NEUTRAL_SPEECH_WPM): number => {
  const target = Math.max(40, Math.min(1600, Math.round(wpm) || 0));
  const neutral = Math.max(60, Math.min(400, neutralWpm));
  return clampRate(target / neutral);
};

/** Words per minute a synthesis rate should produce. */
export const wpmForRate = (rate: number, neutralWpm = NEUTRAL_SPEECH_WPM): number =>
  Math.round(clampRate(rate) * neutralWpm);

export interface SpeechSupportScope {
  readonly speechSynthesis?: unknown;
  readonly SpeechSynthesisUtterance?: unknown;
}

export interface SpeechSupport {
  readonly supported: boolean;
  /** True when the platform is known to fire word boundary events. */
  readonly boundaryEvents: boolean;
  readonly reason: string;
}

/**
 * Feature detection for the speech channel. Boundary support is reported as
 * unknown rather than assumed: the reader is told that the highlight may be
 * estimated, which is the same information the interface shows.
 */
export const detectSpeechSupport = (scope: SpeechSupportScope): SpeechSupport => {
  const hasSynthesis = typeof scope.speechSynthesis === 'object' && scope.speechSynthesis !== null;
  const hasUtterance = typeof scope.SpeechSynthesisUtterance === 'function';
  if (hasSynthesis && hasUtterance) {
    return {
      supported: true,
      boundaryEvents: false,
      reason: 'Speech runs in the browser. Word highlighting uses estimated timings when the voice does not report word boundaries.',
    };
  }
  if (hasSynthesis) {
    return { supported: false, boundaryEvents: false, reason: 'Speech synthesis is present but utterances cannot be created.' };
  }
  return { supported: false, boundaryEvents: false, reason: 'This browser has no speech synthesis. Use the visual metronome instead.' };
};

export interface SpeechChunk {
  readonly text: string;
  /** First token index in the document model. */
  readonly startToken: number;
  /** Index after the last token. */
  readonly endToken: number;
  /** Character offset of each token within `text`, in order. */
  readonly tokenOffsets: readonly number[];
  readonly estimatedMs: number;
}

export interface SpeechPlan {
  readonly chunks: readonly SpeechChunk[];
  readonly totalEstimatedMs: number;
  readonly rate: number;
  /** Words per minute the plan should deliver. */
  readonly wpm: number;
}

export interface SpeechPlanOptions {
  readonly wpm: number;
  /** Pause added after each sentence, in milliseconds. */
  readonly sentencePauseMs?: number;
  /** Longest utterance to hand to the engine; short ones report boundaries better. */
  readonly maxChunkChars?: number;
  readonly fromToken?: number;
  readonly toToken?: number;
  /** Neutral rate of the selected voice, if the reader has calibrated it. */
  readonly neutralWpm?: number;
}

const DEFAULT_SENTENCE_PAUSE_MS = 260;
const DEFAULT_MAX_CHUNK_CHARS = 180;

/** Estimated duration of one word at a synthesis rate, from its letter count. */
export const estimateWordMs = (word: string, rate: number): number => {
  const letters = (word.match(/[0-9A-Za-z\u00c0-\u024f]/g) ?? []).length;
  const perWord = 60_000 / NEUTRAL_SPEECH_WPM;
  const factor = letters === 0 ? 0.6 : Math.min(2.2, Math.max(0.5, letters / 4.7));
  return Math.round((perWord * factor) / clampRate(rate));
};

/**
 * Split the reading stream into utterances. Sentences are the natural unit: an
 * engine that reports boundaries only per sentence still gives a useful
 * highlight, and a pause between utterances is where a reader consolidates.
 */
export const buildSpeechPlan = (
  tokens: readonly TokenRecord[],
  options: SpeechPlanOptions,
): SpeechPlan => {
  const rate = rateForWpm(options.wpm, options.neutralWpm);
  const sentencePause = Math.max(0, options.sentencePauseMs ?? DEFAULT_SENTENCE_PAUSE_MS);
  const maxChars = Math.max(40, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const from = Math.max(0, Math.min(tokens.length, Math.round(options.fromToken ?? 0)));
  const to = Math.max(from, Math.min(tokens.length, Math.round(options.toToken ?? tokens.length)));

  const chunks: SpeechChunk[] = [];
  let index = from;

  while (index < to) {
    const sentenceIndex = tokens[index]!.sentenceIndex;
    const slice: TokenRecord[] = [];
    let chars = 0;
    let cursor = index;
    while (cursor < to && tokens[cursor]!.sentenceIndex === sentenceIndex && chars < maxChars) {
      const token = tokens[cursor]!;
      const addition = token.text.length + (slice.length > 0 ? 1 : 0);
      if (chars + addition > maxChars && slice.length > 0) break;
      slice.push(token);
      chars += addition;
      cursor += 1;
    }
    // A single sentence longer than the cap is split at word boundaries by the
    // loop above; a sentence that fits stays whole and keeps its pause.
    const text = slice.map((token) => token.text).join(' ');
    const tokenOffsets: number[] = [];
    let offset = 0;
    for (const token of slice) {
      tokenOffsets.push(offset);
      offset += token.text.length + 1;
    }
    const wordsMs = slice.reduce((total, token) => total + estimateWordMs(token.text, rate), 0);
    const isSentenceEnd = cursor >= to || tokens[cursor]?.sentenceIndex !== sentenceIndex
      || slice[slice.length - 1]?.breakAfter === 'sentence'
      || slice[slice.length - 1]?.breakAfter === 'paragraph'
      || slice[slice.length - 1]?.breakAfter === 'chapter';
    chunks.push({
      text,
      startToken: index,
      endToken: cursor,
      tokenOffsets,
      estimatedMs: wordsMs + (isSentenceEnd ? sentencePause : 0),
    });
    index = cursor;
  }

  const totalEstimatedMs = chunks.reduce((total, chunk) => total + chunk.estimatedMs, 0);
  return {
    chunks,
    totalEstimatedMs,
    rate,
    wpm: totalEstimatedMs === 0 ? 0 : Math.round((tokensInChunks(chunks) * 60_000) / totalEstimatedMs),
  };
};

const tokensInChunks = (chunks: readonly SpeechChunk[]): number =>
  chunks.reduce((total, chunk) => total + chunk.tokenOffsets.length, 0);

/**
 * Token index for a boundary event's character offset inside a chunk. Engines
 * report the offset of the word they have just started, so the token containing
 * that offset is the one to highlight.
 */
export const tokenForCharOffset = (chunk: SpeechChunk, charOffset: number): number => {
  if (chunk.tokenOffsets.length === 0) return chunk.startToken;
  let found = 0;
  for (let index = 0; index < chunk.tokenOffsets.length; index += 1) {
    if (chunk.tokenOffsets[index]! <= charOffset) found = index;
    else break;
  }
  return chunk.startToken + found;
};

/** Cumulative start times for estimated highlighting, per chunk. */
export const chunkStartTimes = (chunks: readonly SpeechChunk[]): number[] => {
  const starts: number[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    starts.push(cursor);
    cursor += chunk.estimatedMs;
  }
  return starts;
};

export interface VoicePreference {
  /** Language tag the content is written in, e.g. `en`. */
  readonly language: string;
  /** Voice names or fragments to prefer, best first. */
  readonly preferred?: readonly string[];
}

/**
 * Choose a voice from the platform list. Systems report the same voice with
 * different names, so matching is done on the language tag first and on partial
 * name matches second; an exact language match with no name match still wins
 * over a wrong-language voice, because a wrong language is unintelligible.
 */
export const chooseVoice = <Voice extends { name: string; lang: string }>(
  voices: readonly Voice[],
  preference: VoicePreference,
): Voice | undefined => {
  if (voices.length === 0) return undefined;
  const wanted = preference.language.toLowerCase().split('-')[0]!;
  const languageMatches = voices.filter((voice) => voice.lang.toLowerCase().startsWith(wanted));
  const pool = languageMatches.length > 0 ? languageMatches : voices;
  for (const wantedName of preference.preferred ?? []) {
    const needle = wantedName.toLowerCase();
    const match = pool.find((voice) => voice.name.toLowerCase().includes(needle)
      || voice.lang.toLowerCase() === wantedName.toLowerCase());
    if (match) return match;
  }
  const exact = pool.find((voice) => voice.lang.toLowerCase() === preference.language.toLowerCase());
  return exact ?? pool[0];
};

export const SPEECH_RATE_PRESETS: readonly { id: string; label: string; wpm: number }[] = [
  { id: 'natural', label: 'Natural speech', wpm: 175 },
  { id: 'brisk', label: 'Brisk', wpm: 225 },
  { id: 'fast', label: 'Fast', wpm: 300 },
  { id: 'very-fast', label: 'Very fast', wpm: 400 },
];
