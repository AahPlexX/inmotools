import {
  createEmptyGridChart,
  createEmptyPolarChart,
  setGridCell,
  setPolarNode,
} from './engines/geometry-engine';
import { getCrochetSymbol } from './engines/symbol-library';
import {
  createEmptyMetadata,
  type FiberCraftDocument,
  type GaugeSwatch,
  type GridChart,
  type PolarChart,
} from './fiber-craft-types';

export const STARTER_CROCHET_STITCHES = 6;
export const STARTER_CROCHET_GRID_SIZE = 12;
export const CYC_PROJECT_LEVELS = ['Basic', 'Easy', 'Intermediate', 'Complex'] as const;
export type CycProjectLevel = (typeof CYC_PROJECT_LEVELS)[number];

const withUpdatedChart = (
  document: FiberCraftDocument,
  chart: GridChart | PolarChart,
  now: string,
): FiberCraftDocument => ({
  ...document,
  metadata: { ...document.metadata, updatedAt: now },
  chart,
});

const requirePolarChart = (document: FiberCraftDocument): PolarChart => {
  if (document.chart.kind !== 'polar') throw new Error('This crochet action requires a round chart.');
  return document.chart;
};

const requireGridChart = (document: FiberCraftDocument): GridChart => {
  if (document.chart.kind !== 'grid') throw new Error('This crochet action requires a grid chart.');
  return document.chart;
};

const withCrochetSettings = (
  document: FiberCraftDocument,
  patch: Partial<{ readonly targetRoundCounts: readonly number[]; readonly yarnWeight: number | null }>,
): FiberCraftDocument => ({
  ...document,
  settings: {
    ...document.settings,
    crochet: {
      targetRoundCounts: patch.targetRoundCounts ?? document.settings?.crochet?.targetRoundCounts ?? [],
      yarnWeight: patch.yarnWeight !== undefined ? patch.yarnWeight : document.settings?.crochet?.yarnWeight ?? null,
    },
  },
});

export const createStarterCrochetDocument = (now = new Date().toISOString()): FiberCraftDocument => {
  const metadata = createEmptyMetadata('crochet');
  return {
    formatVersion: 1,
    metadata: {
      ...metadata,
      title: 'Crochet round chart',
      difficulty: 'Basic',
      createdAt: now,
      updatedAt: now,
    },
    palette: [
      { id: 'primary', label: 'Primary', hex: '#205bd6' },
      { id: 'accent', label: 'Accent', hex: '#087a55' },
      { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
    ],
    chart: createEmptyPolarChart([STARTER_CROCHET_STITCHES]),
    settings: { crochet: { targetRoundCounts: [STARTER_CROCHET_STITCHES], yarnWeight: null } },
    swatchImages: {},
    completedSteps: [],
  };
};

export const addCrochetRound = (
  document: FiberCraftDocument,
  stitchCount: number,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (!Number.isInteger(stitchCount) || stitchCount <= 0 || stitchCount > 10_000) {
    throw new Error('Round stitch count must be an integer from 1 to 10,000.');
  }
  const chart = requirePolarChart(document);
  const round = chart.rounds;
  const nodes = Array.from({ length: stitchCount }, (_, angleIndex) => ({
    round,
    angleIndex,
    stitchesInRound: stitchCount,
    symbolId: null,
    colorId: null,
  }));
  return withUpdatedChart(document, {
    ...chart,
    rounds: chart.rounds + 1,
    nodes: [...chart.nodes, ...nodes],
  }, now);
};

export const workNextCrochetStitch = (
  document: FiberCraftDocument,
  round: number,
  symbolId: string,
  colorId: string | null,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  getCrochetSymbol(symbolId);
  const chart = requirePolarChart(document);
  if (!Number.isInteger(round) || round < 0 || round >= chart.rounds) {
    throw new Error('Round is outside this chart.');
  }
  if (colorId !== null && !document.palette.some((color) => color.id === colorId)) {
    throw new Error('Selected color is not in this project palette.');
  }
  const target = chart.nodes.find((node) => node.round === round && node.symbolId === null);
  if (!target) throw new Error('Every stitch in this round is already worked.');
  return withUpdatedChart(document, setPolarNode(chart, round, target.angleIndex, colorId, symbolId), now);
};

export const crochetRoundProgress = (
  document: FiberCraftDocument,
  round: number,
): { readonly worked: number; readonly total: number } => {
  const chart = requirePolarChart(document);
  const nodes = chart.nodes.filter((node) => node.round === round);
  return { worked: nodes.filter((node) => node.symbolId !== null).length, total: nodes.length };
};

export const switchCrochetChartMode = (
  document: FiberCraftDocument,
  mode: 'round' | 'grid',
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (mode === 'round' && document.chart.kind === 'polar' && document.metadata.discipline === 'crochet') return document;
  if (mode === 'grid' && document.chart.kind === 'grid' && document.metadata.discipline === 'crochet') return document;
  const chart = mode === 'round'
    ? createEmptyPolarChart([STARTER_CROCHET_STITCHES])
    : createEmptyGridChart(STARTER_CROCHET_GRID_SIZE, STARTER_CROCHET_GRID_SIZE);
  const next = withUpdatedChart(document, chart, now);
  return { ...next, metadata: { ...next.metadata, discipline: 'crochet', updatedAt: now } };
};

export const toggleCrochetGridCell = (
  document: FiberCraftDocument,
  row: number,
  col: number,
  colorId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireGridChart(document);
  if (!document.palette.some((color) => color.id === colorId)) {
    throw new Error('Selected color is not in this project palette.');
  }
  const current = chart.cells.find((cell) => cell.row === row && cell.col === col);
  if (!current) throw new Error(`Cell (${row}, ${col}) is outside this grid.`);
  const nextColor = current.colorId === null ? colorId : null;
  return withUpdatedChart(document, setGridCell(chart, row, col, nextColor, null), now);
};

export const setCrochetTargetRoundCounts = (
  document: FiberCraftDocument,
  counts: readonly number[],
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (counts.some((count) => !Number.isInteger(count) || count <= 0 || count > 10_000)) {
    throw new Error('Every target round count must be an integer from 1 to 10,000.');
  }
  const next = withCrochetSettings(document, { targetRoundCounts: [...counts] });
  return { ...next, metadata: { ...next.metadata, updatedAt: now } };
};

export const setCrochetYarnReference = (
  document: FiberCraftDocument,
  yarnWeight: number | null,
  materialClass: string,
  toolSize: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (yarnWeight !== null && (!Number.isInteger(yarnWeight) || yarnWeight < 0 || yarnWeight > 7)) {
    throw new Error('Yarn weight category must be from 0 to 7.');
  }
  const next = withCrochetSettings(document, { yarnWeight });
  return {
    ...next,
    metadata: {
      ...next.metadata,
      materialClass: materialClass.trim(),
      toolSize: toolSize.trim(),
      updatedAt: now,
    },
  };
};

export const setCrochetGauge = (
  document: FiberCraftDocument,
  gauge: GaugeSwatch,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (!Number.isFinite(gauge.stitchCount) || gauge.stitchCount <= 0
    || !Number.isFinite(gauge.rowCount) || gauge.rowCount <= 0
    || !Number.isFinite(gauge.span) || gauge.span <= 0
    || (gauge.unit !== 'in' && gauge.unit !== 'cm')) {
    throw new Error('Gauge needs positive stitch, row, and span values in inches or centimeters.');
  }
  return {
    ...document,
    gauge: { ...gauge },
    metadata: { ...document.metadata, updatedAt: now },
  };
};

export const setCrochetPatternClassification = (
  document: FiberCraftDocument,
  difficulty: CycProjectLevel,
  techniqueTags: readonly string[],
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (!CYC_PROJECT_LEVELS.includes(difficulty)) throw new Error('Choose a supported project level.');
  const seen = new Set<string>();
  const normalizedTags: string[] = [];
  for (const rawTag of techniqueTags) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalizedTags.push(tag);
  }
  return {
    ...document,
    metadata: {
      ...document.metadata,
      difficulty,
      techniqueTags: normalizedTags,
      updatedAt: now,
    },
  };
};

export const toggleCrochetProgressStep = (
  document: FiberCraftDocument,
  stepId: string,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const normalized = stepId.trim();
  if (!normalized) throw new Error('Progress step id cannot be empty.');
  const completed = new Set(document.completedSteps);
  if (completed.has(normalized)) completed.delete(normalized);
  else completed.add(normalized);
  return {
    ...document,
    metadata: { ...document.metadata, updatedAt: now },
    completedSteps: [...completed],
  };
};
