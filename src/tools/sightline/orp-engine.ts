/**
 * Optimal recognition point (ORP) computation and focal-box geometry.
 *
 * The recognition point is the character a reader's eye lands on when a word
 * is recognised as a whole. Anchoring that character at a fixed horizontal
 * position is what removes the saccades and return sweeps of ordinary page
 * reading. The default table is the widely used five-break rule; the ratio
 * mode exists for readers who prefer a proportional anchor.
 */

export type OrpMode = 'table' | 'ratio';

export interface OrpOptions {
  readonly mode?: OrpMode;
  /** Anchor fraction of the word's alphanumeric core, used by ratio mode. */
  readonly ratio?: number;
}

const isCore = (character: string): boolean => /[0-9A-Za-z\u00c0-\u024f]/.test(character);

/** Offsets from the first alphanumeric character, indexed by core length. */
const TABLE_OFFSETS: readonly number[] = [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4];

const tableOffset = (coreLength: number): number =>
  TABLE_OFFSETS[Math.min(Math.max(coreLength, 1), TABLE_OFFSETS.length) - 1] ?? 0;

export const coreSpan = (token: string): { start: number; end: number } => {
  let start = 0;
  while (start < token.length && !isCore(token[start]!)) start += 1;
  let end = token.length - 1;
  while (end >= start && !isCore(token[end]!)) end -= 1;
  return { start, end };
};

export const computeOrp = (token: string, options: OrpOptions = {}): number => {
  const { start, end } = coreSpan(token);
  if (end < start) return Math.max(0, Math.floor(token.length / 2) - 1);
  const coreLength = end - start + 1;
  const mode = options.mode ?? 'table';
  const offset = mode === 'ratio'
    ? Math.min(coreLength - 1, Math.max(0, Math.round(coreLength * (options.ratio ?? 0.35))))
    : tableOffset(coreLength);
  return Math.min(end, start + offset);
};

/** Horizontal fraction of the focal box at which the anchor character is held. */
export const FOCAL_ANCHOR_FRACTION = 0.36;

export const focalOffsetPx = (containerWidth: number, anchorFraction = FOCAL_ANCHOR_FRACTION): number =>
  Math.round(containerWidth * anchorFraction);

/**
 * For multi-word chunks, the anchor word is the longest word, with ties going
 * to the earlier word. Aligning the longest word keeps the widest part of the
 * chunk inside the box while the remaining words flow around it.
 */
export const selectAnchorIndex = (tokens: readonly string[]): number => {
  let bestIndex = 0;
  let bestLetters = -1;
  tokens.forEach((token, index) => {
    const letters = (token.match(/[0-9A-Za-z\u00c0-\u024f]/g) ?? []).length;
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
): { before: string; anchor: string; after: string } => ({
  before: token.slice(0, orpIndex),
  anchor: token.slice(orpIndex, orpIndex + 1),
  after: token.slice(orpIndex + 1),
});
