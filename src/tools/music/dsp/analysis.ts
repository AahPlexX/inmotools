/**
 * Offline spectrum analysis and the resonance finder (ledgers 50, 63, 80).
 *
 * `averageSpectrum` averages the power spectrum of Hann-windowed 8192-point
 * frames (50 % overlap) of the mono sum over a range. `findResonances`
 * compares that spectrum with a one-third-octave smoothed copy and reports
 * narrow peaks that stand out, each with a suggested EQ cut, so a band can be
 * created from a measured peak instead of by sweeping.
 */
import { fftOfSize, hannWindow } from './fft';

export const ANALYSIS_FRAME = 8192;

export interface Spectrum {
  /** Power in dB per bin (0..size/2), relative to a full-scale sine. */
  db: Float64Array;
  binHz: number;
}

export function averageSpectrum(channels: readonly Float32Array[], sampleRate: number, startFrame: number, endFrame: number, size = ANALYSIS_FRAME): Spectrum {
  const length = channels[0]?.length ?? 0;
  const start = Math.max(0, Math.min(length, Math.trunc(startFrame)));
  const end = Math.max(start, Math.min(length, Math.trunc(endFrame)));
  const fft = fftOfSize(size);
  const window = hannWindow(size);
  const windowSum = window.reduce((sum, value) => sum + value, 0);
  const bins = size / 2 + 1;
  const power = new Float64Array(bins);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  const hop = size / 2;
  const lastStart = Math.max(start, end - size);
  for (let offset = start; offset <= lastStart; offset += hop) {
    for (let n = 0; n < size; n += 1) {
      const index = offset + n;
      let sum = 0;
      if (index < end) for (const channel of channels) sum += channel[index];
      re[n] = sum / channels.length * window[n];
      im[n] = 0;
    }
    fft.transform(re, im);
    for (let bin = 0; bin < bins; bin += 1) power[bin] += re[bin] * re[bin] + im[bin] * im[bin];
    frames += 1;
    if (end - start < size) break;
  }
  // A full-scale sine at a bin centre reads 0 dB: amplitude·windowSum/2 per bin.
  const reference = (windowSum / 2) ** 2;
  const db = Float64Array.from(power, (value) => 10 * Math.log10(Math.max(1e-30, value / Math.max(1, frames) / reference)));
  return { db, binHz: sampleRate / size };
}

export interface Resonance {
  frequency: number;
  levelDb: number;
  prominenceDb: number;
  /** Suggested bell cut: half the prominence, capped at 12 dB. */
  suggestedGainDb: number;
  suggestedQ: number;
}

/** Peaks at least `minimumProminenceDb` above the 1/3-octave average and within 60 dB of the loudest bin, strongest first. */
export function findResonances(spectrum: Spectrum, count = 6, minimumProminenceDb = 4, lowHz = 30, highHz = 16_000): Resonance[] {
  const { binHz } = spectrum;
  const bins = spectrum.db.length;
  // Floor the spectrum 100 dB under its peak (never below −140 dBFS): numerically
  // silent bins would otherwise make inaudible spurs look like huge resonances.
  let loudest = -Infinity;
  for (const value of spectrum.db) loudest = Math.max(loudest, value);
  const floor = Math.max(-140, loudest - 100);
  const db = Float64Array.from(spectrum.db, (value) => Math.max(floor, value));
  const smooth = new Float64Array(bins);
  const prefix = new Float64Array(bins + 1);
  for (let bin = 0; bin < bins; bin += 1) prefix[bin + 1] = prefix[bin] + db[bin];
  const sixthOctave = 2 ** (1 / 6);
  for (let bin = 1; bin < bins; bin += 1) {
    const low = Math.max(1, Math.floor(bin / sixthOctave));
    const high = Math.min(bins - 1, Math.ceil(bin * sixthOctave));
    smooth[bin] = (prefix[high + 1] - prefix[low]) / (high - low + 1);
  }
  const candidates: Resonance[] = [];
  for (let bin = 2; bin < bins - 2; bin += 1) {
    const frequency = bin * binHz;
    if (frequency < lowHz || frequency > highHz) continue;
    if (!(db[bin] > db[bin - 1] && db[bin] >= db[bin + 1] && db[bin] > db[bin - 2] && db[bin] >= db[bin + 2])) continue;
    const prominence = db[bin] - smooth[bin];
    // Only peaks within 60 dB of the loudest bin are audible enough to be worth a cut.
    if (prominence < minimumProminenceDb || db[bin] < loudest - 60) continue;
    const [a, b, c] = [db[bin - 1], db[bin], db[bin + 1]];
    const offset = 0.5 * (a - c) / (a - 2 * b + c || 1);
    const peakFrequency = (bin + Math.max(-0.5, Math.min(0.5, offset))) * binHz;
    candidates.push({
      frequency: peakFrequency,
      levelDb: b,
      prominenceDb: prominence,
      suggestedGainDb: -Math.min(12, prominence / 2),
      suggestedQ: Math.min(12, Math.max(2, prominence)),
    });
  }
  candidates.sort((x, y) => y.prominenceDb - x.prominenceDb);
  const chosen: Resonance[] = [];
  for (const candidate of candidates) {
    if (chosen.some((existing) => Math.abs(Math.log2(existing.frequency / candidate.frequency)) < 1 / 6)) continue;
    chosen.push(candidate);
    if (chosen.length >= count) break;
  }
  return chosen;
}
