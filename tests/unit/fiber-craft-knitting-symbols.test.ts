import { describe, expect, it } from 'vitest';
import { createStarterKnittingDocument } from '../../src/tools/fiber-craft/knitting-document-engine';
import { getKnittingSymbol } from '../../src/tools/fiber-craft/engines/symbol-library';
import { describeKnittingChart } from '../../src/tools/fiber-craft/engines/chart-description-engine';
import { paintKnittingSymbol, knittingCableSegment } from '../../src/tools/fiber-craft/knitting-symbol-engine';
import { isRestorableFiberCraftDocument } from '../../src/tools/fiber-craft/persistence-engine';

const symbolAt = (document: ReturnType<typeof createStarterKnittingDocument>, row: number, col: number) => {
  if (document.chart.kind !== 'grid') throw new Error('Expected grid');
  return document.chart.cells.find((cell) => cell.row === row && cell.col === col)?.symbolId;
};

describe('FC-45 knitting symbol authoring', () => {
  it('paints and clears standard single-stitch symbols without mutating the source', () => {
    const source = createStarterKnittingDocument();
    const painted = paintKnittingSymbol(source, 0, 2, 'ssk');
    expect(symbolAt(source, 0, 2)).toBeNull();
    expect(symbolAt(painted, 0, 2)).toBe('ssk');
    expect(isRestorableFiberCraftDocument(painted)).toBe(true);
    expect(symbolAt(paintKnittingSymbol(painted, 0, 2, null), 0, 2)).toBeNull();
  });

  it('stamps a bounded cable across its full stitch width and clears the whole cross from any segment', () => {
    const source = createStarterKnittingDocument();
    const cable = paintKnittingSymbol(source, 1, 2, 'cable-2-left');
    for (let col = 2; col < 6; col += 1) {
      expect(symbolAt(cable, 1, col)).toBe('cable-2-left');
      expect(knittingCableSegment(cable.chart, 1, col)).toEqual({ start: 2, span: 4, index: col - 2 });
    }
    expect(isRestorableFiberCraftDocument(cable)).toBe(true);
    expect(describeKnittingChart(cable).legend.join(' ')).toContain('1 2-over-2 left-cross cable');
    const cleared = paintKnittingSymbol(cable, 1, 4, 'purl');
    expect([2, 3, 4, 5].map((col) => symbolAt(cleared, 1, col))).toEqual([null, null, 'purl', null]);
    expect(isRestorableFiberCraftDocument(cleared)).toBe(true);
  });

  it('rejects out-of-bounds and malformed cables instead of saving partial twists', () => {
    const source = createStarterKnittingDocument();
    expect(() => paintKnittingSymbol(source, 0, 10, 'cable-2-right')).toThrow();
    expect(() => paintKnittingSymbol(source, 0, 0, 'cable-0-left')).toThrow();
    expect(() => paintKnittingSymbol(source, 0, 0, 'cable-1.5-left')).toThrow();
    expect(() => getKnittingSymbol('cable-2-left')).not.toThrow();
    const valid = paintKnittingSymbol(source, 0, 0, 'cable-2-left');
    if (valid.chart.kind !== 'grid') throw new Error('Expected grid');
    const partial = { ...valid, chart: { ...valid.chart, cells: valid.chart.cells.map((cell) => cell.row === 0 && cell.col === 2 ? { ...cell, symbolId: null } : cell) } };
    expect(isRestorableFiberCraftDocument(partial)).toBe(false);
  });
});
