import { describe, expect, it } from 'vitest';
import { offsetTimelineGroup } from '../../src/tools/tactics/timeline-engine';
import type { TacticalTimeline } from '../../src/tools/tactics/tactics-types';

const timeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 3000,
  loop: false,
  playbackRate: 1,
  markers: [],
  tracks: [
    {
      id: 'track-a',
      targetId: 'a',
      keyframes: [
        { id: 'a0', timeMs: 0, interpolation: 'linear' },
        { id: 'a1', timeMs: 1000, interpolation: 'linear' },
      ],
    },
    {
      id: 'track-b',
      targetId: 'b',
      keyframes: [
        { id: 'b0', timeMs: 0, interpolation: 'linear' },
        { id: 'b1', timeMs: 1000, interpolation: 'linear' },
      ],
    },
    {
      id: 'track-c',
      targetId: 'c',
      keyframes: [{ id: 'c0', timeMs: 500, interpolation: 'hold' }],
    },
  ],
});

describe('Tactical grouped timing', () => {
  it('offsets a selected group with deterministic ordered stagger', () => {
    const source = timeline();
    const result = offsetTimelineGroup(source, ['a', 'b'], 100, 200);
    expect(result.tracks[0]?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([100, 1100]);
    expect(result.tracks[1]?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([300, 1300]);
    expect(result.tracks[2]?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([500]);
    expect(source.tracks[0]?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 1000]);
  });

  it('rejects ambiguous targets and offsets outside timeline bounds', () => {
    const source = timeline();
    expect(() => offsetTimelineGroup(source, [], 100, 0)).toThrow(/target/i);
    expect(() => offsetTimelineGroup(source, ['a', 'a'], 100, 0)).toThrow(/duplicate/i);
    expect(() => offsetTimelineGroup(source, ['missing'], 100, 0)).toThrow(/does not exist/i);
    expect(() => offsetTimelineGroup(source, ['a'], -1, 0)).toThrow(/negative/i);
    expect(() => offsetTimelineGroup(source, ['b'], 2500, 0)).toThrow(/duration/i);
    expect(() => offsetTimelineGroup(source, ['a'], 0.5, 0)).toThrow(/integer/i);
  });
});
