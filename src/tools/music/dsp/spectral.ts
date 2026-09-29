/**
 * STFT restoration (ledgers 33, 34, 43, 44).
 *
 * All processors run through `stftProcess` (Hann, 2048 points, 75 % overlap),
 * which reconstructs unmodified audio exactly, so only the bins a processor
 * changes are affected. Regions are given in clip-local seconds and Hz, the
 * semantic representation chosen in
 * docs/research/audio-mastering-spectral-edit-model-2026-09-19.md.
 */
import type { PcmAudio } from '../mastering-engine';
import { hannWindow, magnitudeSpectrum, stftProcess, type StftFrame } from './fft';

export const SPECTRAL_FRAME = 2048;

export interface SpectralRegion {
  startSeconds: number;
  endSeconds: number;
  lowHz: number;
  highHz: number;
}

/** Input-sample position of a frame centre, matching `stftProcess` padding. */
const frameCentre = (frame: StftFrame) => frame.index * frame.hop - frame.size / 2;

/**
 * Mean magnitude per bin over a noise-only range (ledger 33).
 * @throws {RangeError} when the range is shorter than one analysis frame.
 */
export function noiseProfile(channel: Float32Array, sampleRate: number, startSeconds: number, endSeconds: number, size = SPECTRAL_FRAME): Float64Array {
  const start = Math.max(0, Math.round(Math.min(startSeconds, endSeconds) * sampleRate));
  const end = Math.min(channel.length, Math.round(Math.max(startSeconds, endSeconds) * sampleRate));
  if (end - start < size) throw new RangeError(`Select at least ${Math.ceil(size / sampleRate * 1000)} ms of noise-only audio for the fingerprint.`);
  const window = hannWindow(size);
  const profile = new Float64Array(size / 2 + 1);
  let frames = 0;
  for (let offset = start; offset + size <= end; offset += size / 4) {
    const magnitudes = magnitudeSpectrum(channel, offset, size, window);
    for (let bin = 0; bin < profile.length; bin += 1) profile[bin] += magnitudes[bin];
    frames += 1;
  }
  for (let bin = 0; bin < profile.length; bin += 1) profile[bin] /= frames;
  return profile;
}

/**
 * Spectral-profile noise reduction (ledger 34).
 *
 * Uses the decision-directed Wiener estimator (Ephraim and Malah): the a
 * priori SNR per bin blends the previous frame's cleaned power with the
 * current excess over the noise fingerprint. The blend weight comes from
 * `smoothing` (0–1 → 0.90–0.99); heavier smoothing suppresses the isolated
 * bins heard as "musical noise". Gains are floored at the reduction depth so
 * noise is lowered, not gated. High-SNR bins (tones, voices) keep gain ≈ 1.
 */
export function denoise(audio: PcmAudio, noiseStartSeconds: number, noiseEndSeconds: number, reductionDb: number, smoothing: number): PcmAudio {
  const floor = 10 ** (-Math.abs(reductionDb) / 20);
  const alpha = 0.9 + Math.min(1, Math.max(0, smoothing)) * 0.09;
  const bins = SPECTRAL_FRAME / 2 + 1;
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const profile = noiseProfile(channel, audio.sampleRate, noiseStartSeconds, noiseEndSeconds);
      const noisePower = Float64Array.from(profile, (magnitude) => Math.max(1e-20, magnitude * magnitude));
      const previousClean = new Float64Array(bins);
      return stftProcess(channel, SPECTRAL_FRAME, (frame) => {
        for (let bin = 0; bin < bins; bin += 1) {
          const power = frame.re[bin] * frame.re[bin] + frame.im[bin] * frame.im[bin];
          const posterior = power / noisePower[bin];
          const prior = alpha * previousClean[bin] / noisePower[bin] + (1 - alpha) * Math.max(posterior - 1, 0);
          const gain = Math.max(floor, prior / (1 + prior));
          previousClean[bin] = gain * gain * power;
          frame.re[bin] *= gain; frame.im[bin] *= gain;
          if (bin > 0 && bin < bins - 1) { frame.re[frame.size - bin] *= gain; frame.im[frame.size - bin] *= gain; }
        }
      });
    }),
  };
}

/** Fraction of a frame that overlaps a time range, used to feather region edges in time. */
function timeWeight(frame: StftFrame, rate: number, region: SpectralRegion): number {
  const centre = frameCentre(frame) / rate;
  const halfSpan = frame.hop / rate;
  const start = Math.min(region.startSeconds, region.endSeconds);
  const end = Math.max(region.startSeconds, region.endSeconds);
  return Math.max(0, Math.min(1, (Math.min(end, centre + halfSpan) - Math.max(start, centre - halfSpan)) / (2 * halfSpan)));
}

/** Weight for a bin inside a band, with a one-bin linear feather at each edge. */
function binWeight(bin: number, binHz: number, region: SpectralRegion): number {
  const low = Math.min(region.lowHz, region.highHz) / binHz;
  const high = Math.max(region.lowHz, region.highHz) / binHz;
  if (bin < low - 1 || bin > high + 1) return 0;
  if (bin < low) return 1 - (low - bin);
  if (bin > high) return 1 - (bin - high);
  return 1;
}

/** Spectral brush attenuation (ledger 43): lowers the painted time/frequency regions by `reductionDb`. */
export function spectralAttenuate(audio: PcmAudio, regions: readonly SpectralRegion[], reductionDb: number): PcmAudio {
  const target = 10 ** (-Math.abs(reductionDb) / 20);
  const binHz = audio.sampleRate / SPECTRAL_FRAME;
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => stftProcess(channel, SPECTRAL_FRAME, (frame) => {
      for (const region of regions) {
        const time = timeWeight(frame, audio.sampleRate, region);
        if (time <= 0) continue;
        for (let bin = 0; bin <= frame.size / 2; bin += 1) {
          const weight = time * binWeight(bin, binHz, region);
          if (weight <= 0) continue;
          const gain = 1 - weight * (1 - target);
          frame.re[bin] *= gain; frame.im[bin] *= gain;
          if (bin > 0 && bin < frame.size / 2) { frame.re[frame.size - bin] *= gain; frame.im[frame.size - bin] *= gain; }
        }
      }
    })),
  };
}

/**
 * Spectral heal (ledger 44): inside the region, each bin's magnitude is
 * replaced by a linear interpolation between the average magnitude of the
 * frames just before and just after the region; phases are kept, so the
 * repaired area stays continuous with its surroundings.
 */
export function spectralHeal(audio: PcmAudio, region: SpectralRegion): PcmAudio {
  const rate = audio.sampleRate;
  const binHz = rate / SPECTRAL_FRAME;
  const hop = SPECTRAL_FRAME / 4;
  const start = Math.min(region.startSeconds, region.endSeconds) * rate;
  const end = Math.max(region.startSeconds, region.endSeconds) * rate;
  return {
    sampleRate: rate,
    channels: audio.channels.map((channel) => {
      const window = hannWindow(SPECTRAL_FRAME);
      const reference = (centre: number) => magnitudeSpectrum(channel, Math.round(centre - SPECTRAL_FRAME / 2), SPECTRAL_FRAME, window);
      const before = reference(start - SPECTRAL_FRAME / 2 - hop);
      const after = reference(end + SPECTRAL_FRAME / 2 + hop);
      return stftProcess(channel, SPECTRAL_FRAME, (frame) => {
        const time = timeWeight(frame, rate, region);
        if (time <= 0) return;
        const centre = frameCentre(frame);
        const position = Math.min(1, Math.max(0, (centre - start) / Math.max(1, end - start)));
        for (let bin = 0; bin <= frame.size / 2; bin += 1) {
          const weight = time * binWeight(bin, binHz, region);
          if (weight <= 0) continue;
          const magnitude = Math.hypot(frame.re[bin], frame.im[bin]);
          if (magnitude <= 0) continue;
          const target = before[bin] * (1 - position) + after[bin] * position;
          const gain = 1 - weight + weight * target / magnitude;
          frame.re[bin] *= gain; frame.im[bin] *= gain;
          if (bin > 0 && bin < frame.size / 2) { frame.re[frame.size - bin] *= gain; frame.im[frame.size - bin] *= gain; }
        }
      });
    }),
  };
}
