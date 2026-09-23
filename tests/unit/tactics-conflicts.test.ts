import { describe, expect, it } from 'vitest';
import { findPotentialPathConflicts } from '../../src/tools/tactics/conflict-engine';
import type { TacticalTimeline } from '../../src/tools/tactics/tactics-types';

const crossingTimeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 2000,
  loop: false,
  playbackRate: 1,
  markers: [],
  tracks: [
    {
      id: 'a-track', targetId: 'a',
      keyframes: [
        { id: 'a0', timeMs: 0, position: { x: 0.2, y: 0.5 }, interpolation: 'linear' },
        { id: 'a1', timeMs: 2000, position: { x: 0.8, y: 0.5 }, interpolation: 'linear' },
      ],
    },
    {
      id: 'b-track', targetId: 'b',
      keyframes: [
        { id: 'b0', timeMs: 0, position: { x: 0.5, y: 0.2 }, interpolation: 'linear' },
        { id: 'b1', timeMs: 2000, position: { x: 0.5, y: 0.8 }, interpolation: 'linear' },
      ],
    },
  ],
});

describe('Tactical potential path conflicts', () => {
  it('flags authored crossing paths using physical pitch distance', () => {
    const conflicts = findPotentialPathConflicts(
      crossingTimeline(),
      { lengthMeters: 100, widthMeters: 50 },
      { stepMs: 500, thresholdMeters: 1 },
    );
    expect(conflicts).toEqual([
      { targetA: 'a', targetB: 'b', timeMs: 1000, distanceMeters: 0 },
    ]);
  });

  it('does not flag paths that remain outside the authored proximity threshold', () => {
    const timeline = crossingTimeline();
    timeline.tracks[1] = {
      id: 'b-track', targetId: 'b',
      keyframes: [
        { id: 'b0', timeMs: 0, position: { x: 0.2, y: 0.9 }, interpolation: 'linear' },
        { id: 'b1', timeMs: 2000, position: { x: 0.8, y: 0.9 }, interpolation: 'linear' },
      ],
    };
    expect(findPotentialPathConflicts(
      timeline,
      { lengthMeters: 100, widthMeters: 50 },
      { stepMs: 250, thresholdMeters: 2 },
    )).toEqual([]);
  });
});
