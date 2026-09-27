/**
 * Dynamics building blocks shared by restoration (de-esser, hiss gate,
 * plosive control) and the master chain (compressors, expander, limiter).
 *
 * - `EnvelopeFollower`: one-pole attack/release detector on |x| or x².
 * - `LinkwitzRiley4`: 24 dB/octave crossover built from two cascaded
 *   Butterworth sections per side; low + high sums to an all-pass, so a split
 *   and re-sum has flat magnitude.
 * - `ThreeBandSplitter`: two LR4 crossovers with the low band passed through
 *   the upper crossover's all-pass so all three bands stay phase-aligned.
 * - Static gain computers for compression and downward expansion with a
 *   quadratic soft knee (the standard piecewise form: hard below and above the
 *   knee, quadratic inside it).
 */
import { Biquad, designBiquad } from './biquad';

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (gain: number) => gain > 0 ? 20 * Math.log10(gain) : -Infinity;

/** One-pole smoothing coefficient that reaches ~63 % of a step in `seconds`. */
export const timeCoefficient = (seconds: number, sampleRate: number) => seconds > 0 ? Math.exp(-1 / (seconds * sampleRate)) : 0;

export class EnvelopeFollower {
  private attack: number;
  private release: number;
  value = 0;

  constructor(sampleRate: number, attackSeconds: number, releaseSeconds: number) {
    this.attack = timeCoefficient(attackSeconds, sampleRate);
    this.release = timeCoefficient(releaseSeconds, sampleRate);
  }

  setTimes(sampleRate: number, attackSeconds: number, releaseSeconds: number) {
    this.attack = timeCoefficient(attackSeconds, sampleRate);
    this.release = timeCoefficient(releaseSeconds, sampleRate);
  }

  reset() { this.value = 0; }

  /** Follows a non-negative detector input (|x| for peak, x² for power). */
  next(input: number): number {
    const coefficient = input > this.value ? this.attack : this.release;
    this.value = input + coefficient * (this.value - input);
    return this.value;
  }
}

export class LinkwitzRiley4 {
  private readonly low: [Biquad, Biquad];
  private readonly high: [Biquad, Biquad];

  constructor(frequency: number, sampleRate: number) {
    const lp = designBiquad('lowpass', frequency, sampleRate, Math.SQRT1_2);
    const hp = designBiquad('highpass', frequency, sampleRate, Math.SQRT1_2);
    this.low = [new Biquad(lp), new Biquad(lp)];
    this.high = [new Biquad(hp), new Biquad(hp)];
  }

  reset() { for (const section of [...this.low, ...this.high]) section.reset(); }

  /** Returns [low, high] for one sample. */
  split(input: number): [number, number] {
    return [
      this.low[1].processSample(this.low[0].processSample(input)),
      this.high[1].processSample(this.high[0].processSample(input)),
    ];
  }

  /** The all-pass this crossover applies to a signal: low + high. */
  allPass(input: number): number {
    const [low, high] = this.split(input);
    return low + high;
  }
}

export class ThreeBandSplitter {
  private readonly lower: LinkwitzRiley4;
  private readonly upper: LinkwitzRiley4;
  private readonly lowCompensation: LinkwitzRiley4;

  constructor(lowCrossover: number, highCrossover: number, sampleRate: number) {
    const low = Math.min(lowCrossover, highCrossover);
    const high = Math.max(lowCrossover, highCrossover);
    this.lower = new LinkwitzRiley4(low, sampleRate);
    this.upper = new LinkwitzRiley4(high, sampleRate);
    this.lowCompensation = new LinkwitzRiley4(high, sampleRate);
  }

  reset() { this.lower.reset(); this.upper.reset(); this.lowCompensation.reset(); }

  split(input: number): [number, number, number] {
    const [low, rest] = this.lower.split(input);
    const [mid, high] = this.upper.split(rest);
    return [this.lowCompensation.allPass(low), mid, high];
  }
}

/**
 * Gain change (dB, ≤ 0) of a downward compressor for an input level in dB.
 * `kneeDb` is the full knee width centred on the threshold.
 */
export function compressorGainDb(levelDb: number, thresholdDb: number, ratio: number, kneeDb: number): number {
  const slope = 1 / Math.max(1, ratio) - 1;
  const over = levelDb - thresholdDb;
  if (kneeDb > 0 && Math.abs(over) <= kneeDb / 2) return slope * (over + kneeDb / 2) ** 2 / (2 * kneeDb);
  return over > 0 ? slope * over : 0;
}

/**
 * Gain change (dB, ≤ 0) of a downward expander: below the threshold, every dB
 * of level drop becomes `ratio` dB of output drop, limited to `rangeDb`.
 */
export function expanderGainDb(levelDb: number, thresholdDb: number, ratio: number, rangeDb: number, kneeDb = 0): number {
  const under = thresholdDb - levelDb;
  const slope = Math.max(1, ratio) - 1;
  let gain: number;
  if (kneeDb > 0 && Math.abs(under) <= kneeDb / 2) gain = -slope * (under + kneeDb / 2) ** 2 / (2 * kneeDb);
  else gain = under > 0 ? -slope * under : 0;
  return Math.max(-Math.abs(rangeDb), gain);
}
