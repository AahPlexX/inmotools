import { describe, expect, test } from 'vitest';
import { makePhotoTiff } from '../fixtures/photo-tiff';
import { decodeTiffPixels } from '../../src/tools/photo/codecs/tiff-decoder';

describe('Photo Studio bounded TIFF decoding', () => {
  test.each([true, false])('decodes RGB without modifying the original bytes (little endian: %s)', async (littleEndian) => {
    const bytes = makePhotoTiff({ littleEndian });
    const original = bytes.slice();
    const decoded = await decodeTiffPixels(bytes.buffer);
    expect([decoded.width, decoded.height, decoded.bitDepth]).toEqual([2, 1, 8]);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(bytes).toEqual(original);
  });

  test('retains exact 16-bit samples until the disclosed 8-bit raster conversion', async () => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ bits: 16, samples: [65535, 32768, 1, 0, 65535, 257] }).buffer);
    expect(decoded.samples).toBeInstanceOf(Uint16Array);
    expect([...decoded.samples]).toEqual([65535, 32768, 1, 0, 65535, 257]);
    expect([...decoded.rgba]).toEqual([255, 128, 0, 255, 0, 255, 1, 255]);
    expect(decoded.notice).toMatch(/16-bit.*8-bit/i);
  });

  test.each([
    { photometric: 1, expected: [0, 0, 0, 255, 255, 255, 255, 255] },
    { photometric: 0, expected: [255, 255, 255, 255, 0, 0, 0, 255] },
  ])('normalizes grayscale photometric $photometric', async ({ photometric, expected }) => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ components: 1, photometric, samples: [0, 255] }).buffer);
    expect([...decoded.rgba]).toEqual(expected);
  });

  test('preserves unassociated RGBA alpha', async () => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ components: 4, extraSample: 2, samples: [255, 0, 0, 128, 0, 255, 0, 0] }).buffer);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 128, 0, 255, 0, 0]);
  });

  test.each([8, 32946])('decodes bounded Deflate strips (compression %s)', async (compression) => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ compression, encoded: [120, 156, 251, 207, 192, 192, 240, 159, 1, 0, 7, 254, 1, 255] }).buffer);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  test('applies horizontal prediction through the same decoder', async () => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ predictor: 2, samples: [255, 0, 0, 1, 255, 0] }).buffer);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  test('uses only the first page, even when the next directory cycles', async () => {
    const decoded = await decodeTiffPixels(makePhotoTiff({ nextIfd: 8 }).buffer);
    expect(decoded.notice).toMatch(/first page/i);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  test.each([
    { options: { width: 0 }, error: /dimensions/i },
    { options: { width: 100000 }, error: /limit/i },
    { options: { orientation: 6 }, error: /orientation/i },
    { options: { fillOrder: 2 }, error: /fill order/i },
    { options: { bits: 32 }, error: /bit depth/i },
    { options: { photometric: 5 }, error: /color/i },
    { options: { compression: 5 }, error: /compression/i },
    { options: { compression: 32773 }, error: /compression/i },
    { options: { components: 4, extraSample: 1 }, error: /alpha/i },
    { options: { samples: [255] }, error: /strip/i },
    { options: { width: 1, compression: 8, encoded: [120, 156, 251, 207, 192, 192, 240, 159, 1, 0, 7, 254, 1, 255] }, error: /strip.*size/i },
  ])('rejects unsafe/unsupported TIFF $options', async ({ options, error }) => {
    await expect(decodeTiffPixels(makePhotoTiff(options).buffer)).rejects.toThrow(error);
  });

  test('rejects truncated directories before allocating raster data', async () => {
    await expect(decodeTiffPixels(makePhotoTiff().slice(0, 25).buffer)).rejects.toThrow(/directory|truncated/i);
  });

  test('rejects invalid and BigTIFF signatures explicitly', async () => {
    await expect(decodeTiffPixels(new ArrayBuffer(8))).rejects.toThrow(/TIFF/i);
    const bytes = makePhotoTiff();
    bytes[2] = 43;
    await expect(decodeTiffPixels(bytes.buffer)).rejects.toThrow(/BigTIFF/i);
  });

  test('ignores cyclic EXIF pointers rather than recursively parsing untrusted metadata', async () => {
    const bytes = makePhotoTiff();
    const view = new DataView(bytes.buffer);
    const entry = 10 + 13 * 12;
    view.setUint16(entry, 34665, true);
    view.setUint16(entry + 2, 4, true);
    view.setUint32(entry + 8, 8, true);
    const decoded = await decodeTiffPixels(bytes.buffer);
    expect([...decoded.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });
});
