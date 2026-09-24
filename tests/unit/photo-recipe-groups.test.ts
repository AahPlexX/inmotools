import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import {
  ALL_RECIPE_GROUPS,
  DEFAULT_COPY_GROUPS,
  applyRecipeGroups,
  diffRecipes,
  normalizeRecipeGroups,
  recipeFieldsInGroups,
  summarizeRecipe,
} from '../../src/tools/photo/photo-recipe-groups';
import type { PhotoRecipe } from '../../src/tools/photo/photo-types';

function edited(patch: Partial<PhotoRecipe>): PhotoRecipe {
  return normalizeRecipe({ ...DEFAULT_RECIPE, ...patch });
}

describe('recipe adjustment groups', () => {
  test('every recipe field belongs to exactly one group', () => {
    const fields = recipeFieldsInGroups(ALL_RECIPE_GROUPS);
    const recipeKeys = Object.keys(normalizeRecipe(DEFAULT_RECIPE)).filter((key) => key !== 'version').sort();
    expect([...fields].sort()).toEqual(recipeKeys);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test('copying selected groups changes only those fields', () => {
    const source = edited({ exposure: 1.2, temperature: 0.4, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, vignette: -0.3 });
    const target = edited({ exposure: -0.5, contrast: 0.2, vignette: 0.1 });
    const result = applyRecipeGroups(target, source, ['light', 'white-balance']);
    expect(result.exposure).toBe(1.2);
    expect(result.contrast).toBe(0); // Light group copies all of its fields, including neutral ones.
    expect(result.temperature).toBe(0.4);
    expect(result.vignette).toBe(0.1); // Finishing was not selected.
    expect(result.crop).toEqual(target.crop); // Crop is image-specific and was not selected.
  });

  test('copied structures are independent of the source', () => {
    const source = edited({ toneCurve: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] });
    const result = applyRecipeGroups(DEFAULT_RECIPE, source, ['curves-levels']);
    result.toneCurve[1].y = 0.1;
    expect(source.toneCurve[1].y).toBe(0.7);
  });

  test('image-specific groups are excluded from the default copy set', () => {
    expect(DEFAULT_COPY_GROUPS).not.toContain('crop-geometry');
    expect(DEFAULT_COPY_GROUPS).not.toContain('retouch');
    expect(DEFAULT_COPY_GROUPS).toContain('light');
    expect(normalizeRecipeGroups(['light', 'bogus', 'layers'])).toEqual(['light', 'layers']);
    expect(normalizeRecipeGroups('nope')).toEqual(DEFAULT_COPY_GROUPS);
  });
});

describe('recipe comparison', () => {
  test('lists changed fields with readable before/after values, grouped in editor order', () => {
    const a = edited({ exposure: 0.5, flipX: false });
    const b = edited({ exposure: 1, flipX: true, temperature: 0.2 });
    expect(diffRecipes(a, b)).toEqual([
      { group: 'light', groupLabel: 'Light & tone', field: 'exposure', label: 'Exposure', before: '0.50', after: '1' },
      { group: 'white-balance', groupLabel: 'White balance', field: 'temperature', label: 'Temperature', before: '0', after: '0.20' },
      { group: 'crop-geometry', groupLabel: 'Crop & geometry', field: 'flipX', label: 'Horizontal flip', before: 'Off', after: 'On' },
    ]);
  });

  test('identical recipes have no differences and summaries say so', () => {
    expect(diffRecipes(DEFAULT_RECIPE, DEFAULT_RECIPE)).toEqual([]);
    expect(summarizeRecipe(DEFAULT_RECIPE)).toBe('No edits');
    expect(summarizeRecipe(edited({ exposure: 0.3, contrast: 0.1, grain: 0.2 }))).toBe('3 changes in Light & tone, Vignette & grain');
  });
});
