import { describe, expect, test } from 'vitest';
import {
  MAX_CROCHET_GRID_SIZE,
  clearCrochetGrid,
  createStarterCrochetDocument,
  fillCrochetRound,
  resizeCrochetGrid,
  setCrochetPatternCredit,
  switchCrochetChartMode,
  toggleCrochetGridCell,
  toggleCrochetProgressStep,
  transformCrochetGrid,
} from '../../src/tools/fiber-craft/crochet-document-engine';
import { buildCrochetPatternBookModel, buildCrochetPatternText, fiberCraftPatternTextFilename } from '../../src/tools/fiber-craft/pattern-export-engine';
import type { FiberCraftDocument, GridChart } from '../../src/tools/fiber-craft/fiber-craft-types';

const NOW = '2026-09-29T00:00:00.000Z';

const grid = (document: FiberCraftDocument): GridChart => {
  if (document.chart.kind !== 'grid') throw new Error('Expected a grid chart');
  return document.chart;
};

const paintedGrid = (): FiberCraftDocument => {
  let document = switchCrochetChartMode(createStarterCrochetDocument(NOW), 'grid', NOW);
  document = toggleCrochetGridCell(document, 0, 0, 'primary', NOW);
  document = toggleCrochetGridCell(document, 0, 11, 'accent', NOW);
  return toggleCrochetGridCell(document, 11, 0, 'contrast', NOW);
};

const filledAt = (document: FiberCraftDocument): string[] =>
  grid(document).cells.filter((cell) => cell.colorId !== null).map((cell) => `${cell.row}:${cell.col}:${cell.colorId}`).sort();

describe('crochet grid resize, clear, and transforms', () => {
  test('growing keeps every painted cell in place and adds open cells', () => {
    const grown = resizeCrochetGrid(paintedGrid(), 14, 16, NOW);
    expect(grid(grown)).toMatchObject({ rows: 14, cols: 16 });
    expect(grid(grown).cells).toHaveLength(14 * 16);
    expect(filledAt(grown)).toEqual(['0:0:primary', '0:11:accent', '11:0:contrast']);
  });

  test('shrinking drops cells outside the new size and the progress markers for dropped rows', () => {
    let document = toggleCrochetProgressStep(toggleCrochetProgressStep(paintedGrid(), 'row:2', NOW), 'row:9', NOW);
    document = resizeCrochetGrid(document, 6, 6, NOW);
    expect(grid(document).cells).toHaveLength(36);
    expect(filledAt(document)).toEqual(['0:0:primary']);
    expect(document.completedSteps).toEqual(['row:2']);
  });

  test('rejects sizes that are not whole numbers from 1 to the supported maximum, and round charts', () => {
    const document = paintedGrid();
    for (const [rows, cols] of [[0, 4], [4, 0], [2.5, 4], [4, MAX_CROCHET_GRID_SIZE + 1], [-1, 3]]) {
      expect(() => resizeCrochetGrid(document, rows, cols, NOW)).toThrow(/whole number/i);
    }
    expect(() => resizeCrochetGrid(createStarterCrochetDocument(NOW), 4, 4, NOW)).toThrow(/grid/i);
  });

  test('clearing empties every cell and every row marker but keeps the size', () => {
    const cleared = clearCrochetGrid(toggleCrochetProgressStep(paintedGrid(), 'row:0', NOW), NOW);
    expect(filledAt(cleared)).toEqual([]);
    expect(grid(cleared)).toMatchObject({ rows: 12, cols: 12 });
    expect(cleared.completedSteps).toEqual([]);
  });

  test('mirror and flip move painted cells to the opposite side without changing the count', () => {
    const mirrored = transformCrochetGrid(paintedGrid(), 'mirror-horizontal', NOW);
    expect(filledAt(mirrored)).toEqual(['0:0:accent', '0:11:primary', '11:11:contrast']);
    const flipped = transformCrochetGrid(paintedGrid(), 'mirror-vertical', NOW);
    expect(filledAt(flipped)).toEqual(['0:0:contrast', '11:0:primary', '11:11:accent']);
  });

  test('rotating swaps a rectangular grid and drops row progress that no longer describes the same rows', () => {
    let document = resizeCrochetGrid(paintedGrid(), 12, 8, NOW);
    document = toggleCrochetProgressStep(document, 'row:1', NOW);
    const rotated = transformCrochetGrid(document, 'rotate-90', NOW);
    expect(grid(rotated)).toMatchObject({ rows: 8, cols: 12 });
    expect(grid(rotated).cells).toHaveLength(96);
    expect(rotated.completedSteps).toEqual([]);
  });

  test('every transform leaves the source document untouched', () => {
    const source = paintedGrid();
    const before = JSON.stringify(source);
    transformCrochetGrid(source, 'rotate-90', NOW);
    resizeCrochetGrid(source, 3, 3, NOW);
    clearCrochetGrid(source, NOW);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('pattern title, author, license, and notes', () => {
  test('saves trimmed values and leaves every other field alone', () => {
    const source = createStarterCrochetDocument(NOW);
    const saved = setCrochetPatternCredit(source, { title: '  Moss Bunny  ', author: ' Ana ', license: ' CC BY 4.0 ', notes: ' Use safety eyes. ' }, NOW);
    expect(saved.metadata).toMatchObject({ title: 'Moss Bunny', author: 'Ana', license: 'CC BY 4.0', notes: 'Use safety eyes.', difficulty: source.metadata.difficulty, updatedAt: NOW });
    expect(saved.chart).toBe(source.chart);
  });

  test('rejects an empty title and over-long fields with a message that says what to change', () => {
    const source = createStarterCrochetDocument(NOW);
    const credit = { title: 'T', author: '', license: '', notes: '' };
    expect(() => setCrochetPatternCredit(source, { ...credit, title: '   ' }, NOW)).toThrow(/title/i);
    expect(() => setCrochetPatternCredit(source, { ...credit, title: 'x'.repeat(121) }, NOW)).toThrow(/120/);
    expect(() => setCrochetPatternCredit(source, { ...credit, notes: 'x'.repeat(4001) }, NOW)).toThrow(/4,000/);
  });

  test('the pattern book carries the license and notes so a shared PDF keeps its credit', () => {
    const document = setCrochetPatternCredit(createStarterCrochetDocument(NOW), { title: 'Moss Bunny', author: 'Ana', license: 'CC BY 4.0', notes: 'Use safety eyes.' }, NOW);
    expect(buildCrochetPatternBookModel(document, 'us')).toMatchObject({ title: 'Moss Bunny', author: 'Ana', license: 'CC BY 4.0', notes: 'Use safety eyes.' });
  });
});

describe('plain-text written pattern', () => {
  test('is built from the same model as the PDF: credit, materials, key, and every round', () => {
    let document = setCrochetPatternCredit(createStarterCrochetDocument(NOW), { title: 'Moss Bunny', author: 'Ana', license: 'CC BY 4.0', notes: 'Use safety eyes.' }, NOW);
    document = fillCrochetRound(document, 0, 'sc-dc', 'primary', {}, NOW);
    const text = buildCrochetPatternText(document, 'us');
    expect(text.split('\n')[0]).toBe('Moss Bunny');
    expect(text).toContain('by Ana');
    expect(text).toContain('License: CC BY 4.0');
    expect(text).toContain('Notes: Use safety eyes.');
    expect(text).toContain('Round 1: 6 sc [Primary].');
    for (const line of buildCrochetPatternBookModel(document, 'us').instructions) expect(text).toContain(line);
    expect(buildCrochetPatternText(document, 'uk')).toContain('Round 1: 6 dc [Primary].');
  });

  test('covers C2C and filet instructions for grid charts and names the file after the title', () => {
    const document = toggleCrochetGridCell(switchCrochetChartMode(createStarterCrochetDocument(NOW), 'grid', NOW), 0, 0, 'primary', NOW);
    const text = buildCrochetPatternText(document, 'us');
    expect(text).toContain('Row 1: 1 filled mesh, 11 open meshes.');
    expect(text).toContain('C2C diagonal 1: 1 filled of 1 block.');
    expect(fiberCraftPatternTextFilename('Moss Bunny')).toBe('moss-bunny-pattern.txt');
  });
});
