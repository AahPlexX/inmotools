import { describe, expect, test } from 'vitest';
import { applyPixelAdjustments, DEFAULT_RECIPE, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import {
  appendPhotoSelection,
  normalizePhotoSelection,
  photoSelectionMask,
  photoSelectionWeight,
} from '../../src/tools/photo/photo-selection';
import type { PhotoSelection, PhotoSelectionSource } from '../../src/tools/photo/photo-types';

const selection = (source: PhotoSelectionSource, overrides: Partial<PhotoSelection> = {}): PhotoSelection => ({
  operations: [{ mode: 'replace', source }],
  feather: 0,
  expansion: 0,
  inverted: false,
  ...overrides,
});

describe('photo selection model', () => {
  test('normalizes bounded state and preserves legacy recipes without a selection', () => {
    expect(normalizeRecipe({ ...DEFAULT_RECIPE, selection: undefined }).selection).toBeNull();
    const normalized = normalizePhotoSelection({
      operations: [
        { mode: 'subtract', source: { type: 'rectangle', x: 0.8, y: 0.9, width: -2, height: -2 } },
        { mode: 'add', source: { type: 'color', red: 999, green: -2, blue: 20.4, tolerance: 9 } },
      ],
      feather: 2,
      expansion: -3,
      inverted: true,
    });
    expect(normalized).toMatchObject({ feather: 0.25, expansion: -0.25, inverted: true });
    expect(normalized?.operations[0]).toMatchObject({ mode: 'replace', source: { type: 'rectangle', x: 0, y: 0, width: 0.8, height: 0.9 } });
    expect(normalized?.operations[1]).toMatchObject({ mode: 'add', source: { type: 'color', red: 255, green: 0, blue: 20, tolerance: 1 } });
  });

  test.each([
    ['rectangle', selection({ type: 'rectangle', x: 0.2, y: 0.2, width: 0.4, height: 0.4 }), [0.4, 0.4], [0.9, 0.9]],
    ['ellipse', selection({ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.2 }), [0.5, 0.5], [0.9, 0.9]],
    ['polygon/lasso', selection({ type: 'polygon', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.8 }] }), [0.5, 0.4], [0.1, 0.9]],
  ] as const)('%s geometry selects inside and rejects outside points', (_name, value, inside, outside) => {
    expect(photoSelectionWeight(value, inside[0], inside[1], 0, 0, 0)).toBe(1);
    expect(photoSelectionWeight(value, outside[0], outside[1], 0, 0, 0)).toBe(0);
  });

  test('color tolerance and luminance selection evaluate rendered pixel values', () => {
    const color = selection({ type: 'color', red: 200, green: 40, blue: 30, tolerance: 0.08 });
    expect(photoSelectionWeight(color, 0, 0, 205, 42, 25)).toBe(1);
    expect(photoSelectionWeight(color, 0, 0, 20, 220, 230)).toBe(0);
    const luminance = selection({ type: 'luminance', min: 0.4, max: 0.6 });
    expect(photoSelectionWeight(luminance, 0, 0, 128, 128, 128)).toBe(1);
    expect(photoSelectionWeight(luminance, 0, 0, 250, 250, 250)).toBe(0);
  });

  test('add, subtract, and intersect combine deterministically', () => {
    let value = appendPhotoSelection(null, { type: 'rectangle', x: 0, y: 0, width: 0.6, height: 1 }, 'replace');
    value = appendPhotoSelection(value, { type: 'rectangle', x: 0.4, y: 0, width: 0.6, height: 1 }, 'add');
    expect(photoSelectionWeight(value, 0.9, 0.5, 0, 0, 0)).toBe(1);
    value = appendPhotoSelection(value, { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2 }, 'subtract');
    expect(photoSelectionWeight(value, 0.5, 0.5, 0, 0, 0)).toBe(0);
    value = appendPhotoSelection(value, { type: 'rectangle', x: 0.7, y: 0, width: 0.3, height: 1 }, 'intersect');
    expect(photoSelectionWeight(value, 0.2, 0.5, 0, 0, 0)).toBe(0);
    expect(photoSelectionWeight(value, 0.9, 0.5, 0, 0, 0)).toBe(1);
    value = appendPhotoSelection(value, { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }, 'replace');
    expect(value.operations).toHaveLength(1);
    expect(value.operations[0].mode).toBe('replace');
  });

  test('feather, grow/shrink, and invert change the boundary without destroying operations', () => {
    const base = selection({ type: 'rectangle', x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(photoSelectionWeight(base, 0.2, 0.5, 0, 0, 0)).toBe(0);
    expect(photoSelectionWeight({ ...base, expansion: 0.1 }, 0.2, 0.5, 0, 0, 0)).toBe(1);
    expect(photoSelectionWeight({ ...base, expansion: -0.1 }, 0.3, 0.5, 0, 0, 0)).toBe(0);
    expect(photoSelectionWeight({ ...base, feather: 0.1 }, 0.25, 0.5, 0, 0, 0)).toBeCloseTo(0.5);
    expect(photoSelectionWeight({ ...base, inverted: true }, 0.2, 0.5, 0, 0, 0)).toBe(1);
  });

  test('converted selection masks drive the shared preview/export pixel engine', () => {
    const pixels = new Uint8ClampedArray([
      80, 80, 80, 255,
      80, 80, 80, 255,
      80, 80, 80, 255,
    ]);
    const value = selection({ type: 'rectangle', x: 0.34, y: 0, width: 0.32, height: 1 });
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      selection: value,
      localAdjustments: [{
        id: 'selection-mask',
        label: 'Selection mask',
        enabled: true,
        mask: photoSelectionMask(value),
        effect: { exposure: 1, saturation: 0, sharpness: 0, blur: 0 },
      }],
    });
    applyPixelAdjustments(pixels, 3, 1, recipe);
    expect(pixels[4]).toBeGreaterThan(pixels[0] + 30);
    expect(pixels[0]).toBe(80);
    expect(recipe.selection?.operations).not.toBe(recipe.localAdjustments[0].mask.type === 'selection'
      ? recipe.localAdjustments[0].mask.selection.operations
      : undefined);
  });
});
