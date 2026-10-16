import { MAX_GENERATED_TIME_SAMPLES, MAX_KEYFRAMES_PER_TRACK } from './session-bounds';
import type { NormalizedPoint, TacticalKeyframe, TacticalProject, TimelineTrack } from './tactics-types';
import { addTimelineKeyframe, addTimelineTrack, sampleTacticalProjectAtTime } from './timeline-engine';
import { getPossessionHolderAtTime } from './possession-engine';

export interface ElevationSample {
  timeMs: number;
  elevationMeters: number;
  position: NormalizedPoint;
}

export const BALL_FLIGHT_PRESETS = [
  { id: 'ground', label: 'Ground', launchAngleDeg: 0 },
  { id: 'driven', label: 'Driven', launchAngleDeg: 10 },
  { id: 'lofted', label: 'Lofted', launchAngleDeg: 35 },
  { id: 'chipped', label: 'Chipped', launchAngleDeg: 55 },
] as const;

export type BallFlightPreset = typeof BALL_FLIGHT_PRESETS[number]['id'];

export interface BallFlightInput {
  preset: BallFlightPreset;
  start: NormalizedPoint;
  end: NormalizedPoint;
  startMs: number;
  endMs: number;
  launchAngleDeg?: number;
}

export function authorBallFlight(project: TacticalProject, input: BallFlightInput): TacticalProject {
  const preset = BALL_FLIGHT_PRESETS.find(candidate => candidate.id === input.preset);
  if (!preset) throw new Error('Choose a supported ball flight preset.');
  const startMs = requireElevationTime(project, input.startMs);
  const endMs = requireElevationTime(project, input.endMs);
  if (endMs <= startMs) throw new RangeError('Flight end must be after its start.');
  if (preset.id !== 'ground' && endMs - startMs < 2) throw new RangeError('Airborne flights need at least two milliseconds for an elevation keyframe.');
  if (getPossessionHolderAtTime(project.timeline, startMs)
    || project.timeline.possessionEvents?.some(event => event.timeMs > startMs && event.timeMs <= endMs && event.holderTargetId)) {
    throw new Error('Release ball possession for the flight interval before authoring a flight.');
  }
  for (const point of [input.start, input.end]) {
    if (![point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new RangeError('Flight endpoints must stay inside normalized pitch bounds.');
    }
  }
  const { lengthMeters, widthMeters } = project.pitch.dimensions;
  if (![lengthMeters, widthMeters].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Flight pitch dimensions must be positive finite metres.');
  }
  const distance = Math.hypot((input.end.x - input.start.x) * lengthMeters, (input.end.y - input.start.y) * widthMeters);
  if (!Number.isFinite(distance) || distance === 0) throw new RangeError('Flight endpoints must have a positive finite pitch distance.');
  const angle = input.launchAngleDeg ?? preset.launchAngleDeg;
  if (!Number.isFinite(angle) || (preset.id === 'ground' ? angle !== 0 : angle <= 0 || angle >= 90)) {
    throw new RangeError('Use 0° for ground or an airborne launch angle greater than 0° and less than 90°.');
  }
  const heightScale = distance * Math.tan(angle * Math.PI / 180);
  if (!Number.isFinite(heightScale)) throw new RangeError('Flight elevation must be finite.');
  const existing = project.timeline.tracks.find(track => track.targetId === 'ball');
  const framesByTime = new Map(existing?.keyframes.map(frame => [frame.timeMs, frame]));
  const times = new Set<number>();
  const intervals = Math.min(32, endMs - startMs);
  for (let index = 0; index <= intervals; index += 1) {
    times.add(Math.round(startMs + (endMs - startMs) * index / intervals));
  }
  for (const frame of existing?.keyframes ?? []) times.add(frame.timeMs);
  if (times.size > MAX_KEYFRAMES_PER_TRACK) throw new RangeError('Flight exceeds the ball track keyframe session limit.');
  const ids = new Set(existing?.keyframes.map(frame => frame.id));
  const keyframes = [...times].sort((left, right) => left - right).map((timeMs): TacticalKeyframe => {
    const frame = framesByTime.get(timeMs);
    if (timeMs < startMs || timeMs > endMs) return frame!;
    let id = frame?.id ?? `ball-flight-${timeMs}`;
    if (!frame) {
      while (ids.has(id)) id += '-next';
      ids.add(id);
    }
    const u = (timeMs - startMs) / (endMs - startMs);
    // Equal-height, no-drag authoring geometry; timing is chosen by the coach.
    return {
      ...frame,
      id,
      timeMs,
      position: {
        x: input.start.x + (input.end.x - input.start.x) * u,
        y: input.start.y + (input.end.y - input.start.y) * u,
      },
      elevationMeters: heightScale * u * (1 - u),
      interpolation: 'linear',
      motionPath: undefined,
      bezier: undefined,
    };
  });
  let trackId = 'ball-flight';
  while (project.timeline.tracks.some(track => track.id === trackId)) trackId += '-next';
  return {
    ...project,
    timeline: existing
      ? { ...project.timeline, tracks: project.timeline.tracks.map(track => track.id === existing.id ? { ...track, keyframes } : track) }
      : addTimelineTrack(project.timeline, { id: trackId, targetId: 'ball', keyframes }),
  };
}

function requireElevationTime(project: TacticalProject, timeMs: number): number {
  if (!Number.isInteger(timeMs) || timeMs < 0) {
    throw new RangeError('Elevation time must be a non-negative integer millisecond value.');
  }
  if (timeMs > project.timeline.durationMs) {
    throw new RangeError('Elevation time cannot exceed timeline duration.');
  }
  return timeMs;
}

function requireElevation(elevationMeters: number): number {
  if (!Number.isFinite(elevationMeters) || elevationMeters < 0) {
    throw new RangeError('Ball elevation must be a non-negative finite metre value.');
  }
  return elevationMeters;
}

function elevationKeyframe(timeMs: number, elevationMeters: number): TacticalKeyframe {
  return {
    id: `ball-elevation-${timeMs}`,
    timeMs,
    elevationMeters,
    interpolation: 'linear',
  };
}

export function authorBallElevationKeyframe(
  project: TacticalProject,
  timeMs: number,
  elevationMeters: number,
): TacticalProject {
  const time = requireElevationTime(project, timeMs);
  const elevation = requireElevation(elevationMeters);
  const existing = project.timeline.tracks.find((track) => track.targetId === 'ball');
  if (!existing) {
    return {
      ...project,
      timeline: addTimelineTrack(project.timeline, {
        id: 'ball-elevation',
        targetId: 'ball',
        keyframes: [elevationKeyframe(time, elevation)],
      }),
    };
  }

  const keyframes = existing.keyframes.some((keyframe) => keyframe.timeMs === time)
    ? existing.keyframes.map((keyframe) => (
        keyframe.timeMs === time ? { ...keyframe, elevationMeters: elevation } : keyframe
      ))
    : addTimelineKeyframe(existing, {
        ...elevationKeyframe(time, elevation),
        id: existing.keyframes.some((keyframe) => keyframe.id === `ball-elevation-${time}`)
          ? `ball-elevation-${time}-next`
          : `ball-elevation-${time}`,
      }).keyframes;

  return {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (
        track.id === existing.id ? { ...track, keyframes } : track
      )),
    },
  };
}

function elevationSpan(track: TimelineTrack | undefined): { start: number; end: number } | null {
  const times = (track?.keyframes ?? [])
    .filter((keyframe) => keyframe.elevationMeters !== undefined)
    .map((keyframe) => keyframe.timeMs)
    .sort((left, right) => left - right);
  if (!times.length) return null;
  return { start: times[0]!, end: times[times.length - 1]! };
}

export function sampleBallElevationTrajectory(
  project: TacticalProject,
  stepMs: number,
): ElevationSample[] {
  if (!Number.isInteger(stepMs) || stepMs <= 0) {
    throw new RangeError('Elevation sample step must be a positive integer millisecond value.');
  }
  const span = elevationSpan(project.timeline.tracks.find((track) => track.targetId === 'ball'));
  if (!span) return [];
  const times: number[] = [];
  for (let time = span.start; time < span.end; time += stepMs) times.push(time);
  if (times[times.length - 1] !== span.end) times.push(span.end);
  if (times.length > MAX_GENERATED_TIME_SAMPLES) {
    throw new RangeError(`Elevation trajectory exceeds the ${MAX_GENERATED_TIME_SAMPLES} sample session limit.`);
  }
  return times.map((timeMs) => {
    const sampled = sampleTacticalProjectAtTime(project, timeMs);
    return {
      timeMs,
      elevationMeters: sampled.ball.elevationMeters,
      position: sampled.ball.position,
    };
  });
}
