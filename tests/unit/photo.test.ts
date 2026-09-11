import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RECIPE,
  applyPixelAdjustments,
  commitHistory,
  createHistory,
  normalizeRecipe,
  redoHistory,
  sampleHistogram,
  undoHistory,
} from '../../src/tools/photo/photo-engine';
import { safePhotoFilename, serializePhotoXmp } from '../../src/tools/photo/photo-metadata';
import {
  fitDimensionsWithinLimits,
  isRenderResultCurrent,
  normalizeQuarterTurns,
} from '../../src/tools/photo/photo-renderer';

describe('Photo Studio engine', () => {
  test('neutral recipe preserves an opaque mid-gray pixel', () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    applyPixelAdjustments(pixels, 1, 1, DEFAULT_RECIPE);
    expect([...pixels]).toEqual([128, 128, 128, 255]);
  });

  test('one EV increases linear-light exposure without changing alpha', () => {
    const pixels = new Uint8ClampedArray([64, 64, 64, 200]);
    applyPixelAdjustments(pixels, 1, 1, normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 1 }));
    expect(pixels[0]).toBeGreaterThan(80);
    expect(pixels[0]).toBeLessThan(110);
    expect(pixels[3]).toBe(200);
  });

  test('recipe normalization clamps public adjustment domains', () => {
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, exposure: 99, saturation: -99, sharpenAmount: 99 });
    expect(recipe.exposure).toBe(5);
    expect(recipe.saturation).toBe(-1);
    expect(recipe.sharpenAmount).toBe(2);
  });

  test('recipe normalization rejects an empty crop', () => {
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      crop: { x: 0.4, y: 0.4, width: 0, height: 0.2 },
    });
    expect(recipe.crop.width).toBeGreaterThan(0);
    expect(recipe.crop.x + recipe.crop.width).toBeLessThanOrEqual(1);
  });

  test('history undo and redo preserve recipe revisions', () => {
    const start = createHistory(DEFAULT_RECIPE);
    const changed = { ...DEFAULT_RECIPE, exposure: 1 };
    const committed = commitHistory(start, changed);
    expect(undoHistory(committed).present.exposure).toBe(0);
    expect(redoHistory(undoHistory(committed)).present.exposure).toBe(1);
  });

  test('histogram accounts for every pixel', () => {
    const histogram = sampleHistogram(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
    expect(histogram.luminance.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(histogram.red.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  test('XMP escapes text and maps reviewed rights/descriptive fields', () => {
    const xmp = serializePhotoXmp({
      title: 'A&B <test>',
      creator: 'Photographer',
      credit: 'Studio',
      copyright: 'Copyright 2026',
      keywords: ['one', 'two'],
    });
    expect(xmp).toContain('A&amp;B &lt;test&gt;');
    expect(xmp).toContain('dc:creator');
    expect(xmp).toContain('photoshop:Credit');
    expect(xmp).toContain('Copyright 2026');
  });

  test('XMP omits GPS when coordinates are not explicitly provided', () => {
    const xmp = serializePhotoXmp({ title: 'No location' });
    expect(xmp).not.toContain('exif:GPSLatitude');
    expect(xmp).not.toContain('exif:GPSLongitude');
  });

  test('output filename extension follows requested MIME', () => {
    expect(safePhotoFilename('portrait.CR2', 'image/jpeg')).toBe('portrait-edited.jpg');
    expect(safePhotoFilename('portrait.jpg', 'image/webp')).toBe('portrait-edited.webp');
    expect(safePhotoFilename('portrait.webp', 'image/png')).toBe('portrait-edited.png');
  });

  test('stale render results cannot replace the active revision', () => {
    expect(isRenderResultCurrent(7, { revision: 6 })).toBe(false);
    expect(isRenderResultCurrent(7, { revision: 7 })).toBe(true);
  });

  test('quarter-turn normalization is stable for negative and large rotations', () => {
    expect(normalizeQuarterTurns(-1)).toBe(3);
    expect(normalizeQuarterTurns(5)).toBe(1);
    expect(normalizeQuarterTurns(8)).toBe(0);
  });

  test('export dimensions preserve aspect ratio under edge and area limits', () => {
    expect(fitDimensionsWithinLimits(8000, 4000, 4096, 16_777_216)).toEqual({ width: 4096, height: 2048, scaled: true });
    expect(fitDimensionsWithinLimits(3000, 2000, 4096, 16_777_216)).toEqual({ width: 3000, height: 2000, scaled: false });
    const areaLimited = fitDimensionsWithinLimits(6000, 4000, 10_000, 12_000_000);
    expect(areaLimited.width * areaLimited.height).toBeLessThanOrEqual(12_000_000);
    expect(areaLimited.width / areaLimited.height).toBeCloseTo(1.5, 2);
  });
});
