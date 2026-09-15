import { describe, expect, it } from 'vitest';
import { monoFromDecoded, waveformToSvg, writeId3Tags, hasTagOptions } from '../../src/tools/transcode/audio-engine';
import {
  buildXmpPacket, hasImageMetadata, insertJpegIptc, insertJpegXmp, readJpegIptc, readJpegXmp,
  readPngTextChunks, stripJpegSidecarSegments, stripPngTextChunks, writeJpegMetadata, writePngMetadata,
} from '../../src/tools/transcode/metadata-engine';

// Minimal valid 1x1 PNG.
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
  0x00, 0x03, 0x00, 0x01, 0x5e, 0xf3, 0x2b, 0x6b,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// Minimal valid 1x1 JPEG (widely-used fixture).
const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const jpegBytes = (): Uint8Array => {
  const binary = atob(JPEG_1X1_BASE64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

describe('PNG metadata editor (F34)', () => {
  it('writes and reads tEXt chunks deterministically', () => {
    const tagged = writePngMetadata(PNG_1X1, { title: 'Sunrise', artist: 'Field Team', copyright: 'CC0' });
    const texts = readPngTextChunks(tagged);
    expect(texts['Title']).toBe('Sunrise');
    expect(texts['Author']).toBe('Field Team');
    expect(texts['Copyright']).toBe('CC0');
    // Second run on identical input must produce identical bytes.
    const again = writePngMetadata(PNG_1X1, { title: 'Sunrise', artist: 'Field Team', copyright: 'CC0' });
    expect(Array.from(again)).toEqual(Array.from(tagged));
  });

  it('strips text chunks while preserving image data', () => {
    const tagged = writePngMetadata(PNG_1X1, { title: 'X' });
    const stripped = stripPngTextChunks(tagged);
    expect(readPngTextChunks(stripped)).toEqual({});
    // Signature and IDAT survive.
    expect(Array.from(stripped.slice(0, 8))).toEqual(Array.from(PNG_1X1.slice(0, 8)));
    expect(Array.from(stripped)).toEqual(Array.from(PNG_1X1));
  });

  it('replaces existing metadata when stripExisting is set', () => {
    const tagged = writePngMetadata(PNG_1X1, { title: 'Old' });
    const replaced = writePngMetadata(tagged, { title: 'New', stripExisting: true });
    const texts = readPngTextChunks(replaced);
    expect(texts['Title']).toBe('New');
    expect(Object.keys(texts)).toHaveLength(1);
  });

  it('reports whether metadata work is needed', () => {
    expect(hasImageMetadata(undefined)).toBe(false);
    expect(hasImageMetadata({})).toBe(false);
    expect(hasImageMetadata({ title: 'a' })).toBe(true);
    expect(hasImageMetadata({ stripExisting: true })).toBe(true);
  });
});

describe('JPEG EXIF editor (F34)', () => {
  it('inserts EXIF fields readable by piexifjs', async () => {
    const piexif = (await import('piexifjs')).default;
    const tagged = await writeJpegMetadata(jpegBytes(), { title: 'Harbor', artist: 'Dock Crew', copyright: 'All rights reserved' });
    // JPEG SOI marker preserved.
    expect(tagged[0]).toBe(0xff);
    expect(tagged[1]).toBe(0xd8);

    let binary = '';
    for (let i = 0; i < tagged.length; i += 0x8000) {
      binary += String.fromCharCode(...tagged.subarray(i, Math.min(tagged.length, i + 0x8000)));
    }
    const exif = piexif.load(binary);
    expect(exif['0th'][piexif.ImageIFD.ImageDescription]).toBe('Harbor');
    expect(exif['0th'][piexif.ImageIFD.Artist]).toBe('Dock Crew');
    expect(exif['0th'][piexif.ImageIFD.Copyright]).toBe('All rights reserved');
  });

  it('is a no-op without metadata options', async () => {
    const original = jpegBytes();
    const result = await writeJpegMetadata(original, {});
    expect(result.length).toBe(original.length);
  });
});

describe('JPEG XMP packet editor (F34)', () => {
  const sosIndexOf = (jpeg: Uint8Array): number => {
    for (let i = 2; i + 3 < jpeg.length; i += 1) {
      if (jpeg[i] === 0xff && jpeg[i + 1] === 0xda) return i;
    }
    return -1;
  };

  it('inserts a readable XMP packet without disturbing scan data', () => {
    const original = jpegBytes();
    const tagged = insertJpegXmp(original, { title: 'Bayou Dawn', artist: 'Field Team', copyright: 'CC-BY' });
    expect(tagged[0]).toBe(0xff);
    expect(tagged[1]).toBe(0xd8);

    const packet = readJpegXmp(tagged);
    expect(packet).toContain('<dc:title>');
    expect(packet).toContain('Bayou Dawn');
    expect(packet).toContain('<dc:creator>');
    expect(packet).toContain('Field Team');
    expect(packet).toContain('<?xpacket end="w"?>');

    // Entropy-coded data from SOS onward is byte-identical.
    const originalSos = sosIndexOf(original);
    const taggedSos = sosIndexOf(tagged);
    expect(taggedSos).toBeGreaterThan(2);
    expect(Array.from(tagged.subarray(taggedSos))).toEqual(Array.from(original.subarray(originalSos)));
    // File still ends with EOI.
    expect(tagged[tagged.length - 2]).toBe(0xff);
    expect(tagged[tagged.length - 1]).toBe(0xd9);
  });

  it('replaces an existing packet instead of stacking packets', () => {
    const first = insertJpegXmp(jpegBytes(), { title: 'First' });
    const second = insertJpegXmp(first, { title: 'Second' });
    const packet = readJpegXmp(second);
    expect(packet).toContain('Second');
    expect(packet).not.toContain('First');
    const markerCount = countXmpApp1(second);
    expect(markerCount).toBe(1);
  });

  it('strips XMP and IPTC segments on demand', () => {
    const tagged = insertJpegXmp(jpegBytes(), { title: 'Gone' });
    const stripped = stripJpegSidecarSegments(tagged, { xmp: true, iptc: true });
    expect(readJpegXmp(stripped)).toBeNull();
    // Strip on a clean JPEG is a no-op.
    const clean = jpegBytes();
    expect(Array.from(stripJpegSidecarSegments(clean, { xmp: true }))).toEqual(Array.from(clean));
  });

  it('escapes XML entities in packet fields', () => {
    const packet = buildXmpPacket({ title: 'A & B <C> "D"' });
    expect(packet).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
    expect(packet).not.toContain('<C>');
  });

  it('writes EXIF and XMP together deterministically', async () => {
    const meta = { title: 'Dual', artist: 'Crew', xmp: true };
    const once = await writeJpegMetadata(jpegBytes(), meta);
    const twice = await writeJpegMetadata(jpegBytes(), meta);
    expect(Array.from(twice)).toEqual(Array.from(once));
    expect(readJpegXmp(once)).toContain('Dual');

    const piexif = (await import('piexifjs')).default;
    let binary = '';
    for (let i = 0; i < once.length; i += 0x8000) {
      binary += String.fromCharCode(...once.subarray(i, Math.min(once.length, i + 0x8000)));
    }
    const exif = piexif.load(binary);
    expect(exif['0th'][piexif.ImageIFD.Artist]).toBe('Crew');
  });
});

function countXmpApp1(jpeg: Uint8Array): number {
  const ns = 'http://ns.adobe.com/xap/1.0/';
  let count = 0;
  for (let i = 2; i + 4 < jpeg.length; i += 1) {
    if (jpeg[i] !== 0xff || jpeg[i + 1] !== 0xe1) continue;
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    const payload = jpeg.subarray(i + 4, i + 2 + length);
    let match = payload.length >= ns.length;
    for (let k = 0; match && k < ns.length; k += 1) {
      if (payload[k] !== ns.charCodeAt(k)) match = false;
    }
    if (match) count += 1;
  }
  return count;
}

describe('JPEG IPTC-IIM editor (F34)', () => {
  it('writes and reads IPTC datasets through an APP13 IRB', () => {
    const tagged = insertJpegIptc(jpegBytes(), { title: 'Delta Sunset', artist: 'Bayou Unit', copyright: 'PD', description: 'Golden hour' });
    const iptc = readJpegIptc(tagged);
    expect(iptc[5]).toBe('Delta Sunset');
    expect(iptc[80]).toBe('Bayou Unit');
    expect(iptc[116]).toBe('PD');
    expect(iptc[120]).toBe('Golden hour');
    expect(tagged[0]).toBe(0xff);
    expect(tagged[tagged.length - 1]).toBe(0xd9);
  });

  it('replaces prior IPTC blocks and handles odd-length payloads', () => {
    const first = insertJpegIptc(jpegBytes(), { title: 'AAA' });
    const second = insertJpegIptc(first, { title: 'B' }); // odd-length value exercises padding
    const iptc = readJpegIptc(second);
    expect(iptc[5]).toBe('B');
    expect(Object.keys(iptc)).not.toContain('80');
  });

  it('coexists with XMP in the same file', () => {
    const withXmp = insertJpegXmp(jpegBytes(), { title: 'XMP Title' });
    const withBoth = insertJpegIptc(withXmp, { title: 'IPTC Title' });
    expect(readJpegXmp(withBoth)).toContain('XMP Title');
    expect(readJpegIptc(withBoth)[5]).toBe('IPTC Title');
  });
});

describe('ID3 tag studio helpers (F35)', () => {
  it('detects tag option presence', () => {
    expect(hasTagOptions(undefined)).toBe(false);
    expect(hasTagOptions({})).toBe(false);
    expect(hasTagOptions({ title: 'Track' })).toBe(true);
    expect(hasTagOptions({ trackNumber: 3 })).toBe(true);
  });

  it('writes an ID3v2 header onto an MP3 stream', async () => {
    // Minimal synthetic MP3: ID3-less MPEG frame sync repeated.
    const frame = new Uint8Array(417).fill(0);
    frame[0] = 0xff;
    frame[1] = 0xfb;
    frame[2] = 0x90;
    frame[3] = 0x00;
    const mp3 = new Uint8Array(417 * 4);
    for (let i = 0; i < 4; i += 1) mp3.set(frame, i * 417);

    const tagged = await writeId3Tags(mp3, { title: 'Night Drive', artist: 'Test Artist' });
    expect(String.fromCharCode(tagged[0], tagged[1], tagged[2])).toBe('ID3');
    expect(tagged.length).toBeGreaterThan(mp3.length);
  });
});

describe('waveform exporter (F23)', () => {
  it('renders an SVG envelope from synthetic PCM', () => {
    const samples = new Float32Array(4800);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin((i / 4800) * Math.PI * 8) * 0.8;
    const svg = waveformToSvg({ channelData: [samples], sampleRate: 48000, duration: 0.1 }, 400, 120);
    expect(svg).toContain('<svg xmlns=');
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('48000 Hz');
  });

  it('downmixes multichannel audio to mono', () => {
    const left = new Float32Array([1, -1, 1, -1]);
    const right = new Float32Array([-1, 1, -1, 1]);
    const mono = monoFromDecoded({ channelData: [left, right], sampleRate: 8000, duration: 0.0005 });
    expect(Array.from(mono)).toEqual([0, 0, 0, 0]);
  });
});
