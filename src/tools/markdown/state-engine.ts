import type { ProjectHistory } from './markdown-types';

// Undo/redo history reducer, mirroring the same {past, present, future}
// pattern already used by this catalog's other stateful tools (JSON Lattice
// Studio, PlanCraft Studio), capped at the same 100-entry history limit.

const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): ProjectHistory<T> => ({
  past: [],
  present,
  future: [],
});

export const commitHistory = <T>(history: ProjectHistory<T>, next: T): ProjectHistory<T> => ({
  past: [...history.past, history.present].slice(-HISTORY_LIMIT),
  present: next,
  future: [],
});

export const undoHistory = <T>(history: ProjectHistory<T>): ProjectHistory<T> => {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
};

export const redoHistory = <T>(history: ProjectHistory<T>): ProjectHistory<T> => {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future,
  };
};
