import { createEmptyMetadata, type ColorSlot, type FiberCraftDocument } from '../fiber-craft-types';

export const COUNTED_STITCH_KINDS = [
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
] as const;

export type CountedStitchKind = (typeof COUNTED_STITCH_KINDS)[number];
export interface CountedThreadCell { readonly row: number; readonly col: number; readonly stitchKind: CountedStitchKind | null; readonly colorId: string | null; }
export interface CountedThreadPoint { readonly row: number; readonly col: number; }
export interface CountedFrenchKnot { readonly id: string; readonly point: CountedThreadPoint; readonly colorId: string; }
export interface CountedBackstitch { readonly id: string; readonly start: CountedThreadPoint; readonly end: CountedThreadPoint; readonly colorId: string; }
export interface CountedThreadChart { readonly kind: 'counted-thread'; readonly rows: number; readonly cols: number; readonly cells: readonly CountedThreadCell[]; readonly knots: readonly CountedFrenchKnot[]; readonly backstitches: readonly CountedBackstitch[]; }
export interface CountedThreadLegendEntry { readonly colorId: string; readonly label: string; readonly code?: string; readonly paletteName?: string; readonly symbol: string; readonly usageCount: number; }

const STARTER_SIZE = 12;
const LEGEND_SYMBOLS = ['●', '■', '▲', '◆', '✚', '✦', '○', '□', '△', '◇', '×', '+'] as const;
const STARTER_PALETTE: readonly ColorSlot[] = [
  { id: 'primary', label: 'Primary', hex: '#205bd6' },
  { id: 'accent', label: 'Accent', hex: '#087a55' },
  { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
];

export const isCountedStitchKind = (value: unknown): value is CountedStitchKind => typeof value === 'string' && (COUNTED_STITCH_KINDS as readonly string[]).includes(value);
const requireChart = (document: FiberCraftDocument): CountedThreadChart => {
  if (document.chart.kind !== 'counted-thread') throw new Error('This counted-thread action requires a cross-stitch grid.');
  return document.chart;
};
const requireColor = (document: FiberCraftDocument, colorId: string) => {
  if (!document.palette.some((color) => color.id === colorId)) throw new Error('Selected color is not in this project palette.');
};
const isHalfGrid = (value: number) => Number.isFinite(value) && Number.isInteger(value * 2);
const requirePoint = (chart: CountedThreadChart, point: CountedThreadPoint) => {
  if (!isHalfGrid(point.row) || !isHalfGrid(point.col)) throw new Error('Specialty stitches must snap to the half-grid.');
  if (point.row < 0 || point.row > chart.rows || point.col < 0 || point.col > chart.cols) throw new Error('Point is outside this counted-thread grid.');
};
const withChart = (document: FiberCraftDocument, chart: CountedThreadChart, now: string): FiberCraftDocument => ({ ...document, chart, metadata: { ...document.metadata, updatedAt: now } });

export const createStarterCountedThreadDocument = (now = new Date().toISOString()): FiberCraftDocument => {
  const metadata = createEmptyMetadata('cross-stitch');
  const cells: CountedThreadCell[] = [];
  for (let row = 0; row < STARTER_SIZE; row += 1) for (let col = 0; col < STARTER_SIZE; col += 1) cells.push({ row, col, stitchKind: null, colorId: null });
  return { formatVersion: 1, metadata: { ...metadata, title: 'Counted-thread chart', materialClass: '14-count Aida', createdAt: now, updatedAt: now }, palette: STARTER_PALETTE, chart: { kind: 'counted-thread', rows: STARTER_SIZE, cols: STARTER_SIZE, cells, knots: [], backstitches: [] }, swatchImages: {}, completedSteps: [] };
};

export const setCountedThreadStitch = (document: FiberCraftDocument, row: number, col: number, stitchKind: CountedStitchKind | null, colorId: string | null, now = new Date().toISOString()): FiberCraftDocument => {
  const chart = requireChart(document);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= chart.rows || col < 0 || col >= chart.cols) throw new Error('Cell is outside this counted-thread grid.');
  if (stitchKind !== null && !isCountedStitchKind(stitchKind)) throw new Error('Unsupported counted-thread stitch.');
  if (stitchKind !== null && colorId === null) throw new Error('A counted stitch needs a palette color.');
  if (colorId !== null) requireColor(document, colorId);
  const cells = chart.cells.map((cell) => cell.row === row && cell.col === col ? { ...cell, stitchKind, colorId: stitchKind === null ? null : colorId } : cell);
  return withChart(document, { ...chart, cells }, now);
};

export const addCountedFrenchKnot = (document: FiberCraftDocument, point: CountedThreadPoint, colorId: string, now = new Date().toISOString()): FiberCraftDocument => {
  const chart = requireChart(document); requireColor(document, colorId); requirePoint(chart, point);
  const knot = { id: `knot:${chart.knots.length + 1}`, point: { ...point }, colorId };
  return withChart(document, { ...chart, knots: [...chart.knots, knot] }, now);
};

export const addCountedBackstitch = (document: FiberCraftDocument, start: CountedThreadPoint, end: CountedThreadPoint, colorId: string, now = new Date().toISOString()): FiberCraftDocument => {
  const chart = requireChart(document); requireColor(document, colorId); requirePoint(chart, start); requirePoint(chart, end);
  if (start.row === end.row && start.col === end.col) throw new Error('Backstitch endpoints must be different.');
  const line = { id: `backstitch:${chart.backstitches.length + 1}`, start: { ...start }, end: { ...end }, colorId };
  return withChart(document, { ...chart, backstitches: [...chart.backstitches, line] }, now);
};

export const generateCountedThreadLegend = (document: FiberCraftDocument): readonly CountedThreadLegendEntry[] => {
  const chart = requireChart(document);
  const usage = new Map<string, number>();
  for (const cell of chart.cells) if (cell.stitchKind && cell.colorId) usage.set(cell.colorId, (usage.get(cell.colorId) ?? 0) + 1);
  for (const knot of chart.knots) usage.set(knot.colorId, (usage.get(knot.colorId) ?? 0) + 1);
  for (const line of chart.backstitches) usage.set(line.colorId, (usage.get(line.colorId) ?? 0) + 1);
  return document.palette.flatMap((color, index) => usage.has(color.id) ? [{ colorId: color.id, label: color.label, code: color.paletteCode, paletteName: color.paletteName, symbol: LEGEND_SYMBOLS[index % LEGEND_SYMBOLS.length], usageCount: usage.get(color.id)! }] : []);
};
