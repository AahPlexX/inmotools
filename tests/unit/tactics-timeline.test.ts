import { describe, expect, it } from 'vitest';
import {
  addTimelineKeyframe,
  addTimelineMarker,
  addTimelineTrack,
  getVisibilitySpans,
  offsetTimelineTrack,
  sampleTacticalProjectAtTime,
  sampleTacticalTimeline,
  setTimelinePlayhead,
  setTimelineVisibility,
  stepTimelineFrame,
  timelineKeyframeTimes,
  validateTacticalTimeline,
  activeScenesAtTime,
  sampleTimelineTrack,
} from '../../src/tools/tactics/timeline-engine';
import type { TacticalTimeline, TimelineTrack } from '../../src/tools/tactics/tactics-types';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';

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

  it('updates visibility at an existing keyframe time without discarding authored motion', () => {
    const source = baseTrack();
    const updated = setTimelineVisibility(source, {
      id: 'visibility-0',
      timeMs: 0,
      visible: false,
    });
    expect(updated.keyframes).toHaveLength(2);
    expect(updated.keyframes[0]).toMatchObject({
      id: 'kf-0',
      timeMs: 0,
      position: { x: 0.1, y: 0.2 },
      rotationDeg: 0,
      visible: false,
    });
    expect(source.keyframes[0]?.visible).toBe(true);

    const inserted = setTimelineVisibility(source, {
      id: 'visibility-500',
      timeMs: 500,
      visible: false,
    });
    expect(inserted.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 500, 1000]);
  });

  it('samples temporal visibility for layers and annotations without deleting canonical content', () => {
    const project = buildBeginnerTacticalProject({
      title: 'Visibility',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const scene = project.scenes[0]!;
    const layer = scene.layers[0]!;
    project.annotations.push({
      id: 'annotation-1',
      kind: 'arrow',
      label: 'Temporary cue',
      sceneId: scene.id,
      layerId: layer.id,
      points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }],
      visible: true,
    } as typeof project.annotations[number]);
    project.timeline.tracks.push(
      {
        id: 'visibility-layer',
        targetId: layer.id,
        keyframes: [
          { id: 'layer-hide', timeMs: 500, visible: false, interpolation: 'hold' },
          { id: 'layer-show', timeMs: 1500, visible: true, interpolation: 'hold' },
        ],
      },
      {
        id: 'visibility-annotation',
        targetId: 'annotation-1',
        keyframes: [
          { id: 'annotation-hide', timeMs: 500, visible: false, interpolation: 'hold' },
          { id: 'annotation-show', timeMs: 1500, visible: true, interpolation: 'hold' },
        ],
      },
    );

    const hidden = sampleTacticalProjectAtTime(project, 1000);
    expect(hidden.scenes[0]!.layers[0]!.visible).toBe(false);
    expect((hidden.annotations[0] as typeof hidden.annotations[0] & { visible?: boolean }).visible).toBe(false);
    expect(hidden.annotations).toHaveLength(1);

    const shown = sampleTacticalProjectAtTime(project, 2000);
    expect(shown.scenes[0]!.layers[0]!.visible).toBe(true);
    expect((shown.annotations[0] as typeof shown.annotations[0] & { visible?: boolean }).visible).toBe(true);

    expect(project.scenes[0]!.layers[0]!.visible).toBe(true);
    expect(project.annotations).toHaveLength(1);
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
    const withLate = addTimelineMarker(timeline, { id: 'm2', timeMs: 900, kind: 'coaching-cue', label: 'Press' });
    const withBoth = addTimelineMarker(withLate, { id: 'm1', timeMs: 300, kind: 'coaching-cue', label: 'Go' });
    expect(withBoth.markers.map((marker) => marker.id)).toEqual(['m1', 'm2']);
    expect(() => addTimelineMarker(withBoth, { id: 'm2', timeMs: 1000, kind: 'coaching-cue', label: 'Duplicate' })).toThrow(/id/i);
    expect(() => addTimelineMarker(withBoth, { id: 'late', timeMs: 1201, kind: 'coaching-cue', label: 'Too late' })).toThrow(/duration/i);
  });
  it('adds one deterministic track per target and samples the whole timeline by target id', () => {
    const empty: TacticalTimeline = { playheadMs: 0, durationMs: 2000, loop: false, playbackRate: 1, tracks: [], markers: [] };
    const first = addTimelineTrack(empty, baseTrack());
    const secondTrack: TimelineTrack = {
      id: 'track-ball', targetId: 'ball',
      keyframes: [
        { id: 'ball-0', timeMs: 0, position: { x: 0.5, y: 0.5 }, interpolation: 'linear' },
        { id: 'ball-1000', timeMs: 1000, position: { x: 0.7, y: 0.5 }, interpolation: 'linear' },
      ],
    };
    const both = addTimelineTrack(first, secondTrack);
    const sampled = sampleTacticalTimeline(both, 500);
    expect(sampled['token-1']?.position?.x).toBeCloseTo(0.3, 12);
    expect(sampled.ball?.position).toEqual({ x: 0.6, y: 0.5 });
    expect(() => addTimelineTrack(both, { ...baseTrack(), id: 'other-track' })).toThrow(/target/i);
    expect(() => addTimelineTrack(both, { ...secondTrack, targetId: 'other' })).toThrow(/id/i);
  });

  it('clamps or wraps the integer playhead according to loop mode', () => {
    const timeline: TacticalTimeline = { playheadMs: 0, durationMs: 1000, loop: false, playbackRate: 1, tracks: [], markers: [] };
    expect(setTimelinePlayhead(timeline, 1200).playheadMs).toBe(1000);
    expect(setTimelinePlayhead({ ...timeline, loop: true }, 1200).playheadMs).toBe(200);
    expect(setTimelinePlayhead({ ...timeline, loop: true }, 1000).playheadMs).toBe(0);
    expect(() => setTimelinePlayhead(timeline, 1.5)).toThrow(/integer/i);
  });

  it('returns all scenes active at an integer project time in deterministic order', () => {
    const scenes = [
      { id: 'scene-b', name: 'B', startMs: 500, durationMs: 1000, layers: [], objects: [] },
      { id: 'scene-a', name: 'A', startMs: 0, durationMs: 750, layers: [], objects: [] },
      { id: 'scene-c', name: 'C', startMs: 1500, durationMs: 0, layers: [], objects: [] },
    ];
    expect(activeScenesAtTime(scenes, 600).map((scene) => scene.id)).toEqual(['scene-a', 'scene-b']);
    expect(activeScenesAtTime(scenes, 1499).map((scene) => scene.id)).toEqual(['scene-b']);
    expect(activeScenesAtTime(scenes, 1500).map((scene) => scene.id)).toEqual(['scene-c']);
  });
  it('samples a project presentation without mutating canonical state and steps transport deterministically', () => {
    const project = buildBeginnerTacticalProject({
      title: 'Playback',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const token = project.playerTokens[0]!;
    const start = { ...token.position };
    const target = {
      x: Math.min(1, start.x + 0.2),
      y: Math.min(1, start.y + 0.1),
    };
    project.timeline = addTimelineTrack(project.timeline, {
      id: 'track-playback',
      targetId: token.id,
      keyframes: [
        { id: 'playback-0', timeMs: 0, position: start, interpolation: 'linear' },
        { id: 'playback-1000', timeMs: 1000, position: target, interpolation: 'hold' },
      ],
    });

    const sampled = sampleTacticalProjectAtTime(project, 500);
    const sampledToken = sampled.playerTokens.find((candidate) => candidate.id === token.id)!;
    expect(sampled).not.toBe(project);
    expect(sampledToken.position.x).toBeCloseTo((start.x + target.x) / 2, 12);
    expect(sampledToken.position.y).toBeCloseTo((start.y + target.y) / 2, 12);
    expect(project.playerTokens[0]!.position).toEqual(start);

    expect(stepTimelineFrame(0, project.timeline.durationMs, 60, 1)).toBe(17);
    expect(stepTimelineFrame(20, project.timeline.durationMs, 60, -1)).toBe(17);
    expect(stepTimelineFrame(0, project.timeline.durationMs, 60, -1)).toBe(0);
    expect(timelineKeyframeTimes(project.timeline)).toEqual([0, 1000]);
  });

  it('reports structural timeline errors without mutating the source timeline', () => {
    const timeline: TacticalTimeline = {
      playheadMs: 1300,
      durationMs: 1200,
      loop: false,
      playbackRate: 0,
      tracks: [
        { id: 'dup', targetId: 'token-1', keyframes: [{ id: 'a', timeMs: 1300, interpolation: 'linear' }] },
        { id: 'dup', targetId: 'token-1', keyframes: [{ id: 'b', timeMs: 200, interpolation: 'linear' }] },
      ],
      markers: [
        { id: 'same', timeMs: 100, kind: 'coaching-cue', label: 'A' },
        { id: 'same', timeMs: 1300, kind: 'coaching-cue', label: 'B' },
      ],
    };
    const before = JSON.stringify(timeline);
    const errors = validateTacticalTimeline(timeline);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/playhead.*duration/i),
      expect.stringMatching(/playback rate/i),
      expect.stringMatching(/track id.*dup/i),
      expect.stringMatching(/target.*token-1/i),
      expect.stringMatching(/keyframe.*1300.*duration/i),
      expect.stringMatching(/marker id.*same/i),
      expect.stringMatching(/marker.*1300.*duration/i),
    ]));
    expect(JSON.stringify(timeline)).toBe(before);
  });
});
