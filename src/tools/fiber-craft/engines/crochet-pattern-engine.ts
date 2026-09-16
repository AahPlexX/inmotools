import type {
  FiberCraftDocument,
  GridCell,
  GridChart,
  PolarChart,
  PolarStitchNode,
} from '../fiber-craft-types';
import {
  crochetSymbolAbbreviation,
  getCrochetSymbol,
  type CrochetDialect,
} from './symbol-library';

const gridKey = (row: number, col: number) => `${row}:${col}`;
const isFilledGridCell = (cell: GridCell) => cell.colorId !== null || cell.symbolId !== null;

export interface C2CBlock {
  readonly row: number;
  readonly col: number;
  readonly filled: boolean;
  readonly colorId: string | null;
}

export interface C2CCompiledRow {
  readonly index: number;
  readonly blocks: readonly C2CBlock[];
  readonly filledBlocks: number;
  readonly totalBlocks: number;
}

/**
 * Compiles a rectangular pixel/grid design into diagonal C2C rows. Odd diagonals reverse direction
 * so the returned block order follows the normal back-and-forth working path instead of repeatedly
 * jumping to the same side of the chart.
 */
export const compileC2CRows = (chart: GridChart): readonly C2CCompiledRow[] => {
  const cells = new Map(chart.cells.map((cell) => [gridKey(cell.row, cell.col), cell]));
  const rows: C2CCompiledRow[] = [];
  for (let diagonal = 0; diagonal < chart.rows + chart.cols - 1; diagonal += 1) {
    const diagonalCells: GridCell[] = [];
    for (let row = 0; row < chart.rows; row += 1) {
      const col = diagonal - row;
      if (col < 0 || col >= chart.cols) continue;
      const cell = cells.get(gridKey(row, col));
      if (cell) diagonalCells.push(cell);
    }
    if (diagonal % 2 === 1) diagonalCells.reverse();
    const blocks = diagonalCells.map((cell) => ({
      row: cell.row,
      col: cell.col,
      filled: isFilledGridCell(cell),
      colorId: cell.colorId,
    }));
    rows.push({
      index: diagonal,
      blocks,
      filledBlocks: blocks.filter((block) => block.filled).length,
      totalBlocks: blocks.length,
    });
  }
  return rows;
};

export type FiletMeshKind = 'filled' | 'open';

export interface FiletMeshRun {
  readonly kind: FiletMeshKind;
  readonly count: number;
}

export interface FiletCompiledRow {
  readonly row: number;
  readonly runs: readonly FiletMeshRun[];
  readonly filledMeshes: number;
  readonly openMeshes: number;
  readonly text: string;
}

const meshRunText = (run: FiletMeshRun) => `${run.count} ${run.kind} ${run.count === 1 ? 'mesh' : 'meshes'}`;

/** Compiles each grid row into lossless filled/open filet-mesh runs plus ready-to-read text. */
export const compileFiletRows = (chart: GridChart): readonly FiletCompiledRow[] => {
  const cells = new Map(chart.cells.map((cell) => [gridKey(cell.row, cell.col), cell]));
  return Array.from({ length: chart.rows }, (_, row) => {
    const runs: FiletMeshRun[] = [];
    let filledMeshes = 0;
    for (let col = 0; col < chart.cols; col += 1) {
      const cell = cells.get(gridKey(row, col));
      const kind: FiletMeshKind = cell && isFilledGridCell(cell) ? 'filled' : 'open';
      if (kind === 'filled') filledMeshes += 1;
      const previous = runs.at(-1);
      if (previous?.kind === kind) runs[runs.length - 1] = { kind, count: previous.count + 1 };
      else runs.push({ kind, count: 1 });
    }
    const openMeshes = chart.cols - filledMeshes;
    return {
      row,
      runs,
      filledMeshes,
      openMeshes,
      text: `Row ${row + 1}: ${runs.map(meshRunText).join(', ')}.`,
    };
  });
};

export interface CrochetWrittenRound {
  readonly round: number;
  readonly complete: boolean;
  readonly worked: number;
  readonly capacity: number;
  readonly consumedStitches: number;
  readonly producedStitches: number;
  readonly text: string;
}

interface StitchRun {
  readonly symbolId: string | null;
  readonly colorId: string | null;
  readonly count: number;
}

const sortedRoundNodes = (chart: PolarChart, round: number): readonly PolarStitchNode[] =>
  chart.nodes.filter((node) => node.round === round).toSorted((a, b) => a.angleIndex - b.angleIndex);

const compressRoundNodes = (nodes: readonly PolarStitchNode[]): readonly StitchRun[] => {
  const runs: StitchRun[] = [];
  for (const node of nodes) {
    const previous = runs.at(-1);
    if (previous && previous.symbolId === node.symbolId && previous.colorId === node.colorId) {
      runs[runs.length - 1] = { ...previous, count: previous.count + 1 };
    } else {
      runs.push({ symbolId: node.symbolId, colorId: node.colorId, count: 1 });
    }
  }
  return runs;
};

const requirePolarCrochetDocument = (document: FiberCraftDocument): PolarChart => {
  if (document.metadata.discipline !== 'crochet' || document.chart.kind !== 'polar') {
    throw new Error('Written crochet rounds require a crochet round chart.');
  }
  return document.chart;
};

export const compileCrochetWrittenPattern = (
  document: FiberCraftDocument,
  dialect: CrochetDialect,
): readonly CrochetWrittenRound[] => {
  const chart = requirePolarCrochetDocument(document);
  const paletteNames = new Map(document.palette.map((color) => [color.id, color.label]));
  return Array.from({ length: chart.rounds }, (_, round) => {
    const nodes = sortedRoundNodes(chart, round);
    const runs = compressRoundNodes(nodes);
    let worked = 0;
    let consumedStitches = 0;
    let producedStitches = 0;
    const instructions = runs.map((run) => {
      if (run.symbolId === null) return `${run.count} unworked`;
      const definition = getCrochetSymbol(run.symbolId);
      worked += run.count;
      consumedStitches += definition.stitchesConsumed * run.count;
      producedStitches += definition.stitchesProduced * run.count;
      const abbreviation = crochetSymbolAbbreviation(run.symbolId, dialect);
      const color = run.colorId ? paletteNames.get(run.colorId) : undefined;
      return `${run.count} ${abbreviation}${color ? ` [${color}]` : ''}`;
    });
    return {
      round,
      complete: worked === nodes.length,
      worked,
      capacity: nodes.length,
      consumedStitches,
      producedStitches,
      text: `Round ${round + 1}: ${instructions.join(', ')}.`,
    };
  });
};

export type CrochetValidationCode =
  | 'invalid-round-geometry'
  | 'incomplete-round'
  | 'target-count-mismatch'
  | 'base-consumption-mismatch';

export interface CrochetValidationFinding {
  readonly round: number;
  readonly code: CrochetValidationCode;
  readonly message: string;
  readonly expected?: number;
  readonly actual?: number;
}

export const validateCrochetPattern = (
  document: FiberCraftDocument,
  expectedRoundCounts: readonly number[] = [],
): readonly CrochetValidationFinding[] => {
  const chart = requirePolarCrochetDocument(document);
  const findings: CrochetValidationFinding[] = [];

  for (let round = 0; round < chart.rounds; round += 1) {
    const nodes = sortedRoundNodes(chart, round);
    const capacity = nodes.length;
    const validGeometry = capacity > 0
      && nodes.every((node, index) => node.angleIndex === index && node.stitchesInRound === capacity);
    if (!validGeometry) {
      findings.push({
        round,
        code: 'invalid-round-geometry',
        message: `Round ${round + 1} has inconsistent stitch positions or declared round counts.`,
      });
    }

    const workedNodes = nodes.filter((node) => node.symbolId !== null);
    if (workedNodes.length !== capacity) {
      findings.push({
        round,
        code: 'incomplete-round',
        message: `Round ${round + 1} has ${capacity - workedNodes.length} unworked stitch position${capacity - workedNodes.length === 1 ? '' : 's'}.`,
        expected: capacity,
        actual: workedNodes.length,
      });
    }

    const target = expectedRoundCounts[round];
    if (target !== undefined && target !== capacity) {
      findings.push({
        round,
        code: 'target-count-mismatch',
        message: `Round ${round + 1} has ${capacity} stitch positions; the target is ${target}.`,
        expected: target,
        actual: capacity,
      });
    }

    if (round > 0 && workedNodes.length === capacity && workedNodes.every((node) => {
      if (node.symbolId === null) return false;
      return getCrochetSymbol(node.symbolId).stitchesConsumed > 0;
    })) {
      const consumed = workedNodes.reduce((sum, node) => {
        if (node.symbolId === null) return sum;
        return sum + getCrochetSymbol(node.symbolId).stitchesConsumed;
      }, 0);
      const previousCapacity = sortedRoundNodes(chart, round - 1).length;
      if (consumed !== previousCapacity) {
        findings.push({
          round,
          code: 'base-consumption-mismatch',
          message: `Round ${round + 1} consumes ${consumed} base stitches but round ${round} provides ${previousCapacity}.`,
          expected: previousCapacity,
          actual: consumed,
        });
      }
    }
  }

  return findings;
};

export type AmigurumiGrowthStatus = 'start' | 'increase' | 'decrease' | 'same' | 'target-mismatch';

export interface AmigurumiRoundGrowth {
  readonly round: number;
  readonly stitches: number;
  readonly delta: number;
  readonly target?: number;
  readonly targetDelta?: number;
  readonly status: AmigurumiGrowthStatus;
}

export const analyzeAmigurumiGrowth = (
  chart: PolarChart,
  targetCounts: readonly number[] = [],
): readonly AmigurumiRoundGrowth[] => Array.from({ length: chart.rounds }, (_, round) => {
  const stitches = sortedRoundNodes(chart, round).length;
  const previous = round === 0 ? stitches : sortedRoundNodes(chart, round - 1).length;
  const delta = round === 0 ? 0 : stitches - previous;
  const target = targetCounts[round];
  const previousTarget = round > 0 ? targetCounts[round - 1] : undefined;
  const targetDelta = target !== undefined && previousTarget !== undefined ? target - previousTarget : undefined;
  const status: AmigurumiGrowthStatus = target !== undefined && target !== stitches
    ? 'target-mismatch'
    : round === 0
      ? 'start'
      : delta > 0
        ? 'increase'
        : delta < 0
          ? 'decrease'
          : 'same';
  return { round, stitches, delta, target, targetDelta, status };
});
