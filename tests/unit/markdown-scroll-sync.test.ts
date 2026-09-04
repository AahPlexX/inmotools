import { describe, expect, it } from 'vitest';
import { computeScrollOffset } from '../../src/tools/markdown/scroll-sync';

const anchors = [
  { sourceLine: 1, offsetTop: 0 },
  { sourceLine: 5, offsetTop: 100 },
  { sourceLine: 20, offsetTop: 500 },
];

describe('scroll synchronization interpolation', () => {
  it('returns the first anchor offset when the current line is at or before it', () => {
    expect(computeScrollOffset(anchors, 1)).toBe(0);
    expect(computeScrollOffset(anchors, -5)).toBe(0);
  });

  it('returns the last anchor offset when the current line is at or after it', () => {
    expect(computeScrollOffset(anchors, 20)).toBe(500);
    expect(computeScrollOffset(anchors, 999)).toBe(500);
  });

  it('interpolates linearly between two bounding anchors', () => {
    // Halfway between line 1 (offset 0) and line 5 (offset 100) is line 3.
    expect(computeScrollOffset(anchors, 3)).toBe(50);
  });

  it('interpolates correctly across an anchor pair with a large line span, such as behind a large diagram or table', () => {
    // Anchors 5..20 span 15 lines and 400px; line 12.5 is 50% of the way through.
    expect(computeScrollOffset(anchors, 12.5)).toBe(300);
  });

  it('returns 0 when given no anchors at all', () => {
    expect(computeScrollOffset([], 10)).toBe(0);
  });

  it('returns the single anchor offset when only one anchor is available', () => {
    expect(computeScrollOffset([{ sourceLine: 4, offsetTop: 40 }], 100)).toBe(40);
  });

  it('does not require anchors to already be sorted by source line', () => {
    const unsorted = [
      { sourceLine: 20, offsetTop: 500 },
      { sourceLine: 1, offsetTop: 0 },
      { sourceLine: 5, offsetTop: 100 },
    ];
    expect(computeScrollOffset(unsorted, 3)).toBe(50);
  });
});
