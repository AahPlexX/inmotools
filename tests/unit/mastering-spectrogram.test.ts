import { describe, expect, it } from 'vitest';
import { buildSpectrogram, rowFrequency, spectrogramPalette } from '../../src/tools/music/dsp/spectrogram';

describe('spectrogram', () => {
  it('places a tone in the right log-frequency row and time columns', () => {
    const rate = 48_000;
    const tone = Float32Array.from({ length: rate }, (_, n) => n >= rate / 2 ? 0.5 * Math.sin(2 * Math.PI * 1000 * n / rate) : 0);
    const image = buildSpectrogram([tone], rate);
    expect(image.columns).toBe(Math.ceil(rate / 512));
    expect(image.hopSeconds).toBeCloseTo(512 / rate, 12);
    const column = Math.round(0.75 / image.hopSeconds);
    let loudest = 0;
    for (let row = 1; row < image.rows; row += 1) if (image.data[column * image.rows + row] > image.data[column * image.rows + loudest]) loudest = row;
    const frequency = rowFrequency(loudest, image.rows, image.minHz, image.maxHz);
    expect(Math.abs(Math.log2(frequency / 1000))).toBeLessThan(0.05);
    const silent = Math.round(0.2 / image.hopSeconds);
    expect(Math.max(...image.data.subarray(silent * image.rows, silent * image.rows + image.rows))).toBe(0);
  });

  it('maps quiet to dark and loud to light', () => {
    const palette = spectrogramPalette();
    const brightness = (level: number) => palette[level * 4] + palette[level * 4 + 1] + palette[level * 4 + 2];
    expect(brightness(0)).toBeLessThan(brightness(128));
    expect(brightness(128)).toBeLessThan(brightness(255));
  });
});
