import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import { photoNaturalDimensions, requestedPhotoDimensions } from '../../src/tools/photo/photo-export-dimensions';

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

  test('original mode leaves dimensions unspecified for full-resolution renderer output', () => {
    expect(requestedPhotoDimensions(4000, 3000, DEFAULT_RECIPE, 'original', 100)).toEqual({});
  });
});
