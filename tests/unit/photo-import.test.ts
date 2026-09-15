import { afterEach, describe, expect, test, vi } from 'vitest';
import { makePhotoTiff } from '../fixtures/photo-tiff';
import { makePhotoDng } from '../fixtures/photo-dng';
import {
  PhotoImportError,
  normalizePhotoImport,
  photoImportErrorMessage,
  readPhotoClipboard,
  preparePhotoRaster,
  releasePhotoRaster,
} from '../../src/tools/photo/photo-import';
import { normalizeRawSettings } from '../../src/tools/photo/photo-raw-settings';

function file(name: string, type: string, contents = 'pixels') {
  return new File([contents], name, { type });
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Photo Studio import contract', () => {
  test('RAW variants use normalized cache keys and an old failure cannot evict a newer queued variant', async () => {
    const workers: VariantWorker[] = [];
    const bytes = makePhotoDng();
    class VariantWorker {
      onmessage: ((event: { data: { blob?: Blob; error?: string } }) => void) | null = null;
      started = false;
      constructor() { workers.push(this); }
      postMessage(message: ArrayBuffer | { buffer: ArrayBuffer; settings: unknown }, transfer: Transferable[]) {
        const buffer = message instanceof ArrayBuffer ? message : message.buffer;
        expect(transfer).toEqual([buffer]); expect(new Uint8Array(buffer)).toEqual(bytes);
        if (!(message instanceof ArrayBuffer)) expect(message.settings).toEqual({ whiteBalance: 'custom', redMultiplier: 4, blueMultiplier: 1, highlight: 'clip', demosaic: 'ahd' });
        this.started = true;
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', VariantWorker); vi.stubGlobal('OffscreenCanvas', class {});
    const input = new File([bytes], 'variants.dng', { type: 'image/x-adobe-dng' });
    const prepare = preparePhotoRaster as (file: Blob, settings?: unknown) => ReturnType<typeof preparePhotoRaster>;
    const first = prepare(input);
    const settings = normalizeRawSettings({ whiteBalance: 'custom', redMultiplier: 20 });
    const second = prepare(input, settings);
    const distinct = second !== first;
    void second.catch(() => undefined);
    expect(prepare(input, { ...settings, redMultiplier: 20 })).toBe(second);
    const firstRejection = expect(first).rejects.toThrow('old variant failed');
    await vi.waitFor(() => expect(workers[0]?.started).toBe(true));
    workers[0].onmessage?.({ data: { error: 'old variant failed' } }); await firstRejection;
    expect(distinct).toBe(true);
    expect(prepare(input, settings)).toBe(second);
    await vi.waitFor(() => expect(workers[1]?.started).toBe(true));
    expect(workers).toHaveLength(2);
    const png = new Blob(['custom'], { type: 'image/png' });
    workers[1].onmessage?.({ data: { blob: png } });
    await expect(second).resolves.toMatchObject({ blob: png });
    releasePhotoRaster(input);
  });
  test.each([
    { extension: 'tif', bytes: makePhotoTiff(), type: 'image/tiff', seconds: 20 },
    { extension: 'dng', bytes: makePhotoDng(), type: 'image/x-adobe-dng', seconds: 30 },
  ])('terminates a stalled .$extension worker at its deadline rather than blocking the decoder queue forever', async ({ extension, bytes, type, seconds }) => {
    vi.useFakeTimers();
    let started = false;
    let terminated = false;
    vi.stubGlobal('Worker', class {
      postMessage() { started = true; }
      terminate() { terminated = true; }
    });
    vi.stubGlobal('OffscreenCanvas', class {});
    const input = new File([bytes], `deadline.${extension}`, { type });
    const rejection = expect(preparePhotoRaster(input)).rejects.toThrow(new RegExp(`${seconds}-second time limit`));
    await vi.waitFor(() => expect(started).toBe(true));
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    await rejection;
    expect(terminated).toBe(true);
  });

  test('a misleading TIFF extension does not override an explicit native image MIME', async () => {
    const png = file('native.tiff', 'image/png');
    await expect(preparePhotoRaster(png)).resolves.toEqual({ blob: png });
  });

  test('generic binary TIFF selections reach the decoder but explicit text files remain excluded', () => {
    const tiff = new File([makePhotoTiff()], 'capture.tif', { type: 'application/octet-stream' });
    expect(normalizePhotoImport([file('notes.tif', 'text/plain'), tiff], 'drop').file).toBe(tiff);
  });

  test.each([
    { extension: 'tif', bytes: makePhotoTiff(), type: 'image/tiff', worker: 'tiff.worker' },
    { extension: 'dng', bytes: makePhotoDng(), type: 'image/jpeg', worker: 'raw.worker' },
  ])('signature detection shares one lazy .$extension task and serializes distinct sources', async ({ extension, bytes, type, worker }) => {
    const workers: FakeTiffWorker[] = [];
    class FakeTiffWorker {
      onmessage: ((event: { data: { blob?: Blob; notice?: string; error?: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      buffer: ArrayBuffer | null = null;
      terminated = false;
      constructor(url: URL, options: WorkerOptions) {
        expect(String(url)).toContain(worker); expect(options.type).toBe('module');
        workers.push(this);
      }
      postMessage(buffer: ArrayBuffer, transfer: Transferable[]) {
        expect(transfer).toEqual([buffer]); expect(new Uint8Array(buffer)).toEqual(bytes);
        this.buffer = buffer;
      }
      terminate() { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeTiffWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const first = new File([bytes], 'signature.jpg', { type: 'image/jpeg' });
    const second = new File([bytes], `next.${extension}`, { type });
    const task = preparePhotoRaster(first);
    expect(preparePhotoRaster(first)).toBe(task);
    const next = preparePhotoRaster(second);
    await vi.waitFor(() => expect(workers[0]?.buffer).toBeInstanceOf(ArrayBuffer));
    expect(workers).toHaveLength(1);
    const png = new Blob(['raster'], { type: 'image/png' });
    workers[0].onmessage?.({ data: { blob: png, notice: '8-bit raster' } });
    await expect(task).resolves.toEqual({ blob: png, notice: '8-bit raster' });
    expect(workers[0].terminated).toBe(true);
    await vi.waitFor(() => expect(workers[1]?.buffer).toBeInstanceOf(ArrayBuffer));
    workers[1].onmessage?.({ data: { error: 'Unsupported TIFF orientation.' } });
    await expect(next).rejects.toThrow(/orientation/);
    expect(workers[1].terminated).toBe(true);
    const retry = preparePhotoRaster(second);
    await vi.waitFor(() => expect(workers[2]?.buffer).toBeInstanceOf(ArrayBuffer));
    workers[2].onmessage?.({ data: { blob: png } });
    await expect(retry).resolves.toEqual({ blob: png, notice: undefined });
    releasePhotoRaster(second);
    const uncached = preparePhotoRaster(second);
    expect(uncached).not.toBe(retry);
    await vi.waitFor(() => expect(workers[3]?.buffer).toBeInstanceOf(ArrayBuffer));
    workers[3].onmessage?.({ data: { blob: png } });
    await expect(uncached).resolves.toEqual({ blob: png, notice: undefined });
  });

  test('normalizes picker and drop collections through one image selection rule', () => {
    const image = file('portrait.png', 'image/png');
    expect(normalizePhotoImport([file('notes.png', 'text/plain'), image], 'drop')).toEqual({
      file: image,
      source: 'drop',
    });
    expect(normalizePhotoImport([file('capture.webp', '')], 'file-input').file.name).toBe('capture.webp');
  });

  test('rejects collections without a browser-readable image', () => {
    expect(() => normalizePhotoImport([file('notes.txt', 'text/plain')], 'drop')).toThrow(PhotoImportError);
    try {
      normalizePhotoImport([], 'drop');
    } catch (error) {
      expect(error).toMatchObject({ code: 'no-image', source: 'drop' });
      expect(photoImportErrorMessage(error)).toContain('No browser-readable image was dropped');
    }
  });

  test('converts the first clipboard image blob into a named file candidate', async () => {
    const blob = new Blob(['pixels'], { type: 'image/png' });
    const candidate = await readPhotoClipboard({
      read: async () => [{
        types: ['text/plain', 'image/png'],
        getType: async (type) => {
          expect(type).toBe('image/png');
          return blob;
        },
      }],
    });

    expect(candidate.source).toBe('clipboard');
    expect(candidate.file.name).toBe('clipboard-image.png');
    expect(candidate.file.type).toBe('image/png');
    expect(await candidate.file.text()).toBe('pixels');
  });

  test('explains unavailable, denied, and empty clipboard reads', async () => {
    await expect(readPhotoClipboard(undefined)).rejects.toMatchObject({ code: 'clipboard-unavailable' });
    await expect(readPhotoClipboard({
      read: async () => { throw new DOMException('denied', 'NotAllowedError'); },
    })).rejects.toMatchObject({ code: 'clipboard-denied' });
    await expect(readPhotoClipboard({
      read: async () => [{
        types: ['image/png'],
        getType: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      }],
    })).rejects.toMatchObject({ code: 'clipboard-denied' });
    await expect(readPhotoClipboard({
      read: async () => [{ types: ['text/plain'], getType: async () => new Blob() }],
    })).rejects.toMatchObject({ code: 'no-image', source: 'clipboard' });
  });
});
