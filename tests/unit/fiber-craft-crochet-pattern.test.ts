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
