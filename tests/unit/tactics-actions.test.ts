import { describe, expect, it } from 'vitest';
import {
  applyCoordinatedAction,
  createCoordinatedActionTemplate,
} from '../../src/tools/tactics/action-engine';
import { createMotionPath } from '../../src/tools/tactics/motion-engine';
import type { TacticalTimeline } from '../../src/tools/tactics/tactics-types';

const emptyTimeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 5000,
  loop: false,
  playbackRate: 1,
  tracks: [],
  markers: [],
});

describe('Tactical coordinated action templates', () => {
  it('validates reusable role geometry and role timing', () => {
    const template = createCoordinatedActionTemplate({
      id: 'overlap', label: 'Overlap',
      roles: [
        { roleId: 'carrier', from: { x: 0.3, y: 0.5 }, to: { x: 0.55, y: 0.5 }, startOffsetMs: 0, durationMs: 1200 },
        { roleId: 'runner', from: { x: 0.25, y: 0.7 }, to: { x: 0.65, y: 0.35 }, startOffsetMs: 250, durationMs: 1400 },
      ],
    });
    expect(template.roles.map((role) => role.roleId)).toEqual(['carrier', 'runner']);
    expect(() => createCoordinatedActionTemplate({ ...template, roles: [template.roles[0]!, template.roles[0]!] })).toThrow(/role id/i);
  });

  it('materializes coordinated roles into one deterministic track per assigned target', () => {
    const template = createCoordinatedActionTemplate({
      id: 'third-player', label: 'Third player combination',
      roles: [
        { roleId: 'first', from: { x: 0.2, y: 0.5 }, to: { x: 0.4, y: 0.5 }, startOffsetMs: 0, durationMs: 800 },
        {
          roleId: 'third', from: { x: 0.25, y: 0.75 }, to: { x: 0.65, y: 0.35 }, startOffsetMs: 200, durationMs: 1200,
          motionPath: createMotionPath('quadratic-bezier', [{ x: 0.45, y: 0.8 }]),
        },
      ],
    });
    const result = applyCoordinatedAction(emptyTimeline(), template, { first: 'token-8', third: 'token-10' }, 1000);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks.find((track) => track.targetId === 'token-8')?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([1000, 1800]);
    const third = result.tracks.find((track) => track.targetId === 'token-10');
    expect(third?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([1200, 2400]);
    expect(third?.keyframes[0]?.motionPath?.kind).toBe('quadratic-bezier');
  });

  it('adds action keyframes to an existing target track instead of creating a parallel track', () => {
    const timeline = emptyTimeline();
    timeline.tracks.push({
      id: 'existing', targetId: 'token-8',
      keyframes: [{ id: 'old', timeMs: 100, position: { x: 0.1, y: 0.1 }, interpolation: 'linear' }],
    });
    const template = createCoordinatedActionTemplate({
      id: 'run', label: 'Run',
      roles: [{ roleId: 'runner', from: { x: 0.2, y: 0.2 }, to: { x: 0.6, y: 0.4 }, startOffsetMs: 0, durationMs: 500 }],
    });
    const result = applyCoordinatedAction(timeline, template, { runner: 'token-8' }, 1000);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.id).toBe('existing');
    expect(result.tracks[0]?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([100, 1000, 1500]);
  });

  it('rejects incomplete, duplicated, or colliding assignments without mutating the timeline', () => {
    const template = createCoordinatedActionTemplate({
      id: 'pair', label: 'Pair action',
      roles: [
        { roleId: 'a', from: { x: 0.2, y: 0.2 }, to: { x: 0.4, y: 0.2 }, startOffsetMs: 0, durationMs: 500 },
        { roleId: 'b', from: { x: 0.2, y: 0.8 }, to: { x: 0.4, y: 0.8 }, startOffsetMs: 0, durationMs: 500 },
      ],
    });
    const timeline = emptyTimeline();
    timeline.tracks.push({
      id: 'existing', targetId: 'token-1',
      keyframes: [{ id: 'occupied', timeMs: 1000, position: { x: 0.1, y: 0.1 }, interpolation: 'linear' }],
    });
    const before = JSON.stringify(timeline);
    expect(() => applyCoordinatedAction(timeline, template, { a: 'token-1' }, 1000)).toThrow(/assignment/i);
    expect(() => applyCoordinatedAction(timeline, template, { a: 'token-1', b: 'token-1' }, 1000)).toThrow(/unique target/i);
    expect(() => applyCoordinatedAction(timeline, template, { a: 'token-1', b: 'token-2' }, 1000)).toThrow(/time/i);
    expect(JSON.stringify(timeline)).toBe(before);
  });
});
