import { describe, expect, test } from 'vitest';
import { safeRequestedPhotoFilename } from '../../src/tools/photo/photo-metadata';

describe('Photo Studio export filenames', () => {
  test('uses an edited user stem and enforces the selected format extension', () => {
    expect(safeRequestedPhotoFilename('Campaign Final.png', 'source.cr2', 'image/jpeg')).toBe('Campaign Final.jpg');
    expect(safeRequestedPhotoFilename('Campaign Final.jpg', 'source.cr2', 'image/webp')).toBe('Campaign Final.webp');
  });

  test('sanitizes reserved filename characters without discarding useful words', () => {
    expect(safeRequestedPhotoFilename('Client: Spring / Hero*', 'source.jpg', 'image/png')).toBe('Client- Spring - Hero-.png');
  });

  test('falls back to the normal edited source name when the requested name is empty', () => {
    expect(safeRequestedPhotoFilename('   ', 'portrait.NEF', 'image/jpeg')).toBe('portrait-edited.jpg');
  });
});