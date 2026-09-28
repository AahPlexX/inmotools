/**
 * Fixation-weight typography.
 *
 * A word's first letters carry most of the information a reader needs to
 * recognise it; the rest of the word confirms the guess. Rendering that opening
 * segment at a heavier weight — and leaving the rest at normal weight — gives
 * the eye a fixed entry point in every word and shortens the time spent
 * scanning it. The technique is described here generically: this tool does not
 * use any third-party trademark or reproduce any vendor's rule set, and the
 * splits below come from the letter-count rule stated in the code.
 *
 * The same split is used for the on-screen reader, the exported HTML, and the
 * exported PDF and EPUB, so a document looks the same wherever it is read.
 */

import type { TokenRecord } from './sightline-types';

/** 1 is a light tint, 5 is the heaviest reliable weight. */
export type EmphasisLevel = 1 | 2 | 3 | 4 | 5;

export interface EmphasisConfig {
  readonly level: EmphasisLevel;
  /** Fraction of a word's letters that receive the heavier weight. */
  readonly fraction: number;
  /** Cap on the emphasised letters, so long words do not look malformed. */
  readonly maxLetters: number;
  /** Minimum letters taken even in a one-letter word. */
  readonly minLetters: number;
}

export const DEFAULT_EMPHASIS: EmphasisConfig = {
  level: 3,
  fraction: 0.4,
  maxLetters: 4,
  minLetters: 1,
};

/** Heavier levels emphasise more of the word; see DEFAULT_EMPHASIS. */
export const emphasisForLevel = (level: EmphasisLevel): EmphasisConfig => {
  switch (level) {
    case 1: return { level, fraction: 0.25, maxLetters: 3, minLetters: 1 };
    case 2: return { level, fraction: 0.33, maxLetters: 3, minLetters: 1 };
    case 3: return { level, fraction: 0.4, maxLetters: 4, minLetters: 1 };
    case 4: return { level, fraction: 0.5, maxLetters: 5, minLetters: 1 };
    default: return { level, fraction: 0.6, maxLetters: 6, minLetters: 2 };
  }
};

export interface EmphasisParts {
  /** Punctuation before the word, rendered at the normal weight. */
  readonly lead: string;
  /** Letters rendered heavy. */
  readonly strong: string;
  /** Letters left at the normal weight, including trailing punctuation. */
  readonly rest: string;
}

const isLetter = (character: string): boolean => /[0-9A-Za-z\u00c0-\u024f]/.test(character);

/** Split a word into the heavy opening segment and the remainder. */
export const splitEmphasis = (
  word: string,
  config: EmphasisConfig = DEFAULT_EMPHASIS,
): EmphasisParts => {
  const firstLetter = word.search(/[0-9A-Za-z\u00c0-\u024f]/);
  if (firstLetter === -1) return { lead: '', strong: word, rest: '' };
  const lead = word.slice(0, firstLetter);
  const core = word.slice(firstLetter);
  let letters = 0;
  for (const character of core) if (isLetter(character)) letters += 1;
  const wanted = Math.min(
    config.maxLetters,
    letters,
    Math.max(config.minLetters, Math.round(letters * config.fraction)),
  );
  if (core.length <= 2) return { lead, strong: core, rest: '' };

  let seen = 0;
  let cut = 0;
  for (let index = 0; index < core.length; index += 1) {
    cut = index + 1;
    if (isLetter(core[index]!)) seen += 1;
    if (seen >= wanted) break;
  }
  // Trailing punctuation belongs to the tail, never to the heavy segment.
  while (cut > 0 && !isLetter(core[cut - 1]!)) cut -= 1;
  return { lead, strong: core.slice(0, cut), rest: core.slice(cut) };
};

/** Emphasis levels offered in the reader, with plain-language descriptions. */
export const EMPHASIS_LEVELS: readonly { level: EmphasisLevel; label: string; detail: string }[] = [
  { level: 1, label: 'Light', detail: 'A quarter of each word is heavy. The lightest visible effect.' },
  { level: 2, label: 'Moderate', detail: 'A third of each word is heavy.' },
  { level: 3, label: 'Balanced', detail: 'Two fifths of each word is heavy, capped at four letters.' },
  { level: 4, label: 'Strong', detail: 'Half of each word is heavy.' },
  { level: 5, label: 'Strongest', detail: 'Three fifths of each word is heavy. Best for short words.' },
];

export interface EmphasisSegment {
  readonly text: string;
  readonly strong: boolean;
}

/**
 * Convert a run of tokens into renderable segments: punctuation and spaces stay
 * unstressed, and the words that follow a heavy word keep the ordinary weight
 * so the page does not become a block of bold type.
 */
export const emphasiseTokens = (
  tokens: readonly Pick<TokenRecord, 'text'>[],
  config: EmphasisConfig = DEFAULT_EMPHASIS,
): EmphasisSegment[] => {
  const segments: EmphasisSegment[] = [];
  tokens.forEach((token, index) => {
    if (index > 0) segments.push({ text: ' ', strong: false });
    const parts = splitEmphasis(token.text, config);
    if (parts.lead.length > 0) segments.push({ text: parts.lead, strong: false });
    if (parts.strong.length > 0) segments.push({ text: parts.strong, strong: true });
    if (parts.rest.length > 0) segments.push({ text: parts.rest, strong: false });
  });
  return segments;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));

/** HTML for a token run with the heavy segments wrapped in `<b>`. */
export const emphasisHtml = (
  tokens: readonly Pick<TokenRecord, 'text'>[],
  config: EmphasisConfig = DEFAULT_EMPHASIS,
): string => emphasiseTokens(tokens, config)
  .map((segment) => (segment.strong ? `<b>${escapeHtml(segment.text)}</b>` : escapeHtml(segment.text)))
  .join('');

/** CSS font-weight for a level, for the on-screen reader. */
export const emphasisWeight = (level: EmphasisLevel): number => 400 + level * 100;

/** Opacity of the unstressed remainder, which must stay legible. */
export const emphasisRestOpacity = (level: EmphasisLevel): number => (level >= 5 ? 0.72 : 0.86);
