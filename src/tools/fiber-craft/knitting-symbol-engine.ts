import { isKnittingSymbolId, parseKnittingCableSymbolId } from './engines/symbol-library';
import type { FiberCraftDocument, GridChart } from './fiber-craft-types';

export interface KnittingCableSegment { readonly start: number; readonly span: number; readonly index: number; }

/** A cable occupies every stitch in its cross, so its span is explicit in saved grid cells. */
export function knittingCableSegment(chart: GridChart, row: number, col: number): KnittingCableSegment | null {
  const id = chart.cells.find((cell) => cell.row === row && cell.col === col)?.symbolId;
  const cable = id ? parseKnittingCableSymbolId(id) : null;
  if (!cable) return null;
  let runStart = col;
  while (runStart > 0 && chart.cells.some((cell) => cell.row === row && cell.col === runStart - 1 && cell.symbolId === id)) runStart -= 1;
  const span = cable.width * 2;
  const start = runStart + Math.floor((col - runStart) / span) * span;
  return { start, span, index: col - start };
}

export function hasValidKnittingCableLayout(chart: GridChart): boolean {
  for (let row = 0; row < chart.rows; row += 1) {
    for (let col = 0; col < chart.cols;) {
      const id = chart.cells.find((cell) => cell.row === row && cell.col === col)?.symbolId;
      const cable = id ? parseKnittingCableSymbolId(id) : null;
      if (!cable) { col += 1; continue; }
      const span = cable.width * 2;
      if (col + span > chart.cols) return false;
      for (let offset = 1; offset < span; offset += 1) {
        if (chart.cells.find((cell) => cell.row === row && cell.col === col + offset)?.symbolId !== id) return false;
      }
      col += span;
    }
  }
  return true;
}

export function paintKnittingSymbol(
  document: FiberCraftDocument,
  row: number,
  col: number,
  symbolId: string | null,
  now = new Date().toISOString(),
): FiberCraftDocument {
  if (document.metadata.discipline !== 'knitting' || document.chart.kind !== 'grid') throw new Error('Knitting symbols require a knitting grid.');
  const chart = document.chart;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= chart.rows || col < 0 || col >= chart.cols) throw new Error('Knitting cell is outside the chart.');
  if (symbolId !== null && !isKnittingSymbolId(symbolId)) throw new Error('Unknown knitting symbol.');
  const cable = symbolId ? parseKnittingCableSymbolId(symbolId) : null;
  const span = cable ? cable.width * 2 : 1;
  if (col + span > chart.cols) throw new Error('Cable cross does not fit in this row.');

  const cellsToClear = new Set<number>();
  for (let target = col; target < col + span; target += 1) {
    const existing = knittingCableSegment(chart, row, target);
    if (existing) for (let offset = 0; offset < existing.span; offset += 1) cellsToClear.add(existing.start + offset);
    else cellsToClear.add(target);
  }
  const cells = chart.cells.map((cell) => {
    if (cell.row !== row) return cell;
    if (cell.col >= col && cell.col < col + span) return { ...cell, symbolId };
    if (cellsToClear.has(cell.col)) return { ...cell, symbolId: null };
    return cell;
  });
  return { ...document, chart: { ...chart, cells }, metadata: { ...document.metadata, updatedAt: now } };
}
