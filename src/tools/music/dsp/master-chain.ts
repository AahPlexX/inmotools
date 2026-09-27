/**
 * Mastering chain (ledgers 45–59, 72).
 *
 * One deterministic kernel runs both in the realtime AudioWorklet and in the
 * offline master render, so what you audition is what you export. Signal
 * order (fixed): input gain → EQ → expander → compressor → three-band
 * compressor → saturation → stereo width and bass mono → soft clipper →
 * true-peak limiter → output gain.
 *
 * The EQ works in mid/side: bands routed to "stereo" affect both mid and side
 * (equivalent to processing left and right identically), "mid" bands only the
 * mid, "side" bands only the side. In linear-phase mode static bands become
 * one FIR per mid/side path; dynamic bands need time-varying filters and
 * therefore stay minimum-phase in both modes.
 */
import { Biquad, biquadMagnitude, designBiquad, type BiquadCoefficients, type BiquadShape } from './biquad';
import { EnvelopeFollower, LinkwitzRiley4, ThreeBandSplitter, compressorGainDb, dbToGain, expanderGainDb, gainToDb, timeCoefficient } from './dynamics';
import { fftOfSize } from './fft';
import { TRUE_PEAK_PHASES } from './loudness';
import { Oversampler } from './oversample';

// --- SECTION: settings ---

export type EqShape = 'bell' | 'lowShelf' | 'highShelf' | 'highpass' | 'lowpass' | 'notch' | 'bandpass';
export type EqRouting = 'stereo' | 'mid' | 'side';

export interface DynamicBandSettings {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  /** Maximum gain change the dynamics may add (negative cuts, positive boosts). */
  rangeDb: number;
}

export interface EqBandSettings {
  enabled: boolean;
  shape: EqShape;
  frequency: number;
  gainDb: number;
  q: number;
  routing: EqRouting;
  solo: boolean;
  dynamic: DynamicBandSettings;
}

export interface CompressorSettings {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  kneeDb: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

export interface MultibandBandSettings {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

export interface MasterSettings {
  inputGainDb: number;
  eq: { enabled: boolean; mode: 'minimum' | 'linear'; bands: EqBandSettings[] };
  expander: { enabled: boolean; thresholdDb: number; ratio: number; rangeDb: number; attackMs: number; releaseMs: number };
  compressor: CompressorSettings;
  multiband: { enabled: boolean; lowCrossover: number; highCrossover: number; bands: MultibandBandSettings[] };
  saturation: { enabled: boolean; mode: 'tape' | 'tube'; driveDb: number; mix: number; outputDb: number };
  stereo: { width: number; bassMono: boolean; bassMonoHz: number };
  clipper: { enabled: boolean; ceilingDb: number; oversampling: 1 | 2 | 4 };
  limiter: { enabled: boolean; ceilingDb: number; lookaheadMs: number; releaseMs: number };
  outputGainDb: number;
}

export const EQ_BAND_COUNT = 10;
export const EQ_SHAPES: ReadonlyArray<{ value: EqShape; label: string; hasGain: boolean }> = [
  { value: 'bell', label: 'Bell', hasGain: true },
  { value: 'lowShelf', label: 'Low shelf', hasGain: true },
  { value: 'highShelf', label: 'High shelf', hasGain: true },
  { value: 'highpass', label: 'High-pass', hasGain: false },
  { value: 'lowpass', label: 'Low-pass', hasGain: false },
  { value: 'notch', label: 'Notch', hasGain: false },
  { value: 'bandpass', label: 'Band-pass', hasGain: false },
];
export const shapeHasGain = (shape: EqShape) => EQ_SHAPES.find((option) => option.value === shape)?.hasGain ?? false;

const DEFAULT_FREQUENCIES = [30, 80, 160, 315, 630, 1250, 2500, 5000, 10_000, 16_000];

export function defaultEqBand(index: number): EqBandSettings {
  return {
    enabled: false,
    shape: index === 0 ? 'highpass' : index === 1 ? 'lowShelf' : index === EQ_BAND_COUNT - 1 ? 'highShelf' : 'bell',
    frequency: DEFAULT_FREQUENCIES[index] ?? 1000,
    gainDb: 0,
    q: index === 0 ? Math.SQRT1_2 : 1,
    routing: 'stereo',
    solo: false,
    dynamic: { enabled: false, thresholdDb: -24, ratio: 3, attackMs: 5, releaseMs: 120, rangeDb: -6 },
  };
}

export function defaultMasterSettings(): MasterSettings {
  return {
    inputGainDb: 0,
    eq: { enabled: false, mode: 'minimum', bands: Array.from({ length: EQ_BAND_COUNT }, (_, index) => defaultEqBand(index)) },
    expander: { enabled: false, thresholdDb: -50, ratio: 2, rangeDb: 12, attackMs: 2, releaseMs: 150 },
    compressor: { enabled: false, thresholdDb: -18, ratio: 2, kneeDb: 6, attackMs: 20, releaseMs: 150, makeupDb: 0 },
    multiband: {
      enabled: false,
      lowCrossover: 200,
      highCrossover: 3000,
      bands: [0, 1, 2].map(() => ({ thresholdDb: -20, ratio: 2, attackMs: 15, releaseMs: 150, makeupDb: 0 })),
    },
    saturation: { enabled: false, mode: 'tape', driveDb: 6, mix: 0.5, outputDb: 0 },
    stereo: { width: 1, bassMono: false, bassMonoHz: 120 },
    clipper: { enabled: false, ceilingDb: -0.5, oversampling: 4 },
    limiter: { enabled: false, ceilingDb: -1, lookaheadMs: 1.5, releaseMs: 80 },
    outputGainDb: 0,
  };
}

const clampNumber = (value: unknown, low: number, high: number, fallback: number) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(high, Math.max(low, number));
};

/**
 * Returns settings with every field present and inside its supported range.
 * Used when settings arrive from the UI, the worklet port, or a restored
 * project, so the kernel never sees NaN or impossible values.
 */
export function normalizeMasterSettings(input: Partial<MasterSettings> | undefined): MasterSettings {
  const defaults = defaultMasterSettings();
  const source = (input ?? {}) as Partial<MasterSettings>;
  const eqSource = source.eq ?? defaults.eq;
  const bands = Array.from({ length: EQ_BAND_COUNT }, (_, index) => {
    const base = defaultEqBand(index);
    const band = { ...base, ...(eqSource.bands?.[index] ?? {}) };
    const dynamic = { ...base.dynamic, ...(band.dynamic ?? {}) };
    return {
      enabled: Boolean(band.enabled),
      shape: EQ_SHAPES.some((option) => option.value === band.shape) ? band.shape : base.shape,
      frequency: clampNumber(band.frequency, 10, 22_000, base.frequency),
      gainDb: clampNumber(band.gainDb, -24, 24, 0),
      q: clampNumber(band.q, 0.1, 40, base.q),
      routing: (['stereo', 'mid', 'side'] as const).includes(band.routing) ? band.routing : 'stereo',
      solo: Boolean(band.solo),
      dynamic: {
        enabled: Boolean(dynamic.enabled),
        thresholdDb: clampNumber(dynamic.thresholdDb, -80, 0, -24),
        ratio: clampNumber(dynamic.ratio, 1, 20, 3),
        attackMs: clampNumber(dynamic.attackMs, 0.1, 500, 5),
        releaseMs: clampNumber(dynamic.releaseMs, 5, 5000, 120),
        rangeDb: clampNumber(dynamic.rangeDb, -24, 24, -6),
      },
    } satisfies EqBandSettings;
  });
  const merge = <T extends object>(base: T, value: unknown): T => ({ ...base, ...(value && typeof value === 'object' ? value : {}) });
  const expander = merge(defaults.expander, source.expander);
  const compressor = merge(defaults.compressor, source.compressor);
  const multiband = merge(defaults.multiband, source.multiband);
  const saturation = merge(defaults.saturation, source.saturation);
  const stereo = merge(defaults.stereo, source.stereo);
  const clipper = merge(defaults.clipper, source.clipper);
  const limiter = merge(defaults.limiter, source.limiter);
  const lowCrossover = clampNumber(multiband.lowCrossover, 40, 2000, 200);
  return {
    inputGainDb: clampNumber(source.inputGainDb, -24, 24, 0),
    eq: { enabled: Boolean(eqSource.enabled), mode: eqSource.mode === 'linear' ? 'linear' : 'minimum', bands },
    expander: {
      enabled: Boolean(expander.enabled),
      thresholdDb: clampNumber(expander.thresholdDb, -90, 0, -50),
      ratio: clampNumber(expander.ratio, 1, 10, 2),
      rangeDb: clampNumber(expander.rangeDb, 1, 60, 12),
      attackMs: clampNumber(expander.attackMs, 0.1, 200, 2),
      releaseMs: clampNumber(expander.releaseMs, 5, 3000, 150),
    },
    compressor: {
      enabled: Boolean(compressor.enabled),
      thresholdDb: clampNumber(compressor.thresholdDb, -60, 0, -18),
      ratio: clampNumber(compressor.ratio, 1, 20, 2),
      kneeDb: clampNumber(compressor.kneeDb, 0, 24, 6),
      attackMs: clampNumber(compressor.attackMs, 0.1, 500, 20),
      releaseMs: clampNumber(compressor.releaseMs, 5, 5000, 150),
      makeupDb: clampNumber(compressor.makeupDb, -12, 24, 0),
    },
    multiband: {
      enabled: Boolean(multiband.enabled),
      lowCrossover,
      highCrossover: clampNumber(multiband.highCrossover, lowCrossover * 1.5, 16_000, Math.max(3000, lowCrossover * 1.5)),
      bands: [0, 1, 2].map((index) => {
        const band = merge(defaults.multiband.bands[index], multiband.bands?.[index]);
        return {
          thresholdDb: clampNumber(band.thresholdDb, -60, 0, -20),
          ratio: clampNumber(band.ratio, 1, 20, 2),
          attackMs: clampNumber(band.attackMs, 0.1, 500, 15),
          releaseMs: clampNumber(band.releaseMs, 5, 5000, 150),
          makeupDb: clampNumber(band.makeupDb, -12, 24, 0),
        };
      }),
    },
    saturation: {
      enabled: Boolean(saturation.enabled),
      mode: saturation.mode === 'tube' ? 'tube' : 'tape',
      driveDb: clampNumber(saturation.driveDb, 0, 36, 6),
      mix: clampNumber(saturation.mix, 0, 1, 0.5),
      outputDb: clampNumber(saturation.outputDb, -24, 12, 0),
    },
    stereo: {
      width: clampNumber(stereo.width, 0, 2, 1),
      bassMono: Boolean(stereo.bassMono),
      bassMonoHz: clampNumber(stereo.bassMonoHz, 20, 500, 120),
    },
    clipper: {
      enabled: Boolean(clipper.enabled),
      ceilingDb: clampNumber(clipper.ceilingDb, -24, 0, -0.5),
      oversampling: ([1, 2, 4] as const).includes(clipper.oversampling) ? clipper.oversampling : 4,
    },
    limiter: {
      enabled: Boolean(limiter.enabled),
      ceilingDb: clampNumber(limiter.ceilingDb, -24, 0, -1),
      lookaheadMs: clampNumber(limiter.lookaheadMs, 0.5, 10, 1.5),
      releaseMs: clampNumber(limiter.releaseMs, 1, 2000, 80),
    },
    outputGainDb: clampNumber(source.outputGainDb, -24, 24, 0),
  };
}

// --- SECTION: EQ design ---

const BIQUAD_SHAPE: Record<EqShape, BiquadShape> = {
  bell: 'peaking', lowShelf: 'lowShelf', highShelf: 'highShelf', highpass: 'highpass', lowpass: 'lowpass', notch: 'notch', bandpass: 'bandpass',
};

export function bandCoefficients(band: EqBandSettings, sampleRate: number, gainOffsetDb = 0): BiquadCoefficients {
  const coefficients = designBiquad(BIQUAD_SHAPE[band.shape], band.frequency, sampleRate, band.q, band.gainDb + gainOffsetDb);
  if (band.shape !== 'bandpass') return coefficients;
  // Cookbook band-pass has peak gain Q; normalize it to 0 dB so enabling it never jumps the level.
  const scale = 1 / Math.max(1e-9, biquadMagnitude(coefficients, band.frequency, sampleRate));
  return { ...coefficients, b0: coefficients.b0 * scale, b1: coefficients.b1 * scale, b2: coefficients.b2 * scale };
}

const routesTo = (band: EqBandSettings, path: 'mid' | 'side') => band.routing === 'stereo' || band.routing === path;

/** Summed static EQ response in dB at `frequency` for the mid or side path (for curve drawing). */
export function eqResponseDb(settings: MasterSettings, frequency: number, sampleRate: number, path: 'mid' | 'side' = 'mid'): number {
  if (!settings.eq.enabled) return 0;
  let total = 0;
  for (const band of settings.eq.bands) {
    if (!band.enabled || !routesTo(band, path)) continue;
    total += 20 * Math.log10(Math.max(1e-9, biquadMagnitude(bandCoefficients(band, sampleRate), frequency, sampleRate)));
  }
  return total;
}

/** Linear-phase FIR length (odd, so the delay is a whole number of frames). */
const FIR_LENGTH = 4095;
const FIR_BLOCK = 2048;
const FIR_FFT = 8192;

function designLinearPhaseFir(bands: EqBandSettings[], sampleRate: number): Float64Array | null {
  const active = bands.filter((band) => band.enabled);
  if (!active.length) return null;
  const size = FIR_FFT;
  const fft = fftOfSize(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let bin = 0; bin <= size / 2; bin += 1) {
    const frequency = bin * sampleRate / size;
    let magnitude = 1;
    for (const band of active) magnitude *= biquadMagnitude(bandCoefficients(band, sampleRate), Math.max(1e-3, frequency), sampleRate);
    re[bin] = magnitude;
    if (bin > 0 && bin < size / 2) re[size - bin] = magnitude;
  }
  fft.transform(re, im, true);
  const half = (FIR_LENGTH - 1) / 2;
  const taps = new Float64Array(FIR_LENGTH);
  for (let n = 0; n < FIR_LENGTH; n += 1) {
    const index = (n - half + size) % size;
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * (n + 0.5) / FIR_LENGTH);
    taps[n] = re[index] * window;
  }
  return taps;
}

/** Streaming FFT convolution with constant latency FIR_BLOCK + (FIR_LENGTH − 1) / 2. */
class FirConvolver {
  private readonly spectrumRe = new Float64Array(FIR_FFT);
  private readonly spectrumIm = new Float64Array(FIR_FFT);
  private readonly input = new Float64Array(FIR_BLOCK);
  private readonly overlap = new Float64Array(FIR_FFT);
  private readonly queue = new Float64Array(FIR_BLOCK);
  private readonly re = new Float64Array(FIR_FFT);
  private readonly im = new Float64Array(FIR_FFT);
  private filled = 0;

  constructor(taps: Float64Array | null) { this.setTaps(taps); }

  static readonly latency = FIR_BLOCK + (FIR_LENGTH - 1) / 2;

  setTaps(taps: Float64Array | null) {
    this.spectrumRe.fill(0);
    this.spectrumIm.fill(0);
    if (!taps) { this.spectrumRe[(FIR_LENGTH - 1) / 2] = 1; }
    else this.spectrumRe.set(taps);
    fftOfSize(FIR_FFT).transform(this.spectrumRe, this.spectrumIm);
  }

  reset() { this.input.fill(0); this.overlap.fill(0); this.queue.fill(0); this.filled = 0; }

  processSample(value: number): number {
    const output = this.queue[this.filled];
    this.input[this.filled] = value;
    this.filled += 1;
    if (this.filled === FIR_BLOCK) this.flushBlock();
    return output;
  }

  private flushBlock() {
    const { re, im } = this;
    re.fill(0); im.fill(0);
    re.set(this.input);
    const fft = fftOfSize(FIR_FFT);
    fft.transform(re, im);
    for (let bin = 0; bin < FIR_FFT; bin += 1) {
      const r = re[bin] * this.spectrumRe[bin] - im[bin] * this.spectrumIm[bin];
      const i = re[bin] * this.spectrumIm[bin] + im[bin] * this.spectrumRe[bin];
      re[bin] = r; im[bin] = i;
    }
    fft.transform(re, im, true);
    for (let n = 0; n < FIR_FFT; n += 1) this.overlap[n] += re[n];
    this.queue.set(this.overlap.subarray(0, FIR_BLOCK));
    this.overlap.copyWithin(0, FIR_BLOCK);
    this.overlap.fill(0, FIR_FFT - FIR_BLOCK);
    this.filled = 0;
  }
}

// --- SECTION: stages ---

interface DynamicBandState {
  sidechain: Biquad;
  follower: EnvelopeFollower;
  filter: Biquad;
  gainOffset: number;
}

/** Minimum-phase EQ for one mid/side path, including dynamic bands. */
class MinimumPhasePath {
  private sections: Biquad[] = [];
  private dynamics: Array<{ band: EqBandSettings; state: DynamicBandState } | null> = [];
  private counter = 0;

  configure(bands: EqBandSettings[], path: 'mid' | 'side', sampleRate: number, previous?: MinimumPhasePath) {
    const active = bands.filter((band) => band.enabled && routesTo(band, path));
    // Keep filter state when only parameters change so adjustments don't click.
    this.sections = active.map((band, index) => {
      const section = previous?.sections[index] ?? new Biquad();
      section.coefficients = bandCoefficients(band, sampleRate);
      return section;
    });
    this.dynamics = active.map((band, index) => {
      if (!band.dynamic.enabled || !shapeHasGain(band.shape)) return null;
      const old = previous?.dynamics[index]?.state;
      const state: DynamicBandState = old ?? {
        sidechain: new Biquad(),
        follower: new EnvelopeFollower(sampleRate, band.dynamic.attackMs / 1000, band.dynamic.releaseMs / 1000),
        filter: this.sections[index],
        gainOffset: 0,
      };
      state.sidechain.coefficients = designBiquad('bandpass', band.frequency, sampleRate, Math.max(0.3, band.q));
      state.follower.setTimes(sampleRate, band.dynamic.attackMs / 1000, band.dynamic.releaseMs / 1000);
      state.filter = this.sections[index];
      return { band, state };
    });
  }

  reset() { for (const section of this.sections) section.reset(); for (const item of this.dynamics) item?.state.sidechain.reset(); }

  process(value: number, sampleRate: number): number {
    const updateCoefficients = (this.counter = (this.counter + 1) % 16) === 0;
    for (const item of this.dynamics) {
      if (!item) continue;
      const { band, state } = item;
      const level = gainToDb(state.follower.next(Math.abs(state.sidechain.processSample(value))));
      const reduction = Math.max(-Math.abs(band.dynamic.rangeDb), compressorGainDb(level, band.dynamic.thresholdDb, band.dynamic.ratio, 6));
      // A negative range cuts when loud (dynamic cut); a positive range boosts by the same amount.
      state.gainOffset = band.dynamic.rangeDb >= 0 ? -reduction : reduction;
      if (updateCoefficients) state.filter.coefficients = bandCoefficients(band, sampleRate, state.gainOffset);
    }
    let output = value;
    for (const section of this.sections) output = section.processSample(output);
    return output;
  }
}

class LinkedCompressor {
  private gainDb = 0;
  private attack = 0;
  private release = 0;
  constructor(private readonly sampleRate: number) {}
  configure(attackMs: number, releaseMs: number) {
    this.attack = timeCoefficient(attackMs / 1000, this.sampleRate);
    this.release = timeCoefficient(releaseMs / 1000, this.sampleRate);
  }
  reset() { this.gainDb = 0; }
  /** Smoothed gain (dB) for a detector level (dB) and a static curve. */
  next(targetDb: number): number {
    const coefficient = targetDb < this.gainDb ? this.attack : this.release;
    this.gainDb = targetDb + coefficient * (this.gainDb - targetDb);
    return this.gainDb;
  }
  get currentDb() { return this.gainDb; }
}

const tapeShape = (drive: number) => (x: number) => Math.tanh(drive * x) / drive;
/**
 * Tube: a biased tanh is asymmetric, which adds even harmonics. Subtracting
 * tanh(bias) keeps zero in → zero out, and dividing by the slope at zero keeps
 * small signals at unity gain. The DC the asymmetry creates on loud material
 * is removed after the stage.
 */
const TUBE_BIAS = 0.3;
const tubeShape = (drive: number) => {
  const offset = Math.tanh(TUBE_BIAS);
  const slope = drive * (1 - offset * offset);
  return (x: number) => (Math.tanh(drive * x + TUBE_BIAS) - offset) / slope;
};

/** One-pole DC blocker (≈5 Hz corner) used after asymmetric saturation. */
class DcBlocker {
  private previousInput = 0;
  private previousOutput = 0;
  private readonly pole: number;
  constructor(sampleRate: number) { this.pole = 1 - 2 * Math.PI * 5 / sampleRate; }
  reset() { this.previousInput = 0; this.previousOutput = 0; }
  next(value: number): number {
    const output = value - this.previousInput + this.pole * this.previousOutput;
    this.previousInput = value;
    this.previousOutput = output;
    return output;
  }
}

/** Soft clipper: linear below 80 % of the ceiling, then a tanh knee that never exceeds the ceiling. */
export function softClip(value: number, ceiling: number): number {
  const knee = ceiling * 0.8;
  const magnitude = Math.abs(value);
  if (magnitude <= knee) return value;
  return Math.sign(value) * (knee + (ceiling - knee) * Math.tanh((magnitude - knee) / (ceiling - knee)));
}

class DelayLine {
  private readonly buffer: Float64Array;
  private position = 0;
  constructor(readonly length: number) { this.buffer = new Float64Array(Math.max(1, length + 1)); }
  reset() { this.buffer.fill(0); this.position = 0; }
  next(value: number): number {
    if (this.length === 0) return value;
    this.buffer[this.position] = value;
    this.position = (this.position + 1) % this.buffer.length;
    return this.buffer[this.position];
  }
}

/**
 * Brickwall limiter with oversampled true-peak detection (ledger 55).
 *
 * Detection uses the BS.1770-5 Annex 2 interpolator (4× oversampling), so the
 * gain follows inter-sample peaks. The required gain is min-filtered over the
 * lookahead window and then box-averaged over the same length; with the audio
 * delayed to match, the applied gain is never above what the upcoming peak
 * needs, and the ramp down is smooth. Release is a one-pole recovery.
 */
class TruePeakLimiter {
  readonly lookahead: number;
  private readonly histories: Float64Array[];
  private historyPosition = 0;
  private readonly required: Float64Array;
  private requiredPosition = 0;
  private readonly box: Float64Array;
  private boxPosition = 0;
  private boxSum: number;
  private readonly delays: DelayLine[];
  private gain = 1;
  private release = 0;
  private ceiling = 1;
  reductionDb = 0;

  /** Frames of interpolator delay (the Annex 2 filter peaks between taps 5 and 6). */
  static readonly DETECTION_DELAY = 6;

  constructor(private readonly sampleRate: number, channels: number, lookaheadMs: number) {
    this.lookahead = Math.max(1, Math.round(lookaheadMs / 1000 * sampleRate));
    this.histories = Array.from({ length: channels }, () => new Float64Array(12));
    this.required = new Float64Array(this.lookahead + TruePeakLimiter.DETECTION_DELAY + 1).fill(1);
    this.box = new Float64Array(this.lookahead).fill(1);
    this.boxSum = this.lookahead;
    this.delays = Array.from({ length: channels }, () => new DelayLine(this.lookahead + TruePeakLimiter.DETECTION_DELAY));
  }

  get latency() { return this.lookahead + TruePeakLimiter.DETECTION_DELAY; }

  configure(ceilingDb: number, releaseMs: number) {
    this.ceiling = dbToGain(ceilingDb);
    this.release = timeCoefficient(releaseMs / 1000, this.sampleRate);
  }

  reset() {
    for (const history of this.histories) history.fill(0);
    this.required.fill(1);
    this.box.fill(1);
    this.boxSum = this.lookahead;
    for (const delay of this.delays) delay.reset();
    this.gain = 1;
    this.reductionDb = 0;
  }

  processFrame(frame: Float64Array) {
    this.historyPosition = (this.historyPosition + 11) % 12;
    let peak = 0;
    for (let channel = 0; channel < frame.length; channel += 1) {
      const history = this.histories[channel];
      history[this.historyPosition] = frame[channel];
      peak = Math.max(peak, Math.abs(frame[channel]));
      for (let phase = 0; phase < 4; phase += 1) {
        const coefficients = TRUE_PEAK_PHASES[phase];
        let sum = 0;
        for (let tap = 0; tap < 12; tap += 1) sum += coefficients[tap] * history[(this.historyPosition + tap) % 12];
        peak = Math.max(peak, Math.abs(sum));
      }
    }
    this.required[this.requiredPosition] = peak > this.ceiling ? this.ceiling / peak : 1;
    this.requiredPosition = (this.requiredPosition + 1) % this.required.length;
    let minimum = 1;
    for (let index = 0; index < this.required.length; index += 1) if (this.required[index] < minimum) minimum = this.required[index];
    this.boxSum += minimum - this.box[this.boxPosition];
    this.box[this.boxPosition] = minimum;
    this.boxPosition = (this.boxPosition + 1) % this.box.length;
    const smoothed = Math.min(minimum, this.boxSum / this.box.length);
    this.gain = smoothed < this.gain ? smoothed : smoothed + this.release * (this.gain - smoothed);
    this.reductionDb = gainToDb(this.gain);
    for (let channel = 0; channel < frame.length; channel += 1) frame[channel] = this.delays[channel].next(frame[channel]) * this.gain;
  }
}

// --- SECTION: chain ---

export interface ChainTelemetry {
  compressorReductionDb: number;
  multibandReductionDb: [number, number, number];
  expanderReductionDb: number;
  limiterReductionDb: number;
}

/**
 * Stateful stereo master chain. Always processes two channels; mono material
 * is fed as identical left/right and stays identical (side is zero).
 */
export class MasterChain {
  private settings: MasterSettings = defaultMasterSettings();
  private midPath = new MinimumPhasePath();
  private sidePath = new MinimumPhasePath();
  private readonly midFir = new FirConvolver(null);
  private readonly sideFir = new FirConvolver(null);
  private soloFilters: Array<{ mid: Biquad | null; side: Biquad | null }> = [];
  private readonly expander: LinkedCompressor;
  private readonly expanderFollower: EnvelopeFollower;
  private readonly compressor: LinkedCompressor;
  private readonly multibandSplitters: [ThreeBandSplitter, ThreeBandSplitter];
  private readonly multibandComps: LinkedCompressor[];
  private readonly saturators: [Oversampler, Oversampler];
  private readonly saturationDry: [DelayLine, DelayLine];
  private readonly dcBlockers: [DcBlocker, DcBlocker];
  private clippers: [Oversampler, Oversampler];
  private bassCrossovers: [LinkwitzRiley4, LinkwitzRiley4];
  private limiter: TruePeakLimiter;
  private readonly frame = new Float64Array(2);
  private readonly scratch = { l: new Float64Array(0), r: new Float64Array(0) };
  telemetry: ChainTelemetry = { compressorReductionDb: 0, multibandReductionDb: [0, 0, 0], expanderReductionDb: 0, limiterReductionDb: 0 };

  constructor(readonly sampleRate: number, settings?: Partial<MasterSettings>) {
    this.expander = new LinkedCompressor(sampleRate);
    this.expanderFollower = new EnvelopeFollower(sampleRate, 0.002, 0.05);
    this.compressor = new LinkedCompressor(sampleRate);
    this.multibandSplitters = [new ThreeBandSplitter(200, 3000, sampleRate), new ThreeBandSplitter(200, 3000, sampleRate)];
    this.multibandComps = [0, 1, 2].map(() => new LinkedCompressor(sampleRate));
    this.saturators = [new Oversampler(2), new Oversampler(2)];
    this.saturationDry = [new DelayLine(this.saturators[0].latency), new DelayLine(this.saturators[1].latency)];
    this.dcBlockers = [new DcBlocker(sampleRate), new DcBlocker(sampleRate)];
    const defaults = defaultMasterSettings();
    this.clippers = [new Oversampler(defaults.clipper.oversampling), new Oversampler(defaults.clipper.oversampling)];
    this.bassCrossovers = [new LinkwitzRiley4(defaults.stereo.bassMonoHz, sampleRate), new LinkwitzRiley4(defaults.stereo.bassMonoHz, sampleRate)];
    this.limiter = new TruePeakLimiter(sampleRate, 2, 1.5);
    this.update(settings ?? defaultMasterSettings());
  }

  get currentSettings(): MasterSettings { return this.settings; }

  /**
   * Total delay of the processed path in frames. Constant for a given
   * structure (EQ mode, clipper oversampling, limiter lookahead), so the dry
   * path can be delayed by the same amount for A/B and delta listening.
   */
  get latency(): number {
    const eq = this.settings.eq.enabled && this.settings.eq.mode === 'linear' ? FirConvolver.latency : 0;
    const saturation = this.settings.saturation.enabled ? this.saturators[0].latency : 0;
    const clipper = this.settings.clipper.enabled ? this.clippers[0].latency : 0;
    const limiter = this.settings.limiter.enabled ? this.limiter.latency : 0;
    return eq + saturation + clipper + limiter;
  }

  /** Applies new settings; filter and envelope state is kept where the structure did not change. */
  update(input: Partial<MasterSettings>) {
    const next = normalizeMasterSettings(input as MasterSettings);
    const previous = this.settings;
    this.settings = next;
    const rate = this.sampleRate;
    const bands = next.eq.bands;
    const mid = new MinimumPhasePath();
    const side = new MinimumPhasePath();
    mid.configure(next.eq.mode === 'minimum' ? bands : bands.filter((band) => band.dynamic.enabled && shapeHasGain(band.shape)), 'mid', rate, this.midPath);
    side.configure(next.eq.mode === 'minimum' ? bands : bands.filter((band) => band.dynamic.enabled && shapeHasGain(band.shape)), 'side', rate, this.sidePath);
    this.midPath = mid;
    this.sidePath = side;
    if (next.eq.mode === 'linear') {
      const staticBands = bands.filter((band) => !(band.dynamic.enabled && shapeHasGain(band.shape)));
      this.midFir.setTaps(designLinearPhaseFir(staticBands.filter((band) => routesTo(band, 'mid')), rate));
      this.sideFir.setTaps(designLinearPhaseFir(staticBands.filter((band) => routesTo(band, 'side')), rate));
      if (previous.eq.mode !== 'linear') { this.midFir.reset(); this.sideFir.reset(); }
    }
    this.soloFilters = bands.filter((band) => band.enabled && band.solo).map((band) => {
      const coefficients = designBiquad('bandpass', band.frequency, rate, Math.max(0.3, band.q));
      const normalized = { ...coefficients, b0: coefficients.b0 / Math.max(1e-9, biquadMagnitude(coefficients, band.frequency, rate)), b2: coefficients.b2 / Math.max(1e-9, biquadMagnitude(coefficients, band.frequency, rate)) };
      return { mid: routesTo(band, 'mid') ? new Biquad(normalized) : null, side: routesTo(band, 'side') ? new Biquad(normalized) : null };
    });
    this.expander.configure(next.expander.attackMs, next.expander.releaseMs);
    this.compressor.configure(next.compressor.attackMs, next.compressor.releaseMs);
    if (previous.multiband.lowCrossover !== next.multiband.lowCrossover || previous.multiband.highCrossover !== next.multiband.highCrossover) {
      this.multibandSplitters[0] = new ThreeBandSplitter(next.multiband.lowCrossover, next.multiband.highCrossover, rate);
      this.multibandSplitters[1] = new ThreeBandSplitter(next.multiband.lowCrossover, next.multiband.highCrossover, rate);
    }
    next.multiband.bands.forEach((band, index) => this.multibandComps[index].configure(band.attackMs, band.releaseMs));
    if (previous.clipper.oversampling !== next.clipper.oversampling) {
      this.clippers = [new Oversampler(next.clipper.oversampling), new Oversampler(next.clipper.oversampling)];
    }
    if (previous.stereo.bassMonoHz !== next.stereo.bassMonoHz) {
      this.bassCrossovers = [new LinkwitzRiley4(next.stereo.bassMonoHz, rate), new LinkwitzRiley4(next.stereo.bassMonoHz, rate)];
    }
    if (previous.limiter.lookaheadMs !== next.limiter.lookaheadMs) this.limiter = new TruePeakLimiter(rate, 2, next.limiter.lookaheadMs);
    this.limiter.configure(next.limiter.ceilingDb, next.limiter.releaseMs);
  }

  reset() {
    this.midPath.reset(); this.sidePath.reset(); this.midFir.reset(); this.sideFir.reset();
    for (const solo of this.soloFilters) { solo.mid?.reset(); solo.side?.reset(); }
    this.expander.reset(); this.expanderFollower.reset(); this.compressor.reset();
    for (const splitter of this.multibandSplitters) splitter.reset();
    for (const comp of this.multibandComps) comp.reset();
    for (const oversampler of [...this.saturators, ...this.clippers]) oversampler.reset();
    for (const delay of this.saturationDry) delay.reset();
    for (const blocker of this.dcBlockers) blocker.reset();
    for (const crossover of this.bassCrossovers) crossover.reset();
    this.limiter.reset();
  }

  /** Processes one stereo block in place. */
  process(left: Float32Array | Float64Array, right: Float32Array | Float64Array, length = left.length) {
    const s = this.settings;
    const rate = this.sampleRate;
    const inputGain = dbToGain(s.inputGainDb);
    const outputGain = dbToGain(s.outputGainDb);
    const eqOn = s.eq.enabled;
    const linear = s.eq.mode === 'linear';
    const soloing = eqOn && this.soloFilters.length > 0;
    let expanderMin = 0, compressorMin = 0;
    const multibandMin: [number, number, number] = [0, 0, 0];
    for (let n = 0; n < length; n += 1) {
      let l = left[n] * inputGain;
      let r = right[n] * inputGain;

      // EQ in mid/side.
      if (eqOn) {
        let m = (l + r) / 2;
        let side = (l - r) / 2;
        if (soloing) {
          let soloMid = 0, soloSide = 0;
          for (const solo of this.soloFilters) {
            if (solo.mid) soloMid += solo.mid.processSample(m);
            if (solo.side) soloSide += solo.side.processSample(side);
          }
          m = soloMid; side = soloSide;
        } else {
          if (linear) { m = this.midFir.processSample(m); side = this.sideFir.processSample(side); }
          m = this.midPath.process(m, rate);
          side = this.sidePath.process(side, rate);
        }
        l = m + side; r = m - side;
      }

      // Expander (linked, power detector).
      if (s.expander.enabled) {
        const level = 10 * Math.log10(this.expanderFollower.next(Math.max(l * l, r * r)) + 1e-20);
        const gainDb = this.expander.next(expanderGainDb(level, s.expander.thresholdDb, s.expander.ratio, s.expander.rangeDb, 6));
        const gain = dbToGain(gainDb);
        l *= gain; r *= gain;
        expanderMin = Math.min(expanderMin, gainDb);
      }

      // Broadband compressor (linked peak detector, smoothed in dB).
      if (s.compressor.enabled) {
        const level = gainToDb(Math.max(Math.abs(l), Math.abs(r)));
        const gainDb = this.compressor.next(compressorGainDb(level, s.compressor.thresholdDb, s.compressor.ratio, s.compressor.kneeDb));
        const gain = dbToGain(gainDb + s.compressor.makeupDb);
        l *= gain; r *= gain;
        compressorMin = Math.min(compressorMin, gainDb);
      }

      // Three-band compressor.
      if (s.multiband.enabled) {
        const bandsL = this.multibandSplitters[0].split(l);
        const bandsR = this.multibandSplitters[1].split(r);
        l = 0; r = 0;
        for (let band = 0; band < 3; band += 1) {
          const settings = s.multiband.bands[band];
          const level = gainToDb(Math.max(Math.abs(bandsL[band]), Math.abs(bandsR[band])));
          const gainDb = this.multibandComps[band].next(compressorGainDb(level, settings.thresholdDb, settings.ratio, 6));
          const gain = dbToGain(gainDb + settings.makeupDb);
          l += bandsL[band] * gain; r += bandsR[band] * gain;
          multibandMin[band] = Math.min(multibandMin[band], gainDb);
        }
      }
      left[n] = l; right[n] = r;
    }

    // Saturation (2× oversampled, dry path delayed to match).
    if (s.saturation.enabled) {
      const drive = dbToGain(s.saturation.driveDb);
      const shape = s.saturation.mode === 'tube' ? tubeShape(drive) : tapeShape(drive);
      const trim = dbToGain(s.saturation.outputDb);
      this.ensureScratch(length);
      for (const [index, channel] of [left, right].entries()) {
        const wet = index === 0 ? this.scratch.l : this.scratch.r;
        this.saturators[index].process(channel, wet, length, shape);
        for (let n = 0; n < length; n += 1) {
          const dry = this.saturationDry[index].next(channel[n]);
          const mixed = dry * (1 - s.saturation.mix) + wet[n] * s.saturation.mix;
          channel[n] = (s.saturation.mode === 'tube' ? this.dcBlockers[index].next(mixed) : mixed) * trim;
        }
      }
    }

    // Stereo width and bass mono in mid/side.
    const width = s.stereo.width;
    if (width !== 1 || s.stereo.bassMono) {
      for (let n = 0; n < length; n += 1) {
        let m = (left[n] + right[n]) / 2;
        let side = (left[n] - right[n]) / 2 * width;
        if (s.stereo.bassMono) {
          // Side below the cutoff is removed; mid passes the matching all-pass so both stay phase-aligned.
          m = this.bassCrossovers[0].allPass(m);
          side = this.bassCrossovers[1].split(side)[1];
        }
        left[n] = m + side; right[n] = m - side;
      }
    }

    // Soft clipper (oversampled).
    if (s.clipper.enabled) {
      const ceiling = dbToGain(s.clipper.ceilingDb);
      const shape = (value: number) => softClip(value, ceiling);
      this.clippers[0].process(left, left, length, shape);
      this.clippers[1].process(right, right, length, shape);
    }

    // True-peak limiter and output gain.
    let limiterMin = 0;
    for (let n = 0; n < length; n += 1) {
      if (s.limiter.enabled) {
        this.frame[0] = left[n]; this.frame[1] = right[n];
        this.limiter.processFrame(this.frame);
        left[n] = this.frame[0]; right[n] = this.frame[1];
        limiterMin = Math.min(limiterMin, this.limiter.reductionDb);
      }
      left[n] *= outputGain; right[n] *= outputGain;
    }
    this.telemetry = { compressorReductionDb: compressorMin, multibandReductionDb: multibandMin, expanderReductionDb: expanderMin, limiterReductionDb: limiterMin };
  }

  private ensureScratch(length: number) {
    if (this.scratch.l.length < length) { this.scratch.l = new Float64Array(length); this.scratch.r = new Float64Array(length); }
  }
}

/**
 * Offline master render (ledger 72): runs the chain over a whole mix, feeds
 * `latency` frames of silence to flush it, and drops the first `latency`
 * output frames, so the result lines up sample-for-sample with the input.
 */
export function renderMaster(channels: readonly Float32Array[], sampleRate: number, settings: MasterSettings): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const chain = new MasterChain(sampleRate, settings);
  const latency = chain.latency;
  const left = new Float32Array(length + latency);
  const right = new Float32Array(length + latency);
  left.set(channels[0]);
  right.set(channels[1] ?? channels[0]);
  const block = 4096;
  for (let offset = 0; offset < left.length; offset += block) {
    const size = Math.min(block, left.length - offset);
    chain.process(left.subarray(offset, offset + size), right.subarray(offset, offset + size), size);
  }
  const outLeft = left.slice(latency);
  const outRight = right.slice(latency);
  return channels.length === 1 ? [Float32Array.from(outLeft, (value, index) => (value + outRight[index]) / 2)] : [outLeft, outRight];
}

