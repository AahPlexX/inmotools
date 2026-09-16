import { describe, expect, it } from 'vitest';
import {
  convertLength,
  createEmptyGridChart,
  createEmptyPolarChart,
  findStitchGrowthMismatches,
  gaugeAspectRatio,
  gaugeDensity,
  gridCountsForPhysicalSize,
  gridPhysicalDimensions,
  lengthToRows,
  lengthToStitches,
  mirrorGridHorizontal,
  mirrorGridVertical,
  polarNodeToCartesian,
  polarRoundPhysicalDimensions,
  resizeGridChart,
  rotateGrid90,
  roundStitchesForDiameter,
  rowDensity,
  rowsToLength,
  setGridCell,
  setPolarNode,
  stitchCountsByRound,
  stitchCountsByRow,
  stitchesToLength,
} from '../../src/tools/fiber-craft/engines/geometry-engine';
import {
  crochetSymbolAbbreviation,
  crochetSymbolLabel,
  createCableCrossSymbol,
  CROCHET_SYMBOLS,
  getCrochetSymbol,
  getKnittingSymbol,
} from '../../src/tools/fiber-craft/engines/symbol-library';
import type { GaugeSwatch } from '../../src/tools/fiber-craft/fiber-craft-types';

describe('grid geometry engine', () => {
  it('creates an empty grid with every cell unset', () => {
    const chart = createEmptyGridChart(3, 4);
    expect(chart.rows).toBe(3);
    expect(chart.cols).toBe(4);
    expect(chart.cells).toHaveLength(12);
    expect(chart.cells.every((cell) => cell.colorId === null && cell.symbolId === null)).toBe(true);
  });
  it('rejects non-positive dimensions and aspect ratios', () => {
    expect(() => createEmptyGridChart(0, 4)).toThrow();
    expect(() => createEmptyGridChart(4, 0)).toThrow();
    expect(() => createEmptyGridChart(4, 4, 0)).toThrow();
  });
  it('sets exactly one cell without mutating the others', () => {
    const chart = createEmptyGridChart(2, 2);
    const updated = setGridCell(chart, 0, 1, 'red', 'sc-dc');
    expect(updated.cells.find((cell) => cell.row === 0 && cell.col === 1)).toMatchObject({ colorId: 'red', symbolId: 'sc-dc' });
    expect(updated.cells.filter((cell) => cell.colorId !== null)).toHaveLength(1);
  });
  it('rejects a cell outside the grid bounds', () => expect(() => setGridCell(createEmptyGridChart(2, 2), 5, 0, 'red', 'sc-dc')).toThrow());
  it('mirrors horizontally and vertically without changing cell count', () => {
    const chart = setGridCell(createEmptyGridChart(2, 3), 0, 0, 'a', 'chain');
    expect(mirrorGridHorizontal(chart).cells.find((cell) => cell.row === 0 && cell.col === 2)?.colorId).toBe('a');
    expect(mirrorGridVertical(chart).cells.find((cell) => cell.row === 1 && cell.col === 0)?.colorId).toBe('a');
  });
  it('rotates a rectangular grid 90 degrees clockwise and swaps dimensions', () => {
    const rotated = rotateGrid90(setGridCell(createEmptyGridChart(2, 3), 0, 0, 'a', 'chain'));
    expect(rotated.rows).toBe(3);
    expect(rotated.cols).toBe(2);
    expect(rotated.cells.find((cell) => cell.colorId === 'a')).toMatchObject({ row: 0, col: 1 });
  });
  it('resizing preserves existing in-bounds cells and fills new cells empty', () => {
    const resized = resizeGridChart(setGridCell(createEmptyGridChart(2, 2), 1, 1, 'a', 'chain'), 3, 3);
    expect(resized.cells).toHaveLength(9);
    expect(resized.cells.find((cell) => cell.row === 1 && cell.col === 1)?.colorId).toBe('a');
    expect(resized.cells.find((cell) => cell.row === 2 && cell.col === 2)?.colorId).toBeNull();
  });
  it('flags rows whose stitch count does not match the expected count', () => {
    let chart = createEmptyGridChart(2, 3);
    chart = setGridCell(chart, 0, 0, 'a', 'sc-dc');
    chart = setGridCell(chart, 0, 1, 'a', 'sc-dc');
    chart = setGridCell(chart, 1, 0, 'a', 'sc-dc');
    expect(stitchCountsByRow(chart)).toEqual([2, 1]);
    expect(findStitchGrowthMismatches(chart, () => 3)).toEqual([
      { row: 0, expected: 3, actual: 2, delta: -1 },
      { row: 1, expected: 3, actual: 1, delta: -2 },
    ]);
  });
});

describe('polar geometry engine', () => {
  it('creates a polar chart with the requested stitch count per round', () => {
    const chart = createEmptyPolarChart([6, 12]);
    expect(chart.rounds).toBe(2);
    expect(chart.nodes.filter((node) => node.round === 0)).toHaveLength(6);
    expect(chart.nodes.filter((node) => node.round === 1)).toHaveLength(12);
  });
  it('rejects a round with zero stitches', () => expect(() => createEmptyPolarChart([6, 0])).toThrow());
  it('sets a single node and throws for an out-of-range node', () => {
    const chart = createEmptyPolarChart([6]);
    const updated = setPolarNode(chart, 0, 2, 'red', 'sc-dc');
    expect(updated.nodes.find((node) => node.angleIndex === 2)?.colorId).toBe('red');
    expect(() => setPolarNode(chart, 0, 99, 'red', 'sc-dc')).toThrow();
  });
  it('converts a polar node to a cartesian position centered at the origin', () => {
    const point = polarNodeToCartesian(createEmptyPolarChart([4]).nodes[0], 10);
    expect(point.x).toBeCloseTo(10, 5);
    expect(point.y).toBeCloseTo(0, 5);
  });
  it('counts worked stitches per round', () => {
    let chart = createEmptyPolarChart([4, 4]);
    chart = setPolarNode(chart, 0, 0, 'a', 'sc-dc');
    chart = setPolarNode(chart, 1, 0, 'a', 'sc-dc');
    chart = setPolarNode(chart, 1, 1, 'a', 'sc-dc');
    expect(stitchCountsByRound(chart)).toEqual([1, 2]);
  });
});

describe('gauge and physical-dimension math', () => {
  const gauge: GaugeSwatch = { stitchCount: 20, rowCount: 28, span: 4, unit: 'in' };

  it('converts between inches and centimeters', () => {
    expect(convertLength(1, 'in', 'cm')).toBeCloseTo(2.54, 5);
    expect(convertLength(2.54, 'cm', 'in')).toBeCloseTo(1, 5);
    expect(convertLength(5, 'in', 'in')).toBe(5);
  });
  it('computes stitch and row density per unit length', () => {
    expect(gaugeDensity(gauge, 'in')).toBeCloseTo(5, 5);
    expect(rowDensity(gauge, 'in')).toBeCloseTo(7, 5);
  });
  it('round-trips stitch count and physical length', () => {
    const length = stitchesToLength(40, gauge, 'in');
    expect(length).toBeCloseTo(8, 5);
    expect(lengthToStitches(length, gauge, 'in')).toBeCloseTo(40, 5);
  });
  it('round-trips row count and physical length', () => {
    const length = rowsToLength(42, gauge, 'in');
    expect(length).toBeCloseTo(6, 5);
    expect(lengthToRows(length, gauge, 'in')).toBeCloseTo(42, 5);
  });
  it('bidirectionally maps grid and round chart counts to finished dimensions', () => {
    const grid = createEmptyGridChart(14, 20);
    const size = gridPhysicalDimensions(grid, gauge, 'in');
    expect(size.width).toBeCloseTo(4, 5);
    expect(size.height).toBeCloseTo(2, 5);
    expect(gridCountsForPhysicalSize(size.width, size.height, gauge, 'in')).toEqual({ cols: 20, rows: 14 });

    const round = createEmptyPolarChart([20]);
    const roundSize = polarRoundPhysicalDimensions(round, 0, gauge, 'in');
    expect(roundSize.circumference).toBeCloseTo(4, 5);
    expect(roundStitchesForDiameter(roundSize.diameter, gauge, 'in')).toBe(20);
  });
  it('derives a non-square grid aspect ratio from row/stitch gauge', () => expect(gaugeAspectRatio(gauge)).toBeCloseTo(28 / 20, 5));
  it('rejects invalid gauge components', () => {
    expect(() => gaugeAspectRatio({ stitchCount: 0, rowCount: 10, span: 4, unit: 'in' })).toThrow();
    expect(() => rowDensity({ stitchCount: 10, rowCount: 0, span: 4, unit: 'in' }, 'in')).toThrow();
  });
});

describe('crochet symbol library (Craft Yarn Council terminology)', () => {
  it('maps every US single/double-crochet-family stitch to its correct UK term', () => {
    expect(crochetSymbolLabel('sc-dc', 'us')).toBe('single crochet (sc)');
    expect(crochetSymbolLabel('sc-dc', 'uk')).toBe('double crochet (dc)');
    expect(crochetSymbolLabel('dc-tr', 'us')).toBe('double crochet (dc)');
    expect(crochetSymbolLabel('dc-tr', 'uk')).toBe('treble (tr)');
    expect(crochetSymbolLabel('tr-dtr', 'us')).toBe('treble crochet (tr)');
    expect(crochetSymbolLabel('tr-dtr', 'uk')).toBe('double treble (dtr)');
  });
  it('returns the correct dialect-specific abbreviation', () => {
    expect(crochetSymbolAbbreviation('hdc-htr', 'us')).toBe('hdc');
    expect(crochetSymbolAbbreviation('hdc-htr', 'uk')).toBe('htr');
  });
  it('throws for an unknown symbol id', () => expect(() => getCrochetSymbol('not-a-real-symbol')).toThrow());
  it('keeps the symbol library free of duplicate ids', () => {
    const ids = CROCHET_SYMBOLS.map((symbol) => symbol.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('knitting symbol library', () => {
  it('exposes standard knit/purl/decrease symbols', () => {
    expect(getKnittingSymbol('knit').abbreviation).toBe('k');
    expect(getKnittingSymbol('k2tog').stitchesConsumed).toBe(2);
    expect(getKnittingSymbol('k2tog').stitchesProduced).toBe(1);
  });
  it('builds a cable-cross symbol with a matching stitch count on both sides', () => {
    const cable = createCableCrossSymbol(3, 'left');
    expect(cable.abbreviation).toBe('C6L');
    expect(cable.stitchesConsumed).toBe(6);
    expect(cable.stitchesProduced).toBe(6);
  });
  it('rejects a cable narrower than one stitch per side', () => expect(() => createCableCrossSymbol(0, 'right')).toThrow());
});
