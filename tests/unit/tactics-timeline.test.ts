import { describe, expect, it } from 'vitest';
import {
  addTimelineKeyframe,
  addTimelineMarker,
  getVisibilitySpans,
  offsetTimelineTrack,
  sampleTimelineTrack,
} from '../../src/tools/tactics/timeline-engine';
import type { TacticalTimeline, TimelineTrack } from '../../src/tools/tactics/tactics-types';

const baseTrack = (): TimelineTrack => ({
  id: 'track-player-1',
  targetId: 'token-1',
  keyframes: [
    { id: 'kf-0', timeMs: 0, position: { x: 0.1, y: 0.2 }, rotationDeg: 0, visible: true, interpolation: 'linear' },
    { id: 'kf-1000', timeMs: 1000, position: { x: 0.5, y: 0.6 }, rotationDeg: 90, interpolation: 'linear' },
  ],
});

describe('Tactical timeline engine', () => {
  it('inserts immutable keyframes in deterministic integer-time order and rejects ambiguous times', () => {
    const source = baseTrack();
    const result = addTimelineKeyframe(source, {
      id: 'kf-500', timeMs: 500, position: { x: 0.3, y: 0.4 }, interpolation: 'smooth',
    });
    expect(result).not.toBe(source);
    expect(result.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 500, 1000]);
    expect(source.keyframes).toHaveLength(2);
    expect(() => addTimelineKeyframe(source, { id: 'duplicate-time', timeMs: 1000, interpolation: 'linear' })).toThrow(/time/i);
    expect(() => addTimelineKeyframe(source, { id: 'fractional', timeMs: 250.5, interpolation: 'linear' })).toThrow(/integer/i);
  });

  it('samples position and rotation with deterministic easing while visibility remains stepped', () => {
    const linear = sampleTimelineTrack(baseTrack(), 500);
    expect(linear.position?.x).toBeCloseTo(0.3, 12);
    expect(linear.position?.y).toBeCloseTo(0.4, 12);
    expect(linear.rotationDeg).toBe(45);
    expect(linear.visible).toBe(true);

    const smoothTrack = baseTrack();
    smoothTrack.keyframes[0] = { ...smoothTrack.keyframes[0]!, interpolation: 'ease-in' };
    const eased = sampleTimelineTrack(smoothTrack, 500);
    expect(eased.position?.x).toBeCloseTo(0.2, 12);

    const hidden = addTimelineKeyframe(baseTrack(), { id: 'hide', timeMs: 750, visible: false, interpolation: 'hold' });
    expect(sampleTimelineTrack(hidden, 749).visible).toBe(true);
    expect(sampleTimelineTrack(hidden, 750).visible).toBe(false);
  });

  it('supports cubic-bezier interpolation with bounded deterministic output', () => {
    const track = baseTrack();
    track.keyframes[0] = { ...track.keyframes[0]!, interpolation: 'cubic-bezier', bezier: [0.42, 0, 0.58, 1] };
    const sampled = sampleTimelineTrack(track, 500);
    expect(sampled.position?.x).toBeCloseTo(0.3, 6);
    expect(sampled.position?.y).toBeCloseTo(0.4, 6);
  });

  it('offsets whole tracks immutably without allowing negative project time', () => {
    const source = baseTrack();
    const shifted = offsetTimelineTrack(source, 250);
    expect(shifted.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([250, 1250]);
    expect(source.keyframes[0]?.timeMs).toBe(0);
    expect(() => offsetTimelineTrack(source, -1)).toThrow(/negative/i);
  });

  it('derives complete visibility spans and keeps markers sorted and unique', () => {
    let track = baseTrack();
    track = addTimelineKeyframe(track, { id: 'hide', timeMs: 400, visible: false, interpolation: 'hold' });
    track = addTimelineKeyframe(track, { id: 'show', timeMs: 800, visible: true, interpolation: 'hold' });
    expect(getVisibilitySpans(track, 1200)).toEqual([
      { startMs: 0, endMs: 400, visible: true },
      { startMs: 400, endMs: 800, visible: false },
      { startMs: 800, endMs: 1200, visible: true },
    ]);

    const timeline: TacticalTimeline = { playheadMs: 0, durationMs: 1200, loop: false, playbackRate: 1, tracks: [], markers: [] };
    const withLate = addTimelineMarker(timeline, { id: 'm2', timeMs: 900, kind: 'cue', label: 'Press' });
    const withBoth = addTimelineMarker(withLate, { id: 'm1', timeMs: 300, kind: 'cue', label: 'Go' });
    expect(withBoth.markers.map((marker) => marker.id)).toEqual(['m1', 'm2']);
    expect(() => addTimelineMarker(withBoth, { id: 'm2', timeMs: 1000, kind: 'cue', label: 'Duplicate' })).toThrow(/id/i);
    expect(() => addTimelineMarker(withBoth, { id: 'late', timeMs: 1201, kind: 'cue', label: 'Too late' })).toThrow(/duration/i);
  });
});
