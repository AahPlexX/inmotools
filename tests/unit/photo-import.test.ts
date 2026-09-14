import { describe, expect, test } from 'vitest';
import {
  PhotoImportError,
  normalizePhotoImport,
  photoImportErrorMessage,
  readPhotoClipboard,
} from '../../src/tools/photo/photo-import';

function file(name: string, type: string, contents = 'pixels') {
  return new File([contents], name, { type });
}

describe('Photo Studio import contract', () => {
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
