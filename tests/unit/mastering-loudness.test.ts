import { describe, expect, it } from 'vitest';
import { biquadMagnitude, designBiquad } from '../../src/tools/music/dsp/biquad';
import {
  BS1770_STAGE1_48K,
  BS1770_STAGE2_48K,
  LoudnessMeter,
  kWeightingCoefficients,
  loudnessRangeFrom,
  measureLoudness,
} from '../../src/tools/music/dsp/loudness';
import { resamplePcm } from '../../src/tools/music/dsp/resample';

const RATE = 48_000;
const dbToAmp = (db: number) => 10 ** (db / 20);

/** Concatenated 1 kHz sine segments at per-channel peak levels (dBFS); `null` means silence. */
function tones(segments: Array<[seconds: number, levelDb: number | null]>, channels = 2, rate = RATE, frequency = 1000): Float32Array[] {
  const total = segments.reduce((sum, [seconds]) => sum + Math.round(seconds * rate), 0);
  const signal = new Float32Array(total);
  let offset = 0;
  for (const [seconds, level] of segments) {
    const frames = Math.round(seconds * rate);
    if (level !== null) {
      const amplitude = dbToAmp(level);
      for (let n = 0; n < frames; n += 1) signal[offset + n] = amplitude * Math.sin(2 * Math.PI * frequency * (offset + n) / rate);
    }
    offset += frames;
  }
  return Array.from({ length: channels }, () => signal.slice());
}

describe('K-weighting', () => {
  it('reproduces the BS.1770-5 48 kHz tables exactly', () => {
    const [stage1, stage2] = kWeightingCoefficients(48_000);
    for (const key of ['b0', 'b1', 'b2', 'a1', 'a2'] as const) {
      expect(stage1[key]).toBeCloseTo(BS1770_STAGE1_48K[key], 10);
      expect(stage2[key]).toBeCloseTo(BS1770_STAGE2_48K[key], 10);
    }
  });

  it('keeps the 48 kHz response at other rates and reads a 0 dBFS 997 Hz sine at -3.01 LKFS', () => {
    const [reference1, reference2] = kWeightingCoefficients(48_000);
    for (const rate of [44_100, 96_000]) {
      const [stage1, stage2] = kWeightingCoefficients(rate);
      for (const frequency of [20, 100, 997, 4000, 15_000]) {
        const at = 20 * Math.log10(biquadMagnitude(stage1, frequency, rate) * biquadMagnitude(stage2, frequency, rate));
        const ref = 20 * Math.log10(biquadMagnitude(reference1, frequency, 48_000) * biquadMagnitude(reference2, frequency, 48_000));
        expect(Math.abs(at - ref), `${frequency} Hz at ${rate}`).toBeLessThan(frequency > 10_000 ? 0.25 : 0.02);
      }
    }
    for (const rate of [44_100, 48_000, 96_000]) {
      const signal = tones([[10, 0]], 1, rate, 997);
      expect(measureLoudness(signal, rate).integrated).toBeCloseTo(-3.01, 1);
    }
  });
});

describe('EBU Tech 3341 minimum requirements', () => {
  const within = (value: number, expected: number, tolerance = 0.1) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(tolerance);

  it('cases 1 and 2: steady tones read identically on M, S, and I', () => {
    for (const [level, expected] of [[-23, -23], [-33, -33]] as const) {
      const reading = measureLoudness(tones([[20, level]]), RATE);
      within(reading.momentary, expected);
      within(reading.shortTerm, expected);
      within(reading.integrated, expected);
    }
  });

  it('cases 3, 4, and 5: relative and absolute gating', () => {
    within(measureLoudness(tones([[10, -36], [60, -23], [10, -36]]), RATE).integrated, -23);
    within(measureLoudness(tones([[10, -72], [10, -36], [60, -23], [10, -36], [10, -72]]), RATE).integrated, -23);
    within(measureLoudness(tones([[20, -26], [20.1, -20], [20, -26]]), RATE).integrated, -23);
  });

  it('case 6: 5.0 channel weighting', () => {
    const [left] = tones([[20, -28]], 1);
    const [centre] = tones([[20, -24]], 1);
    const [surround] = tones([[20, -30]], 1);
    within(measureLoudness([left, left.slice(), centre, surround, surround.slice()], RATE).integrated, -23);
  });

  it('case 9: short-term is constant after 3 s', () => {
    const segments: Array<[number, number]> = [];
    for (let repeat = 0; repeat < 5; repeat += 1) segments.push([1.34, -20], [1.66, -30]);
    const [left, right] = tones(segments);
    const meter = new LoudnessMeter(RATE, 2);
    const step = RATE / 10;
    for (let offset = 0; offset < left.length; offset += step) {
      meter.process([left.subarray(offset, offset + step), right.subarray(offset, offset + step)]);
      if (offset + step >= 3 * RATE) within(meter.reading().shortTerm, -23);
    }
  });

  it('cases 10 and 13: maximum short-term and momentary per segment', () => {
    for (const i of [0, 7, 19]) {
      within(measureLoudness(tones([[i * 0.15, null], [3, -23], [1, null]]), RATE).maxShortTerm, -23);
      within(measureLoudness(tones([[i * 0.02, null], [0.4, -23], [1, null]]), RATE).maxMomentary, -23);
    }
  });

  it('case 12: momentary is constant after 1 s', () => {
    const segments: Array<[number, number]> = [];
    for (let repeat = 0; repeat < 25; repeat += 1) segments.push([0.18, -20], [0.22, -30]);
    const [left, right] = tones(segments);
    const meter = new LoudnessMeter(RATE, 2);
    const step = RATE / 10;
    for (let offset = 0; offset < left.length; offset += step) {
      meter.process([left.subarray(offset, offset + step), right.subarray(offset, offset + step)]);
      // Momentary windows start on 100 ms boundaries; each 400 ms window holds one full 0.18 + 0.22 s cycle.
      if (offset + step >= RATE) within(meter.reading().momentary, -23);
    }
  });

  describe('true peak cases 15-23', () => {
    const truePeakOf = (samples: Float32Array) => measureLoudness([samples, samples.slice()], RATE).maxTruePeakDb;
    const accept = (value: number, expected: number) => {
      expect(value).toBeLessThanOrEqual(expected + 0.2);
      expect(value).toBeGreaterThanOrEqual(expected - 0.4);
    };
    const taperedSine = (frequency: number, amplitude: number, phaseDegrees: number, seconds = 1) => {
      const frames = seconds * RATE;
      const fade = 0.01 * RATE;
      return Float32Array.from({ length: frames }, (_, n) => {
        const envelope = Math.min(1, n / fade, (frames - 1 - n) / fade);
        return envelope * amplitude * Math.sin(2 * Math.PI * frequency * n / RATE + phaseDegrees * Math.PI / 180);
      });
    };

    it('cases 15-19: sines at fs/4, fs/6, fs/8 with phase offsets', () => {
      accept(truePeakOf(taperedSine(RATE / 4, 0.5, 0)), -6);
      accept(truePeakOf(taperedSine(RATE / 4, 0.5, 45)), -6);
      accept(truePeakOf(taperedSine(RATE / 6, 0.5, 60)), -6);
      accept(truePeakOf(taperedSine(RATE / 8, 0.5, 67.5)), -6);
      accept(truePeakOf(taperedSine(RATE / 4, 1.41, 45)), 3);
    });

    it('cases 20-23: a single fs/4 period inside an fs/6 tone, downsampled from 4·fs at each offset', () => {
      const highRate = RATE * 4;
      const frames = highRate;
      const burstStart = Math.round(frames / 2);
      const burstLength = 16;
      const synth = new Float32Array(frames);
      const fade = Math.round(0.01 * highRate);
      // The fs/6 tone is phase-continuous on both sides of the single fs/4 period (amplitude 1.0).
      let phase = 0;
      for (let n = 0; n < frames; n += 1) {
        const inBurst = n >= burstStart && n < burstStart + burstLength;
        const frequency = inBurst ? RATE / 4 : RATE / 6;
        const amplitude = inBurst ? 1 : 0.5;
        const envelope = Math.min(1, n / fade, (frames - 1 - n) / fade);
        synth[n] = envelope * amplitude * Math.sin(phase);
        phase += 2 * Math.PI * frequency / highRate;
      }
      for (let offset = 0; offset < 4; offset += 1) {
        // Dropping `offset` samples at 4·fs, then band-limited decimation, is the 0-3 sample offset of the case definition.
        const down = resamplePcm({ sampleRate: highRate, channels: [synth.subarray(offset)] }, RATE).channels[0];
        accept(truePeakOf(down), 0);
      }
    });
  });
});

describe('EBU Tech 3342 loudness range', () => {
  const accept = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(1);
  it('cases 1-4', () => {
    accept(measureLoudness(tones([[20, -20], [20, -30]]), RATE).loudnessRange, 10);
    accept(measureLoudness(tones([[20, -20], [20, -15]]), RATE).loudnessRange, 5);
    accept(measureLoudness(tones([[20, -40], [20, -20]]), RATE).loudnessRange, 20);
    accept(measureLoudness(tones([[20, -50], [20, -35], [20, -20], [20, -35], [20, -50]]), RATE).loudnessRange, 15);
  });

  it('follows the reference percentile rule', () => {
    expect(loudnessRangeFrom([])).toBe(0);
    expect(loudnessRangeFrom([-80, -80])).toBe(0);
    expect(loudnessRangeFrom(Array.from({ length: 101 }, (_, index) => -30 + index * 0.1))).toBeCloseTo(8.5, 6);
  });
});

describe('cookbook biquads', () => {
  it('have the documented gain at the design frequency', () => {
    const peak = designBiquad('peaking', 1000, RATE, 1, 6);
    expect(20 * Math.log10(biquadMagnitude(peak, 1000, RATE))).toBeCloseTo(6, 6);
    const shelf = designBiquad('lowShelf', 200, RATE, Math.SQRT1_2, -4);
    expect(20 * Math.log10(biquadMagnitude(shelf, 10, RATE))).toBeCloseTo(-4, 1);
    const high = designBiquad('highpass', 100, RATE, Math.SQRT1_2);
    expect(20 * Math.log10(biquadMagnitude(high, 100, RATE))).toBeCloseTo(-3.01, 1);
    expect(biquadMagnitude(designBiquad('notch', 60, RATE, 30), 60, RATE)).toBeLessThan(1e-6);
    expect(() => designBiquad('lowpass', 100, 0, 1)).toThrow(RangeError);
  });
});
