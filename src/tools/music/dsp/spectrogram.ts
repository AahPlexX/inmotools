/**
 * Spectrogram analysis (ledger 6).
 *
 * The mono sum is analysed with 2048-point Hann frames every 512 samples and
 * resampled onto log-spaced frequency rows (20 Hz to Nyquist), which matches
 * how pitch is heard and keeps the image readable. Levels are quantized to
 * 8 bits over a 120 dB range so a five-minute stereo mix at 48 kHz stays
 * around 7 MB. Built in the DSP worker; the timeline view reads any time range
 * of it without recomputing.
 */
import { fftOfSize, hannWindow } from './fft';

export const SPECTROGRAM_FRAME = 2048;
export const SPECTROGRAM_HOP = 512;
export const SPECTROGRAM_ROWS = 256;
export const SPECTROGRAM_MIN_HZ = 20;
export const SPECTROGRAM_RANGE_DB = 120;

export interface Spectrogram {
  /** Column-major: column c occupies data[c·rows … c·rows + rows − 1], row 0 = lowest frequency. */
  data: Uint8Array;
  columns: number;
  rows: number;
  /** Seconds between column centres; column c is centred at c·hopSeconds. */
  hopSeconds: number;
  minHz: number;
  maxHz: number;
}

/** Frequency at the centre of a row. */
export const rowFrequency = (row: number, rows: number, minHz: number, maxHz: number) => minHz * (maxHz / minHz) ** ((row + 0.5) / rows);

export function buildSpectrogram(channels: readonly Float32Array[], sampleRate: number, rows = SPECTROGRAM_ROWS): Spectrogram {
  const length = channels[0]?.length ?? 0;
  const size = SPECTROGRAM_FRAME;
  const hop = SPECTROGRAM_HOP;
  const fft = fftOfSize(size);
  const window = hannWindow(size);
  const windowSum = window.reduce((sum, value) => sum + value, 0);
  const reference = (windowSum / 2) ** 2;
  const columns = Math.max(1, Math.ceil(length / hop));
  const maxHz = sampleRate / 2;
  const data = new Uint8Array(columns * rows);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const binHz = sampleRate / size;
  // Each row averages the bins between its edges; rows narrower than a bin read the nearest bin.
  const edges = Array.from({ length: rows + 1 }, (_, row) => SPECTROGRAM_MIN_HZ * (maxHz / SPECTROGRAM_MIN_HZ) ** (row / rows));
  for (let column = 0; column < columns; column += 1) {
    const centre = column * hop;
    for (let n = 0; n < size; n += 1) {
      const index = centre - size / 2 + n;
      let sum = 0;
      if (index >= 0 && index < length) for (const channel of channels) sum += channel[index];
      re[n] = sum / channels.length * window[n];
      im[n] = 0;
    }
    fft.transform(re, im);
    for (let row = 0; row < rows; row += 1) {
      const low = Math.max(1, Math.floor(edges[row] / binHz));
      const high = Math.min(size / 2, Math.max(low, Math.ceil(edges[row + 1] / binHz) - 1));
      let power = 0;
      for (let bin = low; bin <= high; bin += 1) power = Math.max(power, re[bin] * re[bin] + im[bin] * im[bin]);
      const db = 10 * Math.log10(Math.max(1e-30, power / reference));
      data[column * rows + row] = Math.round(Math.max(0, Math.min(1, (db + SPECTROGRAM_RANGE_DB) / SPECTROGRAM_RANGE_DB)) * 255);
    }
  }
  return { data, columns, rows, hopSeconds: hop / sampleRate, minHz: SPECTROGRAM_MIN_HZ, maxHz };
}

/**
 * Colour map from quiet (near black) through purple and orange to pale yellow,
 * approximating the perceptually ordered "magma" scheme so level reads
 * consistently without relying on hue alone.
 */
export function spectrogramPalette(): Uint8ClampedArray {
  const stops: Array<[number, number, number, number]> = [
    [0, 4, 4, 18], [0.25, 60, 15, 110], [0.5, 150, 45, 110], [0.75, 240, 110, 60], [1, 252, 250, 190],
  ];
  const palette = new Uint8ClampedArray(256 * 4);
  for (let level = 0; level < 256; level += 1) {
    const t = level / 255;
    let index = 0;
    while (index < stops.length - 2 && t > stops[index + 1][0]) index += 1;
    const [t0, r0, g0, b0] = stops[index];
    const [t1, r1, g1, b1] = stops[index + 1];
    const mix = (t - t0) / (t1 - t0);
    palette[level * 4] = r0 + (r1 - r0) * mix;
    palette[level * 4 + 1] = g0 + (g1 - g0) * mix;
    palette[level * 4 + 2] = b0 + (b1 - b0) * mix;
    palette[level * 4 + 3] = 255;
  }
  return palette;
}
