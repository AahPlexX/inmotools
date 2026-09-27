import { describe, expect, it } from 'vitest';
import type { LoudnessReading } from '../../src/tools/music/dsp/loudness';
import {
  EMPTY_METADATA,
  buildMetadataTags,
  encodeWav,
  loudnessCsv,
  loudnessJson,
  parseReleaseDate,
  safeFileName,
  type ExportMetadata,
} from '../../src/tools/music/mastering-export';

// --- SECTION: RIFF reader used to check the writer from the outside ---

interface Chunk { id: string; offset: number; size: number }

function readChunks(bytes: Uint8Array): { form: string; riffSize: number; chunks: Chunk[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  expect(text(0, 4)).toBe('RIFF');
  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    chunks.push({ id: text(offset, 4), offset: offset + 8, size });
    offset += 8 + size + (size & 1);
  }
  expect(offset).toBe(bytes.length);
  return { form: text(8, 4), riffSize: view.getUint32(4, true), chunks };
}

const chunk = (bytes: Uint8Array, id: string) => {
  const found = readChunks(bytes).chunks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return { ...found, view: new DataView(bytes.buffer, bytes.byteOffset + found.offset, found.size), data: bytes.subarray(found.offset, found.offset + found.size) };
};

const ascii = (data: Uint8Array) => String.fromCharCode(...data).replace(/\0+$/, '');

function infoEntries(bytes: Uint8Array): Record<string, string> {
  const list = chunk(bytes, 'LIST');
  expect(ascii(list.data.subarray(0, 4))).toBe('INFO');
  const entries: Record<string, string> = {};
  let offset = 4;
  while (offset + 8 <= list.size) {
    const id = ascii(list.data.subarray(offset, offset + 4));
    const size = list.view.getUint32(offset + 4, true);
    entries[id] = ascii(list.data.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size + (size & 1);
  }
  expect(offset).toBe(list.size);
  return entries;
}

const reading = (patch: Partial<LoudnessReading> = {}): LoudnessReading => ({
  momentary: -20, shortTerm: -20, integrated: -14.03, loudnessRange: 6.25, maxMomentary: -9.5, maxShortTerm: -11.994,
  truePeakDb: [-1.21, -1.04], maxTruePeakDb: -1.04, samplePeakDb: [-1.3, -1.1], measuredSeconds: 10, ...patch,
});

const metadata = (patch: Partial<ExportMetadata> = {}): ExportMetadata => ({ ...EMPTY_METADATA, ...patch });
const fixedDate = new Date(Date.UTC(2026, 8, 27, 9, 5, 7));

// --- SECTION: WAV / Broadcast Wave ---

describe('encodeWav', () => {
  it('writes exact 16-bit PCM samples, interleaved, with a PCM fmt chunk', () => {
    const left = Float32Array.from([0, 0.5, -1, 32767 / 32768]);
    const right = Float32Array.from([-0.5, 0.25, 1, -1 / 32768]);
    const { bytes, skipped } = encodeWav([left, right], 48_000, { depth: 16, dither: false, metadata: metadata(), createdAt: fixedDate });
    expect(skipped).toEqual([]);
    const riff = readChunks(bytes);
    expect(riff.form).toBe('WAVE');
    expect(riff.riffSize).toBe(bytes.length - 8);
    expect(riff.chunks.map((entry) => entry.id)).toEqual(['fmt ', 'bext', 'LIST', 'data']);

    const fmt = chunk(bytes, 'fmt ');
    expect(fmt.size).toBe(16);
    expect([fmt.view.getUint16(0, true), fmt.view.getUint16(2, true), fmt.view.getUint32(4, true), fmt.view.getUint32(8, true), fmt.view.getUint16(12, true), fmt.view.getUint16(14, true)])
      .toEqual([1, 2, 48_000, 48_000 * 4, 4, 16]);

    const data = chunk(bytes, 'data');
    const samples = Array.from({ length: 8 }, (_, index) => data.view.getInt16(index * 2, true));
    // Full scale +1 clips to the largest positive code; everything else lands exactly on its code.
    expect(samples).toEqual([0, -16384, 16384, 8192, -32768, 32767, 32767, -1]);
  });

  it('writes 24-bit little-endian three-byte samples', () => {
    const { bytes } = encodeWav([Float32Array.from([1 / 8_388_608, -1 / 8_388_608, 0.5])], 44_100, { depth: 24, dither: false, metadata: metadata(), createdAt: fixedDate });
    const data = chunk(bytes, 'data');
    expect(data.size).toBe(9);
    expect(Array.from(data.data)).toEqual([0x01, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x40]);
    expect(chunk(bytes, 'fmt ').view.getUint16(12, true)).toBe(3);
    // Odd data size gets one pad byte so the RIFF walk still ends exactly at the file end.
    expect(readChunks(bytes).riffSize).toBe(bytes.length - 8);
  });

  it('writes 32-bit IEEE float with format tag 3, cbSize 0, and a fact chunk', () => {
    const samples = Float32Array.from([0.1, -1.5, 2]);
    const { bytes } = encodeWav([samples], 96_000, { depth: 32, dither: true, metadata: metadata(), createdAt: fixedDate });
    const fmt = chunk(bytes, 'fmt ');
    expect(fmt.size).toBe(18);
    expect([fmt.view.getUint16(0, true), fmt.view.getUint16(14, true), fmt.view.getUint16(16, true)]).toEqual([3, 32, 0]);
    expect(chunk(bytes, 'fact').view.getUint32(0, true)).toBe(3);
    const data = chunk(bytes, 'data');
    expect([0, 1, 2].map((index) => data.view.getFloat32(index * 4, true))).toEqual(Array.from(samples));
    // Float export is never dithered, so the history must not claim it.
    expect(ascii(chunk(bytes, 'bext').data.subarray(602))).not.toContain('TPDF');
  });

  it('dithers deterministically for a given seed', () => {
    const tone = Float32Array.from({ length: 256 }, (_, index) => Math.sin(index / 7) * 0.001);
    const options = { depth: 16 as const, dither: true, metadata: metadata(), createdAt: fixedDate, seed: 42 };
    const first = encodeWav([tone], 48_000, options).bytes;
    expect(encodeWav([tone], 48_000, options).bytes).toEqual(first);
    expect(encodeWav([tone], 48_000, { ...options, seed: 43 }).bytes).not.toEqual(first);
  });

  it('fills bext v2 fields, loudness values as round(100x), and an EBU R 98 coding history', () => {
    const { bytes } = encodeWav([new Float32Array(4), new Float32Array(4)], 48_000, {
      depth: 24, dither: true, createdAt: fixedDate, software: 'Test Suite',
      metadata: metadata({ description: 'Final master', originator: 'Studio A', originatorReference: 'REF-001' }),
      loudness: reading(),
    });
    const bext = chunk(bytes, 'bext');
    expect(ascii(bext.data.subarray(0, 256))).toBe('Final master');
    expect(ascii(bext.data.subarray(256, 288))).toBe('Studio A');
    expect(ascii(bext.data.subarray(288, 320))).toBe('REF-001');
    expect(ascii(bext.data.subarray(320, 330))).toBe('2026-09-27');
    expect(ascii(bext.data.subarray(330, 338))).toBe('09:05:07');
    expect(bext.view.getUint32(338, true)).toBe(0);
    expect(bext.view.getUint32(342, true)).toBe(0);
    expect(bext.view.getUint16(346, true)).toBe(2);
    expect(bext.data.subarray(348, 412).every((byte) => byte === 0)).toBe(true);
    const loudness = [0, 1, 2, 3, 4].map((index) => bext.view.getInt16(412 + index * 2, true));
    expect(loudness).toEqual([-1403, 625, -104, -950, -1199]);
    expect(bext.data.subarray(422, 602).every((byte) => byte === 0)).toBe(true);
    expect(ascii(bext.data.subarray(602))).toBe('A=PCM,F=48000,W=24,M=stereo,T=Test Suite; TPDF dither,\r\n');
  });

  it('marks unmeasured or silent loudness fields 0x7FFF so readers ignore them', () => {
    const silent = encodeWav([new Float32Array(2)], 48_000, { depth: 16, dither: false, metadata: metadata(), createdAt: fixedDate, loudness: reading({ integrated: -Infinity, loudnessRange: Number.NaN }) });
    const unmeasured = encodeWav([new Float32Array(2)], 48_000, { depth: 16, dither: false, metadata: metadata(), createdAt: fixedDate });
    expect(chunk(silent.bytes, 'bext').view.getInt16(412, true)).toBe(0x7fff);
    expect(chunk(silent.bytes, 'bext').view.getInt16(414, true)).toBe(0x7fff);
    expect(chunk(silent.bytes, 'bext').view.getInt16(416, true)).toBe(-104);
    expect([0, 1, 2, 3, 4].map((index) => chunk(unmeasured.bytes, 'bext').view.getInt16(412 + index * 2, true))).toEqual([0x7fff, 0x7fff, 0x7fff, 0x7fff, 0x7fff]);
  });

  it('writes RIFF INFO tags with even padding and keeps the typed date precision', () => {
    const { bytes, skipped } = encodeWav([new Float32Array(2)], 48_000, {
      depth: 16, dither: false, createdAt: fixedDate, software: 'Suite',
      metadata: metadata({ title: 'Song', artist: 'Band', album: 'LP', trackNumber: '3', tracksTotal: '12', genre: 'Jazz', date: '2026', comment: 'Take 4' }),
    });
    expect(skipped).toEqual([]);
    expect(infoEntries(bytes)).toEqual({ INAM: 'Song', IART: 'Band', IPRD: 'LP', ITRK: '3/12', IGNR: 'Jazz', ICRD: '2026', ICMT: 'Take 4', ISFT: 'Suite' });
  });

  it('reports metadata it cannot store instead of writing mangled text', () => {
    const { bytes, skipped } = encodeWav([new Float32Array(2)], 48_000, {
      depth: 16, dither: false, createdAt: fixedDate,
      metadata: metadata({ title: '夜の曲', artist: 'Café', originator: 'Studio ✓', date: '2026-02-31' }),
    });
    const info = infoEntries(bytes);
    expect(info.INAM).toBeUndefined();
    expect(info.IART).toBe('Café');
    expect(info.ICRD).toBeUndefined();
    expect(skipped).toEqual([
      'originator (Broadcast Wave fields hold plain ASCII only)',
      'title (RIFF INFO stores Latin-1 text only)',
      'date (use YYYY, YYYY-MM, or YYYY-MM-DD)',
    ]);
  });

  it('rejects channel layouts WAV export does not write', () => {
    expect(() => encodeWav([], 48_000, { depth: 16, dither: false, metadata: metadata() })).toThrow(RangeError);
    expect(() => encodeWav([new Float32Array(1), new Float32Array(1), new Float32Array(1)], 48_000, { depth: 16, dither: false, metadata: metadata() })).toThrow(RangeError);
  });
});

// --- SECTION: metadata helpers ---

describe('parseReleaseDate', () => {
  it('accepts a year, a month, or a full date and rejects dates that do not exist', () => {
    expect(parseReleaseDate('2026')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parseReleaseDate(' 2026-09 ')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(parseReleaseDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(parseReleaseDate('2026-02-29')).toBeUndefined();
    expect(parseReleaseDate('2026-13')).toBeUndefined();
    expect(parseReleaseDate('Sept 2026')).toBeUndefined();
    expect(parseReleaseDate('')).toBeUndefined();
  });
});

describe('buildMetadataTags', () => {
  const full = metadata({ title: ' Song ', artist: 'Band', trackNumber: '2', tracksTotal: 'x', discNumber: '0', date: '2026-09-27', lyrics: 'La', originator: 'Studio' });
  const art = { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png', name: 'cover.png' };

  it('keeps trimmed text, valid positive numbers, and artwork where the format stores them', () => {
    const tags = buildMetadataTags(full, art, 'flac');
    expect(tags).toEqual({
      title: 'Song', artist: 'Band', trackNumber: 2, lyrics: 'La', date: new Date(Date.UTC(2026, 8, 27)),
      images: [{ data: art.data, mimeType: 'image/png', kind: 'coverFront', name: 'cover.png' }],
    });
  });

  it('leaves out fields the format does not carry', () => {
    const tags = buildMetadataTags(full, art, 'wav');
    expect(tags.images).toBeUndefined();
    expect(tags.lyrics).toBeUndefined();
    expect(tags.title).toBe('Song');
  });
});

// --- SECTION: names and reports ---

describe('safeFileName', () => {
  it('keeps readable characters and falls back when nothing is left', () => {
    expect(safeFileName('My Song: Final/Master?')).toBe('My Song FinalMaster');
    expect(safeFileName('  a   b  ')).toBe('a b');
    expect(safeFileName('///')).toBe('master');
    expect(safeFileName('x'.repeat(120))).toHaveLength(80);
  });
});

describe('loudness reports', () => {
  const rows = [
    { file: 'a, "mix".wav', seconds: 12.3456, sampleRate: 48_000, loudness: reading() },
    { file: 'silence.wav', seconds: 1, sampleRate: 44_100, loudness: reading({ integrated: -Infinity, truePeakDb: [-Infinity], maxTruePeakDb: -Infinity }) },
  ];

  it('writes CSV with quoted names, CRLF rows, and empty cells for silence', () => {
    expect(loudnessCsv(rows)).toBe([
      'file,duration_s,sample_rate_hz,integrated_lufs,loudness_range_lu,max_true_peak_dbtp,max_momentary_lufs,max_short_term_lufs,true_peak_left_dbtp,true_peak_right_dbtp',
      '"a, ""mix"".wav",12.346,48000,-14.03,6.25,-1.04,-9.50,-11.99,-1.21,-1.04',
      'silence.wav,1.000,44100,,6.25,,-9.50,-11.99,,',
      '',
    ].join('\r\n'));
  });

  it('writes JSON with nulls for silence and the measurement basis', () => {
    const parsed = JSON.parse(loudnessJson(rows)) as { measuredWith: string; files: Array<Record<string, unknown>> };
    expect(parsed.measuredWith).toContain('BS.1770-5');
    expect(parsed.files[0]).toMatchObject({ file: 'a, "mix".wav', durationSeconds: 12.346, integratedLufs: -14.03, truePeakDbtpPerChannel: [-1.21, -1.04] });
    expect(parsed.files[1]).toMatchObject({ integratedLufs: null, maxTruePeakDbtp: null, truePeakDbtpPerChannel: [null] });
  });
});
