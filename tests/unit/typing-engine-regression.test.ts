import { describe, expect, it } from 'vitest';
import { computeMetrics, extendTarget, finish, initState, isCleanlyCompleted, isTargetCompleted, ngramLatencies, pressKey } from '../../src/tools/typing/typing-engine';

describe('typing engine regression contracts', () => {
  it('keeps strict mode on the incorrect character until it is corrected', () => {
    let state = initState('cat', { errorMode: 'strict' });
    state = pressKey(state, 'c', 'KeyC', 100);
    state = pressKey(state, 'x', 'KeyX', 200);
    expect(state.cursor).toBe(1);
    expect(state.cells[1]?.state).toBe('incorrect');

    state = pressKey(state, 'a', 'KeyA', 300);
    expect(state.cursor).toBe(2);
    expect(state.cells[1]?.state).toBe('correct');
  });

  it('clears the current strict-mode error with Backspace without erasing the preceding correct character', () => {
    let state = initState('cat', { errorMode: 'strict' });
    state = pressKey(state, 'c', 'KeyC', 100);
    state = pressKey(state, 'x', 'KeyX', 200);
    state = pressKey(state, 'Backspace', 'Backspace', 300);
    expect(state.cursor).toBe(1);
    expect(state.cells[0]?.state).toBe('correct');
    expect(state.cells[1]?.state).toBe('pending');
  });

  it('does not inflate final correct-character metrics when a correct character is retyped after Backspace', () => {
    let state = initState('ab');
    state = pressKey(state, 'a', 'KeyA', 100);
    state = pressKey(state, 'Backspace', 'Backspace', 200);
    state = pressKey(state, 'a', 'KeyA', 300);
    state = pressKey(state, 'b', 'KeyB', 400);
    state = finish(state, 'completed', 500);
    const metrics = computeMetrics(state);
    expect(metrics.correctChars).toBe(2);
    expect(metrics.accuracy).toBe(100);
  });

  it('treats Enter as the expected newline character without losing the raw keyboard event value', () => {
    let state = initState('a\nb');
    state = pressKey(state, 'a', 'KeyA', 100);
    state = pressKey(state, 'Enter', 'Enter', 200);
    state = pressKey(state, 'b', 'KeyB', 300);

    expect(state.cursor).toBe(3);
    expect(state.correctKeystrokes).toBe(3);
    expect(state.events[1]).toMatchObject({ key: 'Enter', expected: '\n', correct: true });
    expect(state.cells[1]).toMatchObject({ typed: '\n', state: 'correct' });
    expect(isCleanlyCompleted(state)).toBe(true);
    expect(isTargetCompleted(state)).toBe(true);
  });

  it('completes a fully traversed forgiving target while retaining the error for scoring', () => {
    let state = initState('cat', { errorMode: 'forgiving' });
    state = pressKey(state, 'c', 'KeyC', 100);
    state = pressKey(state, 'x', 'KeyX', 200);
    state = pressKey(state, 't', 'KeyT', 300);

    expect(state.cursor).toBe(3);
    expect(state.cells[1]).toMatchObject({ typed: 'x', state: 'incorrect' });
    expect(state.incorrectKeystrokes).toBe(1);
    expect(state.missedChars).toBe(1);
    expect(isCleanlyCompleted(state)).toBe(false);
    expect(isTargetCompleted(state)).toBe(true);
  });

  it('computes the conventional median for an even number of n-gram observations', () => {
    let state = initState('abab');
    state = pressKey(state, 'a', 'KeyA', 0);
    state = pressKey(state, 'b', 'KeyB', 100);
    state = pressKey(state, 'a', 'KeyA', 200);
    state = pressKey(state, 'b', 'KeyB', 500);

    const ab = ngramLatencies(state.events, 2).find((row) => row.gram === 'ab');
    expect(ab).toMatchObject({ count: 2, meanMs: 200, medianMs: 200, errors: 0, accuracy: 100 });
  });

  it('extends an active target without resetting cursor, events, or timing', () => {
    let state = initState('go');
    state = pressKey(state, 'g', 'KeyG', 100);
    const extended = extendTarget(state, ' faster');
    expect(extended.targetText).toBe('go faster');
    expect(extended.cursor).toBe(1);
    expect(extended.startedAt).toBe(100);
    expect(extended.events).toHaveLength(1);
    expect(extended.cells).toHaveLength('go faster'.length);
  });
});