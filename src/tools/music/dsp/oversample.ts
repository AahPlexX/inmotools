/**
 * Integer-factor oversampling for nonlinear stages (saturation, soft clipper).
 *
 * A Kaiser-windowed sinc low-pass (β = 8, cutoff at 0.45 of the base rate,
 * 32·factor + 1 taps) is used for both interpolation and decimation, so
 * harmonics a nonlinearity creates above the base Nyquist frequency are
 * removed before returning to the base rate instead of aliasing back.
 * Streaming: state carries across blocks. Latency is reported in base-rate
 * frames so the dry path can be aligned for A/B and delta monitoring.
 */

/** Kernel half-length per unit of oversampling; 16 keeps >80 dB image rejection at realtime cost. */
const TAPS_PER_FACTOR = 16;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k += 1) {
    term *= (x * x / 4) / (k * k);
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}

function designLowpass(factor: number): Float64Array {
  const length = TAPS_PER_FACTOR * factor * 2 + 1;
  const centre = (length - 1) / 2;
  const cutoff = 0.45 / factor;
  const beta = 8;
  const denominator = besselI0(beta);
  const taps = new Float64Array(length);
  let sum = 0;
  for (let n = 0; n < length; n += 1) {
    const x = n - centre;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const ratio = x / centre;
    taps[n] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - ratio * ratio))) / denominator;
    sum += taps[n];
  }
  for (let n = 0; n < length; n += 1) taps[n] /= sum;
  return taps;
}

export class Oversampler {
  readonly factor: number;
  private readonly taps: Float64Array;
  /** Base-rate input history for the polyphase interpolator. */
  private readonly inputHistory: Float64Array;
  /** High-rate history of shaped samples for the decimator. */
  private readonly shapedHistory: Float64Array;
  private inputPosition = 0;
  private shapedPosition = 0;

  constructor(factor: 1 | 2 | 4) {
    this.factor = factor;
    this.taps = factor > 1 ? designLowpass(factor) : new Float64Array([1]);
    this.inputHistory = new Float64Array(Math.ceil(this.taps.length / factor));
    this.shapedHistory = new Float64Array(this.taps.length);
  }

  /** Round-trip delay in base-rate frames (both filters are linear phase). */
  get latency(): number {
    return this.factor > 1 ? (this.taps.length - 1) / this.factor : 0;
  }

  reset() { this.inputHistory.fill(0); this.shapedHistory.fill(0); this.inputPosition = 0; this.shapedPosition = 0; }

  /**
   * Upsamples `input`, applies `shape` to every high-rate sample, and writes
   * the decimated result into `output` (which may be the same array).
   */
  process(input: Float32Array | Float64Array, output: Float32Array | Float64Array, length: number, shape: (value: number) => number) {
    const factor = this.factor;
    if (factor === 1) {
      for (let n = 0; n < length; n += 1) output[n] = shape(input[n]);
      return;
    }
    const taps = this.taps;
    const tapCount = taps.length;
    const inputSize = this.inputHistory.length;
    const shapedSize = this.shapedHistory.length;
    for (let n = 0; n < length; n += 1) {
      this.inputPosition = (this.inputPosition + 1) % inputSize;
      this.inputHistory[this.inputPosition] = input[n];
      for (let phase = 0; phase < factor; phase += 1) {
        // Polyphase interpolation: only real input samples are multiplied.
        let up = 0;
        let index = this.inputPosition;
        for (let tap = phase; tap < tapCount; tap += factor) {
          up += taps[tap] * this.inputHistory[index];
          index = index === 0 ? inputSize - 1 : index - 1;
        }
        this.shapedPosition = (this.shapedPosition + 1) % shapedSize;
        this.shapedHistory[this.shapedPosition] = shape(up * factor);
      }
      // Decimation: filter only the high-rate sample that is kept.
      let down = 0;
      let index = this.shapedPosition;
      for (let tap = 0; tap < tapCount; tap += 1) {
        down += taps[tap] * this.shapedHistory[index];
        index = index === 0 ? shapedSize - 1 : index - 1;
      }
      output[n] = down;
    }
  }
}
