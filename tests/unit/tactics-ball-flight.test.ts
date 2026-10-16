import { describe, expect, it } from 'vitest';
import { authorBallElevationKeyframe, authorBallFlight, BALL_FLIGHT_PRESETS } from '../../src/tools/tactics/elevation-engine';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import { sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { exportTacticalProjectJson, importTacticalProjectJson } from '../../src/tools/tactics/project-io';

const flight = {
  preset: 'lofted' as const,
  start: { x: 0.1, y: 0.2 },
  end: { x: 0.5, y: 0.6 },
  startMs: 1000,
  endMs: 3000,
  launchAngleDeg: 45,
};

describe('Ball flight presets', () => {
  it('authors a metre-based parabolic arc on the canonical ball track without mutating the project', () => {
    const project = createStarterTacticalProject();
    project.pitch.dimensions = { lengthMeters: 60, widthMeters: 40 };
    const snapshot = structuredClone(project);
    const result = authorBallFlight(project, flight);
    expect(project).toEqual(snapshot);
    expect(result.ball).toEqual(project.ball);
    expect(result.timeline.tracks.filter(track => track.targetId === 'ball')).toHaveLength(1);
    const distance = Math.hypot(24, 16);
    const frames = result.timeline.tracks.find(track => track.targetId === 'ball')!.keyframes;
    expect(frames).toHaveLength(33);
    for (const frame of frames) {
      const u = (frame.timeMs - flight.startMs) / (flight.endMs - flight.startMs);
      expect(Number.isInteger(frame.timeMs)).toBe(true);
      expect(frame.elevationMeters).toBeCloseTo(distance * u * (1 - u), 8);
    }
    expect(sampleTacticalProjectAtTime(result, 1000).ball).toMatchObject({ position: flight.start, elevationMeters: 0 });
    expect(sampleTacticalProjectAtTime(result, 2000).ball.position.x).toBeCloseTo(0.3);
    expect(sampleTacticalProjectAtTime(result, 2000).ball.elevationMeters).toBeCloseTo(distance / 4);
    expect(sampleTacticalProjectAtTime(result, 3000).ball).toMatchObject({ position: flight.end, elevationMeters: 0 });
    expect(validateTacticalProject(result)).toEqual([]);
    const larger = authorBallFlight({ ...project, pitch: { ...project.pitch, dimensions: { lengthMeters: 120, widthMeters: 80 } } }, flight);
    expect(sampleTacticalProjectAtTime(larger, 2000).ball.elevationMeters).toBeCloseTo(distance / 2);
  });

  it('offers four distinct presets and keeps manual elevation editing on the same track', () => {
    const project = createStarterTacticalProject();
    expect(BALL_FLIGHT_PRESETS.map(preset => preset.id)).toEqual(['ground', 'driven', 'lofted', 'chipped']);
    const peaks = BALL_FLIGHT_PRESETS.map(preset => sampleTacticalProjectAtTime(
      authorBallFlight(project, { ...flight, preset: preset.id, launchAngleDeg: undefined }), 2000,
    ).ball.elevationMeters);
    expect(peaks[0]).toBe(0);
    expect(peaks[1]).toBeGreaterThan(0);
    expect(peaks[2]).toBeGreaterThan(peaks[1]!);
    expect(peaks[3]).toBeGreaterThan(peaks[2]!);
    const authored = authorBallFlight(project, flight);
    const manual = authorBallElevationKeyframe(authored, 2000, 2);
    expect(sampleTacticalProjectAtTime(manual, 2000).ball.elevationMeters).toBe(2);
    expect(manual.timeline.tracks).toHaveLength(authored.timeline.tracks.length);
    expect(manual.timeline.tracks.find(track => track.targetId === 'ball')!.keyframes.find(frame => frame.timeMs === 2000)?.position)
      .toEqual(authored.timeline.tracks.find(track => track.targetId === 'ball')!.keyframes.find(frame => frame.timeMs === 2000)?.position);
  });

  it('preserves events and unrelated frames while replacing motion inside the flight interval', () => {
    const project = createStarterTacticalProject();
    project.timeline.tracks = [{ id: 'ball-track', targetId: 'ball', keyframes: [
      { id: 'before', timeMs: 0, elevationMeters: 1, interpolation: 'hold' },
      { id: 'cue', timeMs: 1333, event: 'Keep this cue', visible: true, rotationDeg: 20, elevationMeters: 99, interpolation: 'hold', motionPath: { kind: 'linear', controlPoints: [] } },
      { id: 'after', timeMs: 4000, position: { x: 0.9, y: 0.9 }, elevationMeters: 3, interpolation: 'linear' },
    ] }];
    const result = authorBallFlight(project, flight);
    const frames = result.timeline.tracks[0]!.keyframes;
    expect(frames[0]).toEqual(project.timeline.tracks[0]!.keyframes[0]);
    expect(frames.at(-1)).toEqual(project.timeline.tracks[0]!.keyframes.at(-1));
    expect(frames.find(frame => frame.id === 'cue')).toMatchObject({ timeMs: 1333, event: 'Keep this cue', visible: true, rotationDeg: 20, interpolation: 'linear' });
    expect(frames.find(frame => frame.id === 'cue')?.motionPath).toBeUndefined();
    expect(new Set(frames.map(frame => frame.timeMs)).size).toBe(frames.length);
    expect(new Set(frames.map(frame => frame.id)).size).toBe(frames.length);
    expect(authorBallFlight(result, flight)).toEqual(result);
  });

  it('rejects invalid flight inputs atomically and supports short integer-time flights', () => {
    const project = createStarterTacticalProject();
    const snapshot = structuredClone(project);
    for (const input of [
      { ...flight, startMs: 0.5 }, { ...flight, startMs: -1 },
      { ...flight, endMs: flight.startMs + 1 },
      { ...flight, endMs: flight.startMs }, { ...flight, endMs: project.timeline.durationMs + 1 },
      { ...flight, launchAngleDeg: 0 }, { ...flight, launchAngleDeg: 90 }, { ...flight, launchAngleDeg: NaN },
      { ...flight, end: flight.start }, { ...flight, end: { x: 1.01, y: 0 } },
      { ...flight, start: { x: NaN, y: 0 } },
    ]) expect(() => authorBallFlight(project, input)).toThrow();
    expect(() => authorBallFlight(project, { ...flight, preset: 'invalid' as typeof flight.preset })).toThrow(/preset/i);
    expect(() => authorBallFlight({ ...project, pitch: { ...project.pitch, dimensions: { lengthMeters: 0, widthMeters: 40 } } }, flight)).toThrow(/dimensions/i);
    expect(project).toEqual(snapshot);
    const short = authorBallFlight(project, { ...flight, startMs: 0, endMs: 2 });
    expect(short.timeline.tracks.find(track => track.targetId === 'ball')!.keyframes.map(frame => frame.timeMs)).toEqual([0, 1, 2]);
  });

  it('refuses possession that would override the flight and allows a released ball', () => {
    const project = createStarterTacticalProject();
    project.timeline.possessionEvents = [{ id: 'hold', timeMs: 0, holderTargetId: 'token-1' }];
    expect(() => authorBallFlight(project, flight)).toThrow(/possession/i);
    project.timeline.possessionEvents.push({ id: 'release', timeMs: 1000, holderTargetId: null });
    expect(() => authorBallFlight(project, flight)).not.toThrow();
    project.timeline.possessionEvents.push({ id: 'catch', timeMs: 2000, holderTargetId: 'token-1' });
    expect(() => authorBallFlight(project, flight)).toThrow(/possession/i);
  });

  it('round-trips generated flights through project JSON and keeps sampled playback unchanged', () => {
    const project = authorBallFlight(createStarterTacticalProject(), flight);
    const imported = importTacticalProjectJson(exportTacticalProjectJson(project), 'flight.tactical.json');
    for (const timeMs of [1000, 1427, 2000, 2873, 3000]) {
      expect(sampleTacticalProjectAtTime(imported, timeMs).ball).toEqual(sampleTacticalProjectAtTime(project, timeMs).ball);
    }
    expect(validateTacticalProject(imported)).toEqual([]);
  });
});
