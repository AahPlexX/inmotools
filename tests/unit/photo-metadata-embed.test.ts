import { describe, expect, test } from 'vitest';
import { embedPhotoXmpBytes } from '../../src/tools/photo/photo-metadata-embed';

const encoder = new TextEncoder();
const decoder = new TextDecoder('latin1');

function minimalPng(): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function minimalWebp(): Uint8Array {
  const payload = new Uint8Array([0x2f, 0, 0, 0, 0]);
  const output = new Uint8Array(12 + 8 + payload.length + 1);
  output.set(encoder.encode('RIFF'), 0);
  writeUint32Le(output, 4, output.length - 8);
  output.set(encoder.encode('WEBP'), 8);
  output.set(encoder.encode('VP8L'), 12);
  writeUint32Le(output, 16, payload.length);
  output.set(payload, 20);
  return output;
}

describe('Photo Studio embedded XMP', () => {
  test('JPEG stores standard XMP APP1 data without changing SOI', () => {
    const source = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const output = embedPhotoXmpBytes(source, 'image/jpeg', '<x:xmpmeta>hello</x:xmpmeta>', { width: 1, height: 1 });
    expect([...output.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(decoder.decode(output)).toContain('http://ns.adobe.com/xap/1.0/');
    expect(decoder.decode(output)).toContain('<x:xmpmeta>hello</x:xmpmeta>');
    expect([...output.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  test('JPEG rejects oversized standard XMP rather than writing a malformed APP1 segment', () => {
    const source = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const xmp = 'x'.repeat(70_000);
    expect(() => embedPhotoXmpBytes(source, 'image/jpeg', xmp, { width: 1, height: 1 })).toThrow(/APP1/i);
  });

  test('PNG inserts one uncompressed XMP iTXt chunk before IEND', () => {
    const xmp = '<x:xmpmeta>png metadata</x:xmpmeta>';
    const output = embedPhotoXmpBytes(minimalPng(), 'image/png', xmp, { width: 1, height: 1 });
    const text = decoder.decode(output);
    expect(text).toContain('iTXtXML:com.adobe.xmp');
    expect(text).toContain(xmp);
    expect(text.indexOf('iTXt')).toBeLessThan(text.indexOf('IEND'));
  });

  test('PNG replaces an existing Photo Studio XMP iTXt packet instead of duplicating it', () => {
    const first = embedPhotoXmpBytes(minimalPng(), 'image/png', '<x:xmpmeta>old</x:xmpmeta>', { width: 1, height: 1 });
    const second = embedPhotoXmpBytes(first, 'image/png', '<x:xmpmeta>new</x:xmpmeta>', { width: 1, height: 1 });
    const text = decoder.decode(second);
    expect(text).not.toContain('<x:xmpmeta>old</x:xmpmeta>');
    expect(text).toContain('<x:xmpmeta>new</x:xmpmeta>');
    expect(text.match(/XML:com\.adobe\.xmp/g)).toHaveLength(1);
  });

  test('WebP upgrades a simple file to VP8X and sets the XMP feature bit', () => {
    const xmp = '<x:xmpmeta>webp metadata</x:xmpmeta>';
    const output = embedPhotoXmpBytes(minimalWebp(), 'image/webp', xmp, { width: 1, height: 1 });
    expect(decoder.decode(output.slice(0, 4))).toBe('RIFF');
    expect(decoder.decode(output.slice(8, 12))).toBe('WEBP');
    const text = decoder.decode(output);
    expect(text).toContain('VP8X');
    expect(text).toContain('XMP ');
    expect(text).toContain(xmp);
    expect(output[20] & 0x04).toBe(0x04);
    const riffSize = (output[4] | (output[5] << 8) | (output[6] << 16) | ((output[7] << 24) >>> 0)) >>> 0;
    expect(riffSize).toBe(output.length - 8);
  });
});