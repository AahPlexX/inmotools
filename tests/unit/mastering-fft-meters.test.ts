import { describe, expect, it } from 'vitest';
import { FFT, magnitudeSpectrum, stftProcess } from '../../src/tools/music/dsp/fft';
import { CorrelationMeter, LevelMeter, goniometerPoints } from '../../src/tools/music/dsp/meters';

describe('FFT and STFT', () => {
  it('matches a direct DFT and inverts exactly', () => {
    const size = 16;
    const input = Array.from({ length: size }, (_, n) => Math.sin(n * 0.7) + 0.3 * Math.cos(n * 2.1));
    const re = Float64Array.from(input);
    const im = new Float64Array(size);
    new FFT(size).transform(re, im);
    for (let k = 0; k < size; k += 1) {
      let dr = 0, di = 0;
      for (let n = 0; n < size; n += 1) { dr += input[n] * Math.cos(-2 * Math.PI * k * n / size); di += input[n] * Math.sin(-2 * Math.PI * k * n / size); }
      expect(re[k]).toBeCloseTo(dr, 9);
      expect(im[k]).toBeCloseTo(di, 9);
    }
    new FFT(size).transform(re, im, true);
    input.forEach((value, n) => expect(re[n]).toBeCloseTo(value, 12));
    expect(() => new FFT(12)).toThrow(RangeError);
  });

  it('reconstructs a signal through an unmodified STFT', () => {
    const input = Float32Array.from({ length: 5000 }, (_, n) => Math.sin(n * 0.05) * 0.5 + (n % 97 === 0 ? 0.4 : 0));
    const output = stftProcess(input, 512, () => undefined);
    let worst = 0;
    for (let n = 0; n < input.length; n += 1) worst = Math.max(worst, Math.abs(output[n] - input[n]));
    expect(worst).toBeLessThan(1e-5);
  });

  it('puts a bin-centred tone in its bin', () => {
    const size = 1024;
    const signal = Float32Array.from({ length: size }, (_, n) => Math.sin(2 * Math.PI * 64 * n / size));
    const magnitudes = magnitudeSpectrum(signal, 0, size);
    const peakBin = magnitudes.reduce((best, value, bin) => value > magnitudes[best] ? bin : best, 0);
    expect(peakBin).toBe(64);
  });
});

describe('level and stereo meters', () => {
  it('reports peak, RMS, and crest factor for a sine', () => {
    const meter = new LevelMeter(48_000, 1);
    const sine = Float32Array.from({ length: 48_000 }, (_, n) => 0.5 * Math.sin(2 * Math.PI * 1000 * n / 48_000));
    meter.process([sine]);
    const reading = meter.reading();
    expect(reading.peakDb[0]).toBeCloseTo(20 * Math.log10(0.5), 2);
    expect(reading.rmsDb[0]).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 2);
    expect(reading.crestDb[0]).toBeCloseTo(3.01, 1);
    expect(reading.programCrestDb[0]).toBeCloseTo(3.01, 1);
    meter.reset();
    expect(meter.reading().peakDb[0]).toBe(-Infinity);
  });

  it('reads +1 for mono, -1 for inverted, and draws mono vertically', () => {
    const signal = Float32Array.from({ length: 4800 }, (_, n) => Math.sin(n / 7));
    const meter = new CorrelationMeter(48_000, 0.05);
    meter.process(signal, signal);
    expect(meter.value()).toBeCloseTo(1, 6);
    meter.reset();
    meter.process(signal, signal.map((value) => -value));
    expect(meter.value()).toBeCloseTo(-1, 6);
    const points = goniometerPoints(signal, signal, 10);
    for (let index = 0; index < points.length; index += 2) expect(points[index]).toBeCloseTo(0, 9);
  });
});
