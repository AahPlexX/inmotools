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

const CM_PER_INCH = 2.54;

const requireGauge = (gauge: GaugeSwatch): void => {
  if (!Number.isFinite(gauge.stitchCount) || gauge.stitchCount <= 0) throw new Error('Gauge stitch count must be positive.');
  if (!Number.isFinite(gauge.rowCount) || gauge.rowCount <= 0) throw new Error('Gauge row count must be positive.');
  if (!Number.isFinite(gauge.span) || gauge.span <= 0) throw new Error('Gauge span must be positive.');
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return from === 'in' ? value * CM_PER_INCH : value / CM_PER_INCH;
}

export function gaugeDensity(gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return gauge.stitchCount / spanInUnit;
}

export function rowDensity(gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return gauge.rowCount / spanInUnit;
}

export function stitchesToLength(stitchCount: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (stitchCount / gauge.stitchCount) * spanInUnit;
}

export function lengthToStitches(length: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (length / spanInUnit) * gauge.stitchCount;
}

export function rowsToLength(rowCount: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (rowCount / gauge.rowCount) * spanInUnit;
}

export function lengthToRows(length: number, gauge: GaugeSwatch, unit: LengthUnit): number {
  requireGauge(gauge);
  const spanInUnit = convertLength(gauge.span, gauge.unit, unit);
  return (length / spanInUnit) * gauge.rowCount;
}

export interface GridPhysicalDimensions {
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
}

export function gridPhysicalDimensions(
  chart: Pick<GridChart, 'rows' | 'cols'>,
  gauge: GaugeSwatch,
  unit: LengthUnit,
): GridPhysicalDimensions {
  return {
    width: stitchesToLength(chart.cols, gauge, unit),
    height: rowsToLength(chart.rows, gauge, unit),
    unit,
  };
}

export function gridCountsForPhysicalSize(
  width: number,
  height: number,
  gauge: GaugeSwatch,
  unit: LengthUnit,
): { readonly cols: number; readonly rows: number } {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Finished width and height must be positive.');
  }
  return {
    cols: Math.max(1, Math.round(lengthToStitches(width, gauge, unit))),
    rows: Math.max(1, Math.round(lengthToRows(height, gauge, unit))),
  };
}

export function polarRoundPhysicalDimensions(
  chart: PolarChart,
  round: number,
  gauge: GaugeSwatch,
  unit: LengthUnit,
): { readonly stitches: number; readonly circumference: number; readonly diameter: number; readonly unit: LengthUnit } {
  if (!Number.isInteger(round) || round < 0 || round >= chart.rounds) throw new Error('Round is outside this chart.');
  const stitches = chart.nodes.filter((node) => node.round === round).length;
  if (stitches <= 0) throw new Error('Round has no stitch positions.');
  const circumference = stitchesToLength(stitches, gauge, unit);
  return { stitches, circumference, diameter: circumference / Math.PI, unit };
}

export function roundStitchesForDiameter(
  diameter: number,
  gauge: GaugeSwatch,
  unit: LengthUnit,
): number {
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Finished diameter must be positive.');
  return Math.max(1, Math.round(lengthToStitches(diameter * Math.PI, gauge, unit)));
}

export function gaugeAspectRatio(gauge: GaugeSwatch): number {
  requireGauge(gauge);
  return gauge.rowCount / gauge.stitchCount;
}
