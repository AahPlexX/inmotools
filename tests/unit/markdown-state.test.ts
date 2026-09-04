import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../../src/tools/markdown/state-engine';

describe('undo/redo history', () => {
  it('creates a history with an empty past and future', () => {
    const history = createHistory('start');
    expect(history.present).toBe('start');
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
  });

  it('moves the current present into past and clears future on commit', () => {
    const history = commitHistory(createHistory('a'), 'b');
    expect(history.present).toBe('b');
    expect(history.past).toEqual(['a']);
    expect(history.future).toEqual([]);
  });

  it('undo restores the previous present and pushes the current one into future', () => {
    const history = commitHistory(createHistory('a'), 'b');
    const undone = undoHistory(history);
    expect(undone.present).toBe('a');
    expect(undone.past).toEqual([]);
    expect(undone.future).toEqual(['b']);
  });

  it('undo is a no-op when there is nothing in the past', () => {
    const history = createHistory('a');
    expect(undoHistory(history)).toBe(history);
  });

  it('redo restores the next future entry and clears future of it', () => {
    const history = commitHistory(createHistory('a'), 'b');
    const undone = undoHistory(history);
    const redone = redoHistory(undone);
    expect(redone.present).toBe('b');
    expect(redone.past).toEqual(['a']);
    expect(redone.future).toEqual([]);
  });

  it('redo is a no-op when there is nothing in the future', () => {
    const history = createHistory('a');
    expect(redoHistory(history)).toBe(history);
  });

  it('a new commit after an undo discards the redo branch', () => {
    const history = commitHistory(createHistory('a'), 'b');
    const undone = undoHistory(history);
    const recommitted = commitHistory(undone, 'c');
    expect(recommitted.present).toBe('c');
    expect(recommitted.future).toEqual([]);
  });

  it('caps the past at 100 entries, dropping the oldest first', () => {
    let history = createHistory(0);
    for (let i = 1; i <= 105; i += 1) {
      history = commitHistory(history, i);
    }
    expect(history.past).toHaveLength(100);
    expect(history.past[0]).toBe(5);
    expect(history.past[history.past.length - 1]).toBe(104);
    expect(history.present).toBe(105);
  });
});
