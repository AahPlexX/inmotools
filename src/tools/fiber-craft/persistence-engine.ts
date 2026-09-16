import { COUNTED_STITCH_KINDS, type CountedThreadChart } from './engines/counted-thread-engine';
import { CROCHET_SYMBOLS } from './engines/symbol-library';
import type { FiberCraftDocument, GridChart, PolarChart } from './fiber-craft-types';

export interface FiberCraftStore {
  load(): Promise<FiberCraftDocument | null>;
  save(document: FiberCraftDocument): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'inmotools.fiber-craft-workstation';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const AUTOSAVE_KEY = 'autosave';
const SYMBOL_IDS = new Set(CROCHET_SYMBOLS.map((symbol) => symbol.id));
const COUNTED_STITCH_IDS = new Set<string>(COUNTED_STITCH_KINDS);
const COLOR_HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFinitePositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

const isFiberCraftMetadata = (value: unknown): boolean => {
  if (!isRecord(value) || (value.discipline !== 'crochet' && value.discipline !== 'cross-stitch')) return false;
  const stringFields = ['title','author','difficulty','materialClass','toolSize','license','notes','createdAt','updatedAt'] as const;
  return stringFields.every((field) => typeof value[field] === 'string') && Array.isArray(value.techniqueTags) && value.techniqueTags.every((tag) => typeof tag === 'string');
};

const isGauge = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return isFinitePositiveNumber(value.stitchCount) && isFinitePositiveNumber(value.rowCount) && isFinitePositiveNumber(value.span) && (value.unit === 'in' || value.unit === 'cm');
};

const isPolarChart = (value: unknown, paletteIds: ReadonlySet<string>): value is PolarChart => {
  if (!isRecord(value) || value.kind !== 'polar' || !Number.isInteger(value.rounds) || Number(value.rounds) <= 0 || !Array.isArray(value.nodes)) return false;
  const rounds = Number(value.rounds); const seen = new Set<string>();
  const validNodes = value.nodes.every((node) => {
    if (!isRecord(node)) return false;
    const round = Number(node.round); const angleIndex = Number(node.angleIndex); const stitchesInRound = Number(node.stitchesInRound); const key = `${round}:${angleIndex}`;
    if (seen.has(key)) return false; seen.add(key);
    return Number.isInteger(round) && round >= 0 && round < rounds && Number.isInteger(angleIndex) && angleIndex >= 0 && angleIndex < stitchesInRound && Number.isInteger(stitchesInRound) && stitchesInRound > 0 && (node.symbolId === null || (typeof node.symbolId === 'string' && SYMBOL_IDS.has(node.symbolId))) && (node.colorId === null || (typeof node.colorId === 'string' && paletteIds.has(node.colorId)));
  });
  if (!validNodes) return false;
  for (let round = 0; round < rounds; round += 1) {
    const roundNodes = value.nodes.filter((node) => isRecord(node) && node.round === round) as Record<string, unknown>[];
    if (roundNodes.length === 0) return false;
    const declaredCount = Number(roundNodes[0]?.stitchesInRound);
    if (!Number.isInteger(declaredCount) || declaredCount <= 0 || roundNodes.length !== declaredCount || !roundNodes.every((node) => node.stitchesInRound === declaredCount)) return false;
  }
  return true;
};

const isGridChart = (value: unknown, paletteIds: ReadonlySet<string>): value is GridChart => {
  if (!isRecord(value) || value.kind !== 'grid') return false;
  const rows = Number(value.rows); const cols = Number(value.cols); const aspectRatio = Number(value.aspectRatio);
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0 || !Number.isFinite(aspectRatio) || aspectRatio <= 0 || !Array.isArray(value.cells) || value.cells.length !== rows * cols) return false;
  const seen = new Set<string>();
  return value.cells.every((cell) => {
    if (!isRecord(cell)) return false;
    const row = Number(cell.row); const col = Number(cell.col); const key = `${row}:${col}`;
    if (seen.has(key)) return false; seen.add(key);
    return Number.isInteger(row) && row >= 0 && row < rows && Number.isInteger(col) && col >= 0 && col < cols && (cell.symbolId === null || (typeof cell.symbolId === 'string' && SYMBOL_IDS.has(cell.symbolId))) && (cell.colorId === null || (typeof cell.colorId === 'string' && paletteIds.has(cell.colorId)));
  });
};

const isHalfGrid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value * 2);
const isCountedThreadChart = (value: unknown, paletteIds: ReadonlySet<string>): value is CountedThreadChart => {
  if (!isRecord(value) || value.kind !== 'counted-thread') return false;
  const rows = Number(value.rows); const cols = Number(value.cols);
  if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0 || !Array.isArray(value.cells) || value.cells.length !== rows * cols || !Array.isArray(value.knots) || !Array.isArray(value.backstitches)) return false;
  const seen = new Set<string>();
  const cellsValid = value.cells.every((cell) => {
    if (!isRecord(cell)) return false; const row = Number(cell.row); const col = Number(cell.col); const key = `${row}:${col}`;
    if (seen.has(key)) return false; seen.add(key);
    return Number.isInteger(row) && row >= 0 && row < rows && Number.isInteger(col) && col >= 0 && col < cols && (cell.stitchKind === null || (typeof cell.stitchKind === 'string' && COUNTED_STITCH_IDS.has(cell.stitchKind))) && (cell.colorId === null || (typeof cell.colorId === 'string' && paletteIds.has(cell.colorId))) && (cell.stitchKind === null ? cell.colorId === null : cell.colorId !== null);
  });
  const validPoint = (point: unknown) => isRecord(point) && isHalfGrid(point.row) && point.row >= 0 && point.row <= rows && isHalfGrid(point.col) && point.col >= 0 && point.col <= cols;
  return cellsValid && value.knots.every((knot) => isRecord(knot) && typeof knot.id === 'string' && validPoint(knot.point) && typeof knot.colorId === 'string' && paletteIds.has(knot.colorId)) && value.backstitches.every((line) => isRecord(line) && typeof line.id === 'string' && validPoint(line.start) && validPoint(line.end) && JSON.stringify(line.start) !== JSON.stringify(line.end) && typeof line.colorId === 'string' && paletteIds.has(line.colorId));
};

const hasValidCrochetSettings = (value: Record<string, unknown>): boolean => {
  if (value.settings === undefined) return true;
  if (!isRecord(value.settings) || value.settings.crochet === undefined) return isRecord(value.settings);
  if (!isRecord(value.settings.crochet)) return false;
  const crochet = value.settings.crochet;
  if (!Array.isArray(crochet.targetRoundCounts) || !crochet.targetRoundCounts.every((count) => Number.isInteger(count) && Number(count) > 0 && Number(count) <= 10_000)) return false;
  const yarnWeight = crochet.yarnWeight;
  return yarnWeight === null || (Number.isInteger(yarnWeight) && Number(yarnWeight) >= 0 && Number(yarnWeight) <= 7);
};

const hasValidSwatchImages = (value: unknown): boolean => isRecord(value) && Object.values(value).every((image) => typeof image === 'string' && image.startsWith('data:'));

export const isRestorableFiberCraftDocument = (value: unknown): value is FiberCraftDocument => {
  if (!isRecord(value) || value.formatVersion !== 1 || !isFiberCraftMetadata(value.metadata) || !Array.isArray(value.palette) || value.palette.length === 0) return false;
  const paletteIds = new Set<string>();
  for (const color of value.palette) {
    if (!isRecord(color) || typeof color.id !== 'string' || color.id.trim() === '' || typeof color.label !== 'string' || typeof color.hex !== 'string' || !COLOR_HEX.test(color.hex) || (color.paletteCode !== undefined && typeof color.paletteCode !== 'string') || (color.paletteName !== undefined && typeof color.paletteName !== 'string') || paletteIds.has(color.id)) return false;
    paletteIds.add(color.id);
  }
  const chartValid = isPolarChart(value.chart, paletteIds) || isGridChart(value.chart, paletteIds) || isCountedThreadChart(value.chart, paletteIds);
  return chartValid && hasValidCrochetSettings(value) && isGauge(value.gauge) && hasValidSwatchImages(value.swatchImages) && Array.isArray(value.completedSteps) && value.completedSteps.every((step) => typeof step === 'string' && step.trim() !== '');
};

// Backward-compatible name retained while callers migrate to the discipline-neutral validator.
export const isRestorableCrochetDocument = isRestorableFiberCraftDocument;

export const createIndexedDbFiberCraftStore = (): FiberCraftStore => {
  const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, DB_VERSION); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.')); });
  return {
    async load() { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readonly'); const request = tx.objectStore(STORE_NAME).get(AUTOSAVE_KEY); request.onsuccess = () => { db.close(); resolve(isRestorableFiberCraftDocument(request.result) ? request.result : null); }; request.onerror = () => { db.close(); reject(request.error ?? new Error('Could not read the local Fiber Craft draft.')); }; }); },
    async save(document) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(document, AUTOSAVE_KEY); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save the local Fiber Craft draft.')); }; }); },
    async clear() { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(AUTOSAVE_KEY); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not clear the local Fiber Craft draft.')); }; }); },
  };
};
