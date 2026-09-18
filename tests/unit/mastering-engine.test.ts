import { describe, expect, it } from 'vitest';
import {
  applyGain,
  dualMonoFromChannel,
  extractChannel,
  foldDownMono,
  insertSilence,
  invertPolarity,
  measureDcOffset,
  removeDcOffset,
  reverseRange,
  swapStereoChannels,
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

describe('restoration and utility PCM transforms', () => {
  it('measures and removes per-channel DC offset without mutating source PCM', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([0.5, 0.5, -0.5, 0.5])] };
    expect(measureDcOffset(source)[0]).toBeCloseTo(0.25, 6);
    const corrected = removeDcOffset(source);
    expect(measureDcOffset(corrected)[0]).toBeCloseTo(0, 6);
    expect(Array.from(source.channels[0])).toEqual([0.5, 0.5, -0.5, 0.5]);
  });

  it('inverts polarity and reverses only the requested sample range', () => {
    expect(Array.from(invertPolarity({ sampleRate: 4, channels: [Float32Array.from([0.25, -0.5])] }).channels[0])).toEqual([-0.25, 0.5]);
    const reversed = reverseRange({ sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3, 4, 5])] }, 0.5, 1.25);
    expect(Array.from(reversed.channels[0])).toEqual([0, 1, 4, 3, 2, 5]);
  });

  it('inserts exact zero-valued frames at the requested timeline position', () => {
    const inserted = insertSilence({ sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3])] }, 0.5, 0.5);
    expect(Array.from(inserted.channels[0])).toEqual([0, 1, 0, 0, 2, 3]);
  });

  it('swaps stereo channels and rejects sources that are not exactly stereo', () => {
    const swapped = swapStereoChannels(pcm([0, 0.5], [1, -1]));
    expect(Array.from(swapped.channels[0])).toEqual([1, -1]);
    expect(Array.from(swapped.channels[1])).toEqual([0, 0.5]);
    expect(() => swapStereoChannels(pcm([0, 0.5]))).toThrow(/two channels/);
  });

  it('folds every channel down to a single averaged mono channel', () => {
    const folded = foldDownMono(pcm([1, 1, -1], [-1, 0, 1]));
    expect(folded.channels).toHaveLength(1);
    expect(Array.from(folded.channels[0])).toEqual([0, 0.5, 0]);
  });

  it('extracts an independent copy of a single channel and rejects an out-of-range index', () => {
    const source = pcm([0.25, 0.5], [-0.25, -0.5]);
    const extracted = extractChannel(source, 1);
    expect(extracted.channels).toHaveLength(1);
    expect(Array.from(extracted.channels[0])).toEqual([-0.25, -0.5]);
    expect(() => extractChannel(source, 2)).toThrow(/out of range/);
  });

  it('duplicates one channel into an independent dual-mono pair', () => {
    const dualMono = dualMonoFromChannel(pcm([0.25, 0.5], [-0.25, -0.5]), 0);
    expect(dualMono.channels).toHaveLength(2);
    expect(Array.from(dualMono.channels[0])).toEqual([0.25, 0.5]);
    expect(Array.from(dualMono.channels[1])).toEqual([0.25, 0.5]);
    expect(dualMono.channels[0]).not.toBe(dualMono.channels[1]);
  });
});
