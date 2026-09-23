import { describe, expect, it } from 'vitest';
import {
  addBallPossessionEvent,
  getPossessionHolderAtTime,
} from '../../src/tools/tactics/possession-engine';
import { sampleTacticalTimeline, validateTacticalTimeline } from '../../src/tools/tactics/timeline-engine';
import type { TacticalTimeline } from '../../src/tools/tactics/tactics-types';

const authoredTimeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 2000,
  loop: false,
  playbackRate: 1,
  markers: [],
  tracks: [
    {
      id: 'p1-track', targetId: 'p1',
      keyframes: [
        { id: 'p1-0', timeMs: 0, position: { x: 0.2, y: 0.2 }, interpolation: 'linear' },
        { id: 'p1-2000', timeMs: 2000, position: { x: 0.6, y: 0.2 }, interpolation: 'linear' },
      ],
    },
    {
      id: 'p2-track', targetId: 'p2',
      keyframes: [
        { id: 'p2-0', timeMs: 0, position: { x: 0.7, y: 0.7 }, interpolation: 'linear' },
        { id: 'p2-2000', timeMs: 2000, position: { x: 0.5, y: 0.7 }, interpolation: 'linear' },
      ],
    },
    {
      id: 'ball-track', targetId: 'ball',
      keyframes: [
        { id: 'ball-0', timeMs: 0, position: { x: 0.1, y: 0.5 }, interpolation: 'linear' },
        { id: 'ball-2000', timeMs: 2000, position: { x: 0.9, y: 0.5 }, interpolation: 'linear' },
      ],
    },
  ],
});

describe('Tactical ball possession and handoffs', () => {
  it('stores sorted possession events separately from motion keyframes', () => {
    let timeline = authoredTimeline();
    timeline = addBallPossessionEvent(timeline, { id: 'handoff', timeMs: 1000, holderTargetId: 'p2' });
    timeline = addBallPossessionEvent(timeline, { id: 'receive', timeMs: 0, holderTargetId: 'p1' });
    expect(timeline.possessionEvents?.map((event) => event.id)).toEqual(['receive', 'handoff']);
    expect(timeline.tracks.find((track) => track.targetId === 'ball')?.keyframes).toHaveLength(2);
    expect(getPossessionHolderAtTime(timeline, 999)).toBe('p1');
    expect(getPossessionHolderAtTime(timeline, 1000)).toBe('p2');
  });

  it('samples the ball at the current holder position and switches at a handoff', () => {
    let timeline = authoredTimeline();
    timeline = addBallPossessionEvent(timeline, { id: 'receive', timeMs: 0, holderTargetId: 'p1' });
    timeline = addBallPossessionEvent(timeline, { id: 'handoff', timeMs: 1000, holderTargetId: 'p2' });

    const before = sampleTacticalTimeline(timeline, 500);
    expect(before.ball?.attachmentTargetId).toBe('p1');
    expect(before.ball?.position?.x).toBeCloseTo(0.3, 12);
    expect(before.ball?.position?.y).toBeCloseTo(0.2, 12);

    const after = sampleTacticalTimeline(timeline, 1500);
    expect(after.ball?.attachmentTargetId).toBe('p2');
    expect(after.ball?.position?.x).toBeCloseTo(0.55, 12);
    expect(after.ball?.position?.y).toBeCloseTo(0.7, 12);
  });

  it('releases possession without rewriting the authored ball trajectory', () => {
    let timeline = authoredTimeline();
    timeline = addBallPossessionEvent(timeline, { id: 'receive', timeMs: 0, holderTargetId: 'p1' });
    timeline = addBallPossessionEvent(timeline, { id: 'release', timeMs: 1000, holderTargetId: null });
    const released = sampleTacticalTimeline(timeline, 1500);
    expect(released.ball?.attachmentTargetId).toBeNull();
    expect(released.ball?.position?.x).toBeCloseTo(0.7, 12);
    expect(released.ball?.position?.y).toBeCloseTo(0.5, 12);
  });

  it('rejects unknown holders, duplicate event times, and events beyond timeline duration', () => {
    const timeline = authoredTimeline();
    expect(() => addBallPossessionEvent(timeline, { id: 'unknown', timeMs: 0, holderTargetId: 'missing' })).toThrow(/holder|target/i);
    const withEvent = addBallPossessionEvent(timeline, { id: 'one', timeMs: 500, holderTargetId: 'p1' });
    expect(() => addBallPossessionEvent(withEvent, { id: 'same-time', timeMs: 500, holderTargetId: 'p2' })).toThrow(/time/i);
    expect(() => addBallPossessionEvent(withEvent, { id: 'late', timeMs: 2001, holderTargetId: null })).toThrow(/duration/i);
  });
  it('reports malformed imported possession events through canonical timeline validation', () => {
    const timeline = authoredTimeline();
    timeline.possessionEvents = [
      { id: 'dup', timeMs: 500, holderTargetId: 'p1' },
      { id: 'dup', timeMs: 500, holderTargetId: 'missing' },
      { id: 'late', timeMs: 2500, holderTargetId: null },
    ];
    const errors = validateTacticalTimeline(timeline);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/possession event id dup.*duplicated/i),
      expect.stringMatching(/possession event time 500.*duplicated/i),
      expect.stringMatching(/holder target missing.*does not exist/i),
      expect.stringMatching(/possession event late.*exceeds.*duration/i),
    ]));
  });
});
