import { describe, expect, it } from 'vitest';
import { snapTrimRange } from '../../src/tools/video/video-engine';

describe('lossless keyframe trim range', () => {
  it('snaps the start backward and the end forward to preserve complete GOPs', () => {
    expect(snapTrimRange(2.3, 7.1, [0, 2, 4, 6, 8], 10)).toEqual({
      requestedStart: 2.3,
      requestedEnd: 7.1,
      start: 2,
      end: 8,
      startAdjusted: true,
      endAdjusted: true,
    });
  });

  it('clamps requests to media bounds and accepts an exact full-duration range', () => {
    expect(snapTrimRange(-3, 14, [0, 2, 4, 6, 8], 10)).toEqual({
      requestedStart: 0,
      requestedEnd: 10,
      start: 0,
      end: 10,
      startAdjusted: false,
      endAdjusted: false,
    });
  });

  it('rejects inverted ranges and media without a usable keyframe', () => {
    expect(() => snapTrimRange(8, 2, [0, 4, 8], 10)).toThrow(/start.*end/i);
    expect(() => snapTrimRange(1, 2, [], 10)).toThrow(/keyframe/i);
  });
});
