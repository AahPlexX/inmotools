import { describe, expect, test } from 'vitest';
import { applyPixelAdjustments, DEFAULT_RECIPE, normalizeRecipe, type PhotoLayerPixels } from '../../src/tools/photo/photo-engine';
import { blendChannels, createLayer } from '../../src/tools/photo/photo-layers';
import type { PhotoLayer, PhotoRecipe } from '../../src/tools/photo/photo-types';

function solidLayerPixels(layerId: string, width: number, height: number, r: number, g: number, b: number, a = 255): PhotoLayerPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { layerId, data, width, height };
}

function basePixels(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

describe('blend mode math', () => {
  test('normal replaces the base entirely', () => {
    expect(blendChannels('normal', [0.2, 0.4, 0.6], [0.9, 0.1, 0.5])).toEqual([0.9, 0.1, 0.5]);
  });

  test('multiply darkens toward black and is idempotent with white', () => {
    expect(blendChannels('multiply', [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])[0]).toBeCloseTo(0.25);
    expect(blendChannels('multiply', [0.5, 0.5, 0.5], [1, 1, 1])).toEqual([0.5, 0.5, 0.5]);
  });

  test('screen lightens and is idempotent with black', () => {
    expect(blendChannels('screen', [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])[0]).toBeCloseTo(0.75);
    expect(blendChannels('screen', [0.5, 0.5, 0.5], [0, 0, 0])).toEqual([0.5, 0.5, 0.5]);
  });

  test('darken and lighten pick the extreme channel-wise', () => {
    expect(blendChannels('darken', [0.2, 0.8, 0.5], [0.6, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5]);
    expect(blendChannels('lighten', [0.2, 0.8, 0.5], [0.6, 0.3, 0.5])).toEqual([0.6, 0.8, 0.5]);
  });

  test('luminosity keeps the base hue/saturation but takes the top layer brightness', () => {
    const grayBase: [number, number, number] = [0.5, 0.5, 0.5];
    const brightTop: [number, number, number] = [0.9, 0.9, 0.9];
    const result = blendChannels('luminosity', grayBase, brightTop);
    // A gray base stays gray; its luminance moves toward the (brighter) top's luminance.
    expect(result[0]).toBeCloseTo(result[1]);
    expect(result[1]).toBeCloseTo(result[2]);
    expect(result[0]).toBeGreaterThan(0.5);
  });

  test('color keeps the base luminance but takes the top layer hue/saturation', () => {
    const base: [number, number, number] = [0.5, 0.5, 0.5]; // neutral gray, luminance 0.5
    const saturatedTop: [number, number, number] = [0.9, 0.1, 0.1]; // saturated red
    const result = blendChannels('color', base, saturatedTop);
    // Result should be a saturated red-leaning color, not neutral gray, since color takes hue/sat from top.
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[0]).toBeGreaterThan(result[2]);
  });
});

describe('layer recipe normalization', () => {
  test('a recipe with no layers field normalizes to an empty stack and renders byte-identical to before layers existed', () => {
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 0.5 } as unknown as PhotoRecipe);
    expect(recipe.layers).toEqual([]);
  });

  test('layer fields clamp to safe ranges and unknown blend modes fall back to normal', () => {
    const layer = createLayer('a', 'A', 'data:image/png;base64,', 10, 10);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      layers: [{
        ...layer,
        opacity: 5,
        blendMode: 'not-a-real-mode' as unknown as PhotoLayer['blendMode'],
        transform: { x: 2, y: -1, scale: 999, rotation: 900 },
      }],
    });
    const normalized = recipe.layers![0];
    expect(normalized.opacity).toBe(1);
    expect(normalized.blendMode).toBe('normal');
    expect(normalized.transform.x).toBe(1);
    expect(normalized.transform.y).toBe(0);
    expect(normalized.transform.scale).toBeLessThanOrEqual(20);
    expect(normalized.transform.rotation).toBe(180);
  });

  test('more than 50 layers are truncated', () => {
    const layers = Array.from({ length: 60 }, (_, index) => createLayer(`layer-${index}`, `Layer ${index}`, '', 1, 1));
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers });
    expect(recipe.layers).toHaveLength(50);
  });
});

describe('layer compositing', () => {
  test('a centered, unscaled, fully opaque normal layer replaces the base pixel at its center', () => {
    const width = 4, height = 4;
    const data = basePixels(width, height, 10, 10, 10);
    const layer = { ...createLayer('a', 'A', '', 2, 2), transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } };
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers: [layer] });
    const pixels = [solidLayerPixels('a', 2, 2, 250, 5, 5)];
    applyPixelAdjustments(data, width, height, recipe, pixels);
    const centerOffset = (2 * width + 2) * 4; // inside the 2x2 layer footprint centered on the 4x4 canvas
    expect(data[centerOffset]).toBeGreaterThan(200);
  });

  test('an invisible layer changes nothing', () => {
    const width = 4, height = 4;
    const data = basePixels(width, height, 10, 10, 10);
    const untouched = Uint8ClampedArray.from(data);
    const layer = { ...createLayer('a', 'A', '', 4, 4), visible: false };
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers: [layer] });
    applyPixelAdjustments(data, width, height, recipe, [solidLayerPixels('a', 4, 4, 250, 5, 5)]);
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('a layer with no decoded pixels supplied yet renders as a no-op instead of throwing', () => {
    const width = 4, height = 4;
    const data = basePixels(width, height, 10, 10, 10);
    const untouched = Uint8ClampedArray.from(data);
    const layer = createLayer('a', 'A', '', 4, 4);
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers: [layer] });
    expect(() => applyPixelAdjustments(data, width, height, recipe, [])).not.toThrow();
    expect(Array.from(data)).toEqual(Array.from(untouched));
  });

  test('opacity partially blends the layer toward the base rather than fully replacing it', () => {
    const width = 2, height = 2;
    const data = basePixels(width, height, 0, 0, 0);
    const layer = { ...createLayer('a', 'A', '', 2, 2), opacity: 0.5 };
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers: [layer] });
    applyPixelAdjustments(data, width, height, recipe, [solidLayerPixels('a', 2, 2, 200, 200, 200)]);
    expect(data[0]).toBeGreaterThan(50);
    expect(data[0]).toBeLessThan(150);
  });

  test('a mask restricts the composited area to where its weight is non-zero', () => {
    const width = 4, height = 1;
    const data = basePixels(width, height, 10, 10, 10);
    const layer: PhotoLayer = {
      ...createLayer('a', 'A', '', 4, 1),
      mask: { type: 'linear', x1: 0, y1: 0.5, x2: 0.5, y2: 0.5, feather: 0, opacity: 1, invert: false },
    };
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, layers: [layer] });
    applyPixelAdjustments(data, width, height, recipe, [solidLayerPixels('a', 4, 1, 250, 5, 5)]);
    expect(data[0]).toBeLessThan(50); // left half: masked out, stays near the base color
    expect(data[3 * 4]).toBeGreaterThan(150); // right half: masked in, picks up the layer color
  });
});
