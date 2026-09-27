/**
 * Second-order IIR sections.
 *
 * Coefficient formulas follow the W3C Audio EQ Cookbook Working Group Note
 * (https://www.w3.org/TR/audio-eq-cookbook/). Coefficients are stored
 * normalized by a0. Processing uses transposed direct form II in double
 * precision, which stays stable and low-noise for the low cutoffs used by
 * K-weighting and bass EQ.
 *
 * Consumed by the loudness meter (K-weighting), the master EQ, dynamics side
 * chains, crossovers, and restoration filters.
 */

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export type BiquadShape = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass' | 'peaking' | 'lowShelf' | 'highShelf';

export const IDENTITY: BiquadCoefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };

/**
 * Cookbook coefficients for one filter shape.
 *
 * @param shape - Filter response.
 * @param frequency - Centre or corner frequency in Hz; clamped just inside (0, Nyquist).
 * @param sampleRate - Sample rate in Hz.
 * @param q - Quality factor; for shelves this is the cookbook Q (0.7071 gives the steepest monotonic shelf).
 * @param gainDb - Gain for peaking and shelving shapes; ignored otherwise.
 * @throws {RangeError} for a non-positive sample rate or Q.
 */
export function designBiquad(shape: BiquadShape, frequency: number, sampleRate: number, q: number, gainDb = 0): BiquadCoefficients {
  if (!(sampleRate > 0) || !(q > 0)) throw new RangeError('Sample rate and Q must be positive.');
  const nyquist = sampleRate / 2;
  const f0 = Math.min(nyquist * 0.9999, Math.max(1e-3, frequency));
  const w0 = 2 * Math.PI * f0 / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (shape) {
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'notch':
      b0 = 1; b1 = -2 * cos; b2 = 1; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'allpass':
      b0 = 1 - alpha; b1 = -2 * cos; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
    case 'lowShelf': {
      const root = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + root);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - root);
      a0 = (A + 1) + (A - 1) * cos + root;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - root;
      break;
    }
    case 'highShelf': {
      const root = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + root);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - root);
      a0 = (A + 1) - (A - 1) * cos + root;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - root;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Complex response magnitude at `frequency`, used for EQ curve drawing and filter tests. */
export function biquadMagnitude(coefficients: BiquadCoefficients, frequency: number, sampleRate: number): number {
  const w = 2 * Math.PI * frequency / sampleRate;
  const cos1 = Math.cos(w), sin1 = Math.sin(w), cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
  const { b0, b1, b2, a1, a2 } = coefficients;
  const numRe = b0 + b1 * cos1 + b2 * cos2;
  const numIm = -(b1 * sin1 + b2 * sin2);
  const denRe = 1 + a1 * cos1 + a2 * cos2;
  const denIm = -(a1 * sin1 + a2 * sin2);
  return Math.sqrt((numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm));
}

/** Stateful single-channel section. `reset` clears history without changing coefficients. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;

  constructor(public coefficients: BiquadCoefficients = IDENTITY) {}

  reset() { this.z1 = 0; this.z2 = 0; }

  processSample(input: number): number {
    const { b0, b1, b2, a1, a2 } = this.coefficients;
    const output = b0 * input + this.z1;
    this.z1 = b1 * input - a1 * output + this.z2;
    this.z2 = b2 * input - a2 * output;
    return output;
  }

  /** Filters `input` into `output` (which may be the same array). */
  process(input: ArrayLike<number>, output: Float32Array | Float64Array, length = input.length) {
    const { b0, b1, b2, a1, a2 } = this.coefficients;
    let z1 = this.z1, z2 = this.z2;
    for (let index = 0; index < length; index += 1) {
      const x = input[index];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      output[index] = y;
    }
    this.z1 = z1;
    this.z2 = z2;
  }
}
