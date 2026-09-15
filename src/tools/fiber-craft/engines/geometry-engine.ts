// Pure, framework-independent grid and polar geometry for the Fiber Craft Workstation.
// No member of this module imports React, touches the DOM, or performs I/O; every function is a
// deterministic transform over the canonical types in `fiber-craft-types.ts`, following this
// catalog's existing engine-first, UI-later discipline.

import type {
  GaugeSwatch,
  GridCell,
  GridChart,
  LengthUnit,
  PolarChart,
  PolarStitchNode,
} from '../fiber-craft-types';

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function createEmptyGridChart(rows: number, cols: number, aspectRatio = 1): GridChart {
  if (rows <= 0 || cols <= 0) throw new Error('Grid dimensions must be positive.');
  if (aspectRatio <= 0) throw new Error('Aspect ratio must be positive.');
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({ row, col, colorId: null, symbolId: null });
    }
  }
  return { kind: 'grid', rows, cols, aspectRatio, cells };
}

function indexGridCells(chart: GridChart): Map<string, GridCell> {
  const map = new Map<string, GridCell>();
  for (const cell of chart.cells) map.set(cellKey(cell.row, cell.col), cell);
  return map;
}

export function setGridCell(
  chart: GridChart,
  row: number,
  col: number,
  colorId: string | null,
  symbolId: string | null,
): GridChart {
  if (row < 0 || row >= chart.rows || col < 0 || col >= chart.cols) {
    throw new Error(`Cell (${row}, ${col}) is outside the ${chart.rows}x${chart.cols} grid.`);
  }
  const cells = chart.cells.map((cell) =>
    cell.row === row && cell.col === col ? { ...cell, colorId, symbolId } : cell,
  );
  return { ...chart, cells };
}

export function mirrorGridHorizontal(chart: GridChart): GridChart {
  const cells = chart.cells.map((cell) => ({ ...cell, col: chart.cols - 1 - cell.col }));
  return { ...chart, cells };
}

export function mirrorGridVertical(chart: GridChart): GridChart {
  const cells = chart.cells.map((cell) => ({ ...cell, row: chart.rows - 1 - cell.row }));
  return { ...chart, cells };
}

export function rotateGrid90(chart: GridChart): GridChart {
  // (row, col) in an R x C grid rotates clockwise into (col, R - 1 - row) in a C x R grid.
  const cells = chart.cells.map((cell) => ({
    ...cell,
    row: cell.col,
    col: chart.rows - 1 - cell.row,
  }));
  return { ...chart, rows: chart.cols, cols: chart.rows, cells };
}

export function resizeGridChart(chart: GridChart, rows: number, cols: number): GridChart {
  if (rows <= 0 || cols <= 0) throw new Error('Grid dimensions must be positive.');
  const existing = indexGridCells(chart);
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const found = existing.get(cellKey(row, col));
      cells.push(found ? { ...found } : { row, col, colorId: null, symbolId: null });
    }
  }
  return { ...chart, rows, cols, cells };
}

/** Counts, per row, how many cells hold a non-null symbol (a stitch), for growth validation. */
export function stitchCountsByRow(chart: GridChart): readonly number[] {
  const counts = new Array<number>(chart.rows).fill(0);
  for (const cell of chart.cells) {
    if (cell.symbolId !== null) counts[cell.row] += 1;
  }
  return counts;
}

export interface StitchGrowthFinding {
  readonly row: number;
  readonly expected: number;
  readonly actual: number;
  readonly delta: number;
}

/**
 * Compares each row's actual stitch count against an expected-count function, surfacing every
 * mismatch. `expectedForRow` is supplied by the caller (flat rows expect a constant count;
 * shaped amigurumi rounds expect a caller-provided target curve).
 */
export function findStitchGrowthMismatches(
  chart: GridChart,
  expectedForRow: (row: number) => number,
): readonly StitchGrowthFinding[] {
  const actualCounts = stitchCountsByRow(chart);
  const findings: StitchGrowthFinding[] = [];
  for (let row = 0; row < chart.rows; row += 1) {
    const expected = expectedForRow(row);
    const actual = actualCounts[row];
    if (actual !== expected) findings.push({ row, expected, actual, delta: actual - expected });
  }
  return findings;
}

// --- Polar (round) geometry: mandalas, doilies, amigurumi bases ---

export function createEmptyPolarChart(stitchesPerRound: readonly number[]): PolarChart {
  if (stitchesPerRound.length === 0) throw new Error('At least one round is required.');
  const nodes: PolarStitchNode[] = [];
  stitchesPerRound.forEach((stitchesInRound, round) => {
    if (stitchesInRound <= 0) throw new Error(`Round ${round} must have at least one stitch.`);
    for (let angleIndex = 0; angleIndex < stitchesInRound; angleIndex += 1) {
      nodes.push({ round, angleIndex, stitchesInRound, symbolId: null, colorId: null });
    }
  });
  return { kind: 'polar', rounds: stitchesPerRound.length, nodes };
}

export function setPolarNode(
  chart: PolarChart,
  round: number,
  angleIndex: number,
  colorId: string | null,
  symbolId: string | null,
): PolarChart {
  let found = false;
  const nodes = chart.nodes.map((node) => {
    if (node.round !== round || node.angleIndex !== angleIndex) return node;
    found = true;
    return { ...node, colorId, symbolId };
  });
  if (!found) throw new Error(`No node at round ${round}, angle index ${angleIndex}.`);
  return { ...chart, nodes };
}

/**
 * Cartesian (x, y) position, centered at the origin, for a polar node — used only for on-screen
 * placement; the underlying data model stays purely round/angle-indexed.
 */
export function polarNodeToCartesian(
  node: PolarStitchNode,
  ringSpacing: number,
): { readonly x: number; readonly y: number } {
  const radius = (node.round + 1) * ringSpacing;
  const angle = (2 * Math.PI * node.angleIndex) / node.stitchesInRound;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export function stitchCountsByRound(chart: PolarChart): readonly number[] {
  const counts = new Array<number>(chart.rounds).fill(0);
  for (const node of chart.nodes) {
    if (node.symbolId !== null) counts[node.round] += 1;
  }
  return counts;
}

// --- Gauge and physical-dimension math (shared by every discipline) ---

const CM_PER_INCH = 2.54;

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return from === 'in' ? value * CM_PER_INCH : value / CM_PER_INCH;
}

/** Stitches (or rows) per unit length, from a measured gauge swatch. */
export function gaugeDensity(gauge: GaugeSwatch, unit: LengthUnit): number {
  if (gauge.span <= 0) throw new Error('Gauge span must be positive.');
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return gauge.stitchCount / spanInUnit;
}

export function stitchesToLength(stitchCount: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (stitchCount / gauge.stitchCount) * spanInUnit;
}

export function lengthToStitches(length: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (length / spanInUnit) * gauge.stitchCount;
}

/** Row-to-stitch aspect ratio implied by a gauge swatch, for FC-43's non-square knitting grid. */
export function gaugeAspectRatio(gauge: GaugeSwatch): number {
  if (gauge.stitchCount <= 0) throw new Error('Gauge stitch count must be positive.');
  return gauge.rowCount / gauge.stitchCount;
}
