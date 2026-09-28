/**
 * Multi-resolution waveform peaks (ledger 5).
 *
 * Built in the DSP worker from the rendered mix. Level 0 holds min/max over a
 * small fixed number of frames; each further level halves the resolution. A
 * view asks for any frame range at any column count and reads the finest level
 * that is still coarser than one column, so zooming never rescans the audio.
 * Below level 0 resolution the view reads PCM directly when it is available.
 */
import type { PcmAudio } from '../mastering-engine';

export interface PeakLevel {
  framesPerBucket: number;
  min: Float32Array;
  max: Float32Array;
}

export interface PeakPyramid {
  frameCount: number;
  levels: PeakLevel[];
}

export interface PeakColumn { min: number; max: number }

/** Frames summarized by one level-0 bucket. */
export const BASE_FRAMES_PER_BUCKET = 32;
/** The coarsest level is built until it has at most this many buckets. */
const COARSEST_BUCKETS = 512;

export function buildPeakPyramid(audio: PcmAudio): PeakPyramid {
  const frameCount = audio.channels[0]?.length ?? 0;
  const baseBuckets = Math.max(1, Math.ceil(frameCount / BASE_FRAMES_PER_BUCKET));
  const min = new Float32Array(baseBuckets);
  const max = new Float32Array(baseBuckets);
  for (let bucket = 0; bucket < baseBuckets; bucket += 1) {
    const start = bucket * BASE_FRAMES_PER_BUCKET;
    const end = Math.min(frameCount, start + BASE_FRAMES_PER_BUCKET);
    let low = Infinity;
    let high = -Infinity;
    for (const channel of audio.channels) {
      for (let frame = start; frame < end; frame += 1) {
        const sample = channel[frame];
        if (sample < low) low = sample;
        if (sample > high) high = sample;
      }
    }
    min[bucket] = Number.isFinite(low) ? low : 0;
    max[bucket] = Number.isFinite(high) ? high : 0;
  }
  const levels: PeakLevel[] = [{ framesPerBucket: BASE_FRAMES_PER_BUCKET, min, max }];
  while (levels[levels.length - 1].min.length > COARSEST_BUCKETS) {
    const previous = levels[levels.length - 1];
    const count = Math.ceil(previous.min.length / 2);
    const nextMin = new Float32Array(count);
    const nextMax = new Float32Array(count);
    for (let bucket = 0; bucket < count; bucket += 1) {
      const a = bucket * 2;
      const b = Math.min(previous.min.length - 1, a + 1);
      nextMin[bucket] = Math.min(previous.min[a], previous.min[b]);
      nextMax[bucket] = Math.max(previous.max[a], previous.max[b]);
    }
    levels.push({ framesPerBucket: previous.framesPerBucket * 2, min: nextMin, max: nextMax });
  }
  return { frameCount, levels };
}

/**
 * Min/max per display column for the half-open frame range `[startFrame, endFrame)`.
 *
 * @param pcm - Optional PCM used when a column spans fewer frames than a level-0 bucket.
 */
export function peaksForView(pyramid: PeakPyramid, startFrame: number, endFrame: number, columns: number, pcm?: PcmAudio | null): PeakColumn[] {
  const count = Math.max(0, Math.trunc(columns));
  const start = Math.max(0, Math.min(pyramid.frameCount, Math.floor(startFrame)));
  const end = Math.max(start, Math.min(pyramid.frameCount, Math.ceil(endFrame)));
  if (!count || end <= start) return Array.from({ length: count }, () => ({ min: 0, max: 0 }));
  const framesPerColumn = (end - start) / count;
  const result: PeakColumn[] = [];
  if (framesPerColumn < BASE_FRAMES_PER_BUCKET && pcm?.channels.length) {
    for (let column = 0; column < count; column += 1) {
      const from = Math.floor(start + column * framesPerColumn);
      const to = Math.max(from + 1, Math.floor(start + (column + 1) * framesPerColumn));
      let low = Infinity;
      let high = -Infinity;
      for (const channel of pcm.channels) {
        for (let frame = from; frame < Math.min(to, channel.length); frame += 1) {
          if (channel[frame] < low) low = channel[frame];
          if (channel[frame] > high) high = channel[frame];
        }
      }
      result.push(Number.isFinite(low) ? { min: low, max: high } : { min: 0, max: 0 });
    }
    return result;
  }
  let level = pyramid.levels[0];
  for (const candidate of pyramid.levels) if (candidate.framesPerBucket <= framesPerColumn) level = candidate;
  for (let column = 0; column < count; column += 1) {
    const from = Math.floor((start + column * framesPerColumn) / level.framesPerBucket);
    const to = Math.max(from + 1, Math.ceil((start + (column + 1) * framesPerColumn) / level.framesPerBucket));
    let low = Infinity;
    let high = -Infinity;
    for (let bucket = from; bucket < Math.min(to, level.min.length); bucket += 1) {
      if (level.min[bucket] < low) low = level.min[bucket];
      if (level.max[bucket] > high) high = level.max[bucket];
    }
    result.push(Number.isFinite(low) ? { min: low, max: high } : { min: 0, max: 0 });
  }
  return result;
}
