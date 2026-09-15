import { createEmptyPolarChart, setPolarNode } from './engines/geometry-engine';
import { getCrochetSymbol } from './engines/symbol-library';
import { createEmptyMetadata, type FiberCraftDocument, type PolarChart } from './fiber-craft-types';

export const STARTER_CROCHET_STITCHES = 6;

const withUpdatedChart = (
  document: FiberCraftDocument,
  chart: PolarChart,
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

export const createStarterCrochetDocument = (now = new Date().toISOString()): FiberCraftDocument => {
  const metadata = createEmptyMetadata('crochet');
  return {
    formatVersion: 1,
    metadata: {
      ...metadata,
      title: 'Crochet round chart',
      createdAt: now,
      updatedAt: now,
    },
    palette: [
      { id: 'primary', label: 'Primary', hex: '#205bd6' },
      { id: 'accent', label: 'Accent', hex: '#087a55' },
      { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
    ],
    chart: createEmptyPolarChart([STARTER_CROCHET_STITCHES]),
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
    stitchCountInRound: stitchCount,
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
  return withUpdatedChart(
    document,
    setPolarNode(chart, round, target.angleIndex, colorId, symbolId),
    now,
  );
};

export const crochetRoundProgress = (
  document: FiberCraftDocument,
  round: number,
): { readonly worked: number; readonly total: number } => {
  const chart = requirePolarChart(document);
  const nodes = chart.nodes.filter((node) => node.round === round);
  return {
    worked: nodes.filter((node) => node.symbolId !== null).length,
    total: nodes.length,
  };
};
