import { describe, expect, it } from 'vitest';
import {
  applyGain,
  buildPeakEnvelope,
  clampSelection,
  createProject,
  findZeroCrossing,
  normalizePeak,
  slicePcm,
  type PcmAudio,
} from '../../src/tools/music/mastering-engine';

const pcm = (...channels: number[][]): PcmAudio => ({
  sampleRate: 48_000,
  channels: channels.map((values) => Float32Array.from(values)),
});

describe('mastering project foundation', () => {
  it('creates isolated projects with bounded default state', () => {
    const first = createProject();
    const second = createProject();
    expect(first).not.toBe(second);
    expect(first.tracks).toEqual([]);
    expect(first.selection).toEqual({ startSeconds: 0, endSeconds: 0 });
    expect(first.markers).toEqual([]);
  });

  it('clamps and orders a selection against duration', () => {
    expect(clampSelection({ startSeconds: 8, endSeconds: -2 }, 5)).toEqual({ startSeconds: 0, endSeconds: 5 });
    expect(clampSelection({ startSeconds: 2, endSeconds: 4 }, 5)).toEqual({ startSeconds: 2, endSeconds: 4 });
  });
});

describe('waveform and edit math', () => {
  it('builds deterministic min/max peak buckets across channels', () => {
    expect(buildPeakEnvelope(pcm([0, 0.5, -1, 0.25], [0.25, -0.75, 0.5, 1]), 2)).toEqual([
      { min: -0.75, max: 0.5 },
      { min: -1, max: 1 },
    ]);
  });

  it('snaps to the nearest sign change around an edit point', () => {
    const samples = Float32Array.from([0.4, 0.2, 0.05, -0.03, -0.2, 0.4]);
    expect(findZeroCrossing(samples, 2, 3)).toBe(3);
    expect(findZeroCrossing(samples, 5, 1)).toBe(5);
  });

  it('applies gain without mutating the source', () => {
    const source = pcm([0.25, -0.5]);
    const gained = applyGain(source, 6.020599913279624);
    expect(Array.from(gained.channels[0])).toEqual([0.5, -1]);
    expect(Array.from(source.channels[0])).toEqual([0.25, -0.5]);
  });

  it('normalizes the absolute peak to the requested dBFS target', () => {
    const normalized = normalizePeak(pcm([0.1, -0.5], [0.25, 0.2]), -6.020599913279624);
    expect(Math.max(...normalized.channels.flatMap((channel) => Array.from(channel, Math.abs)))).toBeCloseTo(0.5, 6);
  });

  it('slices every channel on the same sample boundaries', () => {
    const sliced = slicePcm(pcm([0, 1, 2, 3], [4, 5, 6, 7]), 1 / 48_000, 3 / 48_000);
    expect(Array.from(sliced.channels[0])).toEqual([1, 2]);
    expect(Array.from(sliced.channels[1])).toEqual([5, 6]);
  });
});

describe('edit stack', () => {
  it('replays non-destructive operations in order', async () => {
    const { applyEdits } = await import('../../src/tools/music/mastering-engine');
    const result = applyEdits(pcm([0.1, 0.25, -0.5, 0.25]), [
      { type: 'crop', startSeconds: 1 / 48_000, endSeconds: 4 / 48_000 },
      { type: 'gain', gainDb: 6.020599913279624 },
    ]);
    expect(Array.from(result.channels[0])).toEqual([0.5, -1, 0.5]);
  });
});
