/**
 * Multi-word presentation.
 *
 * Single-word presentation removes every eye movement, but it also removes the
 * shape of a phrase: readers cannot use the syntax of a clause to predict what
 * is coming. Presenting two to five words at a time keeps word positions stable
 * enough for peripheral pickup while still eliminating most saccades. Chunks are
 * built here, and their schedule is built by the pacing engine, so a chunk
 * stream and a single-word stream share their timing rules.
 */

import {
  buildSchedule,
  clampWpm,
  type PacingConfig,
  type Schedule,
  type ScheduleOptions,
} from './pacing-engine';
import { selectAnchorIndex } from './orp-engine';
import type { TokenRecord } from './sightline-types';

export type ChunkMode = 'single' | 'chunked';
export type ChunkSplitPolicy = 'punctuation' | 'balanced';

export interface ChunkConfig {
  /** Words per presentation unit, 1–5. */
  readonly wordsPerChunk: number;
  /** Break chunks at clause and sentence boundaries wherever possible. */
  readonly splitPolicy: ChunkSplitPolicy;
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = { wordsPerChunk: 3, splitPolicy: 'punctuation' };

export interface Chunk {
  /** Index of the first token of the chunk in the document model. */
  readonly startToken: number;
  /** Index after the last token of the chunk. */
  readonly endToken: number;
  readonly text: string;
  /** Index within `tokens` of the word that is held on the focal anchor. */
  readonly anchorOffset: number;
  readonly words: number;
  /** Strongest boundary inside the chunk, used for pacing. */
  readonly breakAfter: TokenRecord['breakAfter'];
  /** True when the chunk ends a sentence. */
  readonly endsSentence: boolean;
}

const isBoundary = (token: TokenRecord): boolean => token.breakAfter === 'clause'
  || token.breakAfter === 'sentence'
  || token.breakAfter === 'paragraph'
  || token.breakAfter === 'chapter';

const strongest = (left: TokenRecord['breakAfter'], right: TokenRecord['breakAfter']): TokenRecord['breakAfter'] => {
  const order: readonly TokenRecord['breakAfter'][] = ['none', 'clause', 'sentence', 'paragraph', 'chapter'];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
};

/**
 * Group tokens into presentation units.
 *
 * With `punctuation` splitting, a chunk is closed early when a clause or
 * sentence ends: the reader sees "in the end," as one unit rather than "in the
 * end, it" as another, which keeps the phrase intact. With `balanced` the words
 * per chunk are distributed evenly across each sentence instead.
 */
export const buildChunks = (
  tokens: readonly TokenRecord[],
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG,
): Chunk[] => {
  const size = Math.max(1, Math.min(5, Math.round(config.wordsPerChunk)));
  const chunks: Chunk[] = [];
  let index = 0;

  while (index < tokens.length) {
    const sentenceIndex = tokens[index]!.sentenceIndex;
    let remaining = 0;
    while (index + remaining < tokens.length && tokens[index + remaining]!.sentenceIndex === sentenceIndex) {
      remaining += 1;
    }

    if (config.splitPolicy === 'balanced' && size > 1) {
      const groups = Math.max(1, Math.round(remaining / size));
      const perGroup = Math.ceil(remaining / groups);
      for (let offset = 0; offset < remaining; offset += perGroup) {
        chunks.push(makeChunk(tokens, index + offset, Math.min(index + offset + perGroup, index + remaining)));
      }
      index += remaining;
      continue;
    }

    let cursor = index;
    while (cursor < tokens.length && cursor < index + remaining) {
      let end = Math.min(cursor + size, index + remaining);
      if (size > 1) {
        // Pull the chunk end back to the first boundary inside it, unless the
        // boundary is the very first word.
        for (let probe = cursor + 1; probe < end; probe += 1) {
          if (isBoundary(tokens[probe - 1]!)) {
            end = probe;
            break;
          }
        }
      }
      chunks.push(makeChunk(tokens, cursor, end));
      cursor = end;
    }
    index += remaining;
  }

  return chunks;
};

const makeChunk = (tokens: readonly TokenRecord[], start: number, end: number): Chunk => {
  const slice = tokens.slice(start, end);
  let breakAfter: TokenRecord['breakAfter'] = 'none';
  for (const token of slice) breakAfter = strongest(breakAfter, token.breakAfter);
  const words = slice.map((token) => token.text);
  return {
    startToken: start,
    endToken: end,
    text: words.join(' '),
    anchorOffset: selectAnchorIndex(words),
    words: words.length,
    breakAfter,
    endsSentence: breakAfter === 'sentence' || breakAfter === 'paragraph' || breakAfter === 'chapter',
  };
};

/**
 * A synthetic token per chunk, so chunk streams can reuse the pacing engine
 * unchanged: the chunk's letters and syllables decide how long it is shown, and
 * its strongest internal break decides the pause that follows.
 */
export const chunksAsTokens = (chunks: readonly Chunk[], tokens: readonly TokenRecord[]): TokenRecord[] =>
  chunks.map((chunk, index) => {
    const slice = tokens.slice(chunk.startToken, chunk.endToken);
    const letters = slice.reduce((total, token) => total + token.letters, 0);
    const syllables = slice.reduce((total, token) => total + token.syllables, 0);
    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    return {
      ...first,
      index,
      text: chunk.text,
      start: first.start,
      end: last.end,
      letters,
      syllables,
      trailing: last.trailing,
      breakAfter: chunk.breakAfter,
      sentenceIndex: first.sentenceIndex,
      paragraphIndex: first.paragraphIndex,
    };
  });

/** Build the schedule for a chunk stream. */
export const buildChunkSchedule = (
  tokens: readonly TokenRecord[],
  chunkConfig: ChunkConfig,
  pacing: PacingConfig,
  options: ScheduleOptions = {},
): { chunks: readonly Chunk[]; schedule: Schedule } => {
  const chunks = buildChunks(tokens, chunkConfig);
  const synthetic = chunksAsTokens(chunks, tokens);
  return { chunks, schedule: buildSchedule(synthetic, pacing, options) };
};

/** Words per minute a chunk stream actually delivers, counting all its words. */
export const chunkStreamWpm = (chunks: readonly Chunk[], schedule: Schedule): number => {
  if (schedule.totalMs <= 0) return 0;
  const words = chunks.reduce((total, chunk) => total + chunk.words, 0);
  return Math.round((words * 60_000) / schedule.totalMs);
};

/** Suggested chunk width for a rate, from what readers can take in at once. */
export const suggestedChunkWidth = (wpm: number): number => {
  const rate = clampWpm(wpm);
  if (rate <= 250) return 1;
  if (rate <= 400) return 2;
  if (rate <= 600) return 3;
  if (rate <= 800) return 4;
  return 5;
};
