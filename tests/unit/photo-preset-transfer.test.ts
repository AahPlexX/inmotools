import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import {
  parsePhotoPreset,
  serializePhotoPreset,
  suggestPhotoPresetFilename,
} from '../../src/tools/photo/photo-preset-transfer';

describe('Photo Studio preset transfer', () => {
  test('round-trips a trimmed name and normalized complete recipe', () => {
    const source = normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 1.25, saturation: -0.4 });
    const json = serializePhotoPreset('  Evening film  ', source);

    expect(json).toBe(JSON.stringify({
      kind: 'inmotools-photo-preset',
      version: 1,
      name: 'Evening film',
      recipe: source,
    }, null, 2));
    expect(parsePhotoPreset(json)).toEqual({
      kind: 'inmotools-photo-preset',
      version: 1,
      name: 'Evening film',
      recipe: source,
    });
  });

  test('does not mutate the input recipe while exporting', () => {
    const source = {
      ...DEFAULT_RECIPE,
      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
      toneCurve: [{ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 }],
      localAdjustments: [{
        id: 'radial',
        label: 'Radial',
        enabled: true,
        mask: { type: 'radial' as const, cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, feather: 0.4, opacity: 1, invert: false },
        effect: { exposure: 0.5, saturation: 0, sharpness: 0, blur: 0 },
      }],
    };
    const before = structuredClone(source);

    serializePhotoPreset('Radial', source);

    expect(source).toEqual(before);
  });

  test('normalizes and clamps imported recipe values through the Photo engine', () => {
    const parsed = parsePhotoPreset(JSON.stringify({
      kind: 'inmotools-photo-preset',
      version: 1,
      name: 'Extreme',
      recipe: {
        ...DEFAULT_RECIPE,
        exposure: 99,
        saturation: -99,
        crop: { x: 0.9, y: -1, width: 2, height: 0 },
        sharpenAmount: 99,
      },
    }));

    expect(parsed.recipe.exposure).toBe(5);
    expect(parsed.recipe.saturation).toBe(-1);
    expect(parsed.recipe.sharpenAmount).toBe(2);
    expect(parsed.recipe.crop).toEqual({ x: 0, y: 0, width: 1, height: 0.001 });
    expect(parsed.recipe.hsl).toHaveLength(8);
    expect(parsed.recipe.blackAndWhiteMix).toHaveLength(8);
  });

  test.each([
    ['not json', /invalid.*json/i],
    [JSON.stringify({ version: 1, name: 'Preset', recipe: DEFAULT_RECIPE }), /kind/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 2, name: 'Preset', recipe: DEFAULT_RECIPE }), /version/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 1, recipe: DEFAULT_RECIPE }), /name/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 1, name: '   ', recipe: DEFAULT_RECIPE }), /name/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 1, name: 'Preset' }), /recipe/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 1, name: 'Preset', recipe: null }), /recipe/i],
    [JSON.stringify({ kind: 'inmotools-photo-preset', version: 1, name: 'Preset', recipe: [] }), /recipe/i],
  ])('rejects invalid envelope %s', (input, message) => {
    expect(() => parsePhotoPreset(input)).toThrow(message);
  });

  test('suggests a safe JSON filename using the Photo filename conventions', () => {
    expect(suggestPhotoPresetFilename('  Client: Spring / Hero*.json  ')).toBe('client-spring-hero-photo-preset.json');
    expect(suggestPhotoPresetFilename('Bright portrait refined')).toBe('bright-portrait-refined-photo-preset.json');
    expect(suggestPhotoPresetFilename('   ')).toBe('photo-preset.json');
  });
});
