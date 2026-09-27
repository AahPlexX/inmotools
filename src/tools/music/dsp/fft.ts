/**
 * Radix-2 complex FFT and short-time Fourier transform helpers.
 *
 * `FFT` caches twiddle factors and the bit-reversal permutation per size so
 * repeated frames (spectrum meters, spectrograms, spectral repair) allocate
 * nothing per call. `stftProcess` runs analysis, a per-frame callback on the
 * complex spectrum, and weighted overlap-add resynthesis with a Hann window at
 * 75 % overlap; with an identity callback it reconstructs the input.
 */

export class FFT {
  readonly size: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) throw new RangeError('FFT size must be a power of two of at least 2.');
    this.size = size;
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let index = 0; index < size / 2; index += 1) {
      this.cos[index] = Math.cos(2 * Math.PI * index / size);
      this.sin[index] = Math.sin(2 * Math.PI * index / size);
    }
    const bits = Math.log2(size);
    this.reversed = new Uint32Array(size);
    for (let index = 0; index < size; index += 1) {
      let value = 0;
      for (let bit = 0; bit < bits; bit += 1) value |= ((index >> bit) & 1) << (bits - 1 - bit);
      this.reversed[index] = value;
    }
  }

  /** In-place transform. `inverse` applies the conjugate kernel and 1/N scaling. */
  transform(re: Float64Array, im: Float64Array, inverse = false) {
    const n = this.size;
    for (let index = 0; index < n; index += 1) {
      const target = this.reversed[index];
      if (target > index) {
        const tr = re[index]; re[index] = re[target]; re[target] = tr;
        const ti = im[index]; im[index] = im[target]; im[target] = ti;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let span = 2; span <= n; span *= 2) {
      const half = span / 2;
      const step = n / span;
      for (let start = 0; start < n; start += span) {
        for (let k = 0; k < half; k += 1) {
          const wr = this.cos[k * step];
          const wi = sign * this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inverse) for (let index = 0; index < n; index += 1) { re[index] /= n; im[index] /= n; }
  }
}

const fftCache = new Map<number, FFT>();
export function fftOfSize(size: number): FFT {
  let fft = fftCache.get(size);
  if (!fft) { fft = new FFT(size); fftCache.set(size, fft); }
  return fft;
}

/** Periodic Hann window, the form that sums to a constant at 50 % and 75 % overlap. */
export function hannWindow(size: number): Float64Array {
  return Float64Array.from({ length: size }, (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / size));
}

export interface StftFrame {
  /** Real and imaginary bins 0..size-1 (full complex spectrum). Edit in place. */
  re: Float64Array;
  im: Float64Array;
  /** Index of this frame; its centre sits at `index * hop` input samples. */
  index: number;
  hop: number;
  size: number;
}

/**
 * Analyse → modify → resynthesize one channel.
 *
 * The signal is padded by one window on each side so the first and last
 * samples receive full overlap, then trimmed back to the input length. Frames
 * use analysis and synthesis Hann windows; output is normalized by the summed
 * squared window, which makes an unmodified spectrum reconstruct exactly.
 *
 * @param onFrame - Called with each frame's spectrum; must keep conjugate symmetry for a real result.
 */
export function stftProcess(input: Float32Array, size: number, onFrame: (frame: StftFrame) => void, hop = size / 4): Float32Array {
  const fft = fftOfSize(size);
  const window = hannWindow(size);
  const padded = new Float64Array(input.length + 2 * size);
  padded.set(input, size);
  const output = new Float64Array(padded.length);
  const norm = new Float64Array(padded.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let index = 0;
  for (let start = 0; start + size <= padded.length; start += hop, index += 1) {
    for (let n = 0; n < size; n += 1) { re[n] = padded[start + n] * window[n]; im[n] = 0; }
    fft.transform(re, im);
    onFrame({ re, im, index, hop, size });
    fft.transform(re, im, true);
    for (let n = 0; n < size; n += 1) {
      output[start + n] += re[n] * window[n];
      norm[start + n] += window[n] * window[n];
    }
  }
  const result = new Float32Array(input.length);
  for (let n = 0; n < input.length; n += 1) {
    const weight = norm[n + size];
    result[n] = weight > 1e-9 ? output[n + size] / weight : 0;
  }
  return result;
}

/** Magnitude spectrum (bins 0..size/2) of one Hann-windowed frame starting at `start`. */
export function magnitudeSpectrum(samples: ArrayLike<number>, start: number, size: number, window = hannWindow(size)): Float64Array {
  const fft = fftOfSize(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let n = 0; n < size; n += 1) {
    const index = start + n;
    re[n] = index >= 0 && index < samples.length ? samples[index] * window[n] : 0;
  }
  fft.transform(re, im);
  const bins = size / 2 + 1;
  const magnitudes = new Float64Array(bins);
  for (let bin = 0; bin < bins; bin += 1) magnitudes[bin] = Math.hypot(re[bin], im[bin]);
  return magnitudes;
}
