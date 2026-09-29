/**
 * Time stretching and pitch shifting (ledgers 28, 29, 30).
 *
 * A phase vocoder with identity phase locking (Laroche & Dolson): each spectral
 * peak advances by its measured instantaneous frequency and the bins around it
 * keep their analysed phase offsets to the peak, which avoids the "phasiness" of
 * a plain vocoder. Stereo is processed as mid/side so both channels share one
 * phase evolution for the centre image.
 *
 * Pitch shifting stretches by the pitch ratio and resamples back to the
 * original length. Optional formant preservation re-imposes the analysed
 * spectral envelope (cepstral smoothing) so voices keep their character.
 */
import type { PcmAudio } from '../mastering-engine';
import { fftOfSize, hannWindow } from './fft';
import { resamplePcm } from './resample';

export const MIN_STRETCH = 0.25;
export const MAX_STRETCH = 4;
const FRAME = 4096;
const SYNTHESIS_HOP = FRAME / 4;

const wrapPhase = (value: number) => value - 2 * Math.PI * Math.round(value / (2 * Math.PI));

/** Output frame count for a stretch; `applyEdits` and the document estimator both use it. */
export const stretchedLength = (frames: number, ratio: number) => Math.max(0, Math.round(frames * ratio));

type EnvelopeWarp = (magnitude: Float64Array, bins: number) => void;

/**
 * Real-cepstrum spectral envelope of a magnitude spectrum (bins 0..size/2),
 * keeping `lifter` quefrency coefficients. Returned as linear magnitude.
 */
function spectralEnvelope(magnitude: Float64Array, size: number, lifter: number): Float64Array {
  const fft = fftOfSize(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const half = size / 2;
  for (let bin = 0; bin <= half; bin += 1) {
    const value = Math.log(magnitude[bin] + 1e-9);
    re[bin] = value;
    if (bin > 0 && bin < half) re[size - bin] = value;
  }
  fft.transform(re, im, true);
  for (let index = lifter + 1; index < size - lifter; index += 1) { re[index] = 0; im[index] = 0; }
  fft.transform(re, im);
  const envelope = new Float64Array(half + 1);
  for (let bin = 0; bin <= half; bin += 1) envelope[bin] = Math.exp(re[bin]);
  return envelope;
}

function vocode(input: Float32Array, ratio: number, warp?: EnvelopeWarp): Float32Array {
  const size = FRAME;
  const half = size / 2;
  const fft = fftOfSize(size);
  const window = hannWindow(size);
  const hs = SYNTHESIS_HOP;
  const ha = hs / ratio;
  const outputLength = stretchedLength(input.length, ratio);
  const output = new Float64Array(outputLength + size);
  const norm = new Float64Array(outputLength + size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const magnitude = new Float64Array(half + 1);
  const phase = new Float64Array(half + 1);
  const previousPhase = new Float64Array(half + 1);
  const synthesisPhase = new Float64Array(half + 1);
  const peakOf = new Int32Array(half + 1);
  let previousStart = 0;
  for (let frame = 0; ; frame += 1) {
    const centre = frame * ha;
    if (centre - half > input.length) break;
    const start = Math.round(centre) - half;
    for (let n = 0; n < size; n += 1) {
      const index = start + n;
      re[n] = index >= 0 && index < input.length ? input[index] * window[n] : 0;
      im[n] = 0;
    }
    fft.transform(re, im);
    for (let bin = 0; bin <= half; bin += 1) {
      magnitude[bin] = Math.hypot(re[bin], im[bin]);
      phase[bin] = Math.atan2(im[bin], re[bin]);
    }
    if (frame === 0) {
      synthesisPhase.set(phase);
    } else {
      const actualHop = start - previousStart;
      // Peaks: local maxima over ±2 bins; every bin is assigned to its nearest peak.
      const peaks: number[] = [];
      for (let bin = 2; bin <= half - 2; bin += 1) {
        const value = magnitude[bin];
        if (value > magnitude[bin - 1] && value >= magnitude[bin + 1] && value > magnitude[bin - 2] && value >= magnitude[bin + 2]) peaks.push(bin);
      }
      if (!peaks.length) peaks.push(0);
      let peakIndex = 0;
      for (let bin = 0; bin <= half; bin += 1) {
        while (peakIndex + 1 < peaks.length && Math.abs(peaks[peakIndex + 1] - bin) <= Math.abs(peaks[peakIndex] - bin)) peakIndex += 1;
        peakOf[bin] = peaks[peakIndex];
      }
      const advanced = new Map<number, number>();
      for (const peak of peaks) {
        const omega = 2 * Math.PI * peak / size;
        const deviation = actualHop > 0 ? wrapPhase(phase[peak] - previousPhase[peak] - omega * actualHop) / actualHop : 0;
        advanced.set(peak, synthesisPhase[peak] + (omega + deviation) * hs);
      }
      for (let bin = 0; bin <= half; bin += 1) {
        const peak = peakOf[bin];
        synthesisPhase[bin] = (advanced.get(peak) ?? 0) + (phase[bin] - phase[peak]);
      }
    }
    previousPhase.set(phase);
    previousStart = start;
    if (warp) warp(magnitude, half + 1);
    for (let bin = 0; bin <= half; bin += 1) {
      re[bin] = magnitude[bin] * Math.cos(synthesisPhase[bin]);
      im[bin] = magnitude[bin] * Math.sin(synthesisPhase[bin]);
      if (bin > 0 && bin < half) { re[size - bin] = re[bin]; im[size - bin] = -im[bin]; }
    }
    im[0] = 0; im[half] = 0;
    fft.transform(re, im, true);
    const outStart = Math.round(frame * hs) - half;
    for (let n = 0; n < size; n += 1) {
      const index = outStart + n;
      if (index < 0 || index >= outputLength) continue;
      output[index] += re[n] * window[n];
      norm[index] += window[n] * window[n];
    }
  }
  const result = new Float32Array(outputLength);
  for (let n = 0; n < outputLength; n += 1) result[n] = norm[n] > 1e-6 ? output[n] / norm[n] : 0;
  return result;
}

/** Runs a per-channel process on mid/side for stereo so both channels share one phase evolution. */
function perImageChannel(audio: PcmAudio, process: (channel: Float32Array) => Float32Array): Float32Array[] {
  if (audio.channels.length !== 2) return audio.channels.map(process);
  const [left, right] = audio.channels;
  const mid = Float32Array.from(left, (value, index) => (value + right[index]) / 2);
  const side = Float32Array.from(left, (value, index) => (value - right[index]) / 2);
  const m = process(mid);
  const s = process(side);
  return [Float32Array.from(m, (value, index) => value + s[index]), Float32Array.from(m, (value, index) => value - s[index])];
}

/**
 * Changes duration by `ratio` (0.25–4) without changing pitch.
 * @throws {RangeError} outside the supported ratio range.
 */
export function timeStretch(audio: PcmAudio, ratio: number): PcmAudio {
  if (!(ratio >= MIN_STRETCH && ratio <= MAX_STRETCH)) throw new RangeError(`Stretch must be between ${MIN_STRETCH * 100}% and ${MAX_STRETCH * 100}%.`);
  if (Math.abs(ratio - 1) < 1e-9) return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) };
  return { sampleRate: audio.sampleRate, channels: perImageChannel(audio, (channel) => vocode(channel, ratio)) };
}

/** Pitch ratio for a semitone + cent shift. */
export const pitchRatio = (semitones: number, cents = 0) => 2 ** (semitones / 12 + cents / 1200);

/**
 * Shifts pitch while keeping duration exactly the same frame count.
 * @param preserveFormants - Keeps the spectral envelope in place (useful for voice).
 * @throws {RangeError} beyond ±24 semitones.
 */
export function pitchShift(audio: PcmAudio, semitones: number, cents = 0, preserveFormants = false): PcmAudio {
  const total = semitones + cents / 100;
  if (!(Math.abs(total) <= 24)) throw new RangeError('Pitch shift is limited to ±24 semitones.');
  if (Math.abs(total) < 1e-9) return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) };
  const ratio = pitchRatio(semitones, cents);
  const lifter = Math.max(8, Math.round(0.0012 * audio.sampleRate));
  const warp: EnvelopeWarp | undefined = preserveFormants ? (magnitude, bins) => {
    // After resampling, stretched bin k lands at frequency k·ratio; scaling by
    // E(k·ratio)/E(k) makes the final envelope equal the original one.
    const envelope = spectralEnvelope(magnitude, FRAME, lifter);
    for (let bin = 0; bin < bins; bin += 1) {
      const source = Math.min(bins - 1, bin * ratio);
      const low = Math.floor(source);
      const fraction = source - low;
      const target = envelope[low] + (envelope[Math.min(bins - 1, low + 1)] - envelope[low]) * fraction;
      magnitude[bin] *= target / envelope[bin];
    }
  } : undefined;
  const length = audio.channels[0]?.length ?? 0;
  const channels = perImageChannel(audio, (channel) => {
    const stretched = vocode(channel, ratio, warp);
    const back = resamplePcm({ sampleRate: audio.sampleRate * ratio, channels: [stretched] }, audio.sampleRate).channels[0];
    const exact = new Float32Array(length);
    exact.set(back.subarray(0, length));
    return exact;
  });
  return { sampleRate: audio.sampleRate, channels };
}
