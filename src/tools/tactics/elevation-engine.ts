import { MAX_GENERATED_TIME_SAMPLES } from './session-bounds';
import type { NormalizedPoint, TacticalKeyframe, TacticalProject, TimelineTrack } from './tactics-types';
import { addTimelineKeyframe, addTimelineTrack, sampleTacticalProjectAtTime } from './timeline-engine';

export interface ElevationSample {
  timeMs: number;
  elevationMeters: number;
  position: NormalizedPoint;
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
