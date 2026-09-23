import type {
  BallPossessionEvent,
  TacticalTimeline,
} from './tactics-types';

function requireIntegerTime(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer millisecond value.`);
  if (value < 0) throw new RangeError(`${label} cannot be negative.`);
  return value;
}

function cloneEvent(event: BallPossessionEvent): BallPossessionEvent {
  return { ...event };
}

export function addBallPossessionEvent(
  timeline: TacticalTimeline,
  rawEvent: BallPossessionEvent,
): TacticalTimeline {
  const id = rawEvent.id.trim();
  if (!id) throw new Error('Possession event id is required.');
  const timeMs = requireIntegerTime(rawEvent.timeMs, 'Possession event time');
  if (timeMs > timeline.durationMs) throw new RangeError('Possession event time cannot exceed timeline duration.');
  if (!timeline.tracks.some((track) => track.targetId === 'ball')) {
    throw new Error('Ball timeline target does not exist.');
  }
  const events = timeline.possessionEvents ?? [];
  if (events.some((event) => event.id === id)) throw new Error(`Possession event id ${id} already exists.`);
  if (events.some((event) => event.timeMs === timeMs)) throw new Error(`A possession event already exists at time ${timeMs}.`);
  const holderTargetId = rawEvent.holderTargetId?.trim() || null;
  if (holderTargetId && !timeline.tracks.some((track) => track.targetId === holderTargetId)) {
    throw new Error(`Possession holder target ${holderTargetId} does not exist in the timeline.`);
  }
  const next: BallPossessionEvent = { id, timeMs, holderTargetId };
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({ ...track, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })) })),
    markers: timeline.markers.map((marker) => ({ ...marker })),
    possessionEvents: [...events.map(cloneEvent), next]
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
  };
}

export function getPossessionHolderAtTime(
  timeline: TacticalTimeline,
  timeMs: number,
): string | null {
  requireIntegerTime(timeMs, 'Possession sample time');
  let holder: string | null = null;
  for (const event of [...(timeline.possessionEvents ?? [])].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))) {
    if (event.timeMs > timeMs) break;
    holder = event.holderTargetId;
  }
  return holder;
}
