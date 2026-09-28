import { describe, expect, test } from 'vitest';
import { sampleNeutralPatch, solveNeutralWhiteBalance } from '../../src/tools/photo/photo-analysis';
import { whiteBalanceMultipliers } from '../../src/tools/photo/photo-engine';

function patchFor(temperature: number, tint: number, grey = 0.4) {
  // A grey card photographed under a cast that the given correction exactly removes.
  const [r, g, b] = whiteBalanceMultipliers(temperature, tint);
  return { red: grey / r, green: grey / g, blue: grey / b, count: 25 };
}

describe('white-balance eyedropper', () => {
  test('recovers the correction that neutralizes a known cast', () => {
    for (const [temperature, tint] of [[0.4, 0], [-0.55, 0.2], [0.1, -0.35], [0, 0]]) {
      const solved = solveNeutralWhiteBalance(patchFor(temperature, tint));
      expect(solved.temperature).toBeCloseTo(temperature, 2);
      expect(solved.tint).toBeCloseTo(tint, 2);
      expect(solved.limited).toBe(false);
    }
  });

  test('flags targets it cannot neutralize instead of guessing', () => {
    expect(solveNeutralWhiteBalance({ red: 0, green: 0, blue: 0, count: 0 })).toEqual({ temperature: 0, tint: 0, limited: true });
    // A cast stronger than the slider range: best effort, flagged as limited.
    const strong = solveNeutralWhiteBalance({ red: 0.1, green: 0.3, blue: 0.6, count: 25 });
    expect(strong.limited).toBe(true);
    expect(strong.temperature).toBeGreaterThan(0.9);
  });

  test('averages a patch in linear light and skips transparent pixels', () => {
    const width = 3; const height = 1;
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 90, 90, 90, 0]);
    const patch = sampleNeutralPatch(pixels, width, height, 1, 0, 1);
    expect(patch.count).toBe(2);
    expect(patch.red).toBeCloseTo(0.5, 12);
  });
});
