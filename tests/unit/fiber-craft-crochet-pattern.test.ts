import { describe, expect, test } from 'vitest';
import {
  addCrochetRound,
  createStarterCrochetDocument,
  switchCrochetChartMode,
  toggleCrochetGridCell,
  toggleCrochetProgressStep,
  workNextCrochetStitch,
} from '../../src/tools/fiber-craft/crochet-document-engine';
import { describeCrochetChart } from '../../src/tools/fiber-craft/engines/chart-description-engine';
import {
  addCountedBackstitch,
  addCountedFrenchKnot,
  COUNTED_STITCH_KINDS,
  createStarterCountedThreadDocument,
  generateCountedThreadLegend,
  setCountedThreadPaletteIdentity,
  setCountedThreadStitch,
} from '../../src/tools/fiber-craft/engines/counted-thread-engine';
import {
  analyzeAmigurumiGrowth,
  compileC2CRows,
  compileCrochetWrittenPattern,
  compileFiletRows,
  validateCrochetPattern,
} from '../../src/tools/fiber-craft/engines/crochet-pattern-engine';
import { createEmptyGridChart, createEmptyPolarChart } from '../../src/tools/fiber-craft/engines/geometry-engine';
import {
  CYC_YARN_WEIGHT_STANDARDS,
  formatCrochetGaugeRange,
  formatHookRange,
  getYarnWeightStandard,
} from '../../src/tools/fiber-craft/engines/yarn-standard-library';

const FIXED_TIME = '2026-09-15T00:00:00.000Z';

describe('crochet pattern compilers and references', () => {
  test.for([[2, 3], [3, 3], [4, 2]])('C2C diagonals cover every %i x %i grid cell exactly once', ([rows, cols]) => {
    const chart = createEmptyGridChart(rows, cols);
    const compiled = compileC2CRows(chart);
    const coordinates = compiled.flatMap((row) => row.blocks.map((block) => `${block.row}:${block.col}`));
    expect(compiled).toHaveLength(rows + cols - 1);
    expect(coordinates).toHaveLength(rows * cols);
    expect(new Set(coordinates).size).toBe(rows * cols);
    expect(compiled.reduce((sum, row) => sum + row.totalBlocks, 0)).toBe(rows * cols);
  });

  test('filet runs reconstruct every row width without losing open or filled cells', () => {
    let document = switchCrochetChartMode(createStarterCrochetDocument(FIXED_TIME), 'grid', FIXED_TIME);
    document = toggleCrochetGridCell(document, 0, 0, 'primary', FIXED_TIME);
    document = toggleCrochetGridCell(document, 0, 1, 'primary', FIXED_TIME);
    document = toggleCrochetGridCell(document, 0, 3, 'accent', FIXED_TIME);
    if (document.chart.kind !== 'grid') throw new Error('Expected grid chart');
    const compiled = compileFiletRows(document.chart);
    expect(compiled[0].runs).toEqual([
      { kind: 'filled', count: 2 },
      { kind: 'open', count: 1 },
      { kind: 'filled', count: 1 },
      { kind: 'open', count: 8 },
    ]);
    for (const row of compiled) {
      expect(row.runs.reduce((sum, run) => sum + run.count, 0)).toBe(document.chart.cols);
      expect(row.filledMeshes + row.openMeshes).toBe(document.chart.cols);
    }
  });

  test('written round compiler stays synchronized with the visual chart in both dialects', () => {
    let document = createStarterCrochetDocument(FIXED_TIME);
    for (let index = 0; index < 6; index += 1) document = workNextCrochetStitch(document, 0, 'sc-dc', 'primary', FIXED_TIME);
    const us = compileCrochetWrittenPattern(document, 'us')[0];
    const uk = compileCrochetWrittenPattern(document, 'uk')[0];
    expect(us).toMatchObject({ complete: true, worked: 6, capacity: 6, producedStitches: 6 });
    expect(us.text).toBe('Round 1: 6 sc [Primary].');
    expect(uk.text).toBe('Round 1: 6 dc [Primary].');
  });

  test('validator explains incomplete, target, and structural consumption mismatches', () => {
    let document = addCrochetRound(createStarterCrochetDocument(FIXED_TIME), 12, FIXED_TIME);
    for (let index = 0; index < 12; index += 1) document = workNextCrochetStitch(document, 1, 'sc-dc', 'primary', FIXED_TIME);
    const findings = validateCrochetPattern(document, [6, 18]);
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(['incomplete-round', 'target-count-mismatch', 'base-consumption-mismatch']));
  });

  test('amigurumi analysis classifies growth and target drift across an entire shaping curve', () => {
    const chart = createEmptyPolarChart([6, 12, 18, 18, 12]);
    expect(analyzeAmigurumiGrowth(chart).map((round) => round.status)).toEqual(['start', 'increase', 'increase', 'same', 'decrease']);
    expect(analyzeAmigurumiGrowth(chart, [6, 12, 20, 18, 12])[2].status).toBe('target-mismatch');
  });

  test('new rounds use the canonical polar node schema required by rendering and persistence', () => {
    const document = addCrochetRound(createStarterCrochetDocument(FIXED_TIME), 9, FIXED_TIME);
    if (document.chart.kind !== 'polar') throw new Error('Expected polar chart');
    const added = document.chart.nodes.filter((node) => node.round === 1);
    expect(added).toHaveLength(9);
    expect(added.every((node) => node.stitchesInRound === 9)).toBe(true);
  });

  test('CYC yarn table is complete, ordered, unique, and internally valid without one test per category', () => {
    expect(CYC_YARN_WEIGHT_STANDARDS.map((entry) => entry.weight)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(CYC_YARN_WEIGHT_STANDARDS.map((entry) => entry.name)).size).toBe(8);
    for (const standard of CYC_YARN_WEIGHT_STANDARDS) {
      expect(standard.hookMm.min).toBeGreaterThan(0);
      if (standard.hookMm.max !== null) expect(standard.hookMm.max).toBeGreaterThanOrEqual(standard.hookMm.min);
      expect(formatHookRange(standard).length).toBeGreaterThan(0);
      expect(formatCrochetGaugeRange(standard).length).toBeGreaterThan(0);
      expect(getYarnWeightStandard(standard.weight)).toBe(standard);
    }
    expect(getYarnWeightStandard(4)).toMatchObject({ name: 'Medium', usHook: 'I-9 to K-10½' });
  });

  test('accessible round description contains layout, progress, stitch names, colors, and dialect changes', () => {
    let document = createStarterCrochetDocument(FIXED_TIME);
    document = workNextCrochetStitch(document, 0, 'sc-dc', 'primary', FIXED_TIME);
    document = toggleCrochetProgressStep(document, 'round:0', FIXED_TIME);
    const us = describeCrochetChart(document, 'us');
    const uk = describeCrochetChart(document, 'uk');
    expect(us.summary).toContain('1 round');
    expect(us.summary).toContain('1 position worked');
    expect(us.details[0]).toContain('Round 1: 6 positions, 1 worked, 5 unworked. Marked complete.');
    expect(us.legend.join(' ')).toContain('single crochet (sc)');
    expect(us.legend.join(' ')).toContain('Primary');
    expect(uk.legend.join(' ')).toContain('double crochet (dc)');
  });

  test('accessible grid description reports every row structurally without depending on color alone', () => {
    let document = switchCrochetChartMode(createStarterCrochetDocument(FIXED_TIME), 'grid', FIXED_TIME);
    document = toggleCrochetGridCell(document, 0, 0, 'accent', FIXED_TIME);
    document = toggleCrochetProgressStep(document, 'row:0', FIXED_TIME);
    const description = describeCrochetChart(document, 'us');
    expect(description.summary).toContain('12 rows and 12 columns');
    expect(description.summary).toContain('1 cell filled');
    expect(description.details).toHaveLength(12);
    expect(description.details[0]).toContain('1 filled, 11 open. Marked complete.');
    expect(description.details[0]).toContain('Accent');
  });
});

describe('counted-thread precision grid and generated legend', () => {
  test('stores every supported cross, half, quarter, and three-quarter stitch at an addressable cell', () => {
    let document = createStarterCountedThreadDocument(FIXED_TIME);
    expect(COUNTED_STITCH_KINDS).toEqual([
      'full-cross',
      'half-forward',
      'half-back',
      'quarter-nw',
      'quarter-ne',
      'quarter-sw',
      'quarter-se',
      'three-quarter-nw',
      'three-quarter-ne',
      'three-quarter-sw',
      'three-quarter-se',
    ]);

    COUNTED_STITCH_KINDS.forEach((kind, index) => {
      document = setCountedThreadStitch(document, Math.floor(index / 4), index % 4, kind, index % 2 === 0 ? 'primary' : 'accent', FIXED_TIME);
    });

    if (document.chart.kind !== 'counted-thread') throw new Error('Expected counted-thread chart');
    expect(document.metadata.discipline).toBe('cross-stitch');
    expect(document.chart.cells.filter((cell) => cell.stitchKind !== null)).toHaveLength(COUNTED_STITCH_KINDS.length);
    COUNTED_STITCH_KINDS.forEach((kind, index) => {
      expect(document.chart.cells.find((cell) => cell.row === Math.floor(index / 4) && cell.col === index % 4)?.stitchKind).toBe(kind);
    });
  });

  test('keeps French knots and backstitch lines on the same grid and generates one unique legend symbol per used color', () => {
    let document = createStarterCountedThreadDocument(FIXED_TIME);
    document = setCountedThreadStitch(document, 0, 0, 'full-cross', 'primary', FIXED_TIME);
    document = setCountedThreadStitch(document, 0, 1, 'quarter-ne', 'accent', FIXED_TIME);
    document = addCountedFrenchKnot(document, { row: 1.5, col: 1.5 }, 'contrast', FIXED_TIME);
    document = addCountedBackstitch(document, { row: 0.5, col: 0.5 }, { row: 2.5, col: 3.5 }, 'primary', FIXED_TIME);

    if (document.chart.kind !== 'counted-thread') throw new Error('Expected counted-thread chart');
    expect(document.chart.knots).toHaveLength(1);
    expect(document.chart.backstitches).toHaveLength(1);

    document = setCountedThreadPaletteIdentity(document, 'primary', 'Project floss', 'P-01', FIXED_TIME);
    const legend = generateCountedThreadLegend(document);
    expect(legend.map((entry) => entry.colorId)).toEqual(['primary', 'accent', 'contrast']);
    expect(new Set(legend.map((entry) => entry.symbol)).size).toBe(legend.length);
    expect(legend.find((entry) => entry.colorId === 'primary')).toMatchObject({ usageCount: 2, paletteName: 'Project floss', code: 'P-01' });
    expect(legend.find((entry) => entry.colorId === 'accent')?.usageCount).toBe(1);
    expect(legend.find((entry) => entry.colorId === 'contrast')?.usageCount).toBe(1);
  });

  test('rejects invalid counted-grid coordinates and palette references', () => {
    const document = createStarterCountedThreadDocument(FIXED_TIME);
    expect(() => setCountedThreadStitch(document, -1, 0, 'full-cross', 'primary', FIXED_TIME)).toThrow(/outside/i);
    expect(() => setCountedThreadStitch(document, 0, 0, 'full-cross', 'missing', FIXED_TIME)).toThrow(/palette/i);
    expect(() => addCountedFrenchKnot(document, { row: 0.25, col: 0.5 }, 'primary', FIXED_TIME)).toThrow(/half-grid/i);
    expect(() => addCountedBackstitch(document, { row: 0.5, col: 0.5 }, { row: 0.5, col: 0.5 }, 'primary', FIXED_TIME)).toThrow(/different/i);
  });
});
