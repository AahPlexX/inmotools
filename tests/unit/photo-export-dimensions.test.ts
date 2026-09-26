import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import {
  fitPhotoDimensionsWithinLimits,
  photoNaturalDimensions,
  planPhotoExportSize,
  requestedPhotoDimensions,
} from '../../src/tools/photo/photo-export-dimensions';

describe('Photo Studio export dimensions', () => {
  test('crop and quarter-turn rotation determine the edited natural frame', () => {
    const recipe = {
      ...DEFAULT_RECIPE,
      crop: { x: 0, y: 0, width: 0.5, height: 0.25 },
      rotateQuarterTurns: 1,
    };
    expect(photoNaturalDimensions(4000, 3000, recipe)).toEqual({ width: 750, height: 2000 });
  });

  test('percentage resize preserves aspect ratio', () => {
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'percent', 50)).toEqual({
      requestedWidth: 2000,
      requestedHeight: 1500,
    });
  });

  test('exact width and height resize preserve edited aspect ratio', () => {
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'width', 1000)).toEqual({ requestedWidth: 1000, requestedHeight: 750 });
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'height', 600)).toEqual({ requestedWidth: 800, requestedHeight: 600 });
  });

  test('long-edge and short-edge resize preserve aspect ratio in either orientation', () => {
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'long-edge', 2000)).toEqual({ requestedWidth: 2000, requestedHeight: 1500 });
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'short-edge', 1200)).toEqual({ requestedWidth: 1600, requestedHeight: 1200 });
    expect(requestedPhotoDimensions(3000, 4000, DEFAULT_RECIPE, 'long-edge', 2000)).toEqual({ requestedWidth: 1500, requestedHeight: 2000 });
    expect(requestedPhotoDimensions(3000, 4000, DEFAULT_RECIPE, 'short-edge', 1200)).toEqual({ requestedWidth: 1200, requestedHeight: 1600 });
  });

  test('original mode leaves dimensions unspecified for full-resolution renderer output', () => {
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'original', 100)).toEqual({});
  });

  test('safe fitting honors both edge and area limits without changing aspect ratio materially', () => {
    expect(fitPhotoDimensionsWithinLimits(8000, 4000, 4096, 16_777_216)).toEqual({ width: 4096, height: 2048, scaled: true });
    expect(fitPhotoDimensionsWithinLimits(5000, 5000, 8192, 16_000_000)).toEqual({ width: 4000, height: 4000, scaled: true });
    expect(fitPhotoDimensionsWithinLimits(3000, 2000, 4096, 16_777_216)).toEqual({ width: 3000, height: 2000, scaled: false });
  });

  test('export size planning exposes the requested dimensions and verified-safe alternative before render', () => {
    expect(planPhotoExportSize(8000, 4000, DEFAULT_RECIPE, 'original', 100, 4096, 16_777_216)).toEqual({
      requested: { width: 8000, height: 4000 },
      safe: { width: 4096, height: 2048 },
      requiresSafetyScaling: true,
    });
    expect(planPhotoExportSize(4000, 3000, DEFAULT_RECIPE, 'long-edge', 2000, 4096, 16_777_216)).toEqual({
      requested: { width: 2000, height: 1500 },
      safe: { width: 2000, height: 1500 },
      requiresSafetyScaling: false,
    });
  });
});

describe("don't-enlarge sizing", () => {
  test('targets larger than the edited frame keep the frame size; smaller targets still apply', () => {
    expect(requestedPhotoDimensions(320, 240, DEFAULT_RECIPE, 'long-edge', 400, false)).toEqual({});
    expect(requestedPhotoDimensions(320, 240, DEFAULT_RECIPE, 'long-edge', 160, false)).toEqual({ requestedWidth: 160, requestedHeight: 120 });
    expect(requestedPhotoDimensions(320, 240, DEFAULT_RECIPE, 'percent', 150, false)).toEqual({});
    expect(planPhotoExportSize(320, 240, DEFAULT_RECIPE, 'width', 1920, 4096, 16_777_216, false).requested).toEqual({ width: 320, height: 240 });
    expect(requestedPhotoDimensions(320, 240, DEFAULT_RECIPE, 'long-edge', 400)).toEqual({ requestedWidth: 400, requestedHeight: 300 });
  });
});
