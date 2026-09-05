import { describe, expect, it } from 'vitest';
import { buildSanitizedFilename, listSensitiveMetadata } from '../../src/tools/exif/exif-engine';

describe('EXIF scrubber helpers', () => {
  it('builds non-destructive output names', () => {
    expect(buildSanitizedFilename('vacation.photo.jpg', 'image/png')).toBe('vacation.photo-sanitized.png');
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
});
