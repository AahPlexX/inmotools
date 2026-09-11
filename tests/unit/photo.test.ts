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
import { mapPhotoGeometryPoint, warpPhotoGeometryPixels } from '../../src/tools/photo/photo-geometry';
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

  test('radial local exposure changes its target more than an outside corner', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 80;
      pixels[offset + 1] = 80;
      pixels[offset + 2] = 80;
      pixels[offset + 3] = 255;
    }
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      localAdjustments: [{
        id: 'radial',
        label: 'Radial',
        enabled: true,
        mask: { type: 'radial', cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25, feather: 0.2, opacity: 1, invert: false },
        effect: { exposure: 1, saturation: 0, sharpness: 0, blur: 0 },
      }],
    });
    applyPixelAdjustments(pixels, 5, 5, recipe);
    const corner = pixels[0];
    const center = pixels[(2 * 5 + 2) * 4];
    expect(center).toBeGreaterThan(corner + 20);
    expect(corner).toBeCloseTo(80, 0);
  });

  test('red-eye correction reduces red dominance only inside the correction circle', () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 220;
      pixels[offset + 1] = 40;
      pixels[offset + 2] = 40;
      pixels[offset + 3] = 255;
    }
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{ id: 'eye', type: 'red-eye', x: 0.5, y: 0.5, radius: 0.22, strength: 1 }],
    });
    applyPixelAdjustments(pixels, 3, 3, recipe);
    const centerOffset = (1 * 3 + 1) * 4;
    expect(pixels[centerOffset]).toBeLessThan(120);
    expect(pixels[0]).toBe(220);
  });

  test('clone spot copies a sampled source into its target region', () => {
    const pixels = new Uint8ClampedArray([
      240, 20, 20, 255,
      20, 240, 20, 255,
      20, 20, 240, 255,
    ]);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 1 / 6, sourceY: 0.5, targetX: 5 / 6, targetY: 0.5,
        radius: 0.3, feather: 0.1, opacity: 1,
      }],
    });
    applyPixelAdjustments(pixels, 3, 1, recipe);
    expect(pixels[8]).toBeGreaterThan(200);
    expect(pixels[9]).toBeLessThan(80);
    expect(pixels[10]).toBeLessThan(80);
  });

  test('luminance denoise reduces an isolated one-pixel spike', () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) pixels[offset + 3] = 255;
    const centerOffset = (1 * 3 + 1) * 4;
    pixels[centerOffset] = 255;
    pixels[centerOffset + 1] = 255;
    pixels[centerOffset + 2] = 255;
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, denoiseLuminance: 1 });
    applyPixelAdjustments(pixels, 3, 3, recipe);
    expect(pixels[centerOffset]).toBeLessThan(180);
    expect(pixels[centerOffset]).toBeGreaterThan(0);
  });

  test('sharpening increases local edge contrast without changing flat alpha', () => {
    const pixels = new Uint8ClampedArray([
      90, 90, 90, 255,
      110, 110, 110, 255,
      130, 130, 130, 255,
    ]);
    const beforeDelta = pixels[8] - pixels[0];
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, sharpenAmount: 1.5, sharpenRadius: 1, sharpenThreshold: 0 });
    applyPixelAdjustments(pixels, 3, 1, recipe);
    expect(pixels[8] - pixels[0]).toBeGreaterThan(beforeDelta);
    expect(pixels[3]).toBe(255);
  });

  test('neutral geometry mapping is an exact identity', () => {
    expect(mapPhotoGeometryPoint(0.2, 0.7, 0, 0, 0)).toEqual({ x: 0.2, y: 0.7 });
    expect(mapPhotoGeometryPoint(0.5, 0.5, 0.8, -0.6, 0.9)).toEqual({ x: 0.5, y: 0.5 });
  });

  test('lens and perspective corrections displace edges while keeping finite coordinates', () => {
    const lens = mapPhotoGeometryPoint(0.8, 0.8, 0.8, 0, 0);
    expect(lens.x).toBeGreaterThan(0.8);
    expect(lens.y).toBeGreaterThan(0.8);

    const top = mapPhotoGeometryPoint(0.8, 0.2, 0, 0.7, 0);
    const bottom = mapPhotoGeometryPoint(0.8, 0.8, 0, 0.7, 0);
    expect(top.x).not.toBeCloseTo(bottom.x, 5);
    expect(Number.isFinite(top.x)).toBe(true);
    expect(Number.isFinite(bottom.x)).toBe(true);
  });

  test('neutral geometry warp is byte-for-byte lossless', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    expect([...warpPhotoGeometryPixels(pixels, 2, 2, 0, 0, 0)]).toEqual([...pixels]);
  });

  test('geometry warp preserves dimensions and produces transparent pixels outside the corrected source', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    const warped = warpPhotoGeometryPixels(pixels, 5, 5, 1, 0, 0);
    expect(warped).toHaveLength(pixels.length);
    const transparentPixels = Array.from({ length: 25 }, (_, index) => warped[index * 4 + 3]).filter((alpha) => alpha === 0);
    expect(transparentPixels.length).toBeGreaterThan(0);
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