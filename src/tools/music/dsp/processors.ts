/**
 * Clip edit processors that need more than a one-line transform (ledgers 19,
 * 24, 27, 32). All are deterministic: randomness comes from a seed stored in
 * the edit, so replaying the edit list always yields identical samples.
 */
import type { PcmAudio } from '../mastering-engine';
import { measureLoudness } from './loudness';

/** Mulberry32: small, fast, well-distributed 32-bit PRNG returning [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- SECTION: bit depth (ledger 27) ---

export type DitherMode = 'none' | 'tpdf';
export const SUPPORTED_BIT_DEPTHS = [8, 16, 24] as const;

/**
 * Quantizes to a signed integer grid of `bits` bits and returns floats on that
 * grid. TPDF dither adds the difference of two independent uniform values
 * (triangular, ±1 LSB peak) before rounding, which decorrelates quantization
 * error from the signal. Values clip to the integer range [-2^(b-1), 2^(b-1)-1].
 */
export function quantizePcm(audio: PcmAudio, bits: number, dither: DitherMode, seed = 1): PcmAudio {
  if (!SUPPORTED_BIT_DEPTHS.includes(bits as 8 | 16 | 24)) throw new RangeError('Bit depth must be 8, 16, or 24.');
  const scale = 2 ** (bits - 1);
  const random = seededRandom(seed);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => Float32Array.from(channel, (sample) => {
      const noise = dither === 'tpdf' ? random() - random() : 0;
      const integer = Math.min(scale - 1, Math.max(-scale, Math.round(sample * scale + noise)));
      return integer / scale;
    })),
  };
}

// --- SECTION: loudness and RMS normalization (ledger 24) ---

export type LevelMeasure = 'lufs' | 'rms';

/** Integrated loudness (LUFS) or whole-clip RMS (dBFS); -Infinity for silence. */
export function measureLevel(audio: PcmAudio, measure: LevelMeasure): number {
  if (measure === 'lufs') return audio.channels.length <= 5 ? measureLoudness(audio.channels, audio.sampleRate).integrated : -Infinity;
  let sum = 0;
  let count = 0;
  for (const channel of audio.channels) { for (const sample of channel) sum += sample * sample; count += channel.length; }
  return count && sum > 0 ? 10 * Math.log10(sum / count) : -Infinity;
}

/** Applies the gain that brings the measured level to `target`. Silent audio is returned unchanged. */
export function normalizeLevel(audio: PcmAudio, measure: LevelMeasure, target: number): PcmAudio {
  const measured = measureLevel(audio, measure);
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) };
  const gain = 10 ** ((target - measured) / 20);
  return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => Float32Array.from(channel, (sample) => sample * gain)) };
}

// --- SECTION: sample pen (ledger 19) ---

/** Longest patch accepted; the pen works at maximum zoom where a few thousand samples fill the view. */
export const MAX_PATCH_FRAMES = 8192;

/**
 * Replaces `values[c].length` samples per channel starting at `startFrame`.
 * Channels without values are left untouched; frames past the end are ignored.
 */
export function patchSamples(audio: PcmAudio, startFrame: number, values: readonly (readonly number[])[]): PcmAudio {
  const start = Math.max(0, Math.trunc(startFrame));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel, index) => {
      const next = channel.slice();
      const patch = values[index];
      if (!patch) return next;
      for (let offset = 0; offset < Math.min(patch.length, MAX_PATCH_FRAMES); offset += 1) {
        const target = start + offset;
        if (target >= next.length) break;
        const value = patch[offset];
        if (Number.isFinite(value)) next[target] = Math.max(-4, Math.min(4, value));
      }
      return next;
    }),
  };
}

// --- SECTION: room tone (ledger 32) ---

const toFrame = (seconds: number, rate: number, length: number) => Math.max(0, Math.min(length, Math.round(seconds * rate)));

/**
 * Replaces a target range with room tone captured from another range of the
 * same audio.
 *
 * Grains of up to 200 ms are read from random positions in the capture and
 * overlapped at 50 % with a sine (square-root Hann) window. Sine windows at
 * 50 % overlap sum to constant power for uncorrelated material, so the fill
 * keeps the capture's level without pumping. The fill is blended into the
 * surrounding audio with 10 ms equal-power crossfades at both ends.
 *
 * @throws {RangeError} when the capture is shorter than 20 ms or the target is empty.
 */
export function fillRoomTone(audio: PcmAudio, captureStart: number, captureEnd: number, targetStart: number, targetEnd: number, seed = 1): PcmAudio {
  const rate = audio.sampleRate;
  const length = audio.channels[0]?.length ?? 0;
  const c0 = toFrame(Math.min(captureStart, captureEnd), rate, length);
  const c1 = toFrame(Math.max(captureStart, captureEnd), rate, length);
  const t0 = toFrame(Math.min(targetStart, targetEnd), rate, length);
  const t1 = toFrame(Math.max(targetStart, targetEnd), rate, length);
  const captureFrames = c1 - c0;
  if (captureFrames < Math.round(0.02 * rate)) throw new RangeError('Capture at least 20 ms of room tone first.');
  if (t1 <= t0) throw new RangeError('Choose a range to fill.');
  const grain = Math.max(2, Math.min(captureFrames, Math.round(0.2 * rate)) & ~1);
  const hop = grain / 2;
  const window = Float64Array.from({ length: grain }, (_, n) => Math.sin(Math.PI * (n + 0.5) / grain));
  const targetFrames = t1 - t0;
  const edge = Math.min(Math.round(0.01 * rate), Math.floor(targetFrames / 2));
  const random = seededRandom(seed);
  const offsets: number[] = [];
  for (let start = -hop; start < targetFrames; start += hop) offsets.push(Math.floor(random() * Math.max(1, captureFrames - grain + 1)));
  return {
    sampleRate: rate,
    channels: audio.channels.map((channel) => {
      const next = channel.slice();
      const fill = new Float64Array(targetFrames);
      offsets.forEach((offset, index) => {
        const start = -hop + index * hop;
        for (let n = 0; n < grain; n += 1) {
          const target = start + n;
          if (target < 0 || target >= targetFrames) continue;
          fill[target] += channel[c0 + offset + n] * window[n];
        }
      });
      for (let n = 0; n < targetFrames; n += 1) {
        let wet = 1;
        if (n < edge) wet = Math.sin(Math.PI / 2 * (n + 0.5) / edge);
        else if (n >= targetFrames - edge) wet = Math.sin(Math.PI / 2 * (targetFrames - n - 0.5) / edge);
        const dry = Math.sqrt(Math.max(0, 1 - wet * wet));
        next[t0 + n] = channel[t0 + n] * dry + fill[n] * wet;
      }
      return next;
    }),
  };
}
