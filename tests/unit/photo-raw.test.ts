import { describe, expect, test, vi } from 'vitest';
import { makePhotoDng } from '../fixtures/photo-dng';
import { decodeRawPixels, detectRawSource } from '../../src/tools/photo/codecs/raw-decoder';
import { normalizePhotoImport } from '../../src/tools/photo/photo-import';
import { DEFAULT_RECIPE, commitHistory, createHistory, normalizeRecipe, undoHistory } from '../../src/tools/photo/photo-engine';
import type { PhotoRecipe } from '../../src/tools/photo/photo-types';

const rawDefaults = { whiteBalance: 'camera', redMultiplier: 1, blueMultiplier: 1, highlight: 'clip', demosaic: 'ahd' };
const develop = decodeRawPixels as (buffer: ArrayBuffer, settings?: unknown) => ReturnType<typeof decodeRawPixels>;

describe('Photo Studio RAW acquisition', () => {
  test.each([
    { input: undefined, expected: rawDefaults },
    { input: { whiteBalance: 'custom', redMultiplier: 20, blueMultiplier: -4, highlight: 'blend', demosaic: 'bilinear' }, expected: { whiteBalance: 'custom', redMultiplier: 4, blueMultiplier: 0.25, highlight: 'blend', demosaic: 'bilinear' } },
    { input: { whiteBalance: 'bad', redMultiplier: NaN, blueMultiplier: Infinity, highlight: 9, demosaic: 'uncompiled' }, expected: rawDefaults },
  ])('normalizes durable RAW options without trusting imported values: $input', ({ input, expected }) => {
    const recipe = normalizeRecipe({ ...DEFAULT_RECIPE, raw: input } as unknown as PhotoRecipe);
    expect((recipe as unknown as { raw: unknown }).raw).toEqual(expected);
  });
  test('RAW settings survive serialized recipes and undo as independent snapshots', () => {
    const input = { ...DEFAULT_RECIPE, raw: { ...rawDefaults, whiteBalance: 'custom', redMultiplier: 2 } } as unknown as PhotoRecipe;
    const history = commitHistory(createHistory(DEFAULT_RECIPE), input);
    (input as unknown as { raw: typeof rawDefaults }).raw.redMultiplier = 4;
    expect((history.present as unknown as { raw: unknown }).raw).toEqual({ ...rawDefaults, whiteBalance: 'custom', redMultiplier: 2 });
    expect((normalizeRecipe(JSON.parse(JSON.stringify(history.present))) as unknown as { raw: unknown }).raw).toEqual({ ...rawDefaults, whiteBalance: 'custom', redMultiplier: 2 });
    expect((undoHistory(history).present as unknown as { raw: unknown }).raw).toEqual(rawDefaults);
  });
  test('inspects actual RAW geometry, camera facts and source-gated processing capabilities', async () => {
    const result = await decodeRawPixels(makePhotoDng().buffer);
    expect((result as unknown as { rawSource: unknown }).rawSource).toMatchObject({
      model: 'Synthetic Bayer', rawWidth: 32, rawHeight: 32, activeWidth: 32, activeHeight: 32,
      layout: 'Bayer CFA', cameraWhiteBalance: true, colorControls: true, demosaicControl: true,
    });
  });
  test.each([{ key: 'redMultiplier', channel: 0 }, { key: 'blueMultiplier', channel: 2 }])('custom RAW $key changes sensor development without changing input bytes', async ({ key, channel }) => {
    const source = makePhotoDng(); const original = source.slice();
    const camera = await develop(source.buffer);
    const custom = await develop(source.buffer, { ...rawDefaults, whiteBalance: 'custom', [key]: 2 });
    expect(custom.samples).not.toEqual(camera.samples);
    expect(custom.rgba[channel]).toBeGreaterThan(custom.rgba[1]);
    expect(source).toEqual(original);
  });
  test.each(['bilinear', 'vng', 'ppg'])('Bayer %s interpolation affects actual developed detail', async (demosaic) => {
    const source = makePhotoDng({ patterned: true });
    const ahd = await develop(source.buffer);
    const alternate = await develop(source.buffer, { ...rawDefaults, demosaic });
    expect(alternate.samples).not.toEqual(ahd.samples);
  });
  test.each(['blend', 'unclip'])('RAW highlight %s changes clipped patterned data rather than a post-raster slider', async (highlight) => {
    const source = makePhotoDng({ patterned: true });
    const clipped = await develop(source.buffer, { ...rawDefaults, whiteBalance: 'custom', redMultiplier: 4 });
    const alternate = await develop(source.buffer, { ...rawDefaults, whiteBalance: 'custom', redMultiplier: 4, highlight });
    expect(alternate.samples).not.toEqual(clipped.samples);
  });
  test('daylight reference is a distinct RAW white-balance development policy', async () => {
    const source = makePhotoDng();
    const camera = await develop(source.buffer);
    const daylight = await develop(source.buffer, { ...rawDefaults, whiteBalance: 'daylight' });
    expect(daylight.samples).not.toEqual(camera.samples);
  });
  test.each([
    { colors: 1, filters: 0, colorControls: false, layout: 'Other' },
    { colors: 3, filters: 9, colorControls: true, layout: 'X-Trans CFA' },
    { colors: 3, filters: 0, colorControls: true, layout: 'Linear RGB' },
  ])('does not expose or apply Bayer-only choices to different source facts: $layout', async ({ colors, filters, colorControls, layout }) => {
    const { LibRaw } = await import('@colorhythm/libraw-wasm');
    // Override only descriptive facts; processing still exercises the real backend.
    const colorFact = vi.spyOn(LibRaw.prototype, 'getColors').mockReturnValue(colors);
    const filterFact = vi.spyOn(LibRaw.prototype, 'getFilters').mockReturnValue(filters);
    const demosaic = vi.spyOn(LibRaw.prototype, 'setDemosaic');
    const multipliers = vi.spyOn(LibRaw.prototype, 'setUserMul');
    try {
      const result = await develop(makePhotoDng().buffer, { ...rawDefaults, whiteBalance: 'custom', redMultiplier: 2, demosaic: 'bilinear' });
      expect((result as unknown as { rawSource: unknown }).rawSource).toMatchObject({ colorControls, demosaicControl: false, layout });
      expect(demosaic).not.toHaveBeenCalled();
      if (!colorControls) expect(multipliers).not.toHaveBeenCalled();
    } finally { colorFact.mockRestore(); filterFact.mockRestore(); demosaic.mockRestore(); multipliers.mockRestore(); }
  });
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
