/**
 * Band-limited sample-rate conversion (ledger 26 and multi-rate import).
 *
 * Kaiser-windowed sinc interpolation evaluated at arbitrary output instants.
 * The kernel is tabulated once per conversion at a fine phase resolution and
 * read with linear interpolation, which keeps an arbitrary ratio (for example
 * 44.1 kHz to 48 kHz) at a fixed cost per output sample.
 *
 * Receives PCM from the import path or a clip edit; returns new PCM at the
 * target rate. Pure: the input is never mutated.
 */
import type { PcmAudio } from '../mastering-engine';

/** Zero crossings of the sinc kept on each side of the centre tap. */
const HALF_ZERO_CROSSINGS = 32;
/** Table entries per zero crossing; linear interpolation between entries adds < -120 dB error at this density. */
const TABLE_RESOLUTION = 512;
/**
 * Kaiser beta for roughly 100 dB of stopband attenuation, from the standard
 * Kaiser design relation beta = 0.1102 * (A - 8.7) with A = 100 dB.
 */
const KAISER_BETA = 0.1102 * (100 - 8.7);
/** Passband edge as a fraction of the lower Nyquist frequency; the rest is the transition band. */
const PASSBAND = 0.94;

/** Zeroth-order modified Bessel function of the first kind, by its power series. */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const quarterSquare = (x * x) / 4;
  for (let k = 1; k < 64; k += 1) {
    term *= quarterSquare / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

function buildKernelTable(): Float64Array {
  const length = HALF_ZERO_CROSSINGS * TABLE_RESOLUTION + 2;
  const table = new Float64Array(length);
  const denominator = besselI0(KAISER_BETA);
  for (let index = 0; index < length; index += 1) {
    const t = index / TABLE_RESOLUTION;
    const ratio = t / HALF_ZERO_CROSSINGS;
    const window = ratio >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - ratio * ratio)) / denominator;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    table[index] = sinc * window;
  }
  return table;
}

let kernelTable: Float64Array | null = null;

/** Output length for a conversion; the same rounding the document uses for converted sources. */
export function resampledLength(frames: number, fromRate: number, toRate: number): number {
  return Math.max(0, Math.round(frames * toRate / fromRate));
}

/**
 * Converts every channel to `targetRate`.
 *
 * @throws {RangeError} when either rate is not a positive finite number.
 * @example
 * resamplePcm({ sampleRate: 44_100, channels: [samples] }, 48_000).sampleRate // => 48000
 */
export function resamplePcm(audio: PcmAudio, targetRate: number): PcmAudio {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) {
    throw new RangeError('Sample rates must be positive finite numbers.');
  }
  if (audio.sampleRate === targetRate) return { sampleRate: targetRate, channels: audio.channels.map((channel) => channel.slice()) };
  kernelTable ??= buildKernelTable();
  const table = kernelTable;
  const step = audio.sampleRate / targetRate;
  // Downsampling narrows the kernel's passband to the new Nyquist frequency so
  // content above it is removed instead of aliasing.
  const cutoff = Math.min(1, targetRate / audio.sampleRate) * PASSBAND;
  const reach = HALF_ZERO_CROSSINGS / cutoff;
  const inputLength = audio.channels[0]?.length ?? 0;
  const outputLength = resampledLength(inputLength, audio.sampleRate, targetRate);
  const channels = audio.channels.map((input) => {
    const output = new Float32Array(outputLength);
    for (let n = 0; n < outputLength; n += 1) {
      const center = n * step;
      const first = Math.max(0, Math.ceil(center - reach));
      const last = Math.min(inputLength - 1, Math.floor(center + reach));
      let sum = 0;
      for (let k = first; k <= last; k += 1) {
        const position = Math.abs(center - k) * cutoff * TABLE_RESOLUTION;
        const index = Math.floor(position);
        if (index >= table.length - 1) continue;
        const fraction = position - index;
        sum += input[k] * (table[index] + (table[index + 1] - table[index]) * fraction);
      }
      output[n] = sum * cutoff;
    }
    return output;
  });
  return { sampleRate: targetRate, channels };
}
