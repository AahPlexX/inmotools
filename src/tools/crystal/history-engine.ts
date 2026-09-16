import type { CrystalDocument } from './crystal-types';

export interface CrystalHistory {
  readonly past: readonly CrystalDocument[];
  readonly present: CrystalDocument;
  readonly future: readonly CrystalDocument[];
  readonly imported: CrystalDocument;
}

export function createCrystalHistory(document: CrystalDocument): CrystalHistory {
  return { past:[], present:document, future:[], imported:document };
}

export function commitCrystalHistory(history: CrystalHistory, next: CrystalDocument, limit = 100): CrystalHistory {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be a positive integer.');
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return {
    ...history,
    past:past.slice(Math.max(0, past.length - limit)),
    present:next,
    future:[],
  };
}

export function undoCrystalHistory(history: CrystalHistory): CrystalHistory {
  if (!history.past.length) return history;
  const present = history.past[history.past.length - 1]!;
  return {
    ...history,
    past:history.past.slice(0, -1),
    present,
    future:[history.present, ...history.future],
  };
}

export function redoCrystalHistory(history: CrystalHistory): CrystalHistory {
  if (!history.future.length) return history;
  const [present, ...future] = history.future;
  return {
    ...history,
    past:[...history.past, history.present],
    present:present!,
    future,
  };
}

export function resetCrystalHistory(history: CrystalHistory): CrystalHistory {
  if (history.present === history.imported) return { ...history, future:[] };
  return {
    ...history,
    past:[...history.past, history.present].slice(-100),
    present:history.imported,
    future:[],
  };
}
