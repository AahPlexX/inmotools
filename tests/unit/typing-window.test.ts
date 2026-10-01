import { describe, expect, test } from 'vitest';
import { PASSAGE_WINDOW_LINES, passageWindowStartLine } from '../../src/tools/typing/typing-window';

describe('passageWindowStartLine', () => {
  test('shows three lines at a time', () => {
    expect(PASSAGE_WINDOW_LINES).toBe(3);
  });

  test('the first line and the second line stay at the top of the window', () => {
    expect(passageWindowStartLine(0, 10)).toBe(0);
    expect(passageWindowStartLine(1, 10)).toBe(0);
  });

  test('from the third line on, the active line stays on the middle row', () => {
    expect(passageWindowStartLine(2, 10)).toBe(1);
    expect(passageWindowStartLine(5, 10)).toBe(4);
    expect(passageWindowStartLine(7, 10)).toBe(6);
  });

  test('never scrolls past the point where the last line is the bottom row', () => {
    expect(passageWindowStartLine(8, 10)).toBe(7);
    expect(passageWindowStartLine(9, 10)).toBe(7);
  });

  test('a passage that fits the window never scrolls', () => {
    expect(passageWindowStartLine(0, 1)).toBe(0);
    expect(passageWindowStartLine(1, 2)).toBe(0);
    expect(passageWindowStartLine(2, 3)).toBe(0);
  });

  test('backspacing to an earlier line scrolls back up', () => {
    expect(passageWindowStartLine(6, 12)).toBe(5);
    expect(passageWindowStartLine(3, 12)).toBe(2);
  });

  test('out-of-range and fractional inputs are clamped rather than producing a bad offset', () => {
    expect(passageWindowStartLine(-4, 10)).toBe(0);
    expect(passageWindowStartLine(99, 10)).toBe(7);
    expect(passageWindowStartLine(3.9, 10.9)).toBe(2);
    expect(passageWindowStartLine(0, 0)).toBe(0);
    expect(passageWindowStartLine(Number.NaN, 10)).toBe(0);
  });

  test('honours a different window height', () => {
    expect(passageWindowStartLine(5, 20, 5)).toBe(3);
    expect(passageWindowStartLine(19, 20, 5)).toBe(15);
  });
});
