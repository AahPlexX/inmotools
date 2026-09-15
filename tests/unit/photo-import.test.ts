import { afterEach, describe, expect, test, vi } from 'vitest';
import { makePhotoTiff } from '../fixtures/photo-tiff';
import {
  PhotoImportError,
  normalizePhotoImport,
  photoImportErrorMessage,
  readPhotoClipboard,
  preparePhotoRaster,
  releasePhotoRaster,
} from '../../src/tools/photo/photo-import';

function file(name: string, type: string, contents = 'pixels') {
  return new File([contents], name, { type });
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Photo Studio import contract', () => {
  test('terminates a stalled TIFF worker at the deadline rather than blocking the decoder queue forever', async () => {
    vi.useFakeTimers();
    let started = false;
    let terminated = false;
    vi.stubGlobal('Worker', class {
      postMessage() { started = true; }
      terminate() { terminated = true; }
    });
    vi.stubGlobal('OffscreenCanvas', class {});
    const input = new File([makePhotoTiff()], 'deadline.tif', { type: 'image/tiff' });
    const rejection = expect(preparePhotoRaster(input)).rejects.toThrow(/20-second time limit/);
    await vi.waitFor(() => expect(started).toBe(true));
    await vi.advanceTimersByTimeAsync(20_000);
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

  test('signature detection shares one lazy TIFF task and serializes distinct sources', async () => {
    const workers: FakeTiffWorker[] = [];
    class FakeTiffWorker {
      onmessage: ((event: { data: { blob?: Blob; notice?: string; error?: string } }) => void) | null = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      buffer: ArrayBuffer | null = null;
      terminated = false;
      constructor() { workers.push(this); }
      postMessage(buffer: ArrayBuffer) { this.buffer = buffer; }
      terminate() { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeTiffWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const first = new File([makePhotoTiff()], 'signature.jpg', { type: 'image/jpeg' });
    const second = new File([makePhotoTiff()], 'next.tif', { type: 'image/tiff' });
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
