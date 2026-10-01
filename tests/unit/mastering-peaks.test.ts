import { describe, expect, it } from 'vitest';
import { BASE_FRAMES_PER_BUCKET, buildPeakPyramid, peaksForView } from '../../src/tools/music/dsp/peaks';

describe('peak pyramid', () => {
  const frames = BASE_FRAMES_PER_BUCKET * 2048;
  const channel = new Float32Array(frames);
  channel[5] = 0.9;
  channel[frames - 3] = -0.7;
  channel[BASE_FRAMES_PER_BUCKET * 1000 + 4] = 0.4;
  const audio = { sampleRate: 48_000, channels: [channel, new Float32Array(frames)] };
  const pyramid = buildPeakPyramid(audio);

  it('halves resolution per level down to a small coarsest level', () => {
    expect(pyramid.levels[0].min).toHaveLength(2048);
    expect(pyramid.levels.map((level) => level.framesPerBucket).slice(0, 3)).toEqual([32, 64, 128]);
    expect(pyramid.levels.at(-1)!.min.length).toBeLessThanOrEqual(512);
  });

  it('never loses an extreme sample at any zoom level', () => {
    for (const columns of [1, 7, 300, 2048]) {
      const view = peaksForView(pyramid, 0, frames, columns);
      expect(Math.max(...view.map((column) => column.max))).toBeCloseTo(0.9, 6);
      expect(Math.min(...view.map((column) => column.min))).toBeCloseTo(-0.7, 6);
    }
  });

  it('reads PCM directly when zoomed below one bucket per column', () => {
    const view = peaksForView(pyramid, 0, 16, 16, audio);
    expect(view[5]).toEqual({ min: 0, max: expect.closeTo(0.9, 6) });
    expect(view[4]).toEqual({ min: 0, max: 0 });
    const zoomed = peaksForView(pyramid, BASE_FRAMES_PER_BUCKET * 1000, BASE_FRAMES_PER_BUCKET * 1001, 4);
    expect(Math.max(...zoomed.map((column) => column.max))).toBeCloseTo(0.4, 6);
  });

  it('returns flat columns for empty ranges', () => {
    expect(peaksForView(pyramid, 10, 10, 3)).toEqual([{ min: 0, max: 0 }, { min: 0, max: 0 }, { min: 0, max: 0 }]);
  });
});
