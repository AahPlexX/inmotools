import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, normalizeRecipe, photoMaskWeight } from '../../src/tools/photo/photo-engine';
import {
  clonePhotoMask,
  combinePhotoMasks,
  normalizePhotoMaskOverlay,
} from '../../src/tools/photo/photo-mask';
import { photoSelectionMask } from '../../src/tools/photo/photo-selection';
import type { PhotoMask, PhotoSelection } from '../../src/tools/photo/photo-types';

function rectangle(x: number, width: number): PhotoSelection {
  return {
    operations: [{ mode: 'replace', source: { type: 'rectangle', x, y: 0, width, height: 1 } }],
    feather: 0,
    expansion: 0,
    inverted: false,
  };
}

describe('photo mask management', () => {
  test('legacy adjustments receive bounded view-only overlay defaults', () => {
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      localAdjustments: [{
        id: 'legacy',
        label: 'Legacy',
        enabled: true,
        mask: { type: 'radial', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, feather: 0.2, opacity: 1, invert: false },
        effect: { exposure: 1, saturation: 0, sharpness: 0, blur: 0 },
      }],
    });
    expect(recipe.localAdjustments[0].overlay).toEqual({ visible: false, color: '#22D3EE', opacity: 0.35 });
    expect(normalizePhotoMaskOverlay({ visible: true, color: 'invalid', opacity: 4 })).toEqual({ visible: true, color: '#22D3EE', opacity: 1 });
  });

  test.each([
    ['add', 0.25, 0.75, 1, 1],
    ['subtract', 0.25, 0.75, 1, 0],
    ['intersect', 0.25, 0.5, 0, 1],
  ] as const)('%s composition combines real mask weights', (mode, leftX, rightX, expectedLeft, expectedRight) => {
    const left = photoSelectionMask(rectangle(0, 0.6));
    const right = photoSelectionMask(rectangle(0.4, 0.6));
    const mask = combinePhotoMasks(left, right, mode);
    expect(photoMaskWeight(mask, leftX, 0.5, 80, 80, 80)).toBe(expectedLeft);
    expect(photoMaskWeight(mask, rightX, 0.5, 80, 80, 80)).toBe(expectedRight);
  });

  test('nested composite masks clone independently and normalize bounded operations', () => {
    const original = combinePhotoMasks(
      photoSelectionMask(rectangle(0, 0.7)),
      photoSelectionMask(rectangle(0.3, 0.7)),
      'intersect',
    );
    const clone = clonePhotoMask(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    if (clone.type === 'composite' && clone.operations[0].mask.type === 'selection') {
      clone.operations[0].mask.selection.operations[0].source = { type: 'luminance', min: 0, max: 0.2 };
    }
    expect(clone).not.toEqual(original);

    const tooMany = Array.from({ length: 80 }, () => ({
      mode: 'add' as const,
      mask: photoSelectionMask(rectangle(0, 1)),
    }));
    const normalized = normalizeRecipe({
      ...DEFAULT_RECIPE,
      localAdjustments: [{
        id: 'bounded', label: 'Bounded', enabled: true,
        mask: { type: 'composite', operations: tooMany, feather: 9, opacity: 9, invert: false } as PhotoMask,
        effect: { exposure: 0, saturation: 0, sharpness: 0, blur: 0 },
      }],
    }).localAdjustments[0].mask;
    expect(normalized.type).toBe('composite');
    if (normalized.type === 'composite') {
      expect(normalized.operations).toHaveLength(64);
      expect(normalized.operations[0].mode).toBe('replace');
      expect(normalized.feather).toBe(1);
      expect(normalized.opacity).toBe(1);
    }
  });
});
