/**
 * Optimal recognition point (ORP) computation and focal-box geometry.
 *
 * Anchor offsets remain UTF-16 indices into the original token, while selection
 * and display operate on grapheme clusters. The default table preserves the
 * existing ASCII break rule; ratio mode offers a proportional anchor.
 */

export type OrpMode = 'table' | 'ratio';

export interface OrpOptions {
  readonly mode?: OrpMode;
  /** Anchor fraction of the word's alphanumeric core, used by ratio mode. */
  readonly ratio?: number;
}

interface TokenGrapheme {
  segment: string;
  index: number;
}

const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

const segmentToken = (token: string): TokenGrapheme[] => {
  if (segmenter) {
    return Array.from(segmenter.segment(token), ({ segment, index }) => ({ segment, index }));
  }
  // Older engines: preserve code points, combining marks, and common emoji
  // sequences. Full Unicode grapheme rules require Intl.Segmenter.
  const parts: TokenGrapheme[] = [];
  let index = 0;
  for (const point of token) {
    const previous = parts[parts.length - 1];
    const extendsPrevious = /[\p{M}\p{Emoji_Modifier}]/u.test(point)
      || point === '\u200d'
      || previous?.segment.endsWith('\u200d')
      || (/^\p{Regional_Indicator}$/u.test(point)
        && /^\p{Regional_Indicator}$/u.test(previous?.segment ?? ''));
    if (previous && extendsPrevious) previous.segment += point;
    else parts.push({ segment: point, index });
    index += point.length;
  }
  return parts;
};

const isCore = (character: string): boolean => /[\p{L}\p{N}]/u.test(character);

const coreGraphemes = (token: string): TokenGrapheme[] => {
  const parts = segmentToken(token);
  let start = 0;
  while (start < parts.length && !isCore(parts[start]!.segment)) start += 1;
  let end = parts.length - 1;
  while (end >= start && !isCore(parts[end]!.segment)) end -= 1;
  return parts.slice(start, end + 1);
};

/** Offsets from the first alphanumeric grapheme, indexed by core length. */
const TABLE_OFFSETS: readonly number[] = [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4];

const tableOffset = (coreLength: number): number =>
  TABLE_OFFSETS[Math.min(Math.max(coreLength, 1), TABLE_OFFSETS.length) - 1] ?? 0;

export const coreSpan = (token: string): { start: number; end: number } => {
  const core = coreGraphemes(token);
  const first = core[0];
  const last = core[core.length - 1];
  return first && last
    ? { start: first.index, end: last.index + last.segment.length - 1 }
    : { start: token.length, end: token.length - 1 };
};

export const computeOrp = (token: string, options: OrpOptions = {}): number => {
  const core = coreGraphemes(token);
  if (core.length === 0) {
    const parts = segmentToken(token);
    return parts[Math.max(0, Math.floor(parts.length / 2) - 1)]?.index ?? 0;
  }
  const ratio = typeof options.ratio === 'number' && Number.isFinite(options.ratio)
    ? Math.min(1, Math.max(0, options.ratio))
    : 0.35;
  const offset = options.mode === 'ratio'
    ? Math.min(core.length - 1, Math.max(0, Math.round(core.length * ratio)))
    : tableOffset(core.length);
  return core[offset]!.index;
};

/** Horizontal fraction of the focal box at which the anchor character is held. */
export const FOCAL_ANCHOR_FRACTION = 0.36;

export const focalOffsetPx = (containerWidth: number, anchorFraction = FOCAL_ANCHOR_FRACTION): number =>
  Math.round(containerWidth * anchorFraction);

/** Select the longest core-grapheme count, with ties going to the earlier word. */
export const selectAnchorIndex = (tokens: readonly string[]): number => {
  let bestIndex = 0;
  let bestLetters = -1;
  tokens.forEach((token, index) => {
    const letters = segmentToken(token).filter((part) => isCore(part.segment)).length;
    if (letters > bestLetters) {
      bestLetters = letters;
      bestIndex = index;
    }
  });
  return bestIndex;
};

export const splitOrp = (
  token: string,
  orpIndex: number,
): { before: string; anchor: string; after: string } => {
  const index = Number.isFinite(orpIndex)
    ? Math.min(Math.max(0, Math.trunc(orpIndex)), Math.max(0, token.length - 1))
    : 0;
  const part = segmentToken(token).find((entry) =>
    index >= entry.index && index < entry.index + entry.segment.length);
  if (!part) return { before: '', anchor: '', after: '' };
  return {
    before: token.slice(0, part.index),
    anchor: part.segment,
    after: token.slice(part.index + part.segment.length),
  };
};
