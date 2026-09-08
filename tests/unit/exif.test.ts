import { describe, expect, it } from 'vitest';
import {
  buildSanitizedFilename,
  buildSanitizedFilenameFromBlob,
  isAnimatedImage,
  listSensitiveMetadata,
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
    expect(found.map((item) => item.key)).toEqual(expect.arrayContaining(['GPSLatitude', 'GPSLongitude', 'SerialNumber']));
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
});
