import { describe, expect, test } from 'vitest';
import {
  PHOTO_SCOPE_HEIGHT,
  PHOTO_SCOPE_WIDTH,
  PHOTO_VECTORSCOPE_SIZE,
  analyzePhotoScopes,
  createPhotoInspectionOverlay,
  photoExposureZone,
} from '../../src/tools/photo/photo-scopes';

function rgba(...pixels: Array<readonly [number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe('Photo Studio inspection scopes', () => {
  test('maps image position and luminance into deterministic waveform bins', () => {
    const analysis = analyzePhotoScopes(rgba([0, 0, 0, 255], [255, 255, 255, 255]), 2, 1);
    expect(analysis.sampleCount).toBe(2);
    expect(analysis.waveform[(PHOTO_SCOPE_HEIGHT - 1) * PHOTO_SCOPE_WIDTH]).toBe(1);
    expect(analysis.waveform[128]).toBe(1);
  });

  test('keeps RGB parade channels independent and maps neutral chroma to vectorscope center', () => {
    const neutral = analyzePhotoScopes(rgba([128, 128, 128, 255]), 1, 1);
    const valueRow = PHOTO_SCOPE_HEIGHT - 1 - Math.round(128 / 255 * (PHOTO_SCOPE_HEIGHT - 1));
    expect(neutral.parade.red[valueRow * PHOTO_SCOPE_WIDTH]).toBe(1);
    expect(neutral.parade.green[valueRow * PHOTO_SCOPE_WIDTH]).toBe(1);
    expect(neutral.parade.blue[valueRow * PHOTO_SCOPE_WIDTH]).toBe(1);
    expect(neutral.vectorscope[64 * PHOTO_VECTORSCOPE_SIZE + 64]).toBe(1);

    const red = analyzePhotoScopes(rgba([255, 0, 0, 255]), 1, 1);
    expect(red.vectorscope[42]).toBe(1);
  });

  test('bins exposure in stops around 18 percent middle gray', () => {
    expect(photoExposureZone(0.18)).toBe(5);
    expect(photoExposureZone(0.09)).toBe(4);
    expect(photoExposureZone(0.36)).toBe(6);
    expect(photoExposureZone(0)).toBe(0);
    expect(photoExposureZone(1)).toBe(7);
  });

  test('creates deterministic focus and exposure overlays without changing source pixels', () => {
    const source = rgba([0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255]);
    const original = source.slice();
    const focus = createPhotoInspectionOverlay(source, 3, 1, 'focus');
    const zones = createPhotoInspectionOverlay(source, 3, 1, 'exposure-zones');
    expect(focus[3]).toBeGreaterThan(0);
    expect(focus[7]).toBeGreaterThan(0);
    expect(zones[3]).toBe(156);
    expect(zones[7]).toBe(156);
    expect(source).toEqual(original);
  });

  test('rejects incomplete rasters instead of reading outside caller-owned bytes', () => {
    expect(() => analyzePhotoScopes(new Uint8ClampedArray(3), 1, 1)).toThrow(/complete positive-size RGBA raster/i);
    expect(() => createPhotoInspectionOverlay(new Uint8ClampedArray(4), 0, 1, 'focus')).toThrow(/complete positive-size RGBA raster/i);
  });
});
