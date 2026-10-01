import { describe, expect, test } from 'vitest';
import {
  applySelectiveColor,
  neutralSelectiveColor,
  normalizeSelectiveColor,
  selectiveColorWeights,
} from '../../src/tools/photo/photo-selective-color';

function settings(patch: Parameters<typeof normalizeSelectiveColor>[0]) {
  return normalizeSelectiveColor(patch)!;
}

describe('selective color', () => {
  test('family weights follow the sorted-channel model', () => {
    // Pure red: max 1, mid 0 → reds 1; nothing else chromatic.
    expect(selectiveColorWeights(1, 0, 0)).toMatchObject({ reds: 1, yellows: 0, magentas: 0 });
    // Orange (1, 0.5, 0): reds = max − mid = 0.5, yellows = mid − min = 0.5.
    expect(selectiveColorWeights(1, 0.5, 0)).toMatchObject({ reds: 0.5, yellows: 0.5 });
    // Mid-grey is fully neutral, not white or black.
    expect(selectiveColorWeights(0.5, 0.5, 0.5)).toMatchObject({ neutrals: 1, whites: 0, blacks: 0, reds: 0 });
    // Near-white and near-black.
    expect(selectiveColorWeights(0.9, 0.9, 0.9).whites).toBeCloseTo(0.8, 12);
    expect(selectiveColorWeights(0.1, 0.1, 0.1).blacks).toBeCloseTo(0.8, 12);
  });

  test('adding cyan to reds lowers red only in red pixels', () => {
    const sc = settings({ ranges: { reds: { cyan: 0.5 } } });
    // Relative: red channel ink is 1 − 0.8 = 0.2; 50 % more → red drops by 0.1 × reds weight (0.8 − 0.2 = 0.6).
    const [r, g, b] = applySelectiveColor([0.8, 0.2, 0.2], sc);
    expect(r).toBeCloseTo(0.8 - 0.6 * 0.2 * 0.5, 12);
    expect([g, b]).toEqual([0.2, 0.2]);
    expect(applySelectiveColor([0.2, 0.8, 0.2], sc)).toEqual([0.2, 0.8, 0.2]);
  });

  test('absolute mode adds ink directly and black affects all channels', () => {
    const sc = settings({ mode: 'absolute', ranges: { neutrals: { black: 0.1 } } });
    const [r, g, b] = applySelectiveColor([0.5, 0.5, 0.5], sc);
    expect([r, g, b].map((value) => Math.round(value * 1000) / 1000)).toEqual([0.4, 0.4, 0.4]);
  });

  test('neutral settings normalize to null and values are bounded', () => {
    expect(normalizeSelectiveColor(neutralSelectiveColor())).toBeNull();
    expect(normalizeSelectiveColor({ ranges: { blues: { yellow: 7 } } })?.ranges.blues.yellow).toBe(1);
    expect(normalizeSelectiveColor({ mode: 'weird', ranges: { reds: { cyan: 0.2 } } })?.mode).toBe('relative');
  });
});
