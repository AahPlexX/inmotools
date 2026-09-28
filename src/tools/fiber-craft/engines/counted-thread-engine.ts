import {
  createEmptyMetadata,
  type ColorSlot,
  type CountedBackstitch,
  type CountedFrenchKnot,
  type CountedStitchKind,
  type CountedThreadCell,
  type CountedThreadChart,
  type CountedThreadPoint,
  type CountedThreadProjectSettings,
  type CountedThreadStrandCount,
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
const legendSymbol = (index: number): string => {
  let value = index;
  let symbol = '';
  do {
    symbol = String.fromCharCode(65 + (value % 26)) + symbol;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return symbol;
};
const STARTER_PALETTE: readonly ColorSlot[] = [
  { id: 'primary', label: 'Primary', hex: '#205bd6' },
  { id: 'accent', label: 'Accent', hex: '#087a55' },
  { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
];

export const DEFAULT_COUNTED_THREAD_SETTINGS: CountedThreadProjectSettings = {
  fabricType: 'aida',
  fabricCount: 14,
  stitchOver: 1,
  confettiWarningsEnabled: true,
  strandCount: 2,
};

// --- FC-40: floss skein & length estimate constants ---
// DMC's own official product specification (dmc.com, Mouliné Spécial embroidery floss,
// verified 2026-09-28) states each skein holds 8 m / 8.7 yd of 6-strand cotton. This figure is
// a manufacturer-published fact, not an estimate, and is reused as-is.
export const DMC_SKEIN_YARDS = 8.7;
const SKEIN_STRAND_COUNT = 6;

// The physical thread length a single full cross stitch consumes on N-count fabric has no
// single manufacturer-published value: independent cross-stitch planning calculators were
// checked as of 2026-09-28 and disagreed with each other by roughly 2x (some ~13.8/N in.,
// others ~7/N in., per full cross at 2 strands). No official standards body publishes this
// figure, so it cannot be pinned to a single authoritative source the way the skein length
// above can be. This constant is therefore a clearly-labeled planning estimate derived from
// the geometrically self-consistent side of that research (a constant length-per-stitch times
// 1/fabricCount held across every count in that source's table), not an asserted manufacturer
// fact. Real consumption varies with individual stitching technique (parking vs. away-waste
// knots, tail length, travel between stitches); the 20% safety margin below is a common
// convention across the calculators reviewed and exists specifically to absorb that variance.
const ESTIMATED_INCHES_PER_FULL_STITCH_AT_COUNT_1 = 13.78;
const ESTIMATED_INCHES_PER_FRENCH_KNOT = 0.4;
const FLOSS_SAFETY_MARGIN = 1.2;

const STITCH_LENGTH_WEIGHT: Readonly<Record<CountedStitchKind, number>> = {
  'full-cross': 1,
  'half-forward': 0.5,
  'half-back': 0.5,
  'quarter-nw': 0.25,
  'quarter-ne': 0.25,
  'quarter-sw': 0.25,
  'quarter-se': 0.25,
  'three-quarter-nw': 0.75,
  'three-quarter-ne': 0.75,
  'three-quarter-sw': 0.75,
  'three-quarter-se': 0.75,
};

export const isCountedThreadStrandCount = (value: unknown): value is CountedThreadStrandCount =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;

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
    settings: { countedThread: DEFAULT_COUNTED_THREAD_SETTINGS },
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

export const setCountedThreadFabricSettings = (
  document: FiberCraftDocument,
  settings: CountedThreadProjectSettings,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  requireChart(document);
  if (!['aida', 'linen', 'evenweave'].includes(settings.fabricType)) {
    throw new Error('Choose Aida, linen, or evenweave fabric.');
  }
  if (!Number.isInteger(settings.fabricCount) || settings.fabricCount < 1 || settings.fabricCount > 100) {
    throw new Error('Fabric count must be a whole number from 1 to 100.');
  }
  if (settings.stitchOver !== 1 && settings.stitchOver !== 2) {
    throw new Error('Stitch-over must be one or two fabric threads.');
  }
  if (!isCountedThreadStrandCount(settings.strandCount)) {
    throw new Error('Strand count must be a whole number from 1 to 6.');
  }
  const normalized: CountedThreadProjectSettings = {
    ...settings,
    stitchOver: settings.fabricType === 'aida' ? 1 : settings.stitchOver,
  };
  return {
    ...document,
    settings: { ...document.settings, countedThread: normalized },
    metadata: {
      ...document.metadata,
      materialClass: `${normalized.fabricCount}-count ${normalized.fabricType === 'aida' ? 'Aida' : normalized.fabricType}`,
      updatedAt: now,
    },
  };
};

const countedSettings = (document: FiberCraftDocument): CountedThreadProjectSettings =>
  document.settings?.countedThread ?? DEFAULT_COUNTED_THREAD_SETTINGS;

export const countedThreadFinishedSizeInches = (
  document: FiberCraftDocument,
): { readonly width: number; readonly height: number } => {
  const chart = requireChart(document);
  const settings = countedSettings(document);
  const stitchesPerInch = settings.fabricCount / settings.stitchOver;
  return {
    width: chart.cols / stitchesPerInch,
    height: chart.rows / stitchesPerInch,
  };
};

export const findCountedThreadConfettiCells = (
  document: FiberCraftDocument,
): readonly CountedThreadCell[] => {
  const chart = requireChart(document);
  const stitched = chart.cells.filter(
    (cell): cell is CountedThreadCell & { readonly colorId: string } =>
      cell.stitchKind !== null && cell.colorId !== null,
  );
  return stitched.filter((cell) => !stitched.some((neighbor) =>
    neighbor !== cell
      && neighbor.colorId === cell.colorId
      && Math.abs(neighbor.row - cell.row) <= 1
      && Math.abs(neighbor.col - cell.col) <= 1));
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
      symbol: legendSymbol(index),
      usageCount: usage.get(color.id)!,
    }]
    : []);
};

// FC-40: floss skein & length calculator. See the constants above for the exact provenance of
// each figure used here (DMC's published skein length is a manufacturer fact; the per-stitch
// length is a documented planning estimate, not a manufacturer spec).
export interface CountedThreadFlossUsageEntry {
  readonly colorId: string;
  readonly label: string;
  readonly code?: string;
  readonly paletteName?: string;
  readonly symbol: string;
  readonly stitchUnits: number;
  readonly knotCount: number;
  readonly estimatedInches: number;
  readonly estimatedYards: number;
  readonly skeinsNeeded: number;
}

export const estimateCountedThreadFlossUsage = (
  document: FiberCraftDocument,
): readonly CountedThreadFlossUsageEntry[] => {
  const chart = requireChart(document);
  const settings = countedSettings(document);
  const perStitchInches = (ESTIMATED_INCHES_PER_FULL_STITCH_AT_COUNT_1 / settings.fabricCount) * settings.stitchOver;
  const gridSpacingInches = settings.stitchOver / settings.fabricCount;
  const skeinFractionPerInchLaid = settings.strandCount / SKEIN_STRAND_COUNT;

  const stitchUnitsByColor = new Map<string, number>();
  for (const cell of chart.cells) {
    if (!cell.stitchKind || !cell.colorId) continue;
    stitchUnitsByColor.set(
      cell.colorId,
      (stitchUnitsByColor.get(cell.colorId) ?? 0) + STITCH_LENGTH_WEIGHT[cell.stitchKind],
    );
  }
  const knotCountByColor = new Map<string, number>();
  for (const knot of chart.knots) {
    knotCountByColor.set(knot.colorId, (knotCountByColor.get(knot.colorId) ?? 0) + 1);
  }
  const backstitchInchesByColor = new Map<string, number>();
  for (const line of chart.backstitches) {
    const dRow = line.end.row - line.start.row;
    const dCol = line.end.col - line.start.col;
    const lengthInches = Math.sqrt(dRow * dRow + dCol * dCol) * gridSpacingInches;
    backstitchInchesByColor.set(line.colorId, (backstitchInchesByColor.get(line.colorId) ?? 0) + lengthInches);
  }

  return generateCountedThreadLegend(document).map((entry) => {
    const stitchUnits = stitchUnitsByColor.get(entry.colorId) ?? 0;
    const knotCount = knotCountByColor.get(entry.colorId) ?? 0;
    const laidInches = stitchUnits * perStitchInches
      + knotCount * ESTIMATED_INCHES_PER_FRENCH_KNOT
      + (backstitchInchesByColor.get(entry.colorId) ?? 0);
    const estimatedInches = laidInches * skeinFractionPerInchLaid * FLOSS_SAFETY_MARGIN;
    const estimatedYards = estimatedInches / 36;
    return {
      colorId: entry.colorId,
      label: entry.label,
      code: entry.code,
      paletteName: entry.paletteName,
      symbol: entry.symbol,
      stitchUnits,
      knotCount,
      estimatedInches,
      estimatedYards,
      skeinsNeeded: estimatedYards > 0 ? Math.ceil(estimatedYards / DMC_SKEIN_YARDS) : 0,
    };
  });
};
