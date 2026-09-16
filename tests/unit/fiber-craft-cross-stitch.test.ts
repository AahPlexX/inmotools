import { describe, expect, it } from 'vitest';
import {
  createStarterCrossStitchDocument,
  setCrossStitchCell,
} from '../../src/tools/fiber-craft/cross-stitch-document-engine';
import {
  buildCrossStitchLegend,
  CROSS_STITCH_CELL_SYMBOLS,
} from '../../src/tools/fiber-craft/engines/cross-stitch-engine';
import { isRestorableFiberCraftDocument } from '../../src/tools/fiber-craft/persistence-engine';

describe('counted-thread precision grid', () => {
  it('supports full, fractional, knot, and backstitch marks without losing addressability', () => {
    let document = createStarterCrossStitchDocument('2026-09-16T18:00:00.000Z');
    const marks = [
      ['full', 'primary'],
      ['half-ne', 'accent'],
      ['quarter-sw', 'contrast'],
      ['three-quarter-se', 'primary'],
      ['french-knot', 'accent'],
    ] as const;

    marks.forEach(([symbolId, colorId], col) => {
      document = setCrossStitchCell(document, 0, col, symbolId, colorId, `2026-09-16T18:0${col + 1}:00.000Z`);
    });

    expect(document.metadata.discipline).toBe('cross-stitch');
    expect(document.chart.kind).toBe('grid');
    if (document.chart.kind !== 'grid') throw new Error('Expected counted grid');
    expect(document.chart.aspectRatio).toBe(1);
    expect(document.chart.cells.slice(0, marks.length).map((cell) => [cell.symbolId, cell.colorId])).toEqual(marks);
    expect(CROSS_STITCH_CELL_SYMBOLS).toEqual(expect.arrayContaining(['full', 'half-ne', 'quarter-sw', 'three-quarter-se', 'french-knot']));
    expect(document.settings?.crossStitch?.backstitches).toEqual([]);
    expect(isRestorableFiberCraftDocument(document)).toBe(true);
  });

  it('generates one stable symbol-key entry per used floss color', () => {
    let document = createStarterCrossStitchDocument('2026-09-16T18:00:00.000Z');
    document = setCrossStitchCell(document, 0, 0, 'full', 'primary');
    document = setCrossStitchCell(document, 0, 1, 'half-ne', 'accent');
    document = setCrossStitchCell(document, 1, 0, 'quarter-sw', 'primary');

    const legend = buildCrossStitchLegend(document);
    expect(legend).toHaveLength(2);
    expect(legend.map((entry) => entry.colorId)).toEqual(['primary', 'accent']);
    expect(new Set(legend.map((entry) => entry.symbol)).size).toBe(2);
    expect(legend[0]).toMatchObject({ label: 'Primary', stitchCount: 2 });
    expect(legend[1]).toMatchObject({ label: 'Accent', stitchCount: 1 });
  });
});
