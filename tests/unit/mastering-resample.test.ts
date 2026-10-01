import { describe, expect, it } from 'vitest';
import { resamplePcm, resampledLength } from '../../src/tools/music/dsp/resample';

const sine = (frequency: number, rate: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, n) => amplitude * Math.sin(2 * Math.PI * frequency * n / rate));

describe('windowed-sinc resampler', () => {
  it('converts 44.1 kHz to 48 kHz with a band-limited result that matches the analytic tone', () => {
    const converted = resamplePcm({ sampleRate: 44_100, channels: [sine(1000, 44_100, 0.25)] }, 48_000);
    expect(converted.sampleRate).toBe(48_000);
    expect(converted.channels[0]).toHaveLength(resampledLength(11_025, 44_100, 48_000));
    const reference = sine(1000, 48_000, 0.25);
    let worst = 0;
    for (let n = 2000; n < 10_000; n += 1) worst = Math.max(worst, Math.abs(converted.channels[0][n] - reference[n]));
    expect(worst).toBeLessThan(2e-4);
  });

  it('removes content above the new Nyquist frequency when downsampling', () => {
    const converted = resamplePcm({ sampleRate: 48_000, channels: [sine(20_000, 48_000, 0.25)] }, 22_050);
    let peak = 0;
    for (let n = 500; n < converted.channels[0].length - 500; n += 1) peak = Math.max(peak, Math.abs(converted.channels[0][n]));
    expect(20 * Math.log10(peak / 0.5)).toBeLessThan(-80);
  });

  it('copies unchanged rates and rejects invalid rates', () => {
    const input = Float32Array.from([0.1, 0.2]);
    const same = resamplePcm({ sampleRate: 48_000, channels: [input] }, 48_000);
    expect(Array.from(same.channels[0])).toEqual(Array.from(input));
    expect(same.channels[0]).not.toBe(input);
    expect(() => resamplePcm({ sampleRate: 0, channels: [input] }, 48_000)).toThrow(RangeError);
  });
});
