import type { ComponentParams, ComponentType, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the RGB LED pixel matrix: an 8 by 8 or
 * 16 by 16 grid of pixels driven the way real matrix modules are, by row and
 * column lines plus three color lines.
 *
 * Pins: one input per row (`ROW0`..) on the left with the three color inputs
 * (`R`, `G`, `B`) below them, and one input per column (`COL0`..) on the right.
 * A row line selects a row, and each column line that is asserted lights the
 * pixel where it crosses the selected row, in the color the `R`, `G` and `B`
 * lines show at that moment.
 *
 * The matrix models persistence of vision, as the multiplexed digit display
 * does: a pixel takes the state driven while its row is selected and keeps it
 * until its row is selected again. That is what makes a scanned matrix read as
 * one steady picture, so a scanning demo (select each row in turn, present its
 * columns) works and a single row held on shows only that row's pixels.
 *
 * A matrix only ever shows a definite state: a floating or unknown column or
 * color line leaves the pixel unlit, because lighting it would suggest a value
 * the circuit does not have.
 */

export const MATRIX_SIZES = [8, 16] as const;
export type MatrixSize = (typeof MATRIX_SIZES)[number];
export const DEFAULT_MATRIX_SIZE: MatrixSize = 8;

export const isMatrixType = (type: ComponentType): boolean => type === 'RGB_MATRIX';

/** Snaps an untrusted size to 8 or 16; anything from 12 up is 16. */
export const clampMatrixSize = (value: unknown): MatrixSize => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MATRIX_SIZE;
  return value >= 12 ? 16 : 8;
};

export const matrixSizeOf = (params: ComponentParams): MatrixSize => clampMatrixSize(params.matrixSize);

/** Body width in grid units: pin-name room on both sides plus a square pixel area. */
export const matrixWidthCols = (size: number): number => (size === 16 ? 14 : 10);

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

export const matrixPorts = (params: ComponentParams): readonly PortDefinition[] => {
  const size = matrixSizeOf(params);
  const width = matrixWidthCols(size);
  const input = (id: string, x: number, y: number): PortDefinition => ({ id, direction: 'input', label: id, x, y });
  return [
    ...range(size).map((index) => input(`ROW${index}`, 0, index)),
    input('R', 0, size),
    input('G', 0, size + 1),
    input('B', 0, size + 2),
    ...range(size).map((index) => input(`COL${index}`, width, index)),
  ];
};

export const matrixTitle = (params: ComponentParams): string => {
  const size = matrixSizeOf(params);
  return `RGB ${size}x${size}`;
};

export const matrixSizeLabel = (size: number): string => `${size} x ${size} pixels`;

// --- SECTION: pixel state ---

/** A pixel's color as a bit mask: 1 is red, 2 is green, 4 is blue, 0 is unlit. */
export type PixelColor = number;

export const COLOR_NAMES: readonly string[] = ['off', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Display colors by mask; index 0 is unused (an unlit pixel is drawn as a faint outline). */
export const COLOR_HEX: readonly string[] = ['#000000', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#d946ef', '#06b6d4', '#ffffff'];

export const colorNameOf = (color: PixelColor): string => COLOR_NAMES[color] ?? 'off';

const isAsserted = (level: LogicLevel, activeHigh: boolean): boolean => (activeHigh ? level === 1 : level === 0);

/** Rebuilds saved pixels, tolerating a missing record or one from before a size change. */
export const restoreMatrixPixels = (saved: readonly LogicLevel[] | readonly number[] | undefined, size: number): PixelColor[] =>
  Array.from({ length: size * size }, (_, index) => {
    const value = saved?.[index];
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0;
  });

export interface UpdateMatrixInput {
  readonly params: ComponentParams;
  /** The pixels from the previous tick (row-major), used to hold a pixel while its row is not selected. */
  readonly previous: readonly number[] | undefined;
  /** The resolved level on one of the matrix's input pins. */
  readonly read: (portId: string) => LogicLevel;
}

/**
 * Returns every pixel's color, row-major: `row * size + column`. Rows and
 * columns share one polarity (`activeHigh`); the color lines are always
 * active high, so a high `R` adds red.
 */
export const updateMatrixPixels = ({ params, previous, read }: UpdateMatrixInput): PixelColor[] => {
  const size = matrixSizeOf(params);
  const activeHigh = params.activeHigh !== false;
  const held = restoreMatrixPixels(previous, size);
  const color = (read('R') === 1 ? 1 : 0) | (read('G') === 1 ? 2 : 0) | (read('B') === 1 ? 4 : 0);
  const pixels: PixelColor[] = [];
  for (let row = 0; row < size; row += 1) {
    const selected = isAsserted(read(`ROW${row}`), activeHigh);
    for (let column = 0; column < size; column += 1) {
      pixels.push(selected ? (isAsserted(read(`COL${column}`), activeHigh) ? color : 0) : held[row * size + column]!);
    }
  }
  return pixels;
};

// --- SECTION: geometry shared by the canvas and the SVG export ---

export interface PixelRect {
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** Room kept clear on each side for pin names such as `ROW10` and `COL15`. */
const SIDE_MARGIN = 40;
const VERTICAL_MARGIN = 8;

/**
 * Lays the pixels out inside a body rectangle (local pixels): a square grid,
 * centered, clear of the pin-name columns. Both renderers call this so a
 * matrix is drawn from the same rectangles on screen and in an export.
 */
export const pixelRects = (size: number, body: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): PixelRect[] => {
  const cell = Math.max(1, Math.min((body.width - SIDE_MARGIN * 2) / size, (body.height - VERTICAL_MARGIN * 2) / size));
  const originX = body.x + (body.width - cell * size) / 2;
  const originY = body.y + (body.height - cell * size) / 2;
  const rects: PixelRect[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      rects.push({ row, column, x: originX + column * cell, y: originY + row * cell, size: cell });
    }
  }
  return rects;
};
