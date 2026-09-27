/**
 * Export encoding (ledgers 26, 73–80).
 *
 * WAV is written here byte for byte so bit depth, dither, and the Broadcast
 * Wave `bext` chunk are exactly controlled:
 * - `fmt ` per EBU Tech 3285 Appendix A / Microsoft WAVEFORMATEX: PCM (tag 1)
 *   for 16/24-bit, IEEE float (tag 3) for 32-bit, which also gets a `fact`
 *   chunk as a non-PCM format.
 * - `bext` version 2 (EBU Tech 3285 v2) with the loudness fields filled from
 *   the BS.1770-5 measurement and a CodingHistory row in EBU R 98 form.
 * - RIFF `LIST/INFO` with the same tag mapping MediaBunny uses (INAM, IART,
 *   IPRD, ITRK, IGNR, ICRD, ICMT) plus ISFT; values must be ISO 8859-1.
 * MP3, FLAC, Ogg, and AAC/M4A go through MediaBunny, using the browser's
 * encoder when present and the pinned first-party WASM extensions otherwise.
 */
import { quantizePcm } from './dsp/processors';
import type { LoudnessReading } from './dsp/loudness';

// --- SECTION: metadata model ---

export interface ExportMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNumber: string;
  tracksTotal: string;
  discNumber: string;
  discsTotal: string;
  genre: string;
  date: string;
  comment: string;
  lyrics: string;
  description: string;
  /** Broadcast Wave: originating organisation or person (32 ASCII characters). */
  originator: string;
  /** Broadcast Wave: unambiguous reference from the originator (32 ASCII characters). */
  originatorReference: string;
}

export const EMPTY_METADATA: ExportMetadata = {
  title: '', artist: '', album: '', albumArtist: '', trackNumber: '', tracksTotal: '', discNumber: '', discsTotal: '',
  genre: '', date: '', comment: '', lyrics: '', description: '', originator: '', originatorReference: '',
};

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg' | 'm4a';
export type MetadataField = keyof ExportMetadata | 'artwork';

/**
 * Fields each format actually writes. WAV follows RIFF INFO + bext; the
 * others follow MediaBunny's normalized tags for ID3v2, Vorbis comments, and
 * MP4 `ilst`. The UI shows everything else as "not stored in this format".
 */
export const FORMAT_FIELDS: Record<ExportFormat, ReadonlySet<MetadataField>> = {
  wav: new Set<MetadataField>(['title', 'artist', 'album', 'trackNumber', 'tracksTotal', 'genre', 'date', 'comment', 'description', 'originator', 'originatorReference']),
  mp3: new Set<MetadataField>(['title', 'artist', 'album', 'albumArtist', 'trackNumber', 'tracksTotal', 'discNumber', 'discsTotal', 'genre', 'date', 'comment', 'lyrics', 'description', 'artwork']),
  flac: new Set<MetadataField>(['title', 'artist', 'album', 'albumArtist', 'trackNumber', 'tracksTotal', 'discNumber', 'discsTotal', 'genre', 'date', 'comment', 'lyrics', 'description', 'artwork']),
  ogg: new Set<MetadataField>(['title', 'artist', 'album', 'albumArtist', 'trackNumber', 'tracksTotal', 'discNumber', 'discsTotal', 'genre', 'date', 'comment', 'lyrics', 'description', 'artwork']),
  m4a: new Set<MetadataField>(['title', 'artist', 'album', 'albumArtist', 'trackNumber', 'tracksTotal', 'discNumber', 'discsTotal', 'genre', 'date', 'comment', 'lyrics', 'description', 'artwork']),
};

export interface Artwork { data: Uint8Array; mimeType: string; name: string }

const positiveInteger = (value: string) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

/** Parses a YYYY, YYYY-MM, or YYYY-MM-DD date; anything else is left out rather than guessed. */
export function parseReleaseDate(value: string): Date | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-31 over into March; a date that does not round-trip was never real.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

const latin1 = (value: string) => [...value].every((character) => character.charCodeAt(0) <= 0xff);

// --- SECTION: WAV / BWF writer (ledgers 73, 78) ---

export type WavDepth = 16 | 24 | 32;

export interface WavOptions {
  depth: WavDepth;
  dither: boolean;
  metadata: ExportMetadata;
  loudness?: LoudnessReading | null;
  /** Seed for TPDF dither so repeated exports are identical. */
  seed?: number;
  software?: string;
  /** Moment written to bext OriginationDate/Time (UTC); defaults to now. */
  createdAt?: Date;
}

export interface WavResult {
  bytes: Uint8Array;
  /** Metadata values that could not be written (for example non-Latin-1 text in RIFF INFO). */
  skipped: string[];
}

class ByteWriter {
  private buffer: Uint8Array;
  private view: DataView;
  length = 0;
  constructor(capacity: number) { this.buffer = new Uint8Array(capacity); this.view = new DataView(this.buffer.buffer); }
  private ensure(extra: number) {
    if (this.length + extra <= this.buffer.length) return;
    const next = new Uint8Array(Math.max(this.buffer.length * 2, this.length + extra));
    next.set(this.buffer);
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }
  ascii(text: string, size = text.length) { this.ensure(size); for (let index = 0; index < size; index += 1) this.buffer[this.length + index] = index < text.length ? text.charCodeAt(index) & 0xff : 0; this.length += size; }
  u16(value: number) { this.ensure(2); this.view.setUint16(this.length, value, true); this.length += 2; }
  i16(value: number) { this.ensure(2); this.view.setInt16(this.length, value, true); this.length += 2; }
  u32(value: number) { this.ensure(4); this.view.setUint32(this.length, value, true); this.length += 4; }
  bytes(data: Uint8Array) { this.ensure(data.length); this.buffer.set(data, this.length); this.length += data.length; }
  zeros(count: number) { this.ensure(count); this.buffer.fill(0, this.length, this.length + count); this.length += count; }
  setU32(offset: number, value: number) { this.view.setUint32(offset, value, true); }
  result() { return this.buffer.slice(0, this.length); }
}

/** Tech 3285 loudness fields: round(100·x) using "integer part of (x + sgn(x)·0.5)", as signed 16-bit. */
const bextLoudness = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return 0x7fff;
  const scaled = value * 100;
  return Math.max(-32768, Math.min(32767, Math.trunc(scaled + Math.sign(scaled) * 0.5)));
};

const two = (value: number) => String(value).padStart(2, '0');

export function encodeWav(channels: readonly Float32Array[], sampleRate: number, options: WavOptions): WavResult {
  const channelCount = channels.length;
  if (channelCount < 1 || channelCount > 2) throw new RangeError('WAV export writes mono or stereo.');
  const frames = channels[0].length;
  const bytesPerSample = options.depth / 8;
  const blockAlign = channelCount * bytesPerSample;
  const isFloat = options.depth === 32;
  const skipped: string[] = [];
  const writer = new ByteWriter(64 + 1024 + frames * blockAlign);

  // Quantize once, with TPDF dither when reducing to an integer depth.
  const pcm = isFloat ? channels : quantizePcm({ sampleRate, channels: [...channels] }, options.depth, options.dither ? 'tpdf' : 'none', options.seed ?? 1).channels;

  writer.ascii('RIFF');
  writer.u32(0);
  writer.ascii('WAVE');

  writer.ascii('fmt ');
  writer.u32(isFloat ? 18 : 16);
  writer.u16(isFloat ? 3 : 1);
  writer.u16(channelCount);
  writer.u32(sampleRate);
  writer.u32(sampleRate * blockAlign);
  writer.u16(blockAlign);
  writer.u16(options.depth);
  if (isFloat) writer.u16(0);

  if (isFloat) {
    writer.ascii('fact');
    writer.u32(4);
    writer.u32(frames);
  }

  // Broadcast Wave extension, version 2.
  const metadata = options.metadata;
  const created = options.createdAt ?? new Date();
  const ascii = (value: string) => value.replace(/[^\x20-\x7e]/g, '');
  const history = `A=PCM,F=${sampleRate},W=${options.depth},M=${channelCount === 1 ? 'mono' : 'stereo'},T=${ascii(options.software ?? 'InMo Tools Audio Mastering')}${isFloat ? '; IEEE float' : ''}${options.dither && !isFloat ? '; TPDF dither' : ''},\r\n`;
  const bextSize = 602 + history.length;
  writer.ascii('bext');
  writer.u32(bextSize);
  writer.ascii(ascii(metadata.description || metadata.title).slice(0, 256), 256);
  writer.ascii(ascii(metadata.originator).slice(0, 32), 32);
  writer.ascii(ascii(metadata.originatorReference).slice(0, 32), 32);
  writer.ascii(`${created.getUTCFullYear()}-${two(created.getUTCMonth() + 1)}-${two(created.getUTCDate())}`, 10);
  writer.ascii(`${two(created.getUTCHours())}:${two(created.getUTCMinutes())}:${two(created.getUTCSeconds())}`, 8);
  writer.u32(0); // TimeReferenceLow
  writer.u32(0); // TimeReferenceHigh
  writer.u16(2); // Version
  writer.zeros(64); // UMID (none)
  const loudness = options.loudness;
  writer.i16(bextLoudness(loudness?.integrated));
  writer.i16(bextLoudness(loudness?.loudnessRange));
  writer.i16(bextLoudness(loudness?.maxTruePeakDb));
  writer.i16(bextLoudness(loudness?.maxMomentary));
  writer.i16(bextLoudness(loudness?.maxShortTerm));
  writer.zeros(180);
  writer.ascii(history);
  if (bextSize & 1) writer.zeros(1);
  for (const [name, value] of [['description', metadata.description], ['originator', metadata.originator], ['originator reference', metadata.originatorReference]] as const) {
    if (value && ascii(value) !== value) skipped.push(`${name} (Broadcast Wave fields hold plain ASCII only)`);
  }

  // RIFF INFO list.
  const date = parseReleaseDate(metadata.date);
  const trackNumber = positiveInteger(metadata.trackNumber);
  const tracksTotal = positiveInteger(metadata.tracksTotal);
  const info: Array<[string, string, string]> = [
    ['INAM', metadata.title, 'title'],
    ['IART', metadata.artist, 'artist'],
    ['IPRD', metadata.album, 'album'],
    ['ITRK', trackNumber ? (tracksTotal ? `${trackNumber}/${tracksTotal}` : String(trackNumber)) : '', 'track number'],
    ['IGNR', metadata.genre, 'genre'],
    // The typed precision is kept: a year stays a year rather than becoming 1 January.
    ['ICRD', date ? metadata.date.trim() : '', 'date'],
    ['ICMT', metadata.comment, 'comment'],
    ['ISFT', options.software ?? 'InMo Tools Audio Mastering', 'software'],
  ];
  const entries = info.filter(([, value, label]) => {
    if (!value.trim()) return false;
    if (!latin1(value)) { skipped.push(`${label} (RIFF INFO stores Latin-1 text only)`); return false; }
    return true;
  });
  if (metadata.date.trim() && !date) skipped.push('date (use YYYY, YYYY-MM, or YYYY-MM-DD)');
  if (entries.length) {
    const listStart = writer.length;
    writer.ascii('LIST');
    writer.u32(0);
    writer.ascii('INFO');
    for (const [id, value] of entries) {
      const size = value.length + 1;
      writer.ascii(id);
      writer.u32(size);
      writer.ascii(value, size);
      if (size & 1) writer.zeros(1);
    }
    writer.setU32(listStart + 4, writer.length - listStart - 8);
  }

  // Interleaved sample data.
  writer.ascii('data');
  const dataSize = frames * blockAlign;
  writer.u32(dataSize);
  const data = new Uint8Array(dataSize);
  const view = new DataView(data.buffer);
  const integerScale = 2 ** (options.depth - 1);
  let offset = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = pcm[channel][frame];
      if (isFloat) { view.setFloat32(offset, value, true); offset += 4; continue; }
      // `quantizePcm` already produced exact grid values; this recovers the integer.
      const integer = Math.max(-integerScale, Math.min(integerScale - 1, Math.round(value * integerScale)));
      if (options.depth === 16) view.setInt16(offset, integer, true);
      else { view.setUint8(offset, integer & 0xff); view.setUint8(offset + 1, (integer >> 8) & 0xff); view.setUint8(offset + 2, (integer >> 16) & 0xff); }
      offset += bytesPerSample;
    }
  }
  writer.bytes(data);
  if (dataSize & 1) writer.zeros(1);
  writer.setU32(4, writer.length - 8);
  return { bytes: writer.result(), skipped };
}

// --- SECTION: MediaBunny encoding (ledgers 74–77, 79) ---

export interface CodecCapability {
  format: ExportFormat;
  available: boolean;
  /** The exact codec that will be written, e.g. "Opus in Ogg". */
  label: string;
  reason?: string;
}

const EXTENSION_CODECS = new Set(['mp3', 'flac', 'aac']);

/** Registers a first-party WASM encoder only when the browser has no native one. */
async function ensureEncoder(codec: 'mp3' | 'flac' | 'aac') {
  const { canEncodeAudio } = await import('mediabunny');
  if (await canEncodeAudio(codec)) return;
  if (codec === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
  else if (codec === 'flac') (await import('@mediabunny/flac-encoder')).registerFlacEncoder();
  else (await import('@mediabunny/aac-encoder')).registerAacEncoder();
}

/**
 * Probes what this browser can export at the given channel count and rate.
 * MP3, FLAC, and AAC always have a WASM fallback; Ogg needs a native Opus or
 * Vorbis encoder, and is disabled with a reason when neither exists.
 */
export async function probeExportCapabilities(numberOfChannels: number, sampleRate: number): Promise<CodecCapability[]> {
  const { canEncodeAudio } = await import('mediabunny');
  const check = async (codec: 'mp3' | 'flac' | 'aac' | 'opus' | 'vorbis') => {
    try {
      if (EXTENSION_CODECS.has(codec)) await ensureEncoder(codec as 'mp3' | 'flac' | 'aac');
      return await canEncodeAudio(codec, { numberOfChannels, sampleRate });
    } catch { return false; }
  };
  const [mp3, flac, aac, opus, vorbis] = await Promise.all([check('mp3'), check('flac'), check('aac'), check('opus'), check('vorbis')]);
  const opusRateOk = [8000, 12_000, 16_000, 24_000, 48_000].includes(sampleRate);
  return [
    { format: 'wav', available: true, label: 'PCM in WAV / Broadcast Wave' },
    { format: 'mp3', available: mp3, label: 'MP3 (MPEG-1 Layer III)', reason: mp3 ? undefined : 'No MP3 encoder could be started in this browser.' },
    { format: 'flac', available: flac, label: 'FLAC (lossless)', reason: flac ? undefined : 'No FLAC encoder could be started in this browser.' },
    { format: 'ogg', available: opus || vorbis, label: opus ? 'Opus in Ogg' : 'Vorbis in Ogg', reason: opus || vorbis ? undefined : `This browser has no Opus or Vorbis encoder${opusRateOk ? '' : `, and Opus needs 48 kHz (this project is ${sampleRate.toLocaleString()} Hz)`}.` },
    { format: 'm4a', available: aac, label: 'AAC-LC in MPEG-4 (M4A)', reason: aac ? undefined : 'No AAC encoder could be started in this browser.' },
  ];
}

export function buildMetadataTags(metadata: ExportMetadata, artwork: Artwork | null, format: ExportFormat): import('mediabunny').MetadataTags {
  const allowed = FORMAT_FIELDS[format];
  const text = (field: keyof ExportMetadata) => allowed.has(field) && metadata[field].trim() ? metadata[field].trim() : undefined;
  const number = (field: keyof ExportMetadata) => allowed.has(field) ? positiveInteger(metadata[field]) : undefined;
  const date = allowed.has('date') ? parseReleaseDate(metadata.date) : undefined;
  const tags: import('mediabunny').MetadataTags = {
    title: text('title'), artist: text('artist'), album: text('album'), albumArtist: text('albumArtist'),
    trackNumber: number('trackNumber'), tracksTotal: number('tracksTotal'), discNumber: number('discNumber'), discsTotal: number('discsTotal'),
    genre: text('genre'), date, comment: text('comment'), lyrics: text('lyrics'), description: text('description'),
    images: artwork && allowed.has('artwork') ? [{ data: artwork.data, mimeType: artwork.mimeType, kind: 'coverFront', name: artwork.name }] : undefined,
  };
  for (const key of Object.keys(tags) as Array<keyof typeof tags>) if (tags[key] === undefined) delete tags[key];
  return tags;
}

export interface EncodeOptions {
  format: Exclude<ExportFormat, 'wav'>;
  bitrateKbps: number;
  metadata: ExportMetadata;
  artwork: Artwork | null;
}

/** Encodes PCM with MediaBunny into the chosen container; returns the bytes and MIME type. */
export async function encodeCompressed(channels: readonly Float32Array[], sampleRate: number, options: EncodeOptions): Promise<{ bytes: Uint8Array; mimeType: string; codec: string }> {
  const mediabunny = await import('mediabunny');
  const codec = options.format === 'mp3' ? 'mp3' : options.format === 'flac' ? 'flac' : options.format === 'm4a' ? 'aac' : null;
  const quality = options.format === 'flac'
    ? undefined
    : new mediabunny.Quality({ bitrate: options.bitrateKbps * 1000, bitrateMode: 'constant' });
  const encodingConfig = { numberOfChannels: channels.length, sampleRate, ...(quality ? { quality } : {}) };
  let audioCodec: import('mediabunny').AudioCodec;
  if (codec) {
    await ensureEncoder(codec);
    if (!await mediabunny.canEncodeAudio(codec, encodingConfig)) {
      throw new Error(`The ${codec.toUpperCase()} encoder cannot encode ${channels.length} channel${channels.length === 1 ? '' : 's'} at ${sampleRate.toLocaleString()} Hz with the selected quality.`);
    }
    audioCodec = codec;
  } else if (await mediabunny.canEncodeAudio('opus', encodingConfig)) {
    audioCodec = 'opus';
  } else if (await mediabunny.canEncodeAudio('vorbis', encodingConfig)) {
    audioCodec = 'vorbis';
  } else {
    throw new Error(`No Ogg encoder can encode ${channels.length} channel${channels.length === 1 ? '' : 's'} at ${sampleRate.toLocaleString()} Hz with the selected quality.`);
  }
  const format = options.format === 'mp3' ? new mediabunny.Mp3OutputFormat()
    : options.format === 'flac' ? new mediabunny.FlacOutputFormat()
      : options.format === 'ogg' ? new mediabunny.OggOutputFormat()
        : new mediabunny.Mp4OutputFormat({ fastStart: 'in-memory' });
  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({ format, target });
  const source = new mediabunny.AudioSampleSource({
    codec: audioCodec,
    ...(quality ? { quality } : {}),
  });
  output.addAudioTrack(source);
  output.setMetadataTags(buildMetadataTags(options.metadata, options.artwork, options.format));
  await output.start();
  const frames = channels[0]?.length ?? 0;
  const block = 8192;
  try {
    for (let offset = 0; offset < frames; offset += block) {
      const size = Math.min(block, frames - offset);
      const planar = new Float32Array(size * channels.length);
      channels.forEach((channel, index) => planar.set(channel.subarray(offset, offset + size), index * size));
      const sample = new mediabunny.AudioSample({ data: planar, format: 'f32-planar', numberOfChannels: channels.length, sampleRate, timestamp: offset / sampleRate });
      await source.add(sample);
      sample.close();
    }
    source.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  if (!target.buffer) throw new Error('The encoder produced no output.');
  const mimeType = options.format === 'm4a' ? 'audio/mp4' : format.mimeType;
  return { bytes: new Uint8Array(target.buffer), mimeType, codec: audioCodec };
}

// --- SECTION: file names and telemetry reports (ledger 80) ---

export const FILE_EXTENSION: Record<ExportFormat, string> = { wav: 'wav', mp3: 'mp3', flac: 'flac', ogg: 'ogg', m4a: 'm4a' };

/** A safe, readable file name: keeps letters, digits, spaces, dots, dashes, and underscores. */
export function safeFileName(name: string, fallback = 'master'): string {
  const cleaned = name.normalize('NFKD').replace(/[^\p{L}\p{N} ._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}

export interface LoudnessReportRow {
  file: string;
  seconds: number;
  sampleRate: number;
  loudness: LoudnessReading;
}

const cell = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '';
const csvText = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** CSV with one row per exported file; empty cells mean silence (−∞). */
export function loudnessCsv(rows: readonly LoudnessReportRow[]): string {
  const header = 'file,duration_s,sample_rate_hz,integrated_lufs,loudness_range_lu,max_true_peak_dbtp,max_momentary_lufs,max_short_term_lufs,true_peak_left_dbtp,true_peak_right_dbtp';
  return [header, ...rows.map((row) => [
    csvText(row.file), cell(row.seconds, 3), String(row.sampleRate), cell(row.loudness.integrated), cell(row.loudness.loudnessRange),
    cell(row.loudness.maxTruePeakDb), cell(row.loudness.maxMomentary), cell(row.loudness.maxShortTerm),
    cell(row.loudness.truePeakDb[0] ?? Number.NaN), cell(row.loudness.truePeakDb[1] ?? row.loudness.truePeakDb[0] ?? Number.NaN),
  ].join(','))].join('\r\n') + '\r\n';
}

export function loudnessJson(rows: readonly LoudnessReportRow[], measuredWith = 'ITU-R BS.1770-5; EBU Tech 3341 v4.0 windows; EBU Tech 3342 loudness range'): string {
  const finiteOrNull = (value: number) => Number.isFinite(value) ? Number(value.toFixed(3)) : null;
  return JSON.stringify({
    measuredWith,
    files: rows.map((row) => ({
      file: row.file,
      durationSeconds: Number(row.seconds.toFixed(3)),
      sampleRate: row.sampleRate,
      integratedLufs: finiteOrNull(row.loudness.integrated),
      loudnessRangeLu: finiteOrNull(row.loudness.loudnessRange),
      maxTruePeakDbtp: finiteOrNull(row.loudness.maxTruePeakDb),
      maxMomentaryLufs: finiteOrNull(row.loudness.maxMomentary),
      maxShortTermLufs: finiteOrNull(row.loudness.maxShortTerm),
      truePeakDbtpPerChannel: row.loudness.truePeakDb.map(finiteOrNull),
    })),
  }, null, 2);
}

// --- SECTION: batch planning and ZIP packaging (ledger 80) ---

export type ExportScope = 'project' | 'selection' | 'regions' | 'stems';

/** One file to render: a timeline range of the mix, or one track as a stem. */
export interface ExportJob {
  /** File name without extension, unique within the batch. */
  name: string;
  startSeconds?: number;
  endSeconds?: number;
  trackId?: string;
}

/** Appends " 2", " 3", … to repeated names, case-insensitively, so no file overwrites another. */
function uniqueNames<T extends { name: string }>(items: T[]): T[] {
  const used = new Set<string>();
  return items.map((item) => {
    let name = item.name;
    for (let suffix = 2; used.has(name.toLowerCase()); suffix += 1) name = `${item.name} ${suffix}`;
    used.add(name.toLowerCase());
    return { ...item, name };
  });
}

/**
 * Turns an export scope into the files to render, in timeline order.
 * @throws {Error} with a plain-language reason when the scope has nothing to export.
 */
export function planExportJobs(document: import('./mastering-project').MasteringDocument, scope: ExportScope, baseName: string, durationSeconds: number): ExportJob[] {
  const base = safeFileName(baseName);
  const frame = document.sampleRate ? 1 / document.sampleRate : 0;
  if (scope === 'project') return [{ name: base }];
  if (scope === 'selection') {
    const start = Math.max(0, Math.min(durationSeconds, document.selection.startSeconds));
    const end = Math.max(0, Math.min(durationSeconds, document.selection.endSeconds));
    if (end - start < frame || end <= start) throw new Error('Select part of the timeline first, or choose the whole project.');
    return [{ name: base, startSeconds: start, endSeconds: end }];
  }
  if (scope === 'regions') {
    const regions = [...document.regions]
      .map((region) => ({ ...region, startSeconds: Math.max(0, region.startSeconds), endSeconds: Math.min(durationSeconds, region.endSeconds) }))
      .filter((region) => region.endSeconds - region.startSeconds >= frame && region.endSeconds > region.startSeconds)
      .sort((a, b) => a.startSeconds - b.startSeconds);
    if (!regions.length) throw new Error('Add at least one region on the timeline to export regions.');
    return uniqueNames(regions.map((region, index) => ({
      name: safeFileName(`${base} - ${region.label.trim() || `Region ${index + 1}`}`),
      startSeconds: region.startSeconds,
      endSeconds: region.endSeconds,
    })));
  }
  const tracks = document.tracks.filter((track) => track.clips.length > 0);
  if (!tracks.length) throw new Error('Add audio to a track to export stems.');
  return uniqueNames(tracks.map((track, index) => ({ name: safeFileName(`${base} - ${track.name.trim() || `Track ${index + 1}`}`), trackId: track.id })));
}

export interface ZipEntry {
  path: string;
  data: Uint8Array | string;
  /** Already-compressed audio is stored; text and PCM are deflated. */
  compress: boolean;
}

/** Packs a batch into one ZIP; every path sits under a single top-level folder. */
export async function buildExportZip(folder: string, entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const root = zip.folder(safeFileName(folder, 'export'));
  if (!root) throw new Error('Could not create the ZIP folder.');
  for (const entry of entries) root.file(entry.path, entry.data, { compression: entry.compress ? 'DEFLATE' : 'STORE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
