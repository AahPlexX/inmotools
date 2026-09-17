import { describe, expect, it } from 'vitest';
import { adjustPhotoCrop, photoStraightenFromGuide } from '../../src/tools/photo/photo-crop';

describe('direct photo crop geometry', () => {
  it.each([
    ['east edge', 'e' as const, { x: 0, y: 0, width: 1, height: 1 }, -0.25, 0, { x: 0, y: 0, width: 0.75, height: 1 }],
    ['west edge', 'w' as const, { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }, 0.2, 0, { x: 0.3, y: 0.2, width: 0.4, height: 0.5 }],
    ['south-east corner', 'se' as const, { x: 0.1, y: 0.1, width: 0.6, height: 0.6 }, 0.15, 0.2, { x: 0.1, y: 0.1, width: 0.75, height: 0.8 }],
  ])('adjusts the %s without moving the opposite crop boundary', (_label, handle, crop, dx, dy, expected) => {
    expect(adjustPhotoCrop(crop, handle, dx, dy)).toEqual(expected);
  });

  it('clamps crop movement to the source frame', () => {
    expect(adjustPhotoCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, 'move', 0.8, -0.6)).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it('keeps resized crops above the minimum frame size', () => {
    const crop = adjustPhotoCrop({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, 'nw', 0.8, 0.8);
    expect(crop.x).toBeCloseTo(0.48, 6);
    expect(crop.y).toBeCloseTo(0.48, 6);
    expect(crop.width).toBeCloseTo(0.02, 6);
    expect(crop.height).toBeCloseTo(0.02, 6);
  });
});

describe('on-image straighten guide', () => {
  it('levels a traced horizontal reference line', () => {
    const correction = photoStraightenFromGuide({ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.3 });
    expect(correction).not.toBeNull();
    expect(correction).toBeCloseTo(-7.125, 2);
  });

  it('levels a traced vertical reference line against the nearest axis', () => {
    const correction = photoStraightenFromGuide({ x: 0.3, y: 0.1 }, { x: 0.4, y: 0.9 });
    expect(correction).not.toBeNull();
    expect(correction).toBeCloseTo(7.125, 2);
  });

  it('rejects a gesture too short to establish a reference line', () => {
    expect(photoStraightenFromGuide({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.501 })).toBeNull();
  });
});
