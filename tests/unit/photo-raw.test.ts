import { describe, expect, test, vi } from 'vitest';
import { makePhotoDng } from '../fixtures/photo-dng';
import { decodeRawPixels, detectRawSource } from '../../src/tools/photo/codecs/raw-decoder';
import { normalizePhotoImport } from '../../src/tools/photo/photo-import';

describe('Photo Studio RAW acquisition', () => {
  test.each(['dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw'])('accepts a generic binary .%s source without admitting explicit text', (extension) => {
    const raw = new File(['raw'], `camera.${extension}`, { type: 'application/octet-stream' });
    const text = new File(['text'], `notes.${extension}`, { type: 'text/plain' });
    expect(normalizePhotoImport([text, raw], 'drop').file).toBe(raw);
  });
  test('detects a DNG directory before generic TIFF even with misleading native MIME/name', async () => {
    await expect(detectRawSource(new File([makePhotoDng()], 'sensor.jpg', { type: 'image/jpeg' }))).resolves.toBe(true);
    await expect(detectRawSource(new File(['png'], 'native.dng', { type: 'image/png' }))).resolves.toBe(false);
  });
  test('routes generic camera RAW MIME files by their RAW extension without overriding native JPEG MIME', async () => {
    await expect(detectRawSource(new File(['camera'], 'source.nef', { type: 'image/x-raw' }))).resolves.toBe(true);
    await expect(detectRawSource(new File(['jpeg'], 'native.nef', { type: 'image/jpeg' }))).resolves.toBe(false);
  });
  test('decodes actual Bayer samples through LibRaw into an owned 16-bit intermediate', async () => {
    const input = makePhotoDng();
    const original = input.slice();
    const result = await decodeRawPixels(input.buffer);
    expect(input).toEqual(original);
    expect(result.width).toBe(32); expect(result.height).toBe(32);
    expect(result.samples).toBeInstanceOf(Uint16Array);
    expect(result.samples.length).toBe(32 * 32 * 3);
    // Fixed LibRaw 0.22.1 RGB characterization for the original neutral mosaic.
    expect([...result.samples.slice(0, 3)]).toEqual([35200, 35201, 35201]);
    expect(result.rgba.length).toBe(32 * 32 * 4);
    expect([...result.rgba.slice(0, 4)]).toEqual([137, 137, 137, 255]);
    await decodeRawPixels(makePhotoDng({ sample: 2048 }).buffer);
    expect([...result.samples.slice(0, 3)]).toEqual([35200, 35201, 35201]);
    expect(result.notice).toMatch(/RAW source preserved.*16-bit.*8-bit/);
  });
  test.each([{ width: 0 }, { width: 100000 }, { width: 4096, height: 4096 }])('rejects unsafe RAW geometry before unpacking: %j', async (geometry) => {
    const { LibRaw } = await import('@colorhythm/libraw-wasm');
    const unpack = vi.spyOn(LibRaw.prototype, 'unpack');
    try {
      await expect(decodeRawPixels(makePhotoDng(geometry).buffer)).rejects.toThrow(/RAW|LibRaw|Unsupported/i);
      expect(unpack).not.toHaveBeenCalled();
    } finally { unpack.mockRestore(); }
  });
  test('rejects malformed sources without turning random bytes into a raster', async () => {
    await expect(decodeRawPixels(new ArrayBuffer(12))).rejects.toThrow(/RAW|LibRaw|Unsupported/i);
  });
  test('rejects pixel-aspect output expansion before unpacking or allocating the processed image', async () => {
    const { LibRaw } = await import('@colorhythm/libraw-wasm');
    const unpack = vi.spyOn(LibRaw.prototype, 'unpack').mockImplementation(() => { throw new Error('Unexpected unpack before geometry validation'); });
    try {
      await expect(decodeRawPixels(makePhotoDng({ width: 2048, pixelAspect: 4 }).buffer)).rejects.toThrow(/RAW dimensions|RAW pixel aspect/);
      expect(unpack).not.toHaveBeenCalled();
    } finally { unpack.mockRestore(); }
  });
});
