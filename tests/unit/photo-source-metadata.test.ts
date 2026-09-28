import { describe, expect, test } from 'vitest';
import { summarizeSourceTags } from '../../src/tools/photo/photo-source-metadata';

describe('source metadata inspection', () => {
  test('summarises camera, capture, location, and embedded profile facts', () => {
    const summary = summarizeSourceTags({
      exif: {
        Make: { description: 'FUJIFILM' },
        Model: { description: 'X-T5' },
        LensModel: { description: 'XF16-55mmF2.8 R LM WR' },
        DateTimeOriginal: { description: '2026:09:20 18:42:07' },
        ExposureTime: { description: '1/250' },
        FNumber: { description: 'f/5.6' },
        ISOSpeedRatings: { description: '160' },
        FocalLength: { description: '23 mm' },
        FocalLengthIn35mmFilm: { description: '35' },
      },
      gps: { Latitude: 38.7223, Longitude: -9.1393, Altitude: 12 },
      icc: { 'ICC Description': { description: 'Display P3' }, 'Color Space': { description: 'RGB' }, 'Profile/Device class': { description: 'Display Device profile' }, 'Profile Version': { description: '4.0.0' } },
    });
    expect(summary.camera).toEqual([{ label: 'Camera', value: 'FUJIFILM X-T5' }, { label: 'Lens', value: 'XF16-55mmF2.8 R LM WR' }]);
    expect(summary.capture).toContainEqual({ label: 'Focal length', value: '23 mm (35 mm full-frame equivalent)' });
    expect(summary.capture).toContainEqual({ label: 'Shutter', value: '1/250' });
    expect(summary.location).toEqual({ latitude: 38.7223, longitude: -9.1393, altitude: 12 });
    expect(summary.colorProfile).toEqual({ description: 'Display P3', colorSpace: 'RGB', deviceClass: 'Display Device profile', version: '4.0.0' });
    expect(summary.found).toBe(true);
  });

  test('does not repeat the maker when the model already includes it', () => {
    expect(summarizeSourceTags({ exif: { Make: { description: 'Canon' }, Model: { description: 'Canon EOS R6' } } }).camera[0].value).toBe('Canon EOS R6');
  });

  test('untrusted text is cleaned and bounded; out-of-range GPS is ignored', () => {
    const summary = summarizeSourceTags({ exif: { Software: { description: `bad\u0000text${'x'.repeat(200)}` } }, gps: { Latitude: 123, Longitude: 5 } });
    expect(summary.camera[0].value.startsWith('bad text')).toBe(true);
    expect(summary.camera[0].value.length).toBeLessThanOrEqual(80);
    expect(summary.location).toBeNull();
  });

  test('a file without metadata reports nothing found', () => {
    expect(summarizeSourceTags({})).toEqual({ camera: [], capture: [], location: null, colorProfile: null, found: false });
  });
});

describe('duplicate source detection', () => {
  const project = (id: string, source: Partial<{ name: string; size: number; lastModified: number; sha256: string }>, updatedAt = 1) => ({
    id, name: `Project ${id}`, updatedAt, source: { name: 'a.jpg', size: 10, lastModified: 5, ...source },
  });

  test('fingerprints are SHA-256 hex of the bytes', async () => {
    const { fingerprintPhotoSource } = await import('../../src/tools/photo/photo-source-metadata');
    // SHA-256("abc") from FIPS 180-2 Appendix B.1.
    expect(await fingerprintPhotoSource(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('matches by fingerprint first, falls back to exact file facts for older projects, and skips the open project', async () => {
    const { findDuplicateProject } = await import('../../src/tools/photo/photo-source-metadata');
    const file = { name: 'a.jpg', size: 10, lastModified: 5 };
    const hashed = project('h', { sha256: 'f'.repeat(64), name: 'renamed.jpg' }, 2);
    const legacy = project('l', {}, 3);
    const other = project('o', { sha256: 'e'.repeat(64) }, 4);
    expect(findDuplicateProject([hashed, other], file, 'f'.repeat(64))?.id).toBe('h');
    expect(findDuplicateProject([legacy, other], file, 'd'.repeat(64))?.id).toBe('l');
    expect(findDuplicateProject([hashed, legacy], file, 'f'.repeat(64))?.id).toBe('l'); // Most recently edited wins.
    expect(findDuplicateProject([hashed], file, 'f'.repeat(64), 'h')).toBeNull();
    expect(findDuplicateProject([other], { ...file, size: 11 }, null)).toBeNull();
  });
});
