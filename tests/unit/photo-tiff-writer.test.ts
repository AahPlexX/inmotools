import { decode } from 'tiff';
import { describe, expect, test } from 'vitest';
import { parsePhotoIccProfile } from '../../src/tools/photo/color/photo-color-management';
import { embedPhotoIcc, embedPhotoXmp } from '../../src/tools/photo/photo-metadata-embed';
import { photoSrgbProfileBytes, photoSrgbProfileFile } from '../fixtures/photo-srgb-profile';
import { safePhotoFilename } from '../../src/tools/photo/photo-metadata';
import { encodePhotoTiff, hasTransparency, readPhotoTiff, withPhotoTiffExtras } from '../../src/tools/photo/photo-tiff-writer';

function gradient(width: number, height: number, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([x * 3 % 256, y * 5 % 256, (x + y) % 256, alpha], (y * width + x) * 4);
  }
  return data;
}

describe('baseline TIFF writer', () => {
  test('an independent decoder reads back identical RGB pixels, size, and resolution', () => {
    const pixels = gradient(300, 250);
    const bytes = encodePhotoTiff(pixels, 300, 250, { alpha: false, ppi: 300 });
    // 300 × 3 bytes per row → 72 rows per 64 KiB strip → 4 strips for 250 rows.
    const [ifd] = decode(bytes);
    expect([ifd.width, ifd.height, ifd.samplesPerPixel, ifd.bitsPerSample, ifd.compression]).toEqual([300, 250, 3, 8, 1]);
    expect(ifd.stripOffsets).toHaveLength(4);
    expect(ifd.xResolution).toBeCloseTo(300, 6);
    expect(ifd.resolutionUnit).toBe(2);
    const data = ifd.data as Uint8Array;
    for (let p = 0; p < 300 * 250; p += 997) {
      expect([data[p * 3], data[p * 3 + 1], data[p * 3 + 2]]).toEqual([pixels[p * 4], pixels[p * 4 + 1], pixels[p * 4 + 2]]);
    }
  });

  test('transparency is kept as unassociated alpha (ExtraSamples = 2)', () => {
    const pixels = gradient(20, 10, 128);
    expect(hasTransparency(pixels)).toBe(true);
    const [ifd] = decode(encodePhotoTiff(pixels, 20, 10, { alpha: true }));
    expect(ifd.samplesPerPixel).toBe(4);
    expect(ifd.extraSamples).toEqual([2]);
    expect(ifd.alpha).toBe(true);
    expect(ifd.associatedAlpha).toBe(false);
    expect((ifd.data as Uint8Array)[3]).toBe(128);
  });

  test('ICC (34675) and XMP (700) tags round-trip and survive a later rewrite', () => {
    const icc = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const xmp = new TextEncoder().encode('<x:xmpmeta/>');
    const original = encodePhotoTiff(gradient(8, 6), 8, 6, { alpha: false, icc });
    const [ifd] = decode(original);
    expect(Array.from(ifd.get(34675) as Uint8Array)).toEqual(Array.from(icc));
    const rewritten = withPhotoTiffExtras(original, { xmp, ppi: 240 });
    const contents = readPhotoTiff(rewritten);
    expect(Array.from(contents.icc ?? [])).toEqual(Array.from(icc));
    expect(new TextDecoder().decode(contents.xmp)).toBe('<x:xmpmeta/>');
    expect(contents.ppi).toBe(240);
    expect(Array.from(contents.pixels)).toEqual(Array.from(gradient(8, 6)));
  });

  test('the shared embedders accept TIFF like the other containers', async () => {
    const tiff = new Blob([encodePhotoTiff(gradient(4, 4), 4, 4, { alpha: false }) as Uint8Array<ArrayBuffer>], { type: 'image/tiff' });
    const withXmp = await embedPhotoXmp(tiff, 'image/tiff', '<x:xmpmeta>rights</x:xmpmeta>', { width: 4, height: 4, ppi: 300 });
    expect(withXmp.type).toBe('image/tiff');
    const read = readPhotoTiff(new Uint8Array(await withXmp.arrayBuffer()));
    expect(new TextDecoder().decode(read.xmp)).toContain('rights');
    expect(read.ppi).toBe(300);
    const profile = await parsePhotoIccProfile(photoSrgbProfileFile());
    const withIcc = await embedPhotoIcc(withXmp, 'image/tiff', profile, { width: 4, height: 4 });
    const reread = readPhotoTiff(new Uint8Array(await withIcc.arrayBuffer()));
    expect(Array.from(reread.icc ?? [])).toEqual(Array.from(photoSrgbProfileBytes()));
    expect(new TextDecoder().decode(reread.xmp)).toContain('rights');
  });

  test('file names use the .tif extension', () => {
    expect(safePhotoFilename('holiday.jpg', 'image/tiff')).toBe('holiday-edited.tif');
  });

  test('invalid input is refused', () => {
    expect(() => encodePhotoTiff(new Uint8ClampedArray(4), 0, 1, { alpha: false })).toThrow(/positive/);
    expect(() => encodePhotoTiff(new Uint8ClampedArray(4), 2, 2, { alpha: false })).toThrow(/smaller/);
    expect(() => readPhotoTiff(new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]))).toThrow(/little-endian/);
  });
});
