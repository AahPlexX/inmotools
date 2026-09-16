import {
  createEmptyMetadata,
  type ColorSlot,
  type CountedBackstitch,
  type CountedFrenchKnot,
  type CountedStitchKind,
  type CountedThreadChart,
  type CountedThreadPoint,
  type FiberCraftDocument,
} from '../fiber-craft-types';

export type { CountedStitchKind, CountedThreadPoint } from '../fiber-craft-types';

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
] as const satisfies readonly CountedStitchKind[];

export const COUNTED_STITCH_LABELS: Readonly<Record<CountedStitchKind, string>> = {
  'full-cross': 'Full cross',
  'half-forward': 'Half cross, forward diagonal',
  'half-back': 'Half cross, back diagonal',
  'quarter-nw': 'Quarter stitch, northwest',
  'quarter-ne': 'Quarter stitch, northeast',
  'quarter-sw': 'Quarter stitch, southwest',
  'quarter-se': 'Quarter stitch, southeast',
  'three-quarter-nw': 'Three-quarter stitch, northwest',
  'three-quarter-ne': 'Three-quarter stitch, northeast',
  'three-quarter-sw': 'Three-quarter stitch, southwest',
  'three-quarter-se': 'Three-quarter stitch, southeast',
};

export interface CountedThreadLegendEntry {
  readonly colorId: string;
  readonly label: string;
  readonly code?: string;
  readonly paletteName?: string;
  readonly symbol: string;
  readonly usageCount: number;
}

const STARTER_SIZE = 12;
const LEGEND_SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
const STARTER_PALETTE: readonly ColorSlot[] = [
  { id: 'primary', label: 'Primary', hex: '#205bd6' },
  { id: 'accent', label: 'Accent', hex: '#087a55' },
  { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
];

export const isCountedStitchKind = (value: unknown): value is CountedStitchKind =>
  typeof value === 'string' && (COUNTED_STITCH_KINDS as readonly string[]).includes(value);

export const countedStitchLabel = (kind: CountedStitchKind): string => COUNTED_STITCH_LABELS[kind];

const requireChart = (document: FiberCraftDocument): CountedThreadChart => {
  if (document.chart.kind !== 'counted-thread') {
    throw new Error('This counted-thread action requires a cross-stitch grid.');
  }
  return document.chart;
};

const requireColor = (document: FiberCraftDocument, colorId: string) => {
  if (!document.palette.some((color) => color.id === colorId)) {
    throw new Error('Selected color is not in this project palette.');
  }
};

const isHalfGrid = (value: number) => Number.isFinite(value) && Number.isInteger(value * 2);

const requirePoint = (chart: CountedThreadChart, point: CountedThreadPoint) => {
  if (!isHalfGrid(point.row) || !isHalfGrid(point.col)) {
    throw new Error('Specialty stitches must snap to the half-grid.');
  }
  if (point.row < 0 || point.row > chart.rows || point.col < 0 || point.col > chart.cols) {
    throw new Error('Point is outside this counted-thread grid.');
  }
};

const withChart = (
  document: FiberCraftDocument,
  chart: CountedThreadChart,
  now: string,
): FiberCraftDocument => ({
  ...document,
  chart,
  metadata: { ...document.metadata, updatedAt: now },
});

export const createStarterCountedThreadDocument = (
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const metadata = createEmptyMetadata('cross-stitch');
  const cells = Array.from({ length: STARTER_SIZE * STARTER_SIZE }, (_, index) => ({
    row: Math.floor(index / STARTER_SIZE),
    col: index % STARTER_SIZE,
    stitchKind: null,
    colorId: null,
  }));
  return {
    formatVersion: 1,
    metadata: {
      ...metadata,
      title: 'Counted-thread chart',
      materialClass: '14-count Aida',
      createdAt: now,
      updatedAt: now,
    },
    palette: STARTER_PALETTE,
    chart: {
      kind: 'counted-thread',
      rows: STARTER_SIZE,
      cols: STARTER_SIZE,
      cells,
      knots: [],
      backstitches: [],
    },
    swatchImages: {},
    completedSteps: [],
  };
};

export const switchToCountedThreadDocument = (
  document: FiberCraftDocument,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (document.metadata.discipline === 'cross-stitch' && document.chart.kind === 'counted-thread') {
    return document;
  }
  const starter = createStarterCountedThreadDocument(now);
  return {
    ...starter,
    metadata: {
      ...starter.metadata,
      title: document.metadata.title,
      author: document.metadata.author,
      difficulty: document.metadata.difficulty,
      techniqueTags: [...document.metadata.techniqueTags],
      license: document.metadata.license,
      notes: document.metadata.notes,
      createdAt: document.metadata.createdAt,
      updatedAt: now,
    },
    palette: document.palette,
    swatchImages: document.swatchImages,
  };
};

export const setCountedThreadStitch = (
  document: FiberCraftDocument,
  row: number,
  col: number,
  stitchKind: CountedStitchKind | null,
  colorId: string | null,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireChart(document);
  if (!Number.isInteger(row) || !Number.isInteger(col)
    || row < 0 || row >= chart.rows || col < 0 || col >= chart.cols) {
    throw new Error('Cell is outside this counted-thread grid.');
  }
  if (stitchKind !== null && !isCountedStitchKind(stitchKind)) {
    throw new Error('Unsupported counted-thread stitch.');
  }
  if (stitchKind !== null && colorId === null) {
    throw new Error('A counted stitch needs a palette color.');
  }
  if (colorId !== null) requireColor(document, colorId);
  const cells = chart.cells.map((cell) =>
    cell.row === row && cell.col === col
      ? { ...cell, stitchKind, colorId: stitchKind === null ? null : colorId }
      : cell);
  return withChart(document, { ...chart, cells }, now);
};

export const addCountedFrenchKnot = (
  document: FiberCraftDocument,
  point: CountedThreadPoint,
  colorId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireChart(document);
  requireColor(document, colorId);
  requirePoint(chart, point);
  if (chart.knots.some((knot) => knot.point.row === point.row && knot.point.col === point.col)) {
    throw new Error('A French knot already occupies this point.');
  }
  const knot: CountedFrenchKnot = {
    id: `knot:${chart.knots.length + 1}`,
    point: { ...point },
    colorId,
  };
  return withChart(document, { ...chart, knots: [...chart.knots, knot] }, now);
};

export const removeCountedFrenchKnot = (
  document: FiberCraftDocument,
  knotId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireChart(document);
  if (!chart.knots.some((knot) => knot.id === knotId)) return document;
  return withChart(document, {
    ...chart,
    knots: chart.knots.filter((knot) => knot.id !== knotId),
  }, now);
};

export const addCountedBackstitch = (
  document: FiberCraftDocument,
  start: CountedThreadPoint,
  end: CountedThreadPoint,
  colorId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireChart(document);
  requireColor(document, colorId);
  requirePoint(chart, start);
  requirePoint(chart, end);
  if (start.row === end.row && start.col === end.col) {
    throw new Error('Backstitch endpoints must be different.');
  }
  const line: CountedBackstitch = {
    id: `backstitch:${chart.backstitches.length + 1}`,
    start: { ...start },
    end: { ...end },
    colorId,
  };
  return withChart(document, { ...chart, backstitches: [...chart.backstitches, line] }, now);
};

export const removeCountedBackstitch = (
  document: FiberCraftDocument,
  lineId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireChart(document);
  if (!chart.backstitches.some((line) => line.id === lineId)) return document;
  return withChart(document, {
    ...chart,
    backstitches: chart.backstitches.filter((line) => line.id !== lineId),
  }, now);
};

export const setCountedThreadPaletteIdentity = (
  document: FiberCraftDocument,
  colorId: string,
  paletteName: string,
  paletteCode: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  requireChart(document);
  requireColor(document, colorId);
  const cleanName = paletteName.trim();
  const cleanCode = paletteCode.trim();
  const palette = document.palette.map((color) => {
    if (color.id !== colorId) return color;
    const { paletteName: _oldName, paletteCode: _oldCode, ...base } = color;
    return {
      ...base,
      ...(cleanName ? { paletteName: cleanName } : {}),
      ...(cleanCode ? { paletteCode: cleanCode } : {}),
    };
  });
  return { ...document, palette, metadata: { ...document.metadata, updatedAt: now } };
};

export const generateCountedThreadLegend = (
  document: FiberCraftDocument,
): readonly CountedThreadLegendEntry[] => {
  const chart = requireChart(document);
  const usage = new Map<string, number>();
  for (const cell of chart.cells) {
    if (cell.stitchKind && cell.colorId) {
      usage.set(cell.colorId, (usage.get(cell.colorId) ?? 0) + 1);
    }
  }
  for (const knot of chart.knots) {
    usage.set(knot.colorId, (usage.get(knot.colorId) ?? 0) + 1);
  }
  for (const line of chart.backstitches) {
    usage.set(line.colorId, (usage.get(line.colorId) ?? 0) + 1);
  }
  return document.palette.flatMap((color, index) => usage.has(color.id)
    ? [{
      colorId: color.id,
      label: color.label,
      code: color.paletteCode,
      paletteName: color.paletteName,
      symbol: LEGEND_SYMBOLS[index % LEGEND_SYMBOLS.length],
      usageCount: usage.get(color.id)!,
    }]
    : []);
};
