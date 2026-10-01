import { describe, expect, test } from 'vitest';
import {
  applyBilateralSmoothing,
  applyDefringe,
  applyDetailFilters,
  applyFrequencySeparationDetail,
  applyGaussianBlur,
  applyHighPass,
  applyHotPixelCorrection,
  applyMedianFilter,
  applyMoireReduction,
  isDetailFiltersNeutral,
  NEUTRAL_DETAIL_FILTERS,
  normalizeDetailFilters,
} from '../../src/tools/photo/photo-detail-filters';

function checkerboard(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const on = (x + y) % 2 === 0;
      data[offset] = on ? 255 : 0;
      data[offset + 1] = on ? 255 : 0;
      data[offset + 2] = on ? 255 : 0;
      data[offset + 3] = 255;
    }
  }
  return data;
}

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

describe('normalization and neutrality', () => {
  test('undefined filters normalize to the neutral defaults and are reported neutral', () => {
    expect(normalizeDetailFilters(undefined)).toEqual(NEUTRAL_DETAIL_FILTERS);
    expect(isDetailFiltersNeutral(undefined)).toBe(true);
    expect(isDetailFiltersNeutral(NEUTRAL_DETAIL_FILTERS)).toBe(true);
  });

  test('any single non-zero control makes the set non-neutral', () => {
    expect(isDetailFiltersNeutral({ ...NEUTRAL_DETAIL_FILTERS, gaussianBlur: 0.2 })).toBe(false);
    expect(isDetailFiltersNeutral({ ...NEUTRAL_DETAIL_FILTERS, frequencySeparationDetail: -0.3 })).toBe(false);
    expect(isDetailFiltersNeutral({ ...NEUTRAL_DETAIL_FILTERS, defringe: { hue: 300, range: 30, amount: 0.1 } })).toBe(false);
  });

  test('out-of-range values clamp to their bounds', () => {
    const normalized = normalizeDetailFilters({
      gaussianBlur: 5, medianFilter: -1, bilateralSmoothing: 2, highPass: -5,
      frequencySeparationDetail: 5, defringe: { hue: 900, range: 500, amount: 3 },
      moireReduction: 9, hotPixelCorrection: -9,
    });
    expect(normalized.gaussianBlur).toBe(1);
    expect(normalized.medianFilter).toBe(0);
    expect(normalized.bilateralSmoothing).toBe(1);
    expect(normalized.highPass).toBe(0);
    expect(normalized.frequencySeparationDetail).toBe(1);
    expect(normalized.defringe.hue).toBe(180);
    expect(normalized.defringe.range).toBe(90);
    expect(normalized.defringe.amount).toBe(1);
  });
});

describe('gaussian blur', () => {
  test('zero amount is a no-op', () => {
    const data = checkerboard(4, 4);
    const untouched = Uint8ClampedArray.from(data);
    applyGaussianBlur(data, 4, 4, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('softens a checkerboard toward mid-gray', () => {
    const data = checkerboard(8, 8);
    applyGaussianBlur(data, 8, 8, 1);
    // Interior pixels move away from pure 0/255 toward an intermediate value.
    const centerOffset = (4 * 8 + 4) * 4;
    expect(data[centerOffset]).toBeGreaterThan(20);
    expect(data[centerOffset]).toBeLessThan(235);
  });
});

describe('median filter', () => {
  test('zero amount is a no-op', () => {
    const data = checkerboard(5, 5);
    const untouched = Uint8ClampedArray.from(data);
    applyMedianFilter(data, 5, 5, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('removes an isolated single-pixel spike that a blur would only soften', () => {
    const data = solid(5, 5, 20, 20, 20);
    const spikeOffset = (2 * 5 + 2) * 4;
    data[spikeOffset] = 250; data[spikeOffset + 1] = 250; data[spikeOffset + 2] = 250;
    applyMedianFilter(data, 5, 5, 1);
    // The median of a mostly-uniform neighborhood erases an isolated outlier entirely.
    expect(data[spikeOffset]).toBe(20);
  });
});

describe('bilateral smoothing', () => {
  test('zero amount is a no-op', () => {
    const data = checkerboard(6, 6);
    const untouched = Uint8ClampedArray.from(data);
    applyBilateralSmoothing(data, 6, 6, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('a uniform region is unaffected regardless of amount', () => {
    const data = solid(5, 5, 100, 120, 140);
    applyBilateralSmoothing(data, 5, 5, 1);
    const centerOffset = (2 * 5 + 2) * 4;
    expect(data[centerOffset]).toBe(100);
    expect(data[centerOffset + 1]).toBe(120);
    expect(data[centerOffset + 2]).toBe(140);
  });
});

describe('high-pass detail', () => {
  test('zero amount is a no-op', () => {
    const data = checkerboard(8, 8);
    const untouched = Uint8ClampedArray.from(data);
    applyHighPass(data, 8, 8, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('a uniform region is unaffected (no detail to amplify)', () => {
    const data = solid(6, 6, 128, 128, 128);
    applyHighPass(data, 6, 6, 1);
    expect(Array.from(data).every((value, index) => index % 4 === 3 || value === 128)).toBe(true);
  });
});

describe('frequency separation detail', () => {
  test('zero detail is a no-op', () => {
    const data = checkerboard(8, 8);
    const untouched = Uint8ClampedArray.from(data);
    applyFrequencySeparationDetail(data, 8, 8, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('negative detail softens toward the low-frequency base; positive boosts away from it', () => {
    // A lower-contrast checkerboard (64/192, not 0/255) so a doubled residual has headroom
    // before clamping, letting the boosted case genuinely move farther than the original.
    function midContrastCheckerboard(): Uint8ClampedArray {
      const data = new Uint8ClampedArray(8 * 8 * 4);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const offset = (y * 8 + x) * 4;
          const on = (x + y) % 2 === 0;
          const value = on ? 192 : 64;
          data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
        }
      }
      return data;
    }
    const softened = midContrastCheckerboard();
    applyFrequencySeparationDetail(softened, 8, 8, -1);
    const boosted = midContrastCheckerboard();
    applyFrequencySeparationDetail(boosted, 8, 8, 1);
    const centerOffset = (4 * 8 + 4) * 4;
    const original = midContrastCheckerboard()[centerOffset];
    const low = 128; // the low-frequency base a checkerboard blurs toward
    // At detail=-1 the high-frequency residual is fully removed, landing on the low-frequency base.
    // At detail=+1 the residual is doubled, pushing further from the base than the untouched checkerboard.
    expect(Math.abs(softened[centerOffset] - low)).toBeLessThan(Math.abs(original - low));
    expect(Math.abs(boosted[centerOffset] - low)).toBeGreaterThan(Math.abs(original - low));
  });
});

describe('defringe', () => {
  test('zero amount is a no-op', () => {
    const data = solid(5, 5, 200, 50, 220);
    const untouched = Uint8ClampedArray.from(data);
    applyDefringe(data, 5, 5, { hue: 300, range: 30, amount: 0 });
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('desaturates a matching-hue pixel sitting on a strong luminance edge', () => {
    const data = solid(5, 5, 20, 20, 20);
    // A magenta-ish fringe pixel (~hue 300) next to a bright neighbor, forming a strong edge.
    const fringeOffset = (2 * 5 + 2) * 4;
    data[fringeOffset] = 220; data[fringeOffset + 1] = 40; data[fringeOffset + 2] = 220;
    const brightOffset = (2 * 5 + 3) * 4;
    data[brightOffset] = 255; data[brightOffset + 1] = 255; data[brightOffset + 2] = 255;
    const before = data[fringeOffset] - data[fringeOffset + 1];
    applyDefringe(data, 5, 5, { hue: 300, range: 30, amount: 1 });
    const after = data[fringeOffset] - data[fringeOffset + 1];
    expect(after).toBeLessThan(before);
  });

  test('a hue outside the targeted band is left untouched', () => {
    const data = solid(5, 5, 20, 20, 20);
    const offset = (2 * 5 + 2) * 4;
    data[offset] = 40; data[offset + 1] = 220; data[offset + 2] = 40; // green, hue ~120
    const untouched = Uint8ClampedArray.from(data);
    applyDefringe(data, 5, 5, { hue: 300, range: 20, amount: 1 });
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });
});

describe('moire reduction', () => {
  test('zero amount is a no-op', () => {
    const data = checkerboard(6, 6);
    const untouched = Uint8ClampedArray.from(data);
    applyMoireReduction(data, 6, 6, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('softens a busy repetitive pattern while leaving a flat region untouched', () => {
    const data = checkerboard(8, 8);
    // Make the top-left 3x3 flat (no local energy) so it should stay exactly as-is.
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const offset = (y * 8 + x) * 4;
        data[offset] = 128; data[offset + 1] = 128; data[offset + 2] = 128;
      }
    }
    const flatBefore = data[(1 * 8 + 1) * 4];
    const busyBefore = data[(5 * 8 + 5) * 4];
    applyMoireReduction(data, 8, 8, 1);
    expect(data[(1 * 8 + 1) * 4]).toBe(flatBefore);
    expect(data[(5 * 8 + 5) * 4]).not.toBe(busyBefore);
  });
});

describe('hot pixel correction', () => {
  test('zero amount is a no-op', () => {
    const data = solid(5, 5, 30, 30, 30);
    const untouched = Uint8ClampedArray.from(data);
    applyHotPixelCorrection(data, 5, 5, 0);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('replaces an isolated hot pixel with its neighborhood median', () => {
    const data = solid(5, 5, 30, 30, 30);
    const hotOffset = (2 * 5 + 2) * 4;
    data[hotOffset] = 255; data[hotOffset + 1] = 255; data[hotOffset + 2] = 255;
    applyHotPixelCorrection(data, 5, 5, 1);
    expect(data[hotOffset]).toBe(30);
  });

  test('leaves the interior of a wide bright block unchanged (only a true isolated pixel qualifies)', () => {
    // A 5-pixel-wide bright block in a 9x9 canvas: an interior/edge block pixel has a majority
    // of same-value 8-neighbors, so its neighborhood median matches it — only the block's own
    // corners (a minority-neighbor case even for a real feature) are expected to shift.
    const data = solid(9, 9, 30, 30, 30);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        const offset = (y * 9 + x) * 4;
        data[offset] = 220; data[offset + 1] = 220; data[offset + 2] = 220;
      }
    }
    applyHotPixelCorrection(data, 9, 9, 1);
    const centerOffset = (4 * 9 + 4) * 4;
    const edgeOffset = (2 * 9 + 4) * 4; // top edge of the block, not a corner
    expect(data[centerOffset]).toBe(220);
    expect(data[edgeOffset]).toBe(220);
  });
});

describe('applyDetailFilters combined pipeline', () => {
  test('a fully neutral filter set is a no-op', () => {
    const data = checkerboard(6, 6);
    const untouched = Uint8ClampedArray.from(data);
    applyDetailFilters(data, 6, 6, NEUTRAL_DETAIL_FILTERS);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('undefined filters is a no-op', () => {
    const data = checkerboard(6, 6);
    const untouched = Uint8ClampedArray.from(data);
    applyDetailFilters(data, 6, 6, undefined);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('a single active control still changes the output', () => {
    const data = checkerboard(6, 6);
    const untouched = Uint8ClampedArray.from(data);
    applyDetailFilters(data, 6, 6, { ...NEUTRAL_DETAIL_FILTERS, gaussianBlur: 1 });
    expect(Array.from(data)).not.toEqual(Array.from(untouched));
  });
});
