import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../../src/tools/lattice/state-engine';

describe('JSON Lattice history engine', () => {
  it('caps undo history at 100 committed states and supports undo/redo', () => {
    let history = createHistory({ value: 0 });
    for (let value = 1; value <= 105; value += 1) history = commitHistory(history, { value });
    expect(history.past).toHaveLength(100);
    expect(history.present).toEqual({ value: 105 });
    history = undoHistory(history);
    expect(history.present).toEqual({ value: 104 });
    expect(history.future).toEqual([{ value: 105 }]);
    history = redoHistory(history);
    expect(history.present).toEqual({ value: 105 });
  });

  it('clears redo history after a new branch commit', () => {
    let history = commitHistory(createHistory({ value: 0 }), { value: 1 });
    history = commitHistory(history, { value: 2 });
    history = undoHistory(history);
    history = commitHistory(history, { value: 9 });
    expect(history.future).toEqual([]);
    expect(history.present).toEqual({ value: 9 });
  });
});
