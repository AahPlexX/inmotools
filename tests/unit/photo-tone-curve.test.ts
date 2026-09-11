import { describe, expect, test } from 'vitest';
import {
  addTonePoint,
  addTonePointInLargestGap,
  canonicalToneCurve,
  removeTonePoint,
  resetToneCurve,
  updateTonePoint,
} from '../../src/tools/photo/photo-tone-curve';

describe('Photo Studio tone curve editing', () => {
  test('canonical curve anchors input endpoints and clamps values', () => {
    expect(canonicalToneCurve([
      { x: 0.2, y: -1 },
      { x: 0.8, y: 2 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  test('adds points in sorted input order without colliding with endpoints', () => {
    const curve = addTonePoint(resetToneCurve(), 0.75, 0.6);
    const next = addTonePoint(curve, 0.25, 0.4);
    expect(next.map((point) => point.x)).toEqual([0, 0.25, 0.75, 1]);
    expect(addTonePoint(next, 0, 0.5)).toEqual(next);
  });

  test('updates internal points while keeping endpoints fixed on the input axis', () => {
    const curve = addTonePoint(resetToneCurve(), 0.5, 0.5);
    expect(updateTonePoint(curve, 1, { x: 0.8, y: 0.7 })[1]).toEqual({ x: 0.8, y: 0.7 });
    expect(updateTonePoint(curve, 0, { x: 0.4, y: 0.2 })[0]).toEqual({ x: 0, y: 0.2 });
  });

  test('does not allow internal points to cross neighboring points', () => {
    const curve = canonicalToneCurve([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.7 },
      { x: 1, y: 1 },
    ]);
    const next = updateTonePoint(curve, 1, { x: 0.99 });
    expect(next[1].x).toBeLessThan(next[2].x);
  });

  test('only internal points can be removed', () => {
    const curve = addTonePoint(resetToneCurve(), 0.5, 0.5);
    expect(removeTonePoint(curve, 0)).toEqual(curve);
    expect(removeTonePoint(curve, 2)).toEqual(curve);
    expect(removeTonePoint(curve, 1)).toEqual(resetToneCurve());
  });

  test('add point chooses the largest gap and preserves the local linear interpolation', () => {
    const curve = canonicalToneCurve([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.4 },
      { x: 1, y: 1 },
    ]);
    const next = addTonePointInLargestGap(curve);
    expect(next).toHaveLength(4);
    expect(next[2].x).toBeCloseTo(0.625);
    expect(next[2].y).toBeCloseTo(0.7);
  });
});
