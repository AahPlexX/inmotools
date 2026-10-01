import { knittingRowDirection, type KnittingRowDirection } from './knitting-document-engine';
import type { FiberCraftDocument, GridChart } from './fiber-craft-types';

export interface KnittingFloatWarning {
  readonly row: number;
  readonly colorId: string;
  readonly fromCol: number;
  readonly toCol: number;
  readonly stitchesBetween: number;
  readonly direction: KnittingRowDirection['direction'];
}

const requireKnittingChart = (document: FiberCraftDocument): GridChart => {
  if (document.metadata.discipline !== 'knitting' || document.chart.kind !== 'grid') throw new Error('This action requires a knitting grid.');
  return document.chart;
};

export function addKnittingYarnColor(document: FiberCraftDocument, label: string, hex: string, now = new Date().toISOString()): FiberCraftDocument {
  requireKnittingChart(document);
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Yarn color name must be 1–80 characters.');
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Yarn color must be a six-digit hex color.');
  let number = 1;
  while (document.palette.some((color) => color.id === `yarn-${number}`)) number += 1;
  return {
    ...document,
    palette: [...document.palette, { id: `yarn-${number}`, label: trimmed, hex: hex.toLowerCase() }],
    metadata: { ...document.metadata, updatedAt: now },
  };
}

export function paintKnittingColor(document: FiberCraftDocument, row: number, col: number, colorId: string | null, now = new Date().toISOString()): FiberCraftDocument {
  const chart = requireKnittingChart(document);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= chart.rows || col < 0 || col >= chart.cols) throw new Error('Knitting cell is outside the chart.');
  if (colorId !== null && !document.palette.some((color) => color.id === colorId)) throw new Error('Unknown yarn color.');
  return {
    ...document,
    chart: { ...chart, cells: chart.cells.map((cell) => cell.row === row && cell.col === col ? { ...cell, colorId } : cell) },
    metadata: { ...document.metadata, updatedAt: now },
  };
}

export function setKnittingFloatThreshold(document: FiberCraftDocument, threshold: number, now = new Date().toISOString()): FiberCraftDocument {
  requireKnittingChart(document);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) throw new Error('Float threshold must be a whole number from 1 to 20 stitches.');
  return {
    ...document,
    settings: { ...document.settings, knitting: { construction: document.settings?.knitting?.construction ?? 'flat', floatThreshold: threshold } },
    metadata: { ...document.metadata, updatedAt: now },
  };
}

/** Only fully colored gaps are analyzable; open/uncharted regions cannot imply a float. */
export function analyzeKnittingFloats(document: FiberCraftDocument, threshold = document.settings?.knitting?.floatThreshold ?? 5): readonly KnittingFloatWarning[] {
  const chart = requireKnittingChart(document);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) throw new Error('Float threshold must be a whole number from 1 to 20 stitches.');
  const warnings: KnittingFloatWarning[] = [];
  for (let row = 0; row < chart.rows; row += 1) {
    const direction = knittingRowDirection(row, document.settings?.knitting?.construction ?? 'flat').direction;
    const cells = chart.cells.filter((cell) => cell.row === row).toSorted((a, b) => direction === 'left-to-right' ? a.col - b.col : b.col - a.col);
    const lastByColor = new Map<string, number>();
    for (let index = 0; index < cells.length; index += 1) {
      const colorId = cells[index].colorId;
      if (colorId === null) { lastByColor.clear(); continue; }
      const previous = lastByColor.get(colorId);
      if (previous !== undefined && index - previous - 1 > threshold) {
        warnings.push({ row, colorId, fromCol: cells[previous].col, toCol: cells[index].col, stitchesBetween: index - previous - 1, direction });
      }
      lastByColor.set(colorId, index);
    }
  }
  return warnings;
}
