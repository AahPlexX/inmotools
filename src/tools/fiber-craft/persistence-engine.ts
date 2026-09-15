import { CROCHET_SYMBOLS } from './engines/symbol-library';
import type { FiberCraftDocument, PolarChart } from './fiber-craft-types';

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPolarChart = (value: unknown, paletteIds: ReadonlySet<string>): value is PolarChart => {
  if (!isRecord(value) || value.kind !== 'polar' || !Number.isInteger(value.rounds) || Number(value.rounds) <= 0) return false;
  if (!Array.isArray(value.nodes)) return false;
  const rounds = Number(value.rounds);
  return value.nodes.every((node) => {
    if (!isRecord(node)) return false;
    const round = Number(node.round);
    const angleIndex = Number(node.angleIndex);
    const stitchesInRound = Number(node.stitchesInRound);
    const symbolId = node.symbolId;
    const colorId = node.colorId;
    return Number.isInteger(round) && round >= 0 && round < rounds
      && Number.isInteger(angleIndex) && angleIndex >= 0 && angleIndex < stitchesInRound
      && Number.isInteger(stitchesInRound) && stitchesInRound > 0
      && (symbolId === null || (typeof symbolId === 'string' && SYMBOL_IDS.has(symbolId)))
      && (colorId === null || (typeof colorId === 'string' && paletteIds.has(colorId)));
  });
};

export const isRestorableCrochetDocument = (value: unknown): value is FiberCraftDocument => {
  if (!isRecord(value) || value.formatVersion !== 1 || !isRecord(value.metadata)) return false;
  if (value.metadata.discipline !== 'crochet' || !Array.isArray(value.palette)) return false;
  const paletteIds = new Set<string>();
  for (const color of value.palette) {
    if (!isRecord(color) || typeof color.id !== 'string' || typeof color.label !== 'string' || typeof color.hex !== 'string') return false;
    if (paletteIds.has(color.id)) return false;
    paletteIds.add(color.id);
  }
  return isPolarChart(value.chart, paletteIds)
    && isRecord(value.swatchImages)
    && Array.isArray(value.completedSteps);
};

export const createIndexedDbFiberCraftStore = (): FiberCraftStore => {
  const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.'));
  });

  return {
    async load() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(AUTOSAVE_KEY);
        request.onsuccess = () => {
          db.close();
          resolve(isRestorableCrochetDocument(request.result) ? request.result : null);
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error('Could not read the local Fiber Craft draft.'));
        };
      });
    },
    async save(document) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(document, AUTOSAVE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Could not save the local Fiber Craft draft.'));
        };
      });
    },
    async clear() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Could not clear the local Fiber Craft draft.'));
        };
      });
    },
  };
};
