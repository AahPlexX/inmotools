import { describe, expect, test } from 'vitest';
import { suggestAutoTone, suggestAutoWhiteBalance } from '../../src/tools/photo/photo-analysis';
import type { PhotoHistogram } from '../../src/tools/photo/photo-types';

function histogramWithBins(bins: {
  red?: Array<[number, number]>;
  green?: Array<[number, number]>;
  blue?: Array<[number, number]>;
  luminance?: Array<[number, number]>;
}): PhotoHistogram {
  const channel = (entries: Array<[number, number]> = []) => {
    const values = Array.from({ length: 256 }, () => 0);
    for (const [index, count] of entries) values[index] = count;
    return values;
  };
  return {
    red: channel(bins.red),
    green: channel(bins.green),
    blue: channel(bins.blue),
    luminance: channel(bins.luminance),
  };
}

describe('Photo Studio deterministic analysis suggestions', () => {
  test('auto tone maps stable luminance percentiles to visible bounded recipe values', () => {
    const luminance = [26, 64, 128, 192, 230].map((bin) => [bin, 20] as [number, number]);
    expect(suggestAutoTone(histogramWithBins({ luminance }))).toEqual({
      exposure: -0.16,
      contrast: -0.06,
      highlights: -0.04,
      shadows: 0.04,
      whites: 0.16,
      blacks: -0.16,
      midtone: 0,
    });
  });

  test('auto white balance uses deterministic gray-world channel means', () => {
    const histogram = histogramWithBins({
      red: [[80, 100]],
      green: [[160, 100]],
      blue: [[120, 100]],
    });
    expect(suggestAutoWhiteBalance(histogram)).toEqual({ temperature: 0.24, tint: 0.47 });
  });

  test('empty and neutral histograms produce finite neutral suggestions', () => {
    const empty = histogramWithBins({});
    expect(suggestAutoTone(empty)).toEqual({
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      midtone: 0,
    });
    expect(suggestAutoWhiteBalance(empty)).toEqual({ temperature: 0, tint: 0 });
    expect(suggestAutoWhiteBalance(histogramWithBins({
      red: [[128, 10]], green: [[128, 10]], blue: [[128, 10]],
    }))).toEqual({ temperature: 0, tint: 0 });
  });
});
