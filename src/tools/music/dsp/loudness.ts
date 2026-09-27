/**
 * Programme loudness and true-peak metering (ledgers 65, 66, 67).
 *
 * Implements ITU-R BS.1770-5 (11/2023): two-stage K-weighting, channel-weighted
 * mean square, 400 ms gating blocks with 75 % overlap, the -70 LKFS absolute
 * gate and the -10 LU relative gate, and the Annex 2 true-peak estimate with
 * the Recommendation's 48-tap, 4-phase interpolator. Momentary (0.4 s) and
 * short-term (3 s) windows follow EBU Tech 3341 v4.0; Loudness Range follows
 * the EBU Tech 3342 definition and reference algorithm.
 *
 * One `LoudnessMeter` instance is shared by realtime metering (fed from the
 * playback graph) and offline analysis (fed a whole buffer), so both report the
 * same numbers.
 */
import { Biquad, type BiquadCoefficients } from './biquad';

// --- SECTION: K-weighting ---

/** BS.1770-5 Table 1 (stage 1, head-model shelf) at 48 kHz. */
export const BS1770_STAGE1_48K: BiquadCoefficients = { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 };
/** BS.1770-5 Table 2 (stage 2, RLB high-pass) at 48 kHz. */
export const BS1770_STAGE2_48K: BiquadCoefficients = { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 };

interface AnalogSection { f0: number; q: number; vh: number; vb: number; vl: number }

/**
 * Recovers the analog second-order prototype behind a 48 kHz section.
 *
 * The Recommendation gives coefficients only at 48 kHz and asks other rates to
 * reproduce the same frequency response. Both tables are bilinear transforms
 * of H(s) = (Vh·s² + Vb·(ω0/Q)·s + Vl·ω0²) / (s² + (ω0/Q)·s + ω0²), so the
 * prototype can be solved exactly from the published numbers and re-transformed
 * at any rate with frequency prewarping.
 */
function analogFrom48k(c: BiquadCoefficients, vl: number): AnalogSection {
  const k2 = (1 + c.a2 + c.a1) / (1 + c.a2 - c.a1);
  const k = Math.sqrt(k2);
  const d = 2 * (1 + k2) / (1 + c.a2);
  const q = k / (d - 1 - k2);
  const vh = vl === 0 ? c.b0 * d : (c.b0 + c.b2) * d / 2 - vl * k2;
  const vb = vl === 0 ? 0 : (c.b0 - c.b2) * d * q / (2 * k);
  return { f0: Math.atan(k) * 48_000 / Math.PI, q, vh, vb, vl };
}

function digitalAt(section: AnalogSection, sampleRate: number): BiquadCoefficients {
  const k = Math.tan(Math.PI * section.f0 / sampleRate);
  const d = 1 + k / section.q + k * k;
  return {
    b0: (section.vh + section.vb * k / section.q + section.vl * k * k) / d,
    b1: 2 * (section.vl * k * k - section.vh) / d,
    b2: (section.vh - section.vb * k / section.q + section.vl * k * k) / d,
    a1: 2 * (k * k - 1) / d,
    a2: (1 - k / section.q + k * k) / d,
  };
}

const STAGE1_ANALOG = analogFrom48k(BS1770_STAGE1_48K, 1);
const STAGE2_ANALOG = analogFrom48k(BS1770_STAGE2_48K, 0);

/** K-weighting stage coefficients at any sample rate; exact to the tables at 48 kHz. */
export function kWeightingCoefficients(sampleRate: number): [BiquadCoefficients, BiquadCoefficients] {
  if (!(sampleRate > 0)) throw new RangeError('Sample rate must be positive.');
  return [digitalAt(STAGE1_ANALOG, sampleRate), digitalAt(STAGE2_ANALOG, sampleRate)];
}

// --- SECTION: true peak (BS.1770-5 Annex 2) ---

/** Annex 2 interpolator, one row per phase, 12 taps each, in the published order. */
export const TRUE_PEAK_PHASES: readonly (readonly number[])[] = [
  [0.0017089843750, 0.0109863281250, -0.0196533203125, 0.0332031250000, -0.0594482421875, 0.1373291015625, 0.9721679687500, -0.1022949218750, 0.0476074218750, -0.0266113281250, 0.0148925781250, -0.0083007812500],
  [-0.0291748046875, 0.0292968750000, -0.0517578125000, 0.0891113281250, -0.1665039062500, 0.4650878906250, 0.7797851562500, -0.2003173828125, 0.1015625000000, -0.0582275390625, 0.0330810546875, -0.0189208984375],
  [-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625000000, -0.2003173828125, 0.7797851562500, 0.4650878906250, -0.1665039062500, 0.0891113281250, -0.0517578125000, 0.0292968750000, -0.0291748046875],
  [-0.0083007812500, 0.0148925781250, -0.0266113281250, 0.0476074218750, -0.1022949218750, 0.9721679687500, 0.1373291015625, -0.0594482421875, 0.0332031250000, -0.0196533203125, 0.0109863281250, 0.0017089843750],
];
const TAPS = 12;

/**
 * Running true-peak detector for one channel. Computed in floating point, so
 * the Annex's 12.04 dB headroom attenuation and make-up are unnecessary.
 */
export class TruePeakDetector {
  private readonly history = new Float64Array(TAPS);
  private position = 0;
  peak = 0;

  reset() { this.history.fill(0); this.position = 0; this.peak = 0; }

  /** Returns the largest absolute interpolated value within this block and updates the running peak. */
  process(samples: ArrayLike<number>, length = samples.length): number {
    let blockPeak = 0;
    const history = this.history;
    for (let index = 0; index < length; index += 1) {
      this.position = (this.position + TAPS - 1) % TAPS;
      history[this.position] = samples[index];
      for (let phase = 0; phase < 4; phase += 1) {
        const coefficients = TRUE_PEAK_PHASES[phase];
        let sum = 0;
        for (let tap = 0; tap < TAPS; tap += 1) sum += coefficients[tap] * history[(this.position + tap) % TAPS];
        const magnitude = Math.abs(sum);
        if (magnitude > blockPeak) blockPeak = magnitude;
      }
    }
    if (blockPeak > this.peak) this.peak = blockPeak;
    return blockPeak;
  }
}

// --- SECTION: gated loudness ---

export const ABSOLUTE_GATE_LUFS = -70;
const LOUDNESS_OFFSET = -0.691;
export const SILENCE_LUFS = -Infinity;

const toLufs = (power: number) => power > 0 ? LOUDNESS_OFFSET + 10 * Math.log10(power) : SILENCE_LUFS;
const fromLufs = (lufs: number) => 10 ** ((lufs - LOUDNESS_OFFSET) / 10);

/** BS.1770-5 Table 3 weights for L, R, C, Ls, Rs; mono and stereo use the first entries. */
export const CHANNEL_WEIGHTS = [1, 1, 1, 1.41, 1.41] as const;

/** Tech 3342 LRA from short-term loudness values (LUFS) sampled at ≥ 10 Hz. */
export function loudnessRangeFrom(shortTermLufs: readonly number[]): number {
  const absoluteGated = shortTermLufs.filter((value) => value >= ABSOLUTE_GATE_LUFS);
  if (!absoluteGated.length) return 0;
  const integrated = 10 * Math.log10(absoluteGated.reduce((sum, value) => sum + 10 ** (value / 10), 0) / absoluteGated.length);
  const relativeGated = absoluteGated.filter((value) => value >= integrated - 20).sort((a, b) => a - b);
  const n = relativeGated.length;
  if (!n) return 0;
  const low = relativeGated[Math.round((n - 1) * 10 / 100 + 1) - 1];
  const high = relativeGated[Math.round((n - 1) * 95 / 100 + 1) - 1];
  return high - low;
}

export interface LoudnessReading {
  momentary: number;
  shortTerm: number;
  integrated: number;
  loudnessRange: number;
  maxMomentary: number;
  maxShortTerm: number;
  /** Per-channel maximum true peak in dBTP. */
  truePeakDb: number[];
  /** Largest channel true peak in dBTP. */
  maxTruePeakDb: number;
  /** Per-channel maximum sample peak in dBFS. */
  samplePeakDb: number[];
  /** Seconds of audio measured since the last reset. */
  measuredSeconds: number;
}

const toDb = (linear: number) => linear > 0 ? 20 * Math.log10(linear) : -Infinity;

/** Sub-blocks per second. Windows slide on this 10 ms grid; gating blocks advance every 10 sub-blocks (100 ms). */
const SUB_BLOCKS_PER_SECOND = 100;
const MOMENTARY_SUB_BLOCKS = 40;
const SHORT_TERM_SUB_BLOCKS = 300;
const GATING_STEP_SUB_BLOCKS = 10;

/**
 * Streaming BS.1770-5 / EBU Mode meter.
 *
 * Audio is K-weighted and accumulated into 10 ms sub-blocks whose boundaries
 * fall on the nearest sample to each 10 ms instant, so any window of N
 * sub-blocks spans N·10 ms to the nearest sample. Momentary (40 sub-blocks)
 * and short-term (300) maxima are tracked on that 10 ms grid, which is fine
 * enough for the EBU Tech 3341 maximum-value cases 10 and 13. Integrated
 * loudness uses 400 ms gating blocks advanced every 100 ms (75 % overlap)
 * and re-gates all stored blocks on demand, so it stays exact at any length.
 */
export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad][];
  private readonly weights: number[];
  private readonly truePeaks: TruePeakDetector[];
  private readonly samplePeaks: number[];
  /** Channel-weighted energy (sum of squares) per sub-block. */
  private readonly subEnergy: number[] = [];
  private readonly subFrames: number[] = [];
  private readonly gatingBlocks: number[] = [];
  private readonly shortTermHistory: number[] = [];
  private accumulator: number[];
  private accumulated = 0;
  private frames = 0;
  private maxMomentaryPower = 0;
  private maxShortTermPower = 0;
  private scratch = new Float64Array(0);

  constructor(readonly sampleRate: number, readonly channelCount: number) {
    if (!(sampleRate > 0)) throw new RangeError('Sample rate must be positive.');
    if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > CHANNEL_WEIGHTS.length) {
      throw new RangeError(`The loudness meter supports 1 to ${CHANNEL_WEIGHTS.length} channels.`);
    }
    const [stage1, stage2] = kWeightingCoefficients(sampleRate);
    this.filters = Array.from({ length: channelCount }, () => [new Biquad(stage1), new Biquad(stage2)]);
    this.weights = Array.from({ length: channelCount }, (_, index) => CHANNEL_WEIGHTS[index]);
    this.truePeaks = Array.from({ length: channelCount }, () => new TruePeakDetector());
    this.samplePeaks = Array.from({ length: channelCount }, () => 0);
    this.accumulator = Array.from({ length: channelCount }, () => 0);
  }

  /** Frames in the sub-block currently being filled. */
  private currentSubBlockFrames(): number {
    const index = this.subEnergy.length;
    return Math.max(1, Math.round((index + 1) * this.sampleRate / SUB_BLOCKS_PER_SECOND) - Math.round(index * this.sampleRate / SUB_BLOCKS_PER_SECOND));
  }

  reset() {
    for (const [first, second] of this.filters) { first.reset(); second.reset(); }
    for (const detector of this.truePeaks) detector.reset();
    this.samplePeaks.fill(0);
    this.subEnergy.length = 0;
    this.subFrames.length = 0;
    this.gatingBlocks.length = 0;
    this.shortTermHistory.length = 0;
    this.accumulator = this.accumulator.map(() => 0);
    this.accumulated = 0;
    this.frames = 0;
    this.maxMomentaryPower = 0;
    this.maxShortTermPower = 0;
  }

  /** Feeds one block. Every channel array must hold at least `length` samples. */
  process(channels: readonly ArrayLike<number>[], length = channels[0]?.length ?? 0) {
    if (channels.length !== this.channelCount) throw new RangeError(`Expected ${this.channelCount} channels, received ${channels.length}.`);
    if (this.scratch.length < length) this.scratch = new Float64Array(length);
    const weighted = this.scratch;
    for (let channel = 0; channel < this.channelCount; channel += 1) {
      const input = channels[channel];
      let peak = this.samplePeaks[channel];
      for (let index = 0; index < length; index += 1) {
        const magnitude = Math.abs(input[index]);
        if (magnitude > peak) peak = magnitude;
      }
      this.samplePeaks[channel] = peak;
      this.truePeaks[channel].process(input, length);
    }
    let offset = 0;
    while (offset < length) {
      const target = this.currentSubBlockFrames();
      const take = Math.min(length - offset, target - this.accumulated);
      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const [first, second] = this.filters[channel];
        const input = channels[channel];
        for (let index = 0; index < take; index += 1) weighted[index] = input[offset + index];
        first.process(weighted, weighted, take);
        second.process(weighted, weighted, take);
        let sum = 0;
        for (let index = 0; index < take; index += 1) sum += weighted[index] * weighted[index];
        this.accumulator[channel] += sum;
      }
      this.accumulated += take;
      offset += take;
      if (this.accumulated === target) this.closeSubBlock(target);
    }
    this.frames += length;
  }

  private closeSubBlock(frames: number) {
    let energy = 0;
    for (let channel = 0; channel < this.channelCount; channel += 1) energy += this.weights[channel] * this.accumulator[channel];
    this.subEnergy.push(energy);
    this.subFrames.push(frames);
    this.accumulator = this.accumulator.map(() => 0);
    this.accumulated = 0;
    const count = this.subEnergy.length;
    if (count >= MOMENTARY_SUB_BLOCKS) {
      const momentary = this.windowPower(MOMENTARY_SUB_BLOCKS);
      if (momentary > this.maxMomentaryPower) this.maxMomentaryPower = momentary;
      if ((count - MOMENTARY_SUB_BLOCKS) % GATING_STEP_SUB_BLOCKS === 0) this.gatingBlocks.push(momentary);
    }
    if (count >= SHORT_TERM_SUB_BLOCKS) {
      const shortTerm = this.windowPower(SHORT_TERM_SUB_BLOCKS);
      if (shortTerm > this.maxShortTermPower) this.maxShortTermPower = shortTerm;
      if ((count - SHORT_TERM_SUB_BLOCKS) % GATING_STEP_SUB_BLOCKS === 0) this.shortTermHistory.push(toLufs(shortTerm));
    }
  }

  /** Mean channel-weighted power over the last `subBlockCount` sub-blocks. */
  private windowPower(subBlockCount: number): number {
    const count = this.subEnergy.length;
    if (count < subBlockCount) return 0;
    let energy = 0;
    let frames = 0;
    for (let index = count - subBlockCount; index < count; index += 1) { energy += this.subEnergy[index]; frames += this.subFrames[index]; }
    return frames ? energy / frames : 0;
  }

  /** Two-stage gated integrated loudness over every complete 400 ms block. */
  integrated(): number {
    const absolute = this.gatingBlocks.filter((power) => toLufs(power) > ABSOLUTE_GATE_LUFS);
    if (!absolute.length) return SILENCE_LUFS;
    const relativeThreshold = toLufs(absolute.reduce((sum, power) => sum + power, 0) / absolute.length) - 10;
    const relative = absolute.filter((power) => toLufs(power) > relativeThreshold);
    return relative.length ? toLufs(relative.reduce((sum, power) => sum + power, 0) / relative.length) : SILENCE_LUFS;
  }

  reading(): LoudnessReading {
    const truePeakDb = this.truePeaks.map((detector) => toDb(detector.peak));
    return {
      momentary: toLufs(this.windowPower(MOMENTARY_SUB_BLOCKS)),
      shortTerm: toLufs(this.windowPower(SHORT_TERM_SUB_BLOCKS)),
      integrated: this.integrated(),
      loudnessRange: loudnessRangeFrom(this.shortTermHistory),
      maxMomentary: toLufs(this.maxMomentaryPower),
      maxShortTerm: toLufs(this.maxShortTermPower),
      truePeakDb,
      maxTruePeakDb: Math.max(...truePeakDb),
      samplePeakDb: this.samplePeaks.map(toDb),
      measuredSeconds: this.frames / this.sampleRate,
    };
  }

  /** Short-term values recorded every 100 ms once 3 s are available (for LRA and loudness CSV export). */
  shortTermSeries(): readonly number[] { return this.shortTermHistory; }
}

/** Measures a whole buffer in one call; the offline path used by analysis and export reports. */
export function measureLoudness(channels: readonly Float32Array[], sampleRate: number): LoudnessReading {
  const meter = new LoudnessMeter(sampleRate, channels.length);
  const block = 8192;
  const length = channels[0]?.length ?? 0;
  for (let offset = 0; offset < length; offset += block) {
    const size = Math.min(block, length - offset);
    meter.process(channels.map((channel) => channel.subarray(offset, offset + size)), size);
  }
  return meter.reading();
}

export { fromLufs as lufsToPower, toLufs as powerToLufs };
