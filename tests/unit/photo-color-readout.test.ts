import { describe, expect, test } from 'vitest';
import { classifyPhotoClipping, photoColorReadout } from '../../src/tools/photo/photo-color-readout';

describe('Photo Studio color readout', () => {
  test('reports stable RGB, HSL and hexadecimal values', () => {
    expect(photoColorReadout(255, 0, 0)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 255,
      hue: 0,
      saturation: 100,
      lightness: 50,
      hex: '#FF0000',
    });
  });

  test('clamps non-byte input before producing readout values', () => {
    const readout = photoColorReadout(300, -5, 127.6, 400);
    expect(readout.r).toBe(255);
    expect(readout.g).toBe(0);
    expect(readout.b).toBe(128);
    expect(readout.a).toBe(255);
    expect(readout.hex).toBe('#FF0080');
  });

  test('classifies deep shadows when every channel is near black', () => {
    expect(classifyPhotoClipping(5, 4, 3)).toBe('shadow');
    expect(classifyPhotoClipping(6, 0, 0)).toBeNull();
  });

  test('classifies channel highlights when any channel approaches clipping', () => {
    expect(classifyPhotoClipping(250, 80, 70)).toBe('highlight');
    expect(classifyPhotoClipping(249, 249, 249)).toBeNull();
  });
});
