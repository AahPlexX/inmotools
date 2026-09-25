import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  applyGain,
  deriveSourceTimelineThroughEdits,
  mapSourceRangeThroughEdits,
  deletePcmRange,
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
  splitPcmAt,
  trimPcmEnd,
  trimPcmStart,
  type PcmAudio,
} from '../../src/tools/music/mastering-engine';

const pcm = (...channels: number[][]): PcmAudio => ({
  sampleRate: 48_000,
  channels: channels.map((values) => Float32Array.from(values)),
});

const expandTimeline = (source: PcmAudio, segments: ReturnType<typeof deriveSourceTimelineThroughEdits>) =>
  segments.flatMap((segment) => segment.sourceStartFrame === null
    ? Array(segment.outputEndFrame - segment.outputStartFrame).fill(0)
    : Array.from({ length: segment.outputEndFrame - segment.outputStartFrame }, (_, offset) => source.channels[0][
      segment.reversed ? segment.sourceEndFrame - offset - 1 : segment.sourceStartFrame + offset
    ]));

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

  it('splits and trims every channel at the same exact frame boundary', () => {
    const source = { sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3]), Float32Array.from([4, 5, 6, 7])] };
    const [left, right] = splitPcmAt(source, 0.5);
    const [roundedToFrame] = splitPcmAt(source, 0.26);
    expect(roundedToFrame.channels.map((channel) => Array.from(channel))).toEqual([[0], [4]]);
    expect(left.channels.map((channel) => Array.from(channel))).toEqual([[0, 1], [4, 5]]);
    expect(right.channels.map((channel) => Array.from(channel))).toEqual([[2, 3], [6, 7]]);
    expect(trimPcmStart(source, 0.5).channels.map((channel) => Array.from(channel))).toEqual([[2, 3], [6, 7]]);
    expect(trimPcmEnd(source, 0.5).channels.map((channel) => Array.from(channel))).toEqual([[0, 1], [4, 5]]);
  });

  it('deletes an exact selected frame range across channels without mutating source PCM', () => {
    const source = { sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3, 4]), Float32Array.from([5, 6, 7, 8, 9])] };
    const deleted = deletePcmRange(source, 0.25, 0.75);
    expect(deleted.channels.map((channel) => Array.from(channel))).toEqual([[0, 3, 4], [5, 8, 9]]);
    expect(source.channels.map((channel) => Array.from(channel))).toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
  });

  it('snaps a range deletion to the requested channel zero crossing when enabled', () => {
    const source = { sampleRate: 4, channels: [Float32Array.from([1, 0.5, -0.5, 0.5]), Float32Array.from([2, 3, 4, 5])] };
    const deleted = deletePcmRange(source, 0.25, 0.75, true, 2);
    expect(Array.from(deleted.channels[0])).toEqual([1, 0.5, 0.5]);
    expect(Array.from(deleted.channels[1])).toEqual([2, 3, 5]);
  });
});

describe('edit stack', () => {
  it('maps source ranges through crop, deletion, and inserted silence', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7])] };
    expect(mapSourceRangeThroughEdits(source, [
      { type: 'crop', startSeconds: 0.25, endSeconds: 1.75 },
      { type: 'deleteRange', startSeconds: 0.25, endSeconds: 1.25 },
      { type: 'insertSilence', atSeconds: 0.25, durationSeconds: 0.5 },
    ], 0, 2)).toEqual([
      { sourceStartFrame: 1, sourceEndFrame: 2, outputStartFrame: 0, outputEndFrame: 1, reversed: false },
      { sourceStartFrame: 6, sourceEndFrame: 7, outputStartFrame: 3, outputEndFrame: 4, reversed: false },
    ]);
  });

  it('derives frame-aligned source and silence spans in chronological edit order', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80])] };
    const edits = [
      { type: 'crop' as const, startSeconds: 0.25, endSeconds: 1.75 },
      { type: 'insertSilence' as const, atSeconds: 0.5, durationSeconds: 0.5 },
      { type: 'reverse' as const, startSeconds: 0.25, endSeconds: 1.5 },
      { type: 'deleteRange' as const, startSeconds: 0.25, endSeconds: 0.5 },
    ];
    const timeline = deriveSourceTimelineThroughEdits(source, edits);
    expect(timeline).toEqual([
      { outputStartFrame: 0, outputEndFrame: 1, sourceStartFrame: 1, sourceEndFrame: 2, reversed: false },
      { outputStartFrame: 1, outputEndFrame: 2, sourceStartFrame: 3, sourceEndFrame: 4, reversed: true },
      { outputStartFrame: 2, outputEndFrame: 4, sourceStartFrame: null, sourceEndFrame: null, reversed: false },
      { outputStartFrame: 4, outputEndFrame: 5, sourceStartFrame: 2, sourceEndFrame: 3, reversed: true },
      { outputStartFrame: 5, outputEndFrame: 7, sourceStartFrame: 5, sourceEndFrame: 7, reversed: false },
    ]);

    expect(expandTimeline(source, timeline)).toEqual(Array.from(applyEdits(source, edits).channels[0]));
  });

  it('preserves source orientation through nested reversals around inserted silence', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80])] };
    const edits = [
      { type: 'reverse' as const, startSeconds: 0.25, endSeconds: 1.5 },
      { type: 'insertSilence' as const, atSeconds: 0.75, durationSeconds: 0.5 },
      { type: 'reverse' as const, startSeconds: 0.25, endSeconds: 1.75 },
      { type: 'reverse' as const, startSeconds: 0.25, endSeconds: 1.75 },
    ];
    const timeline = deriveSourceTimelineThroughEdits(source, edits);
    const expected = [10, 60, 50, 0, 0, 40, 30, 20, 70, 80];

    expect(timeline).toContainEqual({
      outputStartFrame: 3,
      outputEndFrame: 5,
      sourceStartFrame: null,
      sourceEndFrame: null,
      reversed: false,
    });
    expect(expandTimeline(source, timeline)).toEqual(expected);
    expect(Array.from(applyEdits(source, edits).channels[0])).toEqual(expected);
  });

  it('maps reversed source ranges to output ranges in timeline order', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7])] };
    expect(mapSourceRangeThroughEdits(source, [
      { type: 'reverse', startSeconds: 0.5, endSeconds: 1.5 },
    ], 0.25, 0.75)).toEqual([
      { sourceStartFrame: 1, sourceEndFrame: 2, outputStartFrame: 1, outputEndFrame: 2, reversed: false },
      { sourceStartFrame: 2, sourceEndFrame: 3, outputStartFrame: 5, outputEndFrame: 6, reversed: true },
    ]);
  });

  it('keeps the source mapping through channel and amplitude operations', () => {
    const source: PcmAudio = { sampleRate: 4, channels: [Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7])] };
    expect(mapSourceRangeThroughEdits(source, [
      { type: 'gain', gainDb: 3 },
      { type: 'invertPolarity' },
      { type: 'foldDownMono' },
    ], 0.5, 1)).toEqual([
      { sourceStartFrame: 2, sourceEndFrame: 4, outputStartFrame: 2, outputEndFrame: 4, reversed: false },
    ]);
  });

  it('replays non-destructive operations in order', () => {
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


describe('Phase 2 edit replay', () => {
  it('replays utility transforms through the same immutable edit stack', async () => {
    const { applyEdits } = await import('../../src/tools/music/mastering-engine');
    const source: PcmAudio = {
      sampleRate: 4,
      channels: [Float32Array.from([1, 3, 5, 7]), Float32Array.from([2, 4, 6, 8])],
    };
    const result = applyEdits(source, [
      { type: 'removeDc' },
      { type: 'foldDownMono' },
      { type: 'invertPolarity' },
      { type: 'reverse', startSeconds: 0.25, endSeconds: 0.75 },
      { type: 'insertSilence', atSeconds: 0.5, durationSeconds: 0.25 },
    ]);
    expect(result.channels).toHaveLength(1);
    expect(Array.from(result.channels[0])).toEqual([3, -1, 0, 1, -3]);
    expect(Array.from(source.channels[0])).toEqual([1, 3, 5, 7]);
  });

  it('replays channel-routing utilities without aliasing source channels', async () => {
    const { applyEdits } = await import('../../src/tools/music/mastering-engine');
    const source = pcm([0.25, 0.5], [-0.25, -0.5]);
    expect(applyEdits(source, [{ type: 'swapStereo' }]).channels.map((channel) => Array.from(channel))).toEqual([[-0.25, -0.5], [0.25, 0.5]]);
    expect(applyEdits(source, [{ type: 'extractChannel', channelIndex: 1 }]).channels.map((channel) => Array.from(channel))).toEqual([[-0.25, -0.5]]);
    expect(applyEdits(source, [{ type: 'dualMono', channelIndex: 0 }]).channels.map((channel) => Array.from(channel))).toEqual([[0.25, 0.5], [0.25, 0.5]]);
  });
});
