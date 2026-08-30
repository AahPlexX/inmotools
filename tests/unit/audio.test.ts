import { describe, expect, it } from 'vitest';
import { clampAudioSample, encodePcm24Wav } from '../../src/tools/audio/audio-engine';

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)));

function signed24(view: DataView, offset: number) {
  const raw = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
  return raw & 0x800000 ? raw | ~0xffffff : raw;
}

describe('PCM24 WAV encoder', () => {
  it('clamps finite audio samples to the normalized PCM range', () => {
    expect(clampAudioSample(-2)).toBe(-1);
    expect(clampAudioSample(-0.25)).toBe(-0.25);
    expect(clampAudioSample(0.75)).toBe(0.75);
    expect(clampAudioSample(2)).toBe(1);
    expect(clampAudioSample(Number.NaN)).toBe(0);
  });

  it('writes a little-endian 24-bit PCM RIFF/WAVE file with correct channel and rate metadata', () => {
    const left = new Float32Array([-1, 0, 1]);
    const right = new Float32Array([1, 0.5, -1]);
    const buffer = encodePcm24Wav([left, right], 48_000);
    const view = new DataView(buffer);

    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(24);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(3 * 2 * 3);
    expect(buffer.byteLength).toBe(44 + 18);

    expect(signed24(view, 44)).toBe(-8_388_608);
    expect(signed24(view, 47)).toBe(8_388_607);
    expect(signed24(view, 50)).toBe(0);
    expect(signed24(view, 53)).toBeCloseTo(4_194_304, 0);
    expect(signed24(view, 56)).toBe(8_388_607);
    expect(signed24(view, 59)).toBe(-8_388_608);
  });

  it('rejects missing, mismatched, or invalid channel/sample-rate inputs', () => {
    expect(() => encodePcm24Wav([], 48_000)).toThrow(/channel/i);
    expect(() => encodePcm24Wav([new Float32Array(2), new Float32Array(3)], 48_000)).toThrow(/length/i);
    expect(() => encodePcm24Wav([new Float32Array(2)], 0)).toThrow(/sample rate/i);
  });
});
