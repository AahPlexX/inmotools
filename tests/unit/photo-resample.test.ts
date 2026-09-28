import { describe, expect, test } from 'vitest';
import { normalizeResamplingKernel, resamplePixels } from '../../src/tools/photo/photo-resample';

function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(fill(x, y), (y * width + x) * 4);
  return data;
}

const KERNELS = ['lanczos3', 'bicubic', 'mitchell', 'bilinear'] as const;

describe('deterministic resampling', () => {
  test.each(KERNELS)('%s keeps a flat colour flat when shrinking and enlarging', (kernel) => {
    const flat = image(12, 9, () => [37, 140, 222, 255]);
    for (const [w, h] of [[5, 4], [31, 20]]) {
      const out = resamplePixels(flat, 12, 9, w, h, kernel);
      for (let i = 0; i < out.length; i += 4) expect([out[i], out[i + 1], out[i + 2], out[i + 3]]).toEqual([37, 140, 222, 255]);
    }
  });

  test.each(KERNELS)('%s averages a fine checkerboard in linear light', (kernel) => {
    // Halving a 1-px black/white checker must give 50 % linear light: sRGB byte 188, not 128.
    const checker = image(16, 16, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const out = resamplePixels(checker, 16, 16, 8, 8, kernel);
    const centre = (4 * 8 + 4) * 4;
    expect(out[centre]).toBeGreaterThanOrEqual(186);
    expect(out[centre]).toBeLessThanOrEqual(190);
  });

  test('lanczos3 and bilinear reproduce the input exactly at the same size', () => {
    const noisy = image(9, 7, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 71) % 256, (x * y * 13) % 256, 255]);
    for (const kernel of ['lanczos3', 'bilinear'] as const) expect(Array.from(resamplePixels(noisy, 9, 7, 9, 7, kernel))).toEqual(Array.from(noisy));
  });

  test('transparent neighbours do not darken opaque colour (premultiplied alpha)', () => {
    // Left half opaque red, right half fully transparent black.
    const edge = image(8, 2, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const out = resamplePixels(edge, 8, 2, 4, 2, 'mitchell');
    for (let x = 0; x < 4; x += 1) {
      const o = x * 4;
      if (out[o + 3] > 0) expect([out[o], out[o + 1], out[o + 2]]).toEqual([255, 0, 0]);
    }
    expect(out[3]).toBe(255);
    expect(out[3 * 4 + 3]).toBe(0);
  });

  test('the same input always produces identical bytes', () => {
    const noisy = image(40, 30, (x, y) => [(x * 97 + y * 13) % 256, (x * 7 + y * 131) % 256, (x * y) % 256, 255]);
    expect(Array.from(resamplePixels(noisy, 40, 30, 17, 11, 'lanczos3'))).toEqual(Array.from(resamplePixels(noisy, 40, 30, 17, 11, 'lanczos3')));
  });

  test('invalid requests are refused and unknown kernels fall back to the browser scaler', () => {
    expect(() => resamplePixels(new Uint8ClampedArray(4), 1, 1, 0, 1, 'bilinear')).toThrow(/positive dimensions/);
    expect(() => resamplePixels(new Uint8ClampedArray(4), 2, 2, 1, 1, 'bilinear')).toThrow(/smaller than its dimensions/);
    expect(normalizeResamplingKernel('mitchell')).toBe('mitchell');
    expect(normalizeResamplingKernel('sinc-9000')).toBe('browser');
  });
});
