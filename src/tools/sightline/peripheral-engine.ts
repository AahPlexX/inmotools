/**
 * Peripheral expansion.
 *
 * A trained reader can take in more than the word under the fixation; the limit
 * is how far into the periphery the eye can resolve letters. Presenting several
 * narrow columns of text at once, spaced so the outer columns fall where
 * peripheral vision is still usable, trains the reader to stop needing a
 * fixation per word.
 *
 * The layout maths lives here: how many columns fit in a viewport, how wide
 * each column may be, how far apart they sit for a given reading distance, and
 * which column the reading position moves to next.
 */

export interface PeripheralConfig {
  /** Columns shown at once, 2–5. */
  readonly columns: number;
  /** Width of each column in characters, which bounds its measure. */
  readonly columnChars: number;
  /** Gap between columns, expressed in column widths. */
  readonly gapRatio: number;
  /** Fraction of the viewport occupied by the whole block, 0.4–1. */
  readonly spread: number;
  /** Words drawn per column before it moves on. */
  readonly wordsPerColumn: number;
  /** Fade the outer edges so the eye is not drawn to the margins. */
  readonly edgeFade: boolean;
}

export const DEFAULT_PERIPHERAL: PeripheralConfig = {
  columns: 3,
  columnChars: 24,
  gapRatio: 0.6,
  spread: 0.9,
  wordsPerColumn: 12,
  edgeFade: true,
};

export interface ColumnLayout {
  readonly index: number;
  /** Centre of the column as a fraction of the viewport width, 0–1. */
  readonly centreFraction: number;
  /** Left edge of the column as a fraction of the viewport width. */
  readonly leftFraction: number;
  /** Column width as a fraction of the viewport width. */
  readonly widthFraction: number;
  /** Pixel drop applied to the column, so adjacent columns do not align. */
  readonly offsetPx: number;
}

/**
 * Column geometry. Columns are laid out symmetrically about the middle of the
 * viewport, so the centre column stays on the eye's resting line and the outer
 * columns move outwards in equal steps as more are added.
 */
export const buildColumnLayout = (
  viewportWidth: number,
  config: PeripheralConfig = DEFAULT_PERIPHERAL,
): ColumnLayout[] => {
  const columns = Math.max(2, Math.min(5, Math.round(config.columns)));
  const spread = Math.min(1, Math.max(0.4, config.spread));
  const usable = Math.max(1, viewportWidth) * spread;
  const gapRatio = Math.max(0, config.gapRatio);
  // total = columns * width + (columns - 1) * width * gapRatio
  const width = usable / (columns + (columns - 1) * gapRatio);
  const step = width * (1 + gapRatio);
  const blockWidth = columns * width + (columns - 1) * gapRatio * width;
  const start = (Math.max(1, viewportWidth) - blockWidth) / 2;

  return Array.from({ length: columns }, (_, index) => {
    const left = start + index * step;
    return {
      index,
      leftFraction: left / Math.max(1, viewportWidth),
      widthFraction: width / Math.max(1, viewportWidth),
      centreFraction: (left + width / 2) / Math.max(1, viewportWidth),
      // Outer columns drop slightly, which keeps the eye from treating the row
      // as one line of text and trying to read across it.
      offsetPx: Math.round(Math.abs(index - (columns - 1) / 2) * (width * 0.06)),
    };
  });
};

/** Font size in pixels that keeps the column measure at the chosen width. */
export const columnFontSize = (columnWidthPx: number, columnChars: number, averageCharRatio = 0.5): number => {
  const chars = Math.max(8, Math.round(columnChars));
  const width = Math.max(40, columnWidthPx);
  return Math.max(11, Math.min(34, Math.round(width / (chars * Math.max(0.3, averageCharRatio)))));
};

export interface PeripheralSlide {
  /** Global index of the reading position this slide starts at. */
  readonly startToken: number;
  /** Tokens shown in this slide, laid out column by column. */
  readonly columns: readonly { readonly columnIndex: number; readonly tokens: readonly number[] }[];
}

/** Distribute the token stream into slides of `columns × wordsPerColumn`. */
export const buildPeripheralSlides = (
  totalTokens: number,
  config: PeripheralConfig = DEFAULT_PERIPHERAL,
  fromToken = 0,
): PeripheralSlide[] => {
  const columns = Math.max(2, Math.min(5, Math.round(config.columns)));
  const perColumn = Math.max(1, Math.round(config.wordsPerColumn));
  const slides: PeripheralSlide[] = [];
  let cursor = Math.max(0, Math.round(fromToken));

  while (cursor < totalTokens) {
    const slideColumns = Array.from({ length: columns }, (_, columnIndex) => {
      const start = cursor + columnIndex * perColumn;
      const end = Math.min(totalTokens, start + perColumn);
      return { columnIndex, tokens: start < end ? range(start, end) : [] };
    });
    slides.push({ startToken: cursor, columns: slideColumns });
    cursor += columns * perColumn;
  }
  return slides;
};

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);

/**
 * How far the eye must travel between columns, in degrees of visual angle.
 * Useful for the setup panel: beyond roughly 10 degrees of eccentricity most
 * readers can no longer identify a word, whatever they are trained to do.
 */
export const columnEccentricityDegrees = (
  centreFractions: readonly number[],
  viewportWidthPx: number,
  viewingDistanceCm = 55,
): number[] => {
  if (centreFractions.length === 0) return [];
  const middle = centreFractions.reduce((total, value) => total + value, 0) / centreFractions.length;
  // 1 CSS pixel is 1/96 inch; convert to centimetres, then to degrees.
  const pixelCm = 2.54 / 96;
  return centreFractions.map((fraction) => {
    const offsetCm = Math.abs(fraction - middle) * viewportWidthPx * pixelCm;
    return Math.round(((Math.atan2(offsetCm, Math.max(10, viewingDistanceCm)) * 180) / Math.PI) * 10) / 10;
  });
};

/** Advice to show with the peripheral panel, based on the geometry. */
export const peripheralAdvice = (
  layout: readonly ColumnLayout[],
  viewportWidthPx: number,
  viewingDistanceCm = 55,
): string => {
  if (layout.length === 0) return 'Choose at least two columns to begin.';
  const degrees = columnEccentricityDegrees(layout.map((column) => column.centreFraction), viewportWidthPx, viewingDistanceCm);
  const worst = degrees.length > 0 ? Math.max(...degrees) : 0;
  if (worst <= 6) return `Outer columns sit ${worst}° from the middle, inside comfortable peripheral range.`;
  if (worst <= 10) return `Outer columns sit ${worst}° from the middle; most readers can still identify words there.`;
  return `Outer columns sit ${worst}° from the middle, which is past the point where most readers can identify a word. Reduce the spread or sit further back.`;
};
