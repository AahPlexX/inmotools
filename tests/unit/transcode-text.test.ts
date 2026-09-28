import { describe, expect, it } from 'vitest';
import {
  base64ToBytes, bytesToBase64, bytesToHexDump, decodeText, encodeText, hexToBytes, parseDataUri,
  sniffEncoding, toDataUri,
} from '../../src/tools/transcode/text-codecs';
import { detectFormat } from '../../src/tools/transcode/formats';

const encoder = new TextEncoder();

describe('text encoding transcoding', () => {
  it('detects BOMs and UTF-16 without BOM', () => {
    expect(sniffEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x68]))).toMatchObject({ encoding: 'utf-8', bom: true });
    expect(sniffEncoding(new Uint8Array([0xff, 0xfe, 0x68, 0x00]))).toMatchObject({ encoding: 'utf-16le', bom: true });
    const le = new Uint8Array(16);
    for (let i = 0; i < 8; i += 1) le[i * 2] = 0x61 + i;
    expect(sniffEncoding(le).encoding).toBe('utf-16le');
  });

  it('round-trips UTF-16 LE/BE with and without BOM', () => {
    const text = 'héllo — 世界';
    const le = encodeText(text, { encoding: 'utf-16le', bom: true });
    expect(decodeText(le).text).toBe(text);
    const be = encodeText(text, { encoding: 'utf-16be', bom: false });
    expect(decodeText(be, 'utf-16be').text).toBe(text);
  });

  it('encodes Windows-1252 including the 0x80-0x9F specials', () => {
    const bytes = encodeText('€smart…', { encoding: 'windows-1252' });
    expect(Array.from(bytes)).toEqual([0x80, 0x73, 0x6d, 0x61, 0x72, 0x74, 0x85]);
  });

  it('falls back to the replacement character for unmappable code points', () => {
    const bytes = encodeText('世', { encoding: 'windows-1252', replacement: '*' });
    expect(Array.from(bytes)).toEqual([0x2a]);
    const ascii = encodeText('héllo', { encoding: 'ascii', replacement: '?' });
    expect(Array.from(ascii)).toEqual([0x68, 0x3f, 0x6c, 0x6c, 0x6f]);
  });

  it('writes and skips UTF-8 BOMs', () => {
    const withBom = encodeText('abc', { encoding: 'utf-8', bom: true });
    expect(Array.from(withBom.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeText(withBom).text).toBe('abc');
  });

  it('decodes Shift-JIS byte sequences', () => {
    const sjis = new Uint8Array([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]); // こんにちは
    expect(decodeText(sjis, 'shift_jis').text).toBe('こんにちは');
  });
});

describe('base64, hex and data URIs', () => {
  it('round-trips binary through Base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('line-wraps Base64 output when requested', () => {
    const wrapped = bytesToBase64(encoder.encode('abcdef'.repeat(20)), 16);
    expect(wrapped.split('\n')[0]).toHaveLength(16);
    expect(Array.from(base64ToBytes(wrapped))).toEqual(Array.from(encoder.encode('abcdef'.repeat(20))));
  });

  it('produces canonical hex dumps and parses hex back', () => {
    const dump = bytesToHexDump(new Uint8Array([0x41, 0x42, 0x00]));
    expect(dump.split('\n')[0]).toBe('00000000  41 42 00                                          |AB.|');
    expect(Array.from(hexToBytes('41 42\n00'))).toEqual([0x41, 0x42, 0x00]);
  });

  it('builds and parses data URIs', () => {
    const uri = toDataUri(encoder.encode('hello'), 'text/plain');
    expect(uri.startsWith('data:text/plain;base64,')).toBe(true);
    const parsed = parseDataUri(uri);
    expect(parsed.mime).toBe('text/plain');
    expect(new TextDecoder().decode(parsed.bytes)).toBe('hello');
    const plain = parseDataUri('data:,plain%20text');
    expect(new TextDecoder().decode(plain.bytes)).toBe('plain text');
  });
});

describe('format detection', () => {
  it('detects common magic numbers', () => {
    expect(detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'x.png')).toBe('png');
    expect(detectFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'photo.jpg')).toBe('jpeg');
    expect(detectFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'anim.gif')).toBe('gif');
    expect(detectFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'doc.pdf')).toBe('pdf');
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'pack.zip')).toBe('zip');
    expect(detectFormat(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00]), 'f.woff2')).toBe('woff2');
    expect(detectFormat(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]), 'x.tgz')).toBe('tar-gz');
    expect(detectFormat(new Uint8Array([0x4f, 0x67, 0x67, 0x53]), 'a.ogg')).toBe('ogg');
    expect(detectFormat(new Uint8Array([0x66, 0x4c, 0x61, 0x43]), 'a.flac')).toBe('flac');
    expect(detectFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]), 'a.wav')).toBe('wav');
    expect(detectFormat(new Uint8Array([0x50, 0x41, 0x52, 0x31, 0, 0]), 'data.parquet')).toBe('parquet');
    expect(detectFormat(new Uint8Array([0x7b, 0x7d]), 'empty.json')).toBe('json');
  });

  it('detects text formats by content', () => {
    expect(detectFormat(encoder.encode('{\\rtf1\\ansi}'), 'note.rtf')).toBe('rtf');
    expect(detectFormat(encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'pic.svg')).toBe('svg');
    expect(detectFormat(encoder.encode('<?xml version="1.0"?><gpx version="1.1"></gpx>'), 'track.gpx')).toBe('gpx');
    expect(detectFormat(encoder.encode('{"type": "FeatureCollection", "features": []}'), 'map.geojson')).toBe('geojson');
    expect(detectFormat(encoder.encode('POINT (30 10)'), 'geom.wkt')).toBe('wkt');
    expect(detectFormat(encoder.encode('name\tvalue\na\t1\nb\t2'), 'table.tsv')).toBe('tsv');
  });
});
