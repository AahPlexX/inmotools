import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE, applyPixelAdjustments, normalizeRecipe } from '../../src/tools/photo/photo-engine';

describe('Photo Studio advanced tone and color', () => {
  test('per-channel curves can change red without changing green or blue', () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      rgbToneCurves: {
        red: [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }, { x: 1, y: 1 }],
        green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      },
    } as typeof DEFAULT_RECIPE);
    applyPixelAdjustments(pixels, 1, 1, recipe);
    expect(pixels[0]).toBeLessThan(pixels[1]);
    expect(pixels[1]).toBe(pixels[2]);
  });

  test('levels map input endpoints through gamma into output endpoints', () => {
    const pixels = new Uint8ClampedArray([64, 128, 192, 255]);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      levels: { inputBlack: 0.25, gamma: 1, inputWhite: 0.75, outputBlack: 0.1, outputWhite: 0.9 },
    } as typeof DEFAULT_RECIPE);
    applyPixelAdjustments(pixels, 1, 1, recipe);
    expect(pixels[0]).toBeCloseTo(26, -1);
    expect(pixels[1]).toBeCloseTo(128, -1);
    expect(pixels[2]).toBeCloseTo(230, -1);
  });

  test('channel mixer can swap red and blue output channels', () => {
    const pixels = new Uint8ClampedArray([200, 100, 20, 255]);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      channelMixer: {
        red: { red: 0, green: 0, blue: 1, constant: 0 },
        green: { red: 0, green: 1, blue: 0, constant: 0 },
        blue: { red: 1, green: 0, blue: 0, constant: 0 },
      },
    } as typeof DEFAULT_RECIPE);
    applyPixelAdjustments(pixels, 1, 1, recipe);
    expect([...pixels]).toEqual([20, 100, 200, 255]);
  });
  test('normalization clamps malformed levels, curves, and mixer coefficients', () => {
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      levels: { inputBlack: 2, gamma: 99, inputWhite: -1, outputBlack: 2, outputWhite: -1 },
      rgbToneCurves: {
        red: [{ x: -1, y: 2 }, { x: 2, y: -1 }],
        green: [],
        blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      },
      channelMixer: {
        red: { red: 4, green: -4, blue: 0, constant: 4 },
        green: { red: 0, green: 1, blue: 0, constant: 0 },
        blue: { red: 0, green: 0, blue: 1, constant: 0 },
      },
    } as typeof DEFAULT_RECIPE);
    expect(recipe.levels.inputBlack).toBeLessThan(recipe.levels.inputWhite);
    expect(recipe.levels.gamma).toBe(10);
    expect(recipe.levels.outputBlack).toBeLessThanOrEqual(recipe.levels.outputWhite);
    expect(recipe.rgbToneCurves.red[0]).toEqual({ x: 0, y: 1 });
    expect(recipe.rgbToneCurves.green).toEqual(DEFAULT_RECIPE.rgbToneCurves.green);
    expect(recipe.channelMixer.red).toEqual({ red: 2, green: -2, blue: 0, constant: 2 });
  });
});