import type { FiberCraftDocument } from './fiber-craft-types';

const HISTORY_LIMIT = 100;

export interface FiberCraftHistory {
  readonly past: readonly FiberCraftDocument[];
  readonly present: FiberCraftDocument;
  readonly future: readonly FiberCraftDocument[];
}

export const createFiberCraftHistory = (present: FiberCraftDocument): FiberCraftHistory => ({
  past: [],
  present,
  future: [],
});

export const commitFiberCraftHistory = (
  history: FiberCraftHistory,
  present: FiberCraftDocument,
): FiberCraftHistory => ({
  past: [...history.past, history.present].slice(-HISTORY_LIMIT),
  present,
  future: [],
});

export const undoFiberCraftHistory = (history: FiberCraftHistory): FiberCraftHistory => {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
  };
};

export const redoFiberCraftHistory = (history: FiberCraftHistory): FiberCraftHistory => {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future,
  };
};
