import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, applyPixelAdjustments, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import {
  parseCubeLut,
  samplePhotoLut,
  serializeCubeLut,
  suggestPhotoLutFilename,
} from '../../src/tools/photo/photo-lut';

const INVERT_CUBE = `# Red changes fastest, then green, then blue.
TITLE "Invert test"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
1 1 1
0 1 1
1 0 1
0 0 1
1 1 0
0 1 0
1 0 0
0 0 0
`;

describe('Photo Studio .cube LUT workflow', () => {
  test('parses common 3D Cube metadata and red-fastest sample order', () => {
    const lut = parseCubeLut(INVERT_CUBE, 'invert.cube');

    expect(lut).toMatchObject({
      fileName: 'invert.cube',
      title: 'Invert test',
      size: 2,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      strength: 1,
    });
    expect(samplePhotoLut(lut, [0, 0, 0])).toEqual([1, 1, 1]);
    expect(samplePhotoLut(lut, [1, 0, 0])).toEqual([0, 1, 1]);
    expect(samplePhotoLut(lut, [0, 1, 0])).toEqual([1, 0, 1]);
    expect(samplePhotoLut(lut, [0, 0, 1])).toEqual([1, 1, 0]);

    const ranged = parseCubeLut(INVERT_CUBE
      .replace('DOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1', 'LUT_3D_INPUT_RANGE -1 1'), 'ranged.cube');
    expect(ranged.domainMin).toEqual([-1, -1, -1]);
    expect(ranged.domainMax).toEqual([1, 1, 1]);
  });

  test('interpolates inside a domain and blends the configured strength', () => {
    const lut = parseCubeLut(INVERT_CUBE.replace('DOMAIN_MIN 0 0 0', 'DOMAIN_MIN -1 -1 -1'), 'look.cube');
    expect(samplePhotoLut(lut, [0, 0.25, 0.5])).toEqual([0.5, 0.375, 0.25]);

    const halfStrength = { ...lut, strength: 0.5 };
    const result = samplePhotoLut(halfStrength, [0, 0.25, 0.5]);
    expect(result[0]).toBeCloseTo(0.25, 6);
    expect(result[1]).toBeCloseTo(0.3125, 6);
    expect(result[2]).toBeCloseTo(0.375, 6);
  });

  test('bakes strength into a faithful supported Cube export', () => {
    const lut = { ...parseCubeLut(INVERT_CUBE, 'portrait-look.cube'), strength: 0.35 };
    const exported = serializeCubeLut(lut);
    const reparsed = parseCubeLut(exported, 'portrait-look-strength.cube');
    const probes: Array<[number, number, number]> = [
      [0, 0, 0],
      [0.2, 0.4, 0.7],
      [1, 1, 1],
    ];

    expect(exported).toContain('TITLE "Invert test (35% strength)"');
    expect(suggestPhotoLutFilename(lut)).toBe('portrait-look-35pct.cube');
    for (const probe of probes) {
      const expected = samplePhotoLut(lut, probe);
      const actual = samplePhotoLut(reparsed, probe);
      actual.forEach((value, channel) => expect(value).toBeCloseTo(expected[channel], 6));
    }
  });

  test('rejects incomplete, one-dimensional, oversized, and malformed Cube input', () => {
    expect(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0\n', 'short.cube')).toThrow(/8 rows/i);
    expect(() => parseCubeLut('LUT_1D_SIZE 2\n0 0 0\n1 1 1\n', 'one-d.cube')).toThrow(/1D LUTs/i);
    expect(() => parseCubeLut('LUT_3D_SIZE 66\n', 'large.cube')).toThrow(/between 2 and 65/i);
    expect(() => parseCubeLut('LUT_3D_SIZE 2\nwat\n', 'broken.cube')).toThrow(/line 2/i);
    expect(() => parseCubeLut('LUT_3D_SIZE 2\nDOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n', 'domain.cube')).toThrow(/DOMAIN_MIN/i);
  });

  test('normalizes legacy recipes without a LUT and applies an imported LUT in the shared pixel engine', () => {
    const legacy = normalizeRecipe({ ...DEFAULT_RECIPE, lut: undefined } as typeof DEFAULT_RECIPE);
    expect(legacy.lut).toBeNull();

    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      lut: parseCubeLut(INVERT_CUBE, 'invert.cube'),
    });
    const pixels = new Uint8ClampedArray([64, 128, 192, 255]);
    applyPixelAdjustments(pixels, 1, 1, recipe);
    expect([...pixels]).toEqual([191, 127, 63, 255]);
  });
});
