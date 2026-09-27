import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../src/tools/music/dsp/processors';
import { burgCoefficients, declick, declip, decrackle, deess, dehum, deplosive, detectImpulses, hissGate, interpolateArGap, repairBurst } from '../../src/tools/music/dsp/restoration';
import { denoise, noiseProfile, spectralAttenuate, spectralHeal } from '../../src/tools/music/dsp/spectral';
import type { PcmAudio } from '../../src/tools/music/mastering-engine';

const RATE = 48_000;
const tone = (frequency: number, seconds: number, amplitude = 0.5) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, n) => amplitude * Math.sin(2 * Math.PI * frequency * n / RATE));
const mono = (channel: Float32Array): PcmAudio => ({ sampleRate: RATE, channels: [channel] });
const rms = (samples: ArrayLike<number>, from = 0, to = samples.length) => {
  let sum = 0;
  for (let n = from; n < to; n += 1) sum += samples[n] * samples[n];
  return Math.sqrt(sum / Math.max(1, to - from));
};
const db = (ratio: number) => 20 * Math.log10(ratio);
/** Level of one frequency by correlating with sine and cosine over a range. */
const toneLevel = (samples: Float32Array, frequency: number, from: number, to: number) => {
  let s = 0, c = 0;
  for (let n = from; n < to; n += 1) { s += samples[n] * Math.sin(2 * Math.PI * frequency * n / RATE); c += samples[n] * Math.cos(2 * Math.PI * frequency * n / RATE); }
  return 2 * Math.hypot(s, c) / (to - from);
};

describe('AR modelling and gap repair', () => {
  it('recovers a known AR(2) process and rebuilds a gap in a tone', () => {
    const random = seededRandom(4);
    const series = [0, 0];
    for (let n = 2; n < 20_000; n += 1) series.push(1.6 * series[n - 1] - 0.8 * series[n - 2] + (random() - 0.5) * 0.01);
    const a = burgCoefficients(series, 2);
    expect(a[1]).toBeCloseTo(-1.6, 1);
    expect(a[2]).toBeCloseTo(0.8, 1);

    const clean = tone(440, 0.2);
    const damaged = clean.slice();
    for (let n = 4000; n < 4064; n += 1) damaged[n] = 0.9;
    interpolateArGap(damaged, 4000, 64);
    let worst = 0;
    for (let n = 4000; n < 4064; n += 1) worst = Math.max(worst, Math.abs(damaged[n] - clean[n]));
    expect(worst).toBeLessThan(0.01);
  });
});

describe('impulsive noise', () => {
  const withClicks = () => {
    const clean = Float32Array.from({ length: RATE }, (_, n) => 0.3 * Math.sin(2 * Math.PI * 330 * n / RATE) + 0.2 * Math.sin(2 * Math.PI * 1250 * n / RATE));
    const damaged = clean.slice();
    for (const at of [5000, 17_000, 30_011, 41_234]) { damaged[at] += 0.7; damaged[at + 1] -= 0.5; }
    return { clean, damaged };
  };

  it('finds no clicks in clean music and repairs injected ones', () => {
    const { clean, damaged } = withClicks();
    expect(detectImpulses(clean, 12, 48)).toEqual([]);
    const { audio, repaired } = declick(mono(damaged), 60, 2);
    expect(repaired).toBeGreaterThanOrEqual(4);
    let worst = 0;
    for (let n = 0; n < clean.length; n += 1) worst = Math.max(worst, Math.abs(audio.channels[0][n] - clean[n]));
    expect(worst).toBeLessThan(0.03);
  });

  it('attenuates crackle toward the local median', () => {
    const { clean, damaged } = withClicks();
    const output = decrackle(mono(damaged), 1).channels[0];
    const before = Math.abs(damaged[5000] - clean[5000]);
    expect(Math.abs(output[5000] - clean[5000])).toBeLessThan(before / 2);
  });

  it('rebuilds a user-selected burst and refuses spans over 200 ms', () => {
    const clean = tone(500, 0.5, 0.4);
    const damaged = clean.slice();
    const random = seededRandom(9);
    for (let n = 12_000; n < 12_240; n += 1) damaged[n] = (random() - 0.5) * 1.6;
    const repaired = repairBurst(mono(damaged), 12_000 / RATE, 12_240 / RATE).channels[0];
    expect(rms(repaired.map((value, n) => value - clean[n]), 12_000, 12_240)).toBeLessThan(0.02);
    expect(() => repairBurst(mono(damaged), 0, 0.3)).toThrow(/200 ms/);
  });

  it('reconstructs clipped peaks above the clip level', () => {
    const clean = tone(200, 0.2, 1.2);
    const clipped = clean.map((value) => Math.max(-0.9, Math.min(0.9, value)));
    const { audio, repaired } = declip(mono(clipped), 99, 5);
    expect(repaired).toBeGreaterThan(10);
    const peak = Math.max(...audio.channels[0].map(Math.abs));
    expect(peak).toBeGreaterThan(1);
    expect(rms(audio.channels[0].map((value, n) => value - clean[n]))).toBeLessThan(rms(clipped.map((value, n) => value - clean[n])) / 2);
  });
});

describe('filters and dynamics repair', () => {
  it('removes mains hum and harmonics while keeping programme', () => {
    const input = Float32Array.from({ length: RATE * 2 }, (_, n) => 0.2 * Math.sin(2 * Math.PI * 60 * n / RATE) + 0.1 * Math.sin(2 * Math.PI * 180 * n / RATE) + 0.3 * Math.sin(2 * Math.PI * 1000 * n / RATE));
    const output = dehum(mono(input), 60, 4).channels[0];
    const from = RATE, to = RATE * 2;
    expect(db(toneLevel(output, 60, from, to) / 0.2)).toBeLessThan(-30);
    expect(db(toneLevel(output, 180, from, to) / 0.1)).toBeLessThan(-30);
    expect(Math.abs(db(toneLevel(output, 1000, from, to) / 0.3))).toBeLessThan(0.3);
  });

  it('ducks a low-frequency pop but not steady bass', () => {
    const input = Float32Array.from({ length: RATE * 2 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 80 * n / RATE));
    for (let n = RATE; n < RATE + 1200; n += 1) input[n] += 0.8 * Math.sin(2 * Math.PI * 50 * (n - RATE) / RATE) * Math.sin(Math.PI * (n - RATE) / 1200);
    const output = deplosive(mono(input), 150, 6, 18).channels[0];
    expect(rms(output, RATE + 200, RATE + 1000)).toBeLessThan(rms(input, RATE + 200, RATE + 1000) * 0.6);
    expect(Math.abs(db(rms(output, RATE / 2, RATE - 2000) / rms(input, RATE / 2, RATE - 2000)))).toBeLessThan(0.5);
  });

  it('de-esses a loud sibilant band and leaves low content alone', () => {
    const input = Float32Array.from({ length: RATE }, (_, n) => 0.4 * Math.sin(2 * Math.PI * 7000 * n / RATE) + 0.3 * Math.sin(2 * Math.PI * 300 * n / RATE));
    const output = deess(mono(input), 7000, -30, 10).channels[0];
    expect(db(toneLevel(output, 7000, RATE / 2, RATE) / 0.4)).toBeLessThan(-6);
    expect(Math.abs(db(toneLevel(output, 300, RATE / 2, RATE) / 0.3))).toBeLessThan(0.5);
  });

  it('gates quiet hiss per band while loud tones pass', () => {
    const random = seededRandom(2);
    const input = Float32Array.from({ length: RATE * 2 }, (_, n) => (random() - 0.5) * 0.002 + (n >= RATE ? 0.4 * Math.sin(2 * Math.PI * 1000 * n / RATE) : 0));
    const output = hissGate(mono(input), 2000, 8000, [{ thresholdDb: -50, releaseMs: 80 }, { thresholdDb: -50, releaseMs: 80 }, { thresholdDb: -50, releaseMs: 80 }], 24).channels[0];
    expect(db(rms(output, RATE / 4, RATE - 100) / rms(input, RATE / 4, RATE - 100))).toBeLessThan(-12);
    expect(Math.abs(db(toneLevel(output, 1000, RATE * 1.5, RATE * 2) / 0.4))).toBeLessThan(0.5);
  });
});

describe('spectral repair', () => {
  it('reduces broadband noise from a fingerprint while keeping the tone', () => {
    const random = seededRandom(5);
    const noise = () => (random() - 0.5) * 0.1;
    const input = Float32Array.from({ length: RATE * 3 }, (_, n) => noise() + (n >= RATE ? 0.3 * Math.sin(2 * Math.PI * 1000 * n / RATE) : 0));
    expect(() => noiseProfile(input, RATE, 0, 0.01)).toThrow(/at least/);
    const output = denoise(mono(input), 0.1, 0.9, 30, 0.5).channels[0];
    expect(db(rms(output, RATE / 4, RATE - 4000) / rms(input, RATE / 4, RATE - 4000))).toBeLessThan(-15);
    expect(Math.abs(db(toneLevel(output, 1000, RATE * 1.5, RATE * 2.5) / 0.3))).toBeLessThan(1.5);
  });

  it('attenuates only the painted time/frequency region', () => {
    const input = Float32Array.from({ length: RATE * 2 }, (_, n) => 0.3 * Math.sin(2 * Math.PI * 3000 * n / RATE) + 0.3 * Math.sin(2 * Math.PI * 500 * n / RATE));
    const output = spectralAttenuate(mono(input), [{ startSeconds: 0.5, endSeconds: 1.5, lowHz: 2500, highHz: 3500 }], 24).channels[0];
    expect(db(toneLevel(output, 3000, RATE * 0.8, RATE * 1.2) / 0.3)).toBeLessThan(-20);
    expect(Math.abs(db(toneLevel(output, 500, RATE * 0.8, RATE * 1.2) / 0.3))).toBeLessThan(0.3);
    expect(Math.abs(db(toneLevel(output, 3000, RATE * 1.7, RATE * 1.9) / 0.3))).toBeLessThan(0.3);
  });

  it('heals a noise burst toward its surroundings', () => {
    const random = seededRandom(8);
    const input = tone(800, 2, 0.3);
    for (let n = RATE; n < RATE + 2400; n += 1) input[n] += (random() - 0.5) * 0.8;
    const output = spectralHeal(mono(input), { startSeconds: 1, endSeconds: 1.05, lowHz: 0, highHz: RATE / 2 }).channels[0];
    const clean = tone(800, 2, 0.3);
    const before = rms(input.map((value, n) => value - clean[n]), RATE, RATE + 2400);
    const after = rms(output.map((value, n) => value - clean[n]), RATE, RATE + 2400);
    expect(after).toBeLessThan(before / 3);
  });
});

describe('restoration edits in the document', () => {
  it('splices a processed range back with short crossfades and maps ranges into the clip', async () => {
    const { processInRange } = await import('../../src/tools/music/mastering-engine');
    const input = mono(Float32Array.from({ length: 4800 }, () => 1));
    const spliced = processInRange(input, { startSeconds: 0.02, endSeconds: 0.08 }, (audio) => ({ ...audio, channels: audio.channels.map((channel) => channel.map(() => 0)) })).channels[0];
    expect(spliced[100]).toBe(1);
    expect(spliced[2400]).toBe(0);
    expect(spliced[960]).toBeGreaterThan(0.9);
    expect(spliced[960 + 240]).toBeLessThan(0.05);

    const { addSourceTracksRevision, appendAudioEditRevision, createMasteringDocument, moveClipRevision } = await import('../../src/tools/music/mastering-project');
    const reference = { id: 's', name: 's', sampleRate: RATE, channelCount: 1, frameCount: RATE * 4, fileSize: 1, lastModified: 0, codec: 'pcm' };
    const document = moveClipRevision(addSourceTracksRevision(createMasteringDocument(), [{ source: reference, trackId: 't', clipId: 'c' }]), 'c', 1);
    const denoised = appendAudioEditRevision(document, { type: 'denoise', noiseStartSeconds: 1.5, noiseEndSeconds: 2, reductionDb: 12, smoothing: 0.5, range: { startSeconds: 2, endSeconds: 9 } });
    expect(denoised.tracks[0].clips[0].edits[0]).toEqual({ type: 'denoise', noiseStartSeconds: 0.5, noiseEndSeconds: 1, reductionDb: 12, smoothing: 0.5, range: { startSeconds: 1, endSeconds: 4 } });
    const healed = appendAudioEditRevision(document, { type: 'spectralHeal', region: { startSeconds: 1.25, endSeconds: 1.5, lowHz: 100, highHz: 200 } });
    expect(healed.tracks[0].clips[0].edits[0]).toEqual({ type: 'spectralHeal', region: { startSeconds: 0.25, endSeconds: 0.5, lowHz: 100, highHz: 200 } });
    expect(appendAudioEditRevision(document, { type: 'dehum', fundamental: 60, harmonics: 4, range: { startSeconds: 0, endSeconds: 0.5 } }).tracks[0].clips[0].edits).toEqual([]);
    const burst = appendAudioEditRevision(document, { type: 'repairBurst', startSeconds: 2, endSeconds: 2.01 });
    expect(burst.tracks[0].clips[0].edits[0]).toEqual({ type: 'repairBurst', startSeconds: 1, endSeconds: 1.01 });
  });
});
