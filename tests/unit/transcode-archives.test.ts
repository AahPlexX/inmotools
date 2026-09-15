import { describe, expect, it } from 'vitest';
import { zipSync, unzipSync, gunzipSync } from 'fflate';
import {
  buildTarBytes, buildTarGzBytes, buildZipBytes, extractArchive, hexDump, parseTar, unzipEntries,
} from '../../src/tools/transcode/archives-engine';
import { registerArchiveConverters } from '../../src/tools/transcode/archives-converters';
import { runConversion } from '../../src/tools/transcode/transcode-engine';

registerArchiveConverters();

const encoder = new TextEncoder();

describe('ZIP codec (F28/F29)', () => {
  it('extracts and repacks ZIP entries', () => {
    const zip = new Uint8Array(zipSync({
      'notes/a.txt': encoder.encode('alpha'),
      'notes/b.txt': encoder.encode('bravo'),
    }));
    const entries = unzipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual(['notes/a.txt', 'notes/b.txt']);
    expect(new TextDecoder().decode(entries[0].data)).toBe('alpha');

    const rebuilt = buildZipBytes(entries);
    const roundTripped = unzipSync(rebuilt);
    expect(new TextDecoder().decode(roundTripped['notes/b.txt'])).toBe('bravo');
  });

  it('extracts gzip-compressed tar via extractArchive', async () => {
    const tar = buildTarBytes([{ name: 'hello.txt', data: encoder.encode('world') }]);
    const tgz = buildTarGzBytes([{ name: 'hello.txt', data: encoder.encode('world') }]);
    expect(Array.from(tgz.slice(0, 2))).toEqual([0x1f, 0x8b]); // gzip magic
    const entries = await extractArchive(tgz, 'tar-gz');
    expect(entries).toHaveLength(1);
    expect(new TextDecoder().decode(entries[0].data)).toBe('world');
    expect(parseTar(gunzipSync(tgz))).toHaveLength(1);
    expect(parseTar(tar)).toHaveLength(1);
  });
});

describe('TAR builder (F29)', () => {
  it('writes ustar headers that parse back with correct sizes', () => {
    const entries = [
      { name: 'a.txt', data: encoder.encode('one') },
      { name: 'dir/b.bin', data: new Uint8Array(600).fill(7) },
    ];
    const tar = buildTarBytes(entries);
    const parsed = parseTar(tar);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('a.txt');
    expect(new TextDecoder().decode(parsed[0].data)).toBe('one');
    expect(parsed[1].name).toBe('dir/b.bin');
    expect(parsed[1].data).toHaveLength(600);
    expect(parsed[1].data.every((byte) => byte === 7)).toBe(true);
    // Header magic.
    expect(String.fromCharCode(...tar.slice(257, 262))).toBe('ustar');
  });

  it('handles empty files and exact 512-byte multiples', () => {
    const entries = [
      { name: 'empty', data: new Uint8Array(0) },
      { name: 'exact', data: new Uint8Array(512).fill(1) },
    ];
    const parsed = parseTar(buildTarBytes(entries));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].data).toHaveLength(0);
    expect(parsed[1].data).toHaveLength(512);
  });
});

describe('binary encodings (F30)', () => {
  it('produces a canonical hex dump with offsets and ASCII', () => {
    const dump = hexDump(new Uint8Array([0x41, 0x0a, 0xff, 0x20]));
    expect(dump.split('\n')[0]).toBe(`00000000  ${'41 0a ff 20'.padEnd(47)}  |A.. |`);
    expect(dump).toContain('00000004  (4 bytes)');
  });

  it('runs binary -> data-uri through the registry', async () => {
    const artifacts = await runConversion('binary', 'data-uri', {
      sourceId: 'binary',
      fileName: 'pixel.png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      text: () => '',
    }, {});
    const uri = new TextDecoder().decode(artifacts[0].bytes);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri).toContain('iVBORw');
  });
});

describe('archive converters via registry', () => {
  it('unpacks single-entry archives to the contained file', async () => {
    const zip = new Uint8Array(zipSync({ 'report.csv': encoder.encode('a,b\n1,2\n') }));
    const artifacts = await runConversion('zip', 'binary', {
      sourceId: 'zip',
      fileName: 'pack.zip',
      bytes: zip,
      text: () => '',
    }, {});
    expect(artifacts[0].name).toBe('report.csv');
    expect(new TextDecoder().decode(artifacts[0].bytes)).toBe('a,b\n1,2\n');
  });

  it('refuses multi-entry unpack without repack guidance', async () => {
    const zip = new Uint8Array(zipSync({ 'a': encoder.encode('1'), 'b': encoder.encode('2') }));
    await expect(runConversion('zip', 'binary', {
      sourceId: 'zip',
      fileName: 'pack.zip',
      bytes: zip,
      text: () => '',
    }, {})).rejects.toThrow(/zip target/i);
  });

  it('converts ZIP -> TAR.GZ end to end', async () => {
    const zip = new Uint8Array(zipSync({ 'readme.txt': encoder.encode('hello tar') }));
    const artifacts = await runConversion('zip', 'tar-gz', {
      sourceId: 'zip',
      fileName: 'docs.zip',
      bytes: zip,
      text: () => '',
    }, {});
    expect(artifacts[0].name).toBe('docs.tar.gz');
    const parsed = parseTar(gunzipSync(artifacts[0].bytes));
    expect(new TextDecoder().decode(parsed[0].data)).toBe('hello tar');
  });
});
