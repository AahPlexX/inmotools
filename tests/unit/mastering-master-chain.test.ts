import { describe, expect, it } from 'vitest';
import { measureLoudness } from '../../src/tools/music/dsp/loudness';
import { MasterChain, defaultMasterSettings, eqResponseDb, normalizeMasterSettings, renderMaster, softClip, type MasterSettings } from '../../src/tools/music/dsp/master-chain';
import { seededRandom } from '../../src/tools/music/dsp/processors';

const RATE = 48_000;
const tone = (frequency: number, seconds: number, amplitude = 0.5, phase = 0) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, n) => amplitude * Math.sin(2 * Math.PI * frequency * n / RATE + phase));
const level = (samples: Float32Array, frequency: number, from = Math.floor(samples.length / 2), to = samples.length) => {
  let s = 0, c = 0;
  for (let n = from; n < to; n += 1) { s += samples[n] * Math.sin(2 * Math.PI * frequency * n / RATE); c += samples[n] * Math.cos(2 * Math.PI * frequency * n / RATE); }
  return 2 * Math.hypot(s, c) / (to - from);
};
const db = (ratio: number) => 20 * Math.log10(ratio);
const settingsWith = (patch: (settings: MasterSettings) => void) => { const settings = defaultMasterSettings(); patch(settings); return settings; };
const render = (settings: MasterSettings, left: Float32Array, right = left) => renderMaster([left, right.slice()], RATE, settings);

describe('master chain structure', () => {
  it('is bit-transparent with default settings and aligned after rendering', () => {
    const input = tone(440, 0.2);
    const [left, right] = render(defaultMasterSettings(), input);
    expect(Array.from(left)).toEqual(Array.from(input));
    expect(Array.from(right)).toEqual(Array.from(input));
    expect(new MasterChain(RATE).latency).toBe(0);
  });

  it('sanitizes impossible settings', () => {
    const settings = normalizeMasterSettings({ inputGainDb: Number.NaN, limiter: { enabled: true, ceilingDb: 5, lookaheadMs: 99, releaseMs: -1 } } as unknown as MasterSettings);
    expect(settings.inputGainDb).toBe(0);
    expect(settings.limiter).toEqual({ enabled: true, ceilingDb: 0, lookaheadMs: 10, releaseMs: 1 });
    expect(settings.eq.bands).toHaveLength(10);
  });
});

describe('EQ', () => {
  const bell = (mode: 'minimum' | 'linear', routing: 'stereo' | 'mid' | 'side' = 'stereo') => settingsWith((settings) => {
    settings.eq.enabled = true;
    settings.eq.mode = mode;
    Object.assign(settings.eq.bands[5], { enabled: true, shape: 'bell', frequency: 1000, gainDb: 6, q: 1, routing });
  });

  it('boosts by the set gain in minimum- and linear-phase modes, and linear phase stays time-aligned', () => {
    for (const mode of ['minimum', 'linear'] as const) {
      const input = tone(1000, 0.5, 0.25);
      const [output] = render(bell(mode), input);
      expect(db(level(output, 1000) / 0.25), mode).toBeCloseTo(6, 1);
      expect(Math.abs(db(level(render(bell(mode), tone(100, 0.5, 0.25))[0], 100) / 0.25)), mode).toBeLessThan(0.3);
    }
    const input = tone(1000, 0.5, 0.25);
    const [linear] = render(bell('linear'), input);
    let worst = 0;
    for (let n = 12_000; n < 20_000; n += 1) worst = Math.max(worst, Math.abs(linear[n] - input[n] * 10 ** (6 / 20)));
    expect(worst).toBeLessThan(0.01);
    expect(eqResponseDb(bell('minimum'), 1000, RATE)).toBeCloseTo(6, 6);
  });

  it('routes bands to mid or side only', () => {
    const left = tone(1000, 0.4, 0.3);
    const right = new Float32Array(left.length);
    const [outL, outR] = render(bell('minimum', 'side'), left, right);
    const mid = outL.map((value, n) => (value + outR[n]) / 2);
    const side = outL.map((value, n) => (value - outR[n]) / 2);
    expect(db(level(mid, 1000) / 0.15)).toBeCloseTo(0, 1);
    expect(db(level(side, 1000) / 0.15)).toBeCloseTo(6, 1);
  });

  it('cuts a dynamic band only when the band is loud', () => {
    const dynamic = settingsWith((settings) => {
      settings.eq.enabled = true;
      Object.assign(settings.eq.bands[5], { enabled: true, shape: 'bell', frequency: 2000, gainDb: 0, q: 1, dynamic: { enabled: true, thresholdDb: -30, ratio: 10, attackMs: 1, releaseMs: 50, rangeDb: -9 } });
    });
    expect(db(level(render(dynamic, tone(2000, 0.6, 0.5))[0], 2000) / 0.5)).toBeLessThan(-6);
    expect(Math.abs(db(level(render(dynamic, tone(2000, 0.6, 0.005))[0], 2000) / 0.005))).toBeLessThan(0.5);
  });

  it('auditions only the soloed band', () => {
    const solo = settingsWith((settings) => {
      settings.eq.enabled = true;
      Object.assign(settings.eq.bands[5], { enabled: true, shape: 'bell', frequency: 3000, gainDb: 0, q: 2, solo: true });
    });
    const input = tone(3000, 0.5, 0.2).map((value, n) => value + 0.2 * Math.sin(2 * Math.PI * 100 * n / RATE));
    const [output] = render(solo, input);
    expect(db(level(output, 3000) / 0.2)).toBeCloseTo(0, 0);
    expect(db(level(output, 100) / 0.2)).toBeLessThan(-25);
  });
});

describe('dynamics and colour', () => {
  it('compresses above threshold with the configured ratio and makeup', () => {
    const settings = settingsWith((s) => { Object.assign(s.compressor, { enabled: true, thresholdDb: -20, ratio: 4, kneeDb: 0, attackMs: 1, releaseMs: 200, makeupDb: 2 }); });
    const amplitude = 10 ** (-10 / 20);
    const [output] = render(settings, tone(200, 1, amplitude));
    // Peak detection: 10 dB over, 3/4 of it removed, plus 2 dB makeup; release ripple keeps it within ~1 dB.
    expect(db(level(output, 200) / amplitude)).toBeGreaterThan(-6.5);
    expect(db(level(output, 200) / amplitude)).toBeLessThan(-4.5);
  });

  it('compresses one band of the three-band compressor independently', () => {
    const settings = settingsWith((s) => {
      s.multiband.enabled = true;
      s.multiband.bands[0] = { thresholdDb: -30, ratio: 10, attackMs: 1, releaseMs: 100, makeupDb: 0 };
      s.multiband.bands[1] = { thresholdDb: 0, ratio: 1, attackMs: 1, releaseMs: 100, makeupDb: 0 };
      s.multiband.bands[2] = { thresholdDb: 0, ratio: 1, attackMs: 1, releaseMs: 100, makeupDb: 0 };
    });
    const input = tone(60, 1, 0.3).map((value, n) => value + 0.3 * Math.sin(2 * Math.PI * 1000 * n / RATE));
    const [output] = render(settings, input);
    expect(db(level(output, 60) / 0.3)).toBeLessThan(-12);
    expect(Math.abs(db(level(output, 1000) / 0.3))).toBeLessThan(0.5);
  });

  it('expands quiet material downward', () => {
    const settings = settingsWith((s) => { Object.assign(s.expander, { enabled: true, thresholdDb: -40, ratio: 4, rangeDb: 30, attackMs: 1, releaseMs: 50 }); });
    expect(db(level(render(settings, tone(500, 0.6, 0.003))[0], 500) / 0.003)).toBeLessThan(-20);
    expect(Math.abs(db(level(render(settings, tone(500, 0.6, 0.3))[0], 500) / 0.3))).toBeLessThan(0.2);
  });

  it('saturates with unity small-signal gain and adds harmonics when driven', () => {
    const tape = settingsWith((s) => { Object.assign(s.saturation, { enabled: true, mode: 'tape', driveDb: 18, mix: 1, outputDb: 0 }); });
    expect(Math.abs(db(level(render(tape, tone(300, 0.5, 0.001))[0], 300) / 0.001))).toBeLessThan(0.3);
    const driven = render(tape, tone(300, 0.5, 0.5))[0];
    expect(level(driven, 900) / level(driven, 300)).toBeGreaterThan(0.05);
    const tube = settingsWith((s) => { Object.assign(s.saturation, { enabled: true, mode: 'tube', driveDb: 18, mix: 1, outputDb: 0 }); });
    const even = render(tube, tone(300, 0.5, 0.5))[0];
    expect(level(even, 600) / level(even, 300)).toBeGreaterThan(0.01);
  });

  it('controls width and folds bass to mono', () => {
    const left = tone(1000, 0.4, 0.3);
    const right = tone(1000, 0.4, 0.1);
    const [monoL, monoR] = render(settingsWith((s) => { s.stereo.width = 0; }), left, right);
    for (let n = 0; n < monoL.length; n += 50) expect(monoL[n]).toBeCloseTo(monoR[n], 6);
    const bass = settingsWith((s) => { s.stereo.bassMono = true; s.stereo.bassMonoHz = 150; });
    const [bassL, bassR] = render(bass, tone(50, 1, 0.3), new Float32Array(RATE));
    const side = bassL.map((value, n) => (value - bassR[n]) / 2);
    expect(db(level(side, 50) / 0.15)).toBeLessThan(-20);
    const [highL, highR] = render(bass, tone(2000, 1, 0.3), new Float32Array(RATE));
    const highSide = highL.map((value, n) => (value - highR[n]) / 2);
    expect(Math.abs(db(level(highSide, 2000) / 0.15))).toBeLessThan(0.2);
  });
});

describe('peak control', () => {
  it('soft-clips below the ceiling', () => {
    expect(softClip(0.5, 1)).toBe(0.5);
    expect(softClip(10, 1)).toBeLessThanOrEqual(1);
    expect(softClip(0.95, 1)).toBeLessThan(0.95);
    const settings = settingsWith((s) => { Object.assign(s.clipper, { enabled: true, ceilingDb: -3, oversampling: 4 }); });
    const [output] = render(settings, tone(200, 0.5, 1.5));
    expect(db(Math.max(...Array.from(output, Math.abs)))).toBeLessThan(-2.8);
  });

  it('holds true peak at the limiter ceiling on hot, dense material', () => {
    const random = seededRandom(3);
    const hot = Float32Array.from({ length: RATE * 3 }, (_, n) => 1.4 * Math.sin(2 * Math.PI * 11_900 * n / RATE + 0.7) * (0.6 + 0.4 * Math.sin(n / 3000)) + (random() - 0.5) * 0.8);
    const settings = settingsWith((s) => { Object.assign(s.limiter, { enabled: true, ceilingDb: -1, lookaheadMs: 1.5, releaseMs: 60 }); });
    const [left, right] = render(settings, hot);
    expect(left).toHaveLength(hot.length);
    const reading = measureLoudness([left, right], RATE);
    expect(reading.maxTruePeakDb).toBeLessThanOrEqual(-1 + 0.2);
    const quiet = tone(440, 0.5, 0.1);
    expect(Array.from(render(settings, quiet)[0].subarray(1000, 2000))).toEqual(Array.from(quiet.subarray(1000, 2000)));
  });
});

describe('spectrum analysis and resonance finder', () => {
  it('calibrates a full-scale bin-centred sine to 0 dB and finds a resonance in noise', async () => {
    const { averageSpectrum, findResonances } = await import('../../src/tools/music/dsp/analysis');
    const binHz = RATE / 8192;
    const sine = tone(binHz * 200, 1, 1);
    const spectrum = averageSpectrum([sine], RATE, 0, sine.length);
    expect(spectrum.db[200]).toBeCloseTo(0, 1);

    const random = seededRandom(12);
    const noisy = Float32Array.from({ length: RATE * 2 }, (_, n) => (random() - 0.5) * 0.3 + 0.05 * Math.sin(2 * Math.PI * 1234 * n / RATE));
    const resonances = findResonances(averageSpectrum([noisy], RATE, 0, noisy.length));
    expect(resonances.length).toBeGreaterThan(0);
    expect(Math.abs(resonances[0].frequency - 1234)).toBeLessThan(binHz);
    expect(resonances[0].suggestedGainDb).toBeLessThan(0);
  });
});
