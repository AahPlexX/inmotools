import { normalizeRawSettings } from '../../src/tools/photo/photo-raw-settings';
import { describe, expect, test, vi } from 'vitest';
import { makePhotoDng } from '../fixtures/photo-dng';
import { applyRawExposure, decodeRawPixels, detectRawSource, rawPreviewJpegGeometry } from '../../src/tools/photo/codecs/raw-decoder';
import { normalizePhotoImport } from '../../src/tools/photo/photo-import';
import { DEFAULT_RECIPE, commitHistory, createHistory, normalizeRecipe, undoHistory } from '../../src/tools/photo/photo-engine';
import type { PhotoRecipe } from '../../src/tools/photo/photo-types';

const rawDefaults = { whiteBalance: 'camera', redMultiplier: 1, blueMultiplier: 1, highlight: 'clip', demosaic: 'ahd', exposureEv: 0, highlightPreservation: 0 };
const develop = decodeRawPixels as (buffer: ArrayBuffer, settings?: unknown) => ReturnType<typeof decodeRawPixels>;

describe('Photo Studio RAW acquisition', () => {
  test('embedded RGB previews retain the source orientation needed for display', async () => {
    const consumer = vi.fn(async () => undefined);
    await decodeRawPixels(makePhotoDng({ thumbnail: true, orientation: 6 }).buffer, undefined, consumer);
    expect(consumer).toHaveBeenCalledTimes(1);
    const preview = consumer.mock.calls[0] as unknown as [{ width: number; height: number; flip: number }];
    expect({ width: preview[0].width, height: preview[0].height, flip: preview[0].flip }).toEqual({ width: 16, height: 8, flip: 6 });
  });
  test.each([0xc0, 0xc1, 0xc2])('bounds supported JPEG SOF %i geometry before browser decoding', (marker) => {
    const header = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, marker, 0, 11, 8, 0, 8, 0, 16, 1, 1, 17, 0]);
    expect(rawPreviewJpegGeometry(header)).toEqual({ width: 16, height: 8 });
    header[15] = 255; header[16] = 255;
    expect(() => rawPreviewJpegGeometry(header)).toThrow(/dimensions/);
    expect(() => rawPreviewJpegGeometry(header.slice(0, 16))).toThrow(/header/);
  });
  test.each([new Uint8Array([255, 216, 255, 224, 0, 0]), new Uint8Array([255, 216, 255, 218, 0, 2]), new Uint8Array([1, 2, 3])])('rejects malformed optional JPEG headers: %j', (header) => {
    expect(() => rawPreviewJpegGeometry(header)).toThrow(/preview JPEG/);
  });
  test('oversized thumbnail geometry is skipped before extraction while full RAW development still succeeds', async () => {
    const { LibRaw } = await import('@colorhythm/libraw-wasm');
    const unpack = vi.spyOn(LibRaw.prototype, 'unpackThumb'); const consumer = vi.fn(async () => undefined);
    try {
      const result = await decodeRawPixels(makePhotoDng({ thumbnail: true, thumbnailWidth: 5000 }).buffer, undefined, consumer);
      expect(consumer).not.toHaveBeenCalled(); expect(unpack).not.toHaveBeenCalled();
      expect([...result.samples.slice(0, 3)]).toEqual([35200, 35201, 35201]);
    } finally { unpack.mockRestore(); }
  });
  test('emits an owned embedded RGB preview before sensor unpack without changing developed pixels', async () => {
    const { LibRaw } = await import('@colorhythm/libraw-wasm');
    const unpack = vi.spyOn(LibRaw.prototype, 'unpack');
    const previews: unknown[] = [];
    const decode = decodeRawPixels as (buffer: ArrayBuffer, settings: undefined, onPreview: (preview: unknown) => Promise<void>) => ReturnType<typeof decodeRawPixels>;
    try {
      const result = await decode(makePhotoDng({ thumbnail: true }).buffer, undefined, async (preview) => {
        expect(unpack).not.toHaveBeenCalled(); previews.push(preview);
      });
      expect(previews).toHaveLength(1);
      const preview = previews[0] as { width: number; height: number; rgba: Uint8ClampedArray };
      expect([preview.width, preview.height]).toEqual([16, 8]);
      expect([...preview.rgba.slice(0, 4)]).toEqual([230, 40, 90, 255]);
      expect([...result.samples.slice(0, 3)]).toEqual([35200, 35201, 35201]);
      await decodeRawPixels(makePhotoDng().buffer);
      expect([...preview.rgba.slice(0, 4)]).toEqual([230, 40, 90, 255]);
    } finally { unpack.mockRestore(); }
  });
  test.each(['missing', 'consumer failure'])('optional preview %s does not prevent full RAW development', async (mode) => {
    const consumer = vi.fn(async () => { throw new Error('preview display unavailable'); });
    const decode = decodeRawPixels as (buffer: ArrayBuffer, settings: undefined, onPreview: typeof consumer) => ReturnType<typeof decodeRawPixels>;
    const result = await decode(makePhotoDng({ thumbnail: mode !== 'missing' }).buffer, undefined, consumer);
    expect(consumer).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);
    expect([...result.samples.slice(0, 3)]).toEqual([35200, 35201, 35201]);
  });
  test.each([
    { input: undefined, expected: rawDefaults },
    { input: { whiteBalance: 'custom', redMultiplier: 20, blueMultiplier: -4, highlight: 'blend', demosaic: 'bilinear', exposureEv: 12 }, expected: { whiteBalance: 'custom', redMultiplier: 4, blueMultiplier: 0.25, highlight: 'blend', demosaic: 'bilinear', exposureEv: 3, highlightPreservation: 0 } },
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
  test('RAW exposure EV shifts sensor data before demosaic in both directions without changing input bytes', async () => {
    const source = makePhotoDng(); const original = source.slice();
    const neutral = await develop(source.buffer, { ...rawDefaults, exposureEv: 0 });
    const raised = await develop(source.buffer, { ...rawDefaults, exposureEv: 1 });
    const lowered = await develop(source.buffer, { ...rawDefaults, exposureEv: -1 });
    expect(raised.samples[1]).toBeGreaterThan(neutral.samples[1]);
    expect(lowered.samples[1]).toBeLessThan(neutral.samples[1]);
    expect(source).toEqual(original);
  });
  test('RAW exposure is repeatable and highlight preservation changes brightened highlights', async () => {
    const source = makePhotoDng({ patterned: true });
    const first = await develop(source.buffer, { ...rawDefaults, exposureEv: 2 });
    const again = await develop(source.buffer, { ...rawDefaults, exposureEv: 2 });
    expect(again.samples).toEqual(first.samples);
    const preserved = await develop(source.buffer, { ...rawDefaults, exposureEv: 2, highlightPreservation: 1 });
    expect(preserved.samples).not.toEqual(first.samples);
  });
  test('RAW exposure refuses to write when the decoder layout cannot be proven', () => {
    // A fake decoder whose setters store fbdd_noiserd somewhere other than the documented offset.
    const heap = new Uint8Array(4096);
    const view = new DataView(heap.buffer);
    const bright = 256;
    const decoder = {
      lr: 128,
      setBright: (value: number) => view.setFloat32(bright, value, true),
      setHighlight: (value: number) => view.setInt32(bright + 16, value, true),
      setOutputBps: (value: number) => view.setInt32(bright + 52, value, true),
      setAdjustMaximumThr: (value: number) => view.setFloat32(bright + 104, value, true),
      setFbddNoiserd: (value: number) => view.setInt32(bright + 200, value, true),
    };
    expect(() => applyRawExposure({ module: { HEAPU8: heap } }, decoder, 1, 0)).toThrow(/could not be verified/);
    expect(view.getFloat32(bright + 140, true)).toBe(0);
    // The same fake with the documented layout is accepted and receives the shift.
    decoder.setFbddNoiserd = (value: number) => view.setInt32(bright + 132, value, true);
    applyRawExposure({ module: { HEAPU8: heap } }, decoder, 1, 0.5);
    expect([view.getInt32(bright + 136, true), view.getFloat32(bright + 140, true), view.getFloat32(bright + 144, true)]).toEqual([1, 2, 0.5]);
  });
  test('RAW exposure settings clamp to the range LibRaw documents for exp_shift', () => {
    expect(normalizeRawSettings({ exposureEv: -4 }).exposureEv).toBe(-2);
    expect(normalizeRawSettings({ exposureEv: 4.5 }).exposureEv).toBe(3);
    expect(normalizeRawSettings({ highlightPreservation: 2 }).highlightPreservation).toBe(1);
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
