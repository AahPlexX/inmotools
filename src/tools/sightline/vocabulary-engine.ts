/**
 * Vocabulary bank, retention drills, and flashcard vault.
 *
 * Three things happen here:
 *
 * 1. **Collection.** Words that took longer than the reader's own average, and
 *    words the reader marked as unknown, are collected into a bank with a
 *    weight. The bank is derived from the reader's own timing, so it reflects
 *    their vocabulary rather than a frequency list.
 * 2. **Retention drills.** Cloze items blank a word in its own sentence and
 *    offer distractors drawn from the bank. Distractors are chosen by phonetic
 *    and orthographic similarity, so the drill tests discrimination instead of
 *    being answerable from the shape of the options.
 * 3. **Spaced review.** The vault schedules each card with a compact
 *    spaced-repetition rule: a correct answer lengthens the interval, a wrong
 *    answer resets it to the start.
 */

import { doubleMetaphone } from 'double-metaphone';
import type { SentenceNode, TokenRecord } from './sightline-types';

export interface VocabularyEntry {
  readonly word: string;
  /** Times the word was collected or missed. */
  readonly seen: number;
  /** Times the reader answered it correctly in a drill. */
  readonly correct: number;
  /** Average presentation time in milliseconds, when it has been timed. */
  readonly averageMs: number;
  /** Higher weight means the word is weaker and should be drilled first. */
  readonly weight: number;
  readonly addedAt: number;
  readonly lastSeenAt: number;
  /** Next review time in milliseconds since the epoch, for the vault. */
  readonly dueAt: number;
  /** Current interval in days. */
  readonly intervalDays: number;
}

export const DEFAULT_EASE = 2.3;
export const MIN_INTERVAL_DAYS = 0.5;
export const MAX_INTERVAL_DAYS = 240;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our', 'out',
  'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'why', 'did',
  'she', 'use', 'way', 'with', 'that', 'this', 'from', 'they', 'have', 'were', 'been', 'than', 'them', 'then',
  'when', 'into', 'more', 'some', 'such', 'only', 'over', 'also', 'than', 'very', 'will', 'your', 'what', 'just',
]);

export const isStopWord = (word: string): boolean => STOP_WORDS.has(word.toLowerCase());

export interface CollectOptions {
  /** Words slower than this share of the document average are collected. */
  readonly slowRatio: number;
  /** Words shorter than this are never collected. */
  readonly minLetters: number;
  /** Words the reader marked as unknown are always collected. */
  readonly markedWords?: readonly string[];
  readonly now?: number;
}

export const DEFAULT_COLLECT: CollectOptions = { slowRatio: 1.6, minLetters: 4 };

export interface TimedToken {
  readonly token: TokenRecord;
  /** Milliseconds the word was on screen. */
  readonly durationMs: number;
}

/**
 * Build the initial bank: words that took markedly longer than the reader's own
 * median, plus any word the reader marked. The median is used rather than the
 * mean so one very slow word does not set the bar for the rest.
 */
export const collectVocabulary = (
  timed: readonly TimedToken[],
  options: CollectOptions = DEFAULT_COLLECT,
): VocabularyEntry[] => {
  const now = options.now ?? Date.now();
  const marked = new Set((options.markedWords ?? []).map((word) => word.toLowerCase()));
  const candidates = timed
    .map((entry) => ({ word: entry.token.text, durationMs: entry.durationMs, token: entry.token }))
    .filter((entry) => {
      const cleaned = entry.word.replace(/[^A-Za-z\u00c0-\u024f]/g, '');
      return cleaned.length >= options.minLetters && !isStopWord(cleaned);
    });
  if (candidates.length === 0 && marked.size === 0) return [];

  const durations = candidates.map((entry) => entry.durationMs).sort((left, right) => left - right);
  const median = durations.length === 0 ? 0 : durations[Math.floor(durations.length / 2)]!;
  const threshold = median * Math.max(1, options.slowRatio);

  const bank = new Map<string, VocabularyEntry>();
  const upsert = (word: string, averageMs: number, force: boolean) => {
    const key = word.toLowerCase();
    const existing = bank.get(key);
    const weight = existing
      ? existing.weight + 1
      : force ? 3 : 1;
    bank.set(key, {
      word,
      seen: (existing?.seen ?? 0) + 1,
      correct: existing?.correct ?? 0,
      averageMs: existing ? Math.round((existing.averageMs + averageMs) / 2) : Math.round(averageMs),
      weight,
      addedAt: existing?.addedAt ?? now,
      lastSeenAt: now,
      dueAt: existing?.dueAt ?? now,
      intervalDays: existing?.intervalDays ?? 0,
    });
  };

  for (const entry of candidates) {
    const force = marked.has(entry.word.toLowerCase());
    if (entry.durationMs >= threshold || force) upsert(entry.word, entry.durationMs, force);
  }
  for (const word of marked) {
    if (!bank.has(word)) upsert(word, median || 0, true);
  }

  return [...bank.values()].sort((left, right) => right.weight - left.weight || left.word.localeCompare(right.word));
};

/**
 * Words that are easy to confuse with the target: same initial sound, similar
 * length, and a share of the same letters. Used as cloze distractors.
 */
export const chooseDistractors = (
  target: string,
  pool: readonly string[],
  count = 3,
): string[] => {
  const lower = target.toLowerCase();
  const [primary] = doubleMetaphone(lower);
  const scored = pool
    .map((word) => word.toLowerCase())
    .filter((word) => word !== lower && word.length > 1)
    .map((word) => {
      const [wordPrimary] = doubleMetaphone(word);
      const sameSound = wordPrimary === primary ? 2 : 0;
      const lengthGap = Math.abs(word.length - lower.length);
      const shared = sharedLetters(lower, word);
      return { word, score: sameSound + shared * 1.5 - lengthGap * 0.5 };
    })
    .sort((left, right) => right.score - left.score || left.word.localeCompare(right.word));
  const picked: string[] = [];
  for (const entry of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(entry.word)) picked.push(entry.word);
  }
  return picked;
};

const sharedLetters = (left: string, right: string): number => {
  const counts = new Map<string, number>();
  for (const character of left) counts.set(character, (counts.get(character) ?? 0) + 1);
  let shared = 0;
  for (const character of right) {
    const remaining = counts.get(character) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(character, remaining - 1);
    }
  }
  return shared;
};

export interface ClozeItem {
  /** Sentence with the target replaced by a blank. */
  readonly text: string;
  readonly answer: string;
  readonly options: readonly string[];
  /** Index of the answer within `options`. */
  readonly answerIndex: number;
  readonly tokenIndex: number;
}

export const BLANK = '____';

/**
 * Build a cloze item from the sentence that contains the target word. If the
 * word appears more than once in the sentence, only the first occurrence is
 * blanked.
 */
export const buildCloze = (
  sentence: SentenceNode,
  tokens: readonly TokenRecord[],
  target: string,
  pool: readonly string[] = [],
): ClozeItem | null => {
  const slice = tokens.slice(sentence.tokenStart, sentence.tokenEnd);
  const match = slice.find((token) => stripWord(token.text).toLowerCase() === target.toLowerCase());
  if (!match) return null;
  const candidates = pool.length > 0 ? pool : slice.map((token) => stripWord(token.text));
  const distractors = chooseDistractors(target, candidates, 3);
  const options = shuffleDeterministic([target, ...distractors], match.index + target.length);
  return {
    text: slice
      .map((token) => (token.index === match.index ? token.text.replace(new RegExp(escapeRegExp(stripWord(token.text)), 'i'), BLANK) : token.text))
      .join(' '),
    answer: stripWord(match.text),
    options,
    answerIndex: options.findIndex((option) => option.toLowerCase() === stripWord(match.text).toLowerCase()),
    tokenIndex: match.index,
  };
};

const stripWord = (word: string): string => word.replace(/^[^A-Za-z\u00c0-\u024f]+|[^A-Za-z\u00c0-\u024f]+$/g, '');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shuffleDeterministic = (values: readonly string[], seed: number): string[] => {
  const output = [...values];
  let state = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const swap = state % (index + 1);
    const value = output[index]!;
    output[index] = output[swap]!;
    output[swap] = value;
  }
  return output;
};

/** Build up to `limit` cloze items from the bank, in bank order. */
export const buildClozeSet = (
  bank: readonly VocabularyEntry[],
  tokens: readonly TokenRecord[],
  sentences: readonly SentenceNode[],
  limit = 10,
): ClozeItem[] => {
  const pool = bank.map((entry) => entry.word);
  const items: ClozeItem[] = [];
  for (const entry of bank) {
    if (items.length >= limit) break;
    for (const sentence of sentences) {
      const item = buildCloze(sentence, tokens, entry.word, pool);
      if (item && item.answerIndex >= 0) {
        items.push(item);
        break;
      }
    }
  }
  return items;
};

export interface ReviewOutcome {
  readonly entry: VocabularyEntry;
  /** True when the reader answered correctly. */
  readonly correct: boolean;
  readonly now?: number;
}

/** Apply a review result to an entry: correct answers stretch, misses reset. */
export const applyReview = ({ entry, correct, now = Date.now() }: ReviewOutcome): VocabularyEntry => {
  if (!correct) {
    return {
      ...entry,
      seen: entry.seen + 1,
      weight: entry.weight + 2,
      intervalDays: MIN_INTERVAL_DAYS,
      dueAt: now + MIN_INTERVAL_DAYS * 86_400_000,
      lastSeenAt: now,
    };
  }
  const intervalDays = entry.intervalDays <= 0
    ? 1
    : Math.min(MAX_INTERVAL_DAYS, Math.round(entry.intervalDays * DEFAULT_EASE * 10) / 10);
  return {
    ...entry,
    seen: entry.seen + 1,
    correct: entry.correct + 1,
    weight: Math.max(1, entry.weight - 1),
    intervalDays,
    dueAt: now + intervalDays * 86_400_000,
    lastSeenAt: now,
  };
};

/** Entries whose review is due, weakest first. */
export const dueEntries = (bank: readonly VocabularyEntry[], now = Date.now()): VocabularyEntry[] =>
  bank
    .filter((entry) => entry.dueAt <= now)
    .sort((left, right) => right.weight - left.weight || left.dueAt - right.dueAt);

/** Retention expressed as the share of reviews answered correctly. */
export const retentionRate = (bank: readonly VocabularyEntry[]): number => {
  const seen = bank.reduce((total, entry) => total + entry.seen, 0);
  if (seen === 0) return 0;
  const correct = bank.reduce((total, entry) => total + entry.correct, 0);
  return Math.round((correct / seen) * 1000) / 10;
};

export const vocabularyRows = (bank: readonly VocabularyEntry[]): readonly (readonly (string | number)[])[] => [
  ['word', 'seen', 'correct', 'weight', 'averageMs', 'intervalDays', 'dueAt', 'addedAt'],
  ...bank.map((entry) => [
    entry.word,
    entry.seen,
    entry.correct,
    entry.weight,
    entry.averageMs,
    entry.intervalDays,
    new Date(entry.dueAt).toISOString(),
    new Date(entry.addedAt).toISOString(),
  ]),
];

export const vocabularyPayload = (bank: readonly VocabularyEntry[]): string => JSON.stringify({
  exportedAt: new Date().toISOString(),
  retention: retentionRate(bank),
  entries: bank,
}, null, 2);
