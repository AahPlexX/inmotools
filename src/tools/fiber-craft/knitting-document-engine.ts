import { createEmptyGridChart, gaugeAspectRatio } from './engines/geometry-engine';
import {
  createEmptyMetadata,
  type ColorSlot,
  type FiberCraftDocument,
  type GaugeSwatch,
  type GridChart,
  type KnittingConstruction,
} from './fiber-craft-types';

const STARTER_ROWS = 12;
const STARTER_COLS = 12;

/**
 * Neutral editable starter gauge for the knitting workspace.
 * It is a project default, not a yarn-weight recommendation.
 */
export const STARTER_KNITTING_GAUGE: GaugeSwatch = {
  stitchCount: 20,
  rowCount: 25,
  span: 4,
  unit: 'in',
};

const STARTER_PALETTE: readonly ColorSlot[] = [
  { id: 'primary', label: 'Primary', hex: '#205bd6' },
  { id: 'accent', label: 'Accent', hex: '#087a55' },
  { id: 'contrast', label: 'Contrast', hex: '#9b5d00' },
];

const requireKnittingGrid = (document: FiberCraftDocument): GridChart => {
  if (document.metadata.discipline !== 'knitting' || document.chart.kind !== 'grid') {
    throw new Error('This knitting action requires a knitting grid.');
  }
  return document.chart;
};

export const createStarterKnittingDocument = (
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const metadata = createEmptyMetadata('knitting');
  const gauge = { ...STARTER_KNITTING_GAUGE };
  return {
    formatVersion: 1,
    metadata: {
      ...metadata,
      title: 'Knitting chart',
      createdAt: now,
      updatedAt: now,
    },
    palette: STARTER_PALETTE,
    gauge,
    chart: createEmptyGridChart(STARTER_ROWS, STARTER_COLS, gaugeAspectRatio(gauge)),
    settings: { knitting: { construction: 'flat', floatThreshold: 5 } },
    swatchImages: {},
    completedSteps: [],
  };
};

export const switchToKnittingDocument = (
  document: FiberCraftDocument,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (document.metadata.discipline === 'knitting' && document.chart.kind === 'grid') {
    return document;
  }

  const starter = createStarterKnittingDocument(now);
  return {
    ...starter,
    metadata: {
      ...starter.metadata,
      title: document.metadata.title,
      author: document.metadata.author,
      difficulty: document.metadata.difficulty,
      materialClass: document.metadata.materialClass,
      toolSize: document.metadata.toolSize,
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

export const setKnittingGauge = (
  document: FiberCraftDocument,
  gauge: GaugeSwatch,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  const chart = requireKnittingGrid(document);
  const aspectRatio = gaugeAspectRatio(gauge);
  return {
    ...document,
    gauge: { ...gauge },
    chart: { ...chart, aspectRatio },
    metadata: { ...document.metadata, updatedAt: now },
  };
};


export interface KnittingRowDirection {
  readonly side: 'right' | 'wrong';
  readonly direction: 'right-to-left' | 'left-to-right';
}

export const knittingRowDirection = (
  rowIndex: number,
  construction: KnittingConstruction,
): KnittingRowDirection => {
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new Error('Knitting row index must be a non-negative integer.');
  }
  if (construction === 'round' || rowIndex % 2 === 0) {
    return { side: 'right', direction: 'right-to-left' };
  }
  return { side: 'wrong', direction: 'left-to-right' };
};

export const setKnittingConstruction = (
  document: FiberCraftDocument,
  construction: KnittingConstruction,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  requireKnittingGrid(document);
  if (construction !== 'flat' && construction !== 'round') {
    throw new Error('Knitting construction must be flat or in the round.');
  }
  return {
    ...document,
    settings: {
      ...document.settings,
      knitting: { ...document.settings?.knitting, construction },
    },
    metadata: { ...document.metadata, updatedAt: now },
  };
};
