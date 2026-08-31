export interface LatticeHistory<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): LatticeHistory<T> => ({
  past: [],
  present,
  future: [],
});

export const commitHistory = <T>(history: LatticeHistory<T>, next: T): LatticeHistory<T> => ({
  past: [...history.past, history.present].slice(-HISTORY_LIMIT),
  present: next,
  future: [],
});

export const undoHistory = <T>(history: LatticeHistory<T>): LatticeHistory<T> => {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
};

export const redoHistory = <T>(history: LatticeHistory<T>): LatticeHistory<T> => {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future,
  };
};
