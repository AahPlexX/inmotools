import { describe, expect, it } from 'vitest';
import {
  decodeBuffer,
  decodeBytes,
  detectEncoding,
  ENCODING_LABELS,
  isValidUtf8,
} from '../../src/tools/sightline/encoding-engine';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const utf16 = (value: string, littleEndian: boolean): Uint8Array => {
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes[index * 2] = littleEndian ? code & 0xff : (code >> 8) & 0xff;
    bytes[index * 2 + 1] = littleEndian ? (code >> 8) & 0xff : code & 0xff;
  }
  return bytes;
};

const withPrefix = (prefix: readonly number[], body: Uint8Array): Uint8Array => {
  const output = new Uint8Array(prefix.length + body.length);
  output.set(prefix, 0);
  output.set(body, prefix.length);
  return output;
};

describe('encoding detection and decoding', () => {
  it('recognises a UTF-8 byte-order mark and drops it from the decoded text', () => {
    const bytes = withPrefix([0xef, 0xbb, 0xbf], utf8('Reading accelerates.'));
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('utf-8');
    expect(detection.bomLength).toBe(3);
    expect(decodeBytes(bytes, detection)).toBe('Reading accelerates.');
  });

  it('recognises UTF-16 little-endian from its byte-order mark', () => {
    const bytes = withPrefix([0xff, 0xfe], utf16('Résumé', true));
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('utf-16le');
    expect(detection.bomLength).toBe(2);
    expect(decodeBytes(bytes, detection)).toBe('Résumé');
  });

  it('recognises UTF-16 big-endian from its byte-order mark', () => {
    const bytes = withPrefix([0xfe, 0xff], utf16('Résumé', false));
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('utf-16be');
    expect(decodeBytes(bytes, detection)).toBe('Résumé');
  });

  it('recognises UTF-16 without a byte-order mark from its null-byte pattern', () => {
    const bytes = utf16('Chapter One text that is long enough to sample.', true);
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('utf-16le');
    expect(detection.bomLength).toBe(0);
    expect(detection.reason).toContain('null-byte pattern');
    expect(decodeBytes(bytes, detection)).toBe('Chapter One text that is long enough to sample.');
  });

  it('reports pure ASCII separately from multi-byte UTF-8', () => {
    expect(detectEncoding(utf8('plain ascii text')).encoding).toBe('ascii');
    expect(detectEncoding(utf8('naïve café')).encoding).toBe('utf-8');
  });

  it('falls back to Windows-1252 for bytes that are not valid UTF-8', () => {
    // 0xE9 is "é" in Windows-1252 and an unpaired lead byte in UTF-8.
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('windows-1252');
    expect(decodeBytes(bytes, detection)).toBe('café');
  });

  it('maps the Windows-1252 smart-quote range instead of leaving control characters', () => {
    const bytes = new Uint8Array([0x93, 0x48, 0x69, 0x94, 0x20, 0x97, 0x20, 0x92, 0x74, 0x69, 0x73]);
    const detection = detectEncoding(bytes);
    expect(detection.encoding).toBe('windows-1252');
    expect(decodeBytes(bytes, detection)).toBe('\u201cHi\u201d \u2014 \u2019tis');
  });

  it('rejects overlong UTF-8 sequences, surrogate halves, and out-of-range code points', () => {
    expect(isValidUtf8(new Uint8Array([0xc0, 0xaf]))).toBe(false);
    expect(isValidUtf8(new Uint8Array([0xed, 0xa0, 0x80]))).toBe(false);
    expect(isValidUtf8(new Uint8Array([0xf5, 0x80, 0x80, 0x80]))).toBe(false);
    expect(isValidUtf8(utf8('valid \u00e9\u20ac\u{1f600}'))).toBe(true);
  });

  it('reports both text and detection through decodeBuffer', () => {
    const { text, detection } = decodeBuffer(utf8('# Heading\n\nBody text.'));
    expect(text).toBe('# Heading\n\nBody text.');
    expect(ENCODING_LABELS[detection.encoding]).toContain('UTF-8');
  });

  it('decodes an empty buffer without throwing', () => {
    const detection = detectEncoding(new Uint8Array(0));
    expect(decodeBytes(new Uint8Array(0), detection)).toBe('');
  });
});
