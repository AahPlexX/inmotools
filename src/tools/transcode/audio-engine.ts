// Audio transcoding & analysis (F20-F23) plus ID3 tagging at export (F35).
// Built on mediabunny (WebCodecs) with WASM fallback encoders for MP3/FLAC/AAC
// where the browser lacks native support. Waveform and spectrogram exporters
// run on decoded PCM with a hand-rolled FFT.

import type { FormatId } from './formats';

export interface AudioConvertOptions {
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface AudioTagOptions {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  comment?: string;
  trackNumber?: number;
  coverArt?: { bytes: Uint8Array; mime: string };
}

const FORMAT_CONFIG: Record<'wav' | 'mp3' | 'ogg' | 'flac' | 'aac', { codec: string; extension: string; mime: string }> = {
  wav: { codec: 'pcm-s16', extension: 'wav', mime: 'audio/wav' },
  mp3: { codec: 'mp3', extension: 'mp3', mime: 'audio/mpeg' },
  ogg: { codec: 'opus', extension: 'ogg', mime: 'audio/ogg' },
  flac: { codec: 'flac', extension: 'flac', mime: 'audio/flac' },
  aac: { codec: 'aac', extension: 'm4a', mime: 'audio/mp4' },
};

const DEFAULT_BITRATE_KBPS: Record<string, number> = { mp3: 192, ogg: 128, aac: 160 };

async function ensureEncoder(codec: string): Promise<void> {
  const { canEncodeAudio } = await import('mediabunny');
  if (codec === 'mp3' && !(await canEncodeAudio('mp3'))) {
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder');
    registerMp3Encoder();
  } else if (codec === 'flac' && !(await canEncodeAudio('flac'))) {
    const { registerFlacEncoder } = await import('@mediabunny/flac-encoder');
    registerFlacEncoder();
  } else if (codec === 'aac' && !(await canEncodeAudio('aac'))) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }
}

async function createOutputFormat(target: 'wav' | 'mp3' | 'ogg' | 'flac' | 'aac'): Promise<import('mediabunny').OutputFormat> {
  // Constructed lazily so the modules load only when audio conversion runs.
  const mediabunny = await import('mediabunny');
  switch (target) {
    case 'wav': return new mediabunny.WavOutputFormat();
    case 'mp3': return new mediabunny.Mp3OutputFormat();
    case 'ogg': return new mediabunny.OggOutputFormat();
    case 'flac': return new mediabunny.FlacOutputFormat();
    case 'aac': return new mediabunny.AdtsOutputFormat();
    default: throw new Error(`Unsupported audio target: ${target}`);
  }
}

export async function transcodeAudio(
  bytes: Uint8Array,
  target: 'wav' | 'mp3' | 'ogg' | 'flac' | 'aac',
  options: AudioConvertOptions = {},
): Promise<Uint8Array> {
  const config = FORMAT_CONFIG[target];
  await ensureEncoder(config.codec);

  const mediabunny = await import('mediabunny');
  const { canEncodeAudio } = mediabunny;
  if (!(await canEncodeAudio(config.codec as import('mediabunny').AudioCodec))) {
    throw new Error(`This browser cannot encode ${config.codec.toUpperCase()} audio (no WebCodecs support for this codec). Try a different target format.`);
  }

  const format = await createOutputFormat(target);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer]);
  const input = new mediabunny.Input({
    formats: mediabunny.ALL_FORMATS,
    source: new mediabunny.BlobSource(blob),
  });
  if (!(await input.canRead())) throw new Error('The audio file could not be read. It may be corrupted or use an unsupported container.');

  const targetHandle = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({ format, target: targetHandle });

  const audioOptions: Record<string, unknown> = {
    codec: config.codec,
    forceTranscode: true,
  };
  if (target !== 'wav') {
    const bitrate = (options.bitrateKbps ?? DEFAULT_BITRATE_KBPS[target] ?? 192) * 1000;
    audioOptions.quality = new mediabunny.Quality({ bitrate });
  }
  if (options.sampleRate && options.sampleRate > 0) audioOptions.sampleRate = options.sampleRate;
  if (options.channels && options.channels > 0) audioOptions.numberOfChannels = options.channels;

  const trim = options.trimStart !== undefined || options.trimEnd !== undefined
    ? { start: Math.max(0, options.trimStart ?? 0), end: options.trimEnd }
    : undefined;

  const conversion = await mediabunny.Conversion.init({
    input,
    output,
    audio: audioOptions as never,
    ...(trim ? { trim: trim as { start: number; end?: number } } : {}),
  });
  await conversion.execute();

  if (!targetHandle.buffer) {
    throw new Error('Audio conversion failed: no output was produced. The source may contain no audio track.');
  }
  return new Uint8Array(targetHandle.buffer);
}

// ---------------------------------------------------------------------------
// PCM decoding for analysis (waveform / spectrogram)
// ---------------------------------------------------------------------------

interface DecodedAudio {
  channelData: Float32Array[];
  sampleRate: number;
  duration: number;
}

export async function decodeAudio(bytes: Uint8Array): Promise<DecodedAudio> {
  const mediabunny = await import('mediabunny');
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer]);
  const input = new mediabunny.Input({
    formats: mediabunny.ALL_FORMATS,
    source: new mediabunny.BlobSource(blob),
  });
  if (!(await input.canRead())) throw new Error('The audio file could not be decoded.');
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('The file contains no audio track.');
  const sink = new mediabunny.AudioBufferSink(track);
  const chunks: Array<{ data: Float32Array[]; length: number; channels: number; sampleRate: number }> = [];
  for await (const wrapped of sink.buffers()) {
    const buffer = wrapped.buffer;
    const channelData: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      channelData.push(buffer.getChannelData(channel).slice());
    }
    chunks.push({ data: channelData, length: buffer.length, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  }
  if (chunks.length === 0) throw new Error('No audio samples were decoded.');
  const channels = chunks[0].channels;
  const sampleRate = chunks[0].sampleRate;
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      const source = chunk.data[Math.min(channel, chunk.channels - 1)];
      merged.set(source, offset);
      offset += chunk.length;
    }
    channelData.push(merged);
  }
  return { channelData, sampleRate, duration: totalLength / sampleRate };
}

/** Mix all channels down to a single mono signal. */
export function monoFromDecoded(audio: DecodedAudio): Float32Array {
  if (audio.channelData.length === 1) return audio.channelData[0];
  const mono = new Float32Array(audio.channelData[0].length);
  for (const channel of audio.channelData) {
    for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i] / audio.channelData.length;
  }
  return mono;
}

// ---------------------------------------------------------------------------
// F23: waveform SVG export
// ---------------------------------------------------------------------------

export function waveformToSvg(audio: DecodedAudio, width = 1200, height = 300): string {
  const mono = monoFromDecoded(audio);
  const buckets = width;
  const perBucket = Math.max(1, Math.floor(mono.length / buckets));
  const mins: number[] = [];
  const maxs: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * perBucket;
    const end = Math.min(mono.length, start + perBucket);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const sample = mono[i];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    mins.push(min);
    maxs.push(max);
  }
  const mid = height / 2;
  const scale = (height / 2) * 0.95;
  const topPath = maxs.map((value, index) => `${index === 0 ? 'M' : 'L'}${index},${(mid - value * scale).toFixed(2)}`).join(' ');
  const bottomPath = [...mins].reverse().map((value, index) => `L${buckets - 1 - index},${(mid - value * scale).toFixed(2)}`).join(' ');
  const durationLabel = formatDuration(audio.duration);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#0f172a"/>`,
    `<path d="${topPath} ${bottomPath} Z" fill="#38bdf8" opacity="0.9"/>`,
    `<line x1="0" y1="${mid}" x2="${width}" y2="${mid}" stroke="#1e293b" stroke-width="1"/>`,
    `<text x="8" y="${height - 8}" font-family="monospace" font-size="12" fill="#94a3b8">${durationLabel} · ${audio.sampleRate} Hz · ${audio.channelData.length} ch</text>`,
    '</svg>',
    '',
  ].join('\n');
}

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
};

// ---------------------------------------------------------------------------
// F23: spectrogram PNG export (hand-rolled FFT)
// ---------------------------------------------------------------------------

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const HANN = new Map<number, Float32Array>();
function hannWindow(size: number): Float32Array {
  let window = HANN.get(size);
  if (!window) {
    window = new Float32Array(size);
    for (let i = 0; i < size; i += 1) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    HANN.set(size, window);
  }
  return window;
}

/** Inferno-style colormap sampled at t in [0,1]. */
function colormap(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.25) {
    const u = clamped / 0.25;
    return [Math.round(u * 87), 0, Math.round(70 + u * 70)];
  }
  if (clamped < 0.5) {
    const u = (clamped - 0.25) / 0.25;
    return [Math.round(87 + u * 115), Math.round(u * 30), Math.round(140 - u * 10)];
  }
  if (clamped < 0.75) {
    const u = (clamped - 0.5) / 0.25;
    return [Math.round(202 + u * 40), Math.round(30 + u * 100), Math.round(130 - u * 100)];
  }
  const u = (clamped - 0.75) / 0.25;
  return [Math.round(242 + u * 13), Math.round(130 + u * 120), Math.round(30 + u * 130)];
}

export async function spectrogramToPng(audio: DecodedAudio, width = 1000, height = 400): Promise<Uint8Array> {
  const mono = monoFromDecoded(audio);
  const fftSize = 2048;
  const hop = Math.max(fftSize / 8, Math.floor(mono.length / width));
  const columns = Math.max(1, Math.floor((mono.length - fftSize) / hop));
  const bins = fftSize / 2;
  const window = hannWindow(fftSize);

  const canvas = document.createElement('canvas');
  canvas.width = columns;
  canvas.height = bins;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  const imageData = context.createImageData(columns, bins);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  let maxMagnitude = 1e-9;
  const magnitudes = new Float32Array(columns * bins);
  for (let column = 0; column < columns; column += 1) {
    const start = column * hop;
    for (let i = 0; i < fftSize; i += 1) {
      re[i] = mono[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin < bins; bin += 1) {
      const magnitude = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
      magnitudes[column * bins + bin] = magnitude;
      if (magnitude > maxMagnitude) maxMagnitude = magnitude;
    }
  }
  const maxDb = Math.log10(maxMagnitude);
  for (let column = 0; column < columns; column += 1) {
    for (let bin = 0; bin < bins; bin += 1) {
      const magnitude = magnitudes[column * bins + bin];
      const db = Math.log10(Math.max(magnitude, 1e-9));
      const normalized = Math.min(1, Math.max(0, (db - (maxDb - 6)) / 6)); // 60 dB dynamic range
      const [r, g, b] = colormap(normalized);
      // Flip so low frequencies are at the bottom.
      const row = bins - 1 - bin;
      const index = (row * columns + column) * 4;
      imageData.data[index] = r;
      imageData.data[index + 1] = g;
      imageData.data[index + 2] = b;
      imageData.data[index + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outContext = out.getContext('2d');
  if (!outContext) throw new Error('Canvas rendering is unavailable.');
  outContext.imageSmoothingEnabled = true;
  outContext.fillStyle = '#0f172a';
  outContext.fillRect(0, 0, width, height);
  outContext.drawImage(canvas, 0, 20, width, height - 40);
  outContext.fillStyle = '#94a3b8';
  outContext.font = '12px monospace';
  const nyquist = Math.round(audio.sampleRate / 2);
  outContext.fillText(`0 Hz`, 4, height - 8);
  outContext.fillText(`${nyquist} Hz`, 4, 14);
  outContext.fillText(formatDuration(audio.duration), width - 90, height - 8);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((value) => (value ? resolve(value) : reject(new Error('Spectrogram rendering failed.'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// F35: ID3v2 tagging (MP3)
// ---------------------------------------------------------------------------

export async function writeId3Tags(bytes: Uint8Array, tags: AudioTagOptions): Promise<Uint8Array> {
  const { ID3Writer } = await import('browser-id3-writer');
  const writer = new ID3Writer(bytes.slice().buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  if (tags.title) writer.setFrame('TIT2', tags.title);
  if (tags.artist) writer.setFrame('TPE1', [tags.artist]);
  if (tags.album) writer.setFrame('TALB', tags.album);
  if (tags.year && /^\d{4}$/.test(tags.year)) writer.setFrame('TYER', Number(tags.year));
  if (tags.genre) writer.setFrame('TCON', [tags.genre]);
  if (tags.comment) writer.setFrame('COMM', { language: 'eng', description: '', text: tags.comment });
  if (tags.trackNumber) writer.setFrame('TRCK', String(tags.trackNumber));
  if (tags.coverArt) {
    writer.setFrame('APIC', {
      type: 3,
      data: tags.coverArt.bytes.slice().buffer.slice(tags.coverArt.bytes.byteOffset, tags.coverArt.bytes.byteOffset + tags.coverArt.bytes.byteLength) as ArrayBuffer,
      description: 'cover',
    });
  }
  return new Uint8Array(writer.addTag());
}

export function hasTagOptions(tags: AudioTagOptions | undefined): boolean {
  if (!tags) return false;
  return Boolean(tags.title || tags.artist || tags.album || tags.year || tags.genre || tags.comment || tags.trackNumber || tags.coverArt);
}

export { FORMAT_CONFIG };
