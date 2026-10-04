import { describe, expect, it } from 'vitest';
import {
  buildSanitizedFilename,
  buildSanitizedFilenameFromBlob,
  classifyMetadata,
  isAnimatedImage,
  listSensitiveMetadata,
  stripJpegMetadata,
  stripPngMetadata,
  stripWebpMetadata,
} from '../../src/tools/exif/exif-engine';

function asciiBytes(value: string) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

describe('EXIF scrubber helpers', () => {
  it('builds non-destructive output names', () => {
    expect(buildSanitizedFilename('vacation.photo.jpg', 'image/png')).toBe('vacation.photo-sanitized.png');
  });

  it('derives the output extension from the encoded blob MIME type', () => {
    const encoded = new Blob(['image-bytes'], { type: 'image/png' });
    expect(buildSanitizedFilenameFromBlob('vacation.photo.webp', encoded)).toBe('vacation.photo-sanitized.png');
  });

  it('identifies location and device identifiers from parsed tag maps', () => {
    const found = listSensitiveMetadata({
      GPSLatitude: { description: '41.7' },
      GPSLongitude: { description: '-71.3' },
      SerialNumber: { description: 'ABC123' },
      Make: { description: 'CameraCo' },
    });
    expect(found.map((item) => item.key)).toEqual(expect.arrayContaining(['GPSLatitude', 'GPSLongitude', 'SerialNumber', 'Make']));
  });

  it('flags IPTC location and byline fields commonly embedded by editing tools', () => {
    const found = listSensitiveMetadata({
      City: { description: 'Providence' },
      'Province/State': { description: 'Rhode Island' },
      'Country/Primary Location Name': { description: 'USA' },
      'By-line': { description: 'Jane Doe' },
    });
    expect(found.map((item) => item.key)).toEqual(
      expect.arrayContaining(['City', 'Province/State', 'Country/Primary Location Name', 'By-line']),
    );
  });

  it('keeps exposure settings out of the privacy list and labels device fields', () => {
    const found = classifyMetadata({
      Make: { description: 'CameraCo' },
      Orientation: { description: 'Horizontal' },
      ExposureTime: { description: '1/100' },
      DateTimeOriginal: { description: '2026:10:01 09:00:00' },
    });
    expect(found.find((item) => item.key === 'Make')?.risk).toBe('device');
    expect(found.find((item) => item.key === 'DateTimeOriginal')?.risk).toBe('time');
    expect(found.find((item) => item.key === 'Orientation')?.risk).toBe('setting');
    expect(listSensitiveMetadata({ Orientation: { description: 'Horizontal' } })).toEqual([]);
  });

  it('EXF-R02 treats ICC colour-profile tags as settings, not identity fields', () => {
    const found = classifyMetadata({
      'ICC Copyright': { description: 'Copyright Google Inc. 2016' },
      'Profile Creator': { description: 'Google' },
      'ICC Description': { description: 'sRGB IEC61966-2.1' },
      Artist: { description: 'Jane Doe' },
      Copyright: { description: 'Jane Doe 2026' },
    });
    expect(found.find((item) => item.key === 'ICC Copyright')?.risk).toBe('setting');
    expect(found.find((item) => item.key === 'Profile Creator')?.risk).toBe('setting');
    expect(found.find((item) => item.key === 'ICC Description')?.risk).toBe('setting');
    expect(found.find((item) => item.key === 'Artist')?.risk).toBe('identity');
    expect(found.find((item) => item.key === 'Copyright')?.risk).toBe('identity');
  });

  it('detects APNG animation control chunks before image data', () => {
    const bytes = new Uint8Array([
      137, ...asciiBytes('PNG'), 13, 10, 26, 10,
      0, 0, 0, 8, ...asciiBytes('acTL'), 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(isAnimatedImage(bytes, 'image/png')).toBe(true);
  });

  it('does not classify a PNG whose first image-data chunk arrives without acTL as animated', () => {
    const bytes = new Uint8Array([
      137, ...asciiBytes('PNG'), 13, 10, 26, 10,
      0, 0, 0, 0, ...asciiBytes('IDAT'), 0, 0, 0, 0,
    ]);
    expect(isAnimatedImage(bytes, 'image/png')).toBe(false);
  });

  it('detects WebP animation from VP8X feature flags', () => {
    const bytes = new Uint8Array([
      ...asciiBytes('RIFF'), 14, 0, 0, 0, ...asciiBytes('WEBP'),
      ...asciiBytes('VP8X'), 1, 0, 0, 0, 0x02, 0,
    ]);
    expect(isAnimatedImage(bytes, 'image/webp')).toBe(true);
  });

  it('strips JPEG EXIF and comments without touching the scan', () => {
    const scan = [0x11, 0xff, 0x00, 0x22];
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08, ...asciiBytes('Exif'), 0, 1,
      0xff, 0xfe, 0x00, 0x05, ...asciiBytes('gps'),
      0xff, 0xe0, 0x00, 0x06, ...asciiBytes('JFIF'),
      0xff, 0xda, 0x00, 0x02, ...scan,
      0xff, 0xd9,
      ...asciiBytes('trailer'),
    ]);
    const stripped = stripJpegMetadata(bytes);
    expect(Array.from(stripped.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(stripped.slice(-2))).toEqual([0xff, 0xd9]);
    expect(stripped.includes(0xe1)).toBe(false);
    expect(new TextDecoder().decode(stripped)).not.toContain('Exif');
    expect(new TextDecoder().decode(stripped)).toContain('JFIF');
    expect(new TextDecoder().decode(stripped)).not.toContain('trailer');
    expect(Array.from(stripped)).toEqual(expect.arrayContaining(scan));
  });

  it('drops PNG text and EXIF chunks and keeps image data', () => {
    const bytes = new Uint8Array([
      137, ...asciiBytes('PNG'), 13, 10, 26, 10,
      0, 0, 0, 4, ...asciiBytes('tEXt'), ...asciiBytes('City'), 0, 0, 0, 0,
      0, 0, 0, 3, ...asciiBytes('IDAT'), 1, 2, 3, 0, 0, 0, 0,
      0, 0, 0, 0, ...asciiBytes('IEND'), 0, 0, 0, 0,
    ]);
    const stripped = stripPngMetadata(bytes);
    expect(new TextDecoder().decode(stripped)).not.toContain('tEXt');
    expect(new TextDecoder().decode(stripped)).toContain('IDAT');
    expect(new TextDecoder().decode(stripped)).toContain('IEND');
  });

  it('drops WebP EXIF chunks and clears the EXIF flag', () => {
    const bytes = new Uint8Array([
      ...asciiBytes('RIFF'), 30, 0, 0, 0, ...asciiBytes('WEBP'),
      ...asciiBytes('VP8X'), 1, 0, 0, 0, 0x08, 0,
      ...asciiBytes('EXIF'), 4, 0, 0, 0, ...asciiBytes('GPS!'),
    ]);
    const stripped = stripWebpMetadata(bytes);
    expect(new TextDecoder().decode(stripped)).not.toContain('EXIF');
    expect(new TextDecoder().decode(stripped)).not.toContain('GPS!');
    expect(stripped[20]).toBe(0);
  });
});
