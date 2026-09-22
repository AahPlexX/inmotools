import { describe, expect, it } from 'vitest';
import {
  createMotionPath,
  sampleMotionPath,
  setKeyframeMotionPath,
} from '../../src/tools/tactics/motion-engine';
import { sampleTimelineTrack } from '../../src/tools/tactics/timeline-engine';
import { transformTacticalProject } from '../../src/tools/tactics/pitch-engine';
import { createStarterTacticalProject } from '../../src/tools/tactics/tactics-engine';
import type { TimelineTrack } from '../../src/tools/tactics/tactics-types';

describe('Tactical spatial motion paths', () => {
  it('samples quadratic and cubic Bézier geometry independently of timing easing', () => {
    const start = { x: 0.1, y: 0.5 };
    const end = { x: 0.9, y: 0.5 };
    const quadratic = createMotionPath('quadratic-bezier', [{ x: 0.5, y: 0.1 }]);
    const cubic = createMotionPath('cubic-bezier', [{ x: 0.25, y: 0.1 }, { x: 0.75, y: 0.9 }]);

    expect(sampleMotionPath(start, end, quadratic, 0.5)).toEqual({ x: 0.5, y: 0.3 });
    const cubicMid = sampleMotionPath(start, end, cubic, 0.5);
    expect(cubicMid.x).toBeCloseTo(0.5, 12);
    expect(cubicMid.y).toBeCloseTo(0.5, 12);
  });

  it('validates Bézier control counts and normalized control points', () => {
    expect(() => createMotionPath('quadratic-bezier', [])).toThrow(/one control/i);
    expect(() => createMotionPath('cubic-bezier', [{ x: 0.2, y: 0.2 }])).toThrow(/two control/i);
    expect(() => createMotionPath('quadratic-bezier', [{ x: 1.2, y: 0.4 }])).toThrow(/normalized/i);
  });

  it('attaches a path immutably to an existing segment keyframe', () => {
    const track: TimelineTrack = {
      id: 'player-track', targetId: 'token-1',
      keyframes: [
        { id: 'start', timeMs: 0, position: { x: 0.1, y: 0.5 }, interpolation: 'linear' },
        { id: 'end', timeMs: 1000, position: { x: 0.9, y: 0.5 }, interpolation: 'linear' },
      ],
    };
    const path = createMotionPath('quadratic-bezier', [{ x: 0.5, y: 0.1 }]);
    const result = setKeyframeMotionPath(track, 'start', path);
    expect(result).not.toBe(track);
    expect(result.keyframes[0]?.motionPath).toEqual(path);
    expect(track.keyframes[0]?.motionPath).toBeUndefined();
    expect(() => setKeyframeMotionPath(track, 'end', path)).toThrow(/next keyframe/i);
  });

  it('uses the authored spatial path when sampling a timeline segment', () => {
    const track: TimelineTrack = {
      id: 'player-track', targetId: 'token-1',
      keyframes: [
        {
          id: 'start', timeMs: 0, position: { x: 0.1, y: 0.5 }, interpolation: 'linear',
          motionPath: createMotionPath('quadratic-bezier', [{ x: 0.5, y: 0.1 }]),
        },
        { id: 'end', timeMs: 1000, position: { x: 0.9, y: 0.5 }, interpolation: 'linear' },
      ],
    };
    const sampled = sampleTimelineTrack(track, 500);
    expect(sampled.position?.x).toBeCloseTo(0.5, 12);
    expect(sampled.position?.y).toBeCloseTo(0.3, 12);
  });
  it('transforms spatial path control points with the whole tactical project', () => {
    const project = createStarterTacticalProject();
    project.timeline.tracks = [{
      id: 'path-track', targetId: 'token-1',
      keyframes: [
        {
          id: 'start', timeMs: 0, position: { x: 0.1, y: 0.5 }, interpolation: 'linear',
          motionPath: createMotionPath('quadratic-bezier', [{ x: 0.25, y: 0.2 }]),
        },
        { id: 'end', timeMs: 1000, position: { x: 0.9, y: 0.5 }, interpolation: 'linear' },
      ],
    }];
    const mirrored = transformTacticalProject(project, 'horizontal');
    expect(mirrored.timeline.tracks[0]?.keyframes[0]?.motionPath?.controlPoints[0]).toEqual({ x: 0.75, y: 0.2 });
    expect(project.timeline.tracks[0]?.keyframes[0]?.motionPath?.controlPoints[0]).toEqual({ x: 0.25, y: 0.2 });
  });
});
