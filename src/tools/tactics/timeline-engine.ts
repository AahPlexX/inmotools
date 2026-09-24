import type {
  InterpolationKind,
  NormalizedPoint,
  TacticalKeyframe,
  TacticalTimeline,
  TacticalScene,
  TimelineMarker,
  TimelineTrack,
} from './tactics-types';
import { createMotionPath, sampleMotionPath } from './motion-engine';
import { getPossessionHolderAtTime } from './possession-engine';

export interface SampledTimelineState {
  position?: NormalizedPoint;
  rotationDeg?: number;
  visible?: boolean;
  attachmentTargetId?: string | null;
}

export interface TimelineVisibilitySpan {
  startMs: number;
  endMs: number;
  visible: boolean;
}

function requireIntegerTime(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer millisecond value.`);
  if (value < 0) throw new RangeError(`${label} cannot be negative.`);
  return value;
}
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function validatePoint(point: NormalizedPoint, label: string): NormalizedPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError(`${label} must use finite coordinates.`);
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) throw new RangeError(`${label} must stay inside normalized pitch bounds.`);
  return { x: point.x, y: point.y };
}

function cloneKeyframe(keyframe: TacticalKeyframe): TacticalKeyframe {
  return {
    ...keyframe,
    position: keyframe.position ? { ...keyframe.position } : undefined,
    bezier: keyframe.bezier ? [...keyframe.bezier] as [number, number, number, number] : undefined,
    motionPath: keyframe.motionPath
      ? { kind: keyframe.motionPath.kind, controlPoints: keyframe.motionPath.controlPoints.map((point) => ({ ...point })) }
      : undefined,
  };
}

function sortedKeyframes(track: TimelineTrack): TacticalKeyframe[] {
  return track.keyframes.map(cloneKeyframe).sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
}
function validateKeyframe(keyframe: TacticalKeyframe): TacticalKeyframe {
  requireIntegerTime(keyframe.timeMs, 'Keyframe time');
  if (keyframe.position) validatePoint(keyframe.position, 'Keyframe position');
  if (keyframe.rotationDeg !== undefined && !Number.isFinite(keyframe.rotationDeg)) throw new RangeError('Keyframe rotation must be finite.');
  if (keyframe.interpolation === 'cubic-bezier') {
    if (!keyframe.bezier) throw new Error('Cubic-bezier keyframes require four control values.');
    const [x1, y1, x2, y2] = keyframe.bezier;
    if (![x1, y1, x2, y2].every(Number.isFinite)) throw new RangeError('Cubic-bezier controls must be finite.');
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new RangeError('Cubic-bezier x controls must stay between 0 and 1.');
  }
  if (keyframe.motionPath) createMotionPath(keyframe.motionPath.kind, keyframe.motionPath.controlPoints);
  return cloneKeyframe(keyframe);
}

export function addTimelineKeyframe(track: TimelineTrack, keyframe: TacticalKeyframe): TimelineTrack {
  const next = validateKeyframe(keyframe);
  if (track.keyframes.some((item) => item.id === next.id)) throw new Error(`Keyframe id ${next.id} already exists.`);
  if (track.keyframes.some((item) => item.timeMs === next.timeMs)) throw new Error(`A keyframe already exists at time ${next.timeMs}.`);
  return { ...track, keyframes: [...track.keyframes.map(cloneKeyframe), next].sort((a, b) => a.timeMs - b.timeMs) };
}

function cubicCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

function cubicBezierProgress(progress: number, values: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = values;
  let low = 0;
  let high = 1;
  let parameter = progress;
  for (let index = 0; index < 30; index += 1) {
    parameter = (low + high) / 2;
    const x = cubicCoordinate(parameter, x1, x2);
    if (x < progress) low = parameter;
    else high = parameter;
  }
  return clampUnit(cubicCoordinate(parameter, y1, y2));
}
function easedProgress(kind: InterpolationKind, progress: number, bezier?: [number, number, number, number]): number {
  const t = clampUnit(progress);
  if (kind === 'hold') return 0;
  if (kind === 'linear') return t;
  if (kind === 'smooth') return t * t * (3 - 2 * t);
  if (kind === 'ease-in') return t * t;
  if (kind === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (kind === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  if (kind === 'cubic-bezier') {
    if (!bezier) throw new Error('Cubic-bezier interpolation requires control values.');
    return cubicBezierProgress(t, bezier);
  }
  return t;
}

function inheritedState(keyframes: TacticalKeyframe[], index: number): SampledTimelineState {
  const state: SampledTimelineState = {};
  for (let cursor = 0; cursor <= index; cursor += 1) {
    const keyframe = keyframes[cursor]!;
    if (keyframe.position) state.position = { ...keyframe.position };
    if (keyframe.rotationDeg !== undefined) state.rotationDeg = keyframe.rotationDeg;
    if (keyframe.visible !== undefined) state.visible = keyframe.visible;
  }
  return state;
}

function interpolateNumber(left: number | undefined, right: number | undefined, progress: number): number | undefined {
  if (left === undefined) return undefined;
  if (right === undefined) return left;
  return left + (right - left) * progress;
}

export function sampleTimelineTrack(track: TimelineTrack, timeMs: number): SampledTimelineState {
  requireIntegerTime(timeMs, 'Sample time');
  const keyframes = sortedKeyframes(track);
  if (!keyframes.length) return {};
  if (timeMs <= keyframes[0]!.timeMs) return inheritedState(keyframes, 0);
  const lastIndex = keyframes.length - 1;
  if (timeMs >= keyframes[lastIndex]!.timeMs) return inheritedState(keyframes, lastIndex);
  let leftIndex = 0;
  for (let index = 0; index < lastIndex; index += 1) {
    if (keyframes[index]!.timeMs <= timeMs && timeMs < keyframes[index + 1]!.timeMs) {
      leftIndex = index;
      break;
    }
  }
  const rightIndex = leftIndex + 1;
  const leftKeyframe = keyframes[leftIndex]!;
  const rightKeyframe = keyframes[rightIndex]!;
  if (timeMs === leftKeyframe.timeMs) return inheritedState(keyframes, leftIndex);
  const leftState = inheritedState(keyframes, leftIndex);
  const rightState = inheritedState(keyframes, rightIndex);
  const rawProgress = (timeMs - leftKeyframe.timeMs) / (rightKeyframe.timeMs - leftKeyframe.timeMs);
  const progress = easedProgress(leftKeyframe.interpolation, rawProgress, leftKeyframe.bezier);
  let position: NormalizedPoint | undefined;
  if (leftState.position && rightState.position) {
    position = leftKeyframe.motionPath
      ? sampleMotionPath(leftState.position, rightState.position, leftKeyframe.motionPath, progress)
      : {
          x: clampUnit(interpolateNumber(leftState.position.x, rightState.position.x, progress)!),
          y: clampUnit(interpolateNumber(leftState.position.y, rightState.position.y, progress)!),
        };
  }
  const rotationDeg = interpolateNumber(leftState.rotationDeg, rightState.rotationDeg, progress);
  return { position, rotationDeg, visible: leftState.visible };
}

export function offsetTimelineTrack(track: TimelineTrack, deltaMs: number): TimelineTrack {
  if (!Number.isInteger(deltaMs)) throw new RangeError('Timeline offset must be an integer millisecond value.');
  const keyframes = track.keyframes.map((keyframe) => {
    const timeMs = keyframe.timeMs + deltaMs;
    if (timeMs < 0) throw new RangeError('Timeline offset cannot create negative project time.');
    return { ...cloneKeyframe(keyframe), timeMs };
  });
  return { ...track, keyframes };
}
export function offsetTimelineGroup(
  timeline: TacticalTimeline,
  targetIds: string[],
  baseOffsetMs: number,
  staggerStepMs = 0,
): TacticalTimeline {
  if (!Number.isInteger(baseOffsetMs) || !Number.isInteger(staggerStepMs)) {
    throw new RangeError('Group timing offsets must use integer millisecond values.');
  }
  const targets = targetIds.map((targetId) => targetId.trim()).filter(Boolean);
  if (!targets.length) throw new Error('Select at least one timeline target for grouped timing.');
  if (new Set(targets).size !== targets.length) {
    throw new Error('Grouped timing cannot contain duplicate targets.');
  }

  const byTarget = new Map(timeline.tracks.map((track) => [track.targetId, track] as const));
  const shiftedById = new Map<string, TimelineTrack>();
  targets.forEach((targetId, index) => {
    const track = byTarget.get(targetId);
    if (!track) throw new Error(`Timeline target ${targetId} does not exist.`);
    const shifted = offsetTimelineTrack(track, baseOffsetMs + staggerStepMs * index);
    if (shifted.keyframes.some((keyframe) => keyframe.timeMs > timeline.durationMs)) {
      throw new RangeError(`Grouped timing for ${targetId} exceeds timeline duration.`);
    }
    shiftedById.set(track.id, shifted);
  });

  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => shiftedById.get(track.id) ?? {
      ...track,
      keyframes: track.keyframes.map(cloneKeyframe),
    }),
    markers: timeline.markers.map(cloneMarker),
    possessionEvents: timeline.possessionEvents?.map((event) => ({ ...event })),
  };
}
export function getVisibilitySpans(
  track: TimelineTrack,
  durationMs: number,
  defaultVisible = true,
): TimelineVisibilitySpan[] {
  requireIntegerTime(durationMs, 'Timeline duration');
  if (durationMs === 0) return [];
  const changes = sortedKeyframes(track)
    .filter((keyframe) => keyframe.visible !== undefined && keyframe.timeMs <= durationMs)
    .map((keyframe) => ({ timeMs: keyframe.timeMs, visible: keyframe.visible! }));
  let visible = defaultVisible;
  let startMs = 0;
  const spans: TimelineVisibilitySpan[] = [];
  for (const change of changes) {
    if (change.timeMs === 0) {
      visible = change.visible;
      continue;
    }
    if (change.visible === visible) continue;
    spans.push({ startMs, endMs: change.timeMs, visible });
    startMs = change.timeMs;
    visible = change.visible;
  }
  if (startMs < durationMs) spans.push({ startMs, endMs: durationMs, visible });
  return spans;
}

function cloneMarker(marker: TimelineMarker): TimelineMarker {
  return { ...marker };
}

export function addTimelineMarker(timeline: TacticalTimeline, marker: TimelineMarker): TacticalTimeline {
  requireIntegerTime(marker.timeMs, 'Marker time');
  if (marker.timeMs > timeline.durationMs) throw new RangeError('Marker time cannot exceed timeline duration.');
  if (timeline.markers.some((item) => item.id === marker.id)) throw new Error(`Marker id ${marker.id} already exists.`);
  const next = cloneMarker(marker);
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({ ...track, keyframes: track.keyframes.map(cloneKeyframe) })),
    markers: [...timeline.markers.map(cloneMarker), next].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)),
  };
}

function validateTrack(track: TimelineTrack): TimelineTrack {
  const id = track.id.trim();
  const targetId = track.targetId.trim();
  if (!id) throw new Error('Timeline track id is required.');
  if (!targetId) throw new Error('Timeline track target id is required.');
  const ids = new Set<string>();
  const times = new Set<number>();
  const keyframes = sortedKeyframes(track).map((keyframe) => {
    const next = validateKeyframe(keyframe);
    if (ids.has(next.id)) throw new Error(`Keyframe id ${next.id} already exists in track ${id}.`);
    if (times.has(next.timeMs)) throw new Error(`Track ${id} has more than one keyframe at time ${next.timeMs}.`);
    ids.add(next.id);
    times.add(next.timeMs);
    return next;
  });
  return { ...track, id, targetId, keyframes };
}

export function addTimelineTrack(timeline: TacticalTimeline, track: TimelineTrack): TacticalTimeline {
  const next = validateTrack(track);
  if (timeline.tracks.some((item) => item.id === next.id)) throw new Error(`Timeline track id ${next.id} already exists.`);
  if (timeline.tracks.some((item) => item.targetId === next.targetId)) throw new Error(`Timeline target ${next.targetId} already has a track.`);
  return {
    ...timeline,
    tracks: [...timeline.tracks.map(validateTrack), next],
    markers: timeline.markers.map(cloneMarker),
  };
}

export function sampleTacticalTimeline(
  timeline: TacticalTimeline,
  timeMs: number,
): Record<string, SampledTimelineState> {
  requireIntegerTime(timeMs, 'Sample time');
  const result: Record<string, SampledTimelineState> = {};
  for (const track of timeline.tracks) {
    const valid = validateTrack(track);
    if (result[valid.targetId]) throw new Error(`Timeline target ${valid.targetId} has multiple tracks.`);
    result[valid.targetId] = sampleTimelineTrack(valid, timeMs);
  }
  if ((timeline.possessionEvents?.length ?? 0) > 0) {
    const holderTargetId = getPossessionHolderAtTime(timeline, timeMs);
    const ballState = result.ball ?? {};
    ballState.attachmentTargetId = holderTargetId;
    if (holderTargetId) {
      const holder = result[holderTargetId];
      if (!holder?.position) throw new Error(`Possession holder target ${holderTargetId} has no sampled position.`);
      ballState.position = { ...holder.position };
    }
    result.ball = ballState;
  }
  return result;
}

export function setTimelinePlayhead(timeline: TacticalTimeline, timeMs: number): TacticalTimeline {
  requireIntegerTime(timeMs, 'Playhead time');
  requireIntegerTime(timeline.durationMs, 'Timeline duration');
  let playheadMs = Math.min(timeMs, timeline.durationMs);
  if (timeline.loop) playheadMs = timeline.durationMs === 0 ? 0 : timeMs % timeline.durationMs;
  return { ...timeline, playheadMs };
}

export function addTimelineScene(
  scenes: TacticalScene[],
  rawScene: TacticalScene,
): TacticalScene[] {
  const id = rawScene.id.trim();
  const name = rawScene.name.trim();
  if (!id) throw new Error('Scene id is required.');
  if (!name) throw new Error('Scene name is required.');
  requireIntegerTime(rawScene.startMs, `Scene ${id} start`);
  requireIntegerTime(rawScene.durationMs, `Scene ${id} duration`);
  if (scenes.some((scene) => scene.id === id)) {
    throw new Error(`Scene id ${id} already exists.`);
  }
  const clone = (scene: TacticalScene): TacticalScene => ({
    ...scene,
    layers: scene.layers.map((layer) => ({ ...layer })),
    objects: scene.objects.map((object) => ({
      ...object,
      position: { ...object.position },
    })),
  });
  const next = clone({ ...rawScene, id, name });
  return [...scenes.map(clone), next]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
}
export function activeScenesAtTime(scenes: TacticalScene[], timeMs: number): TacticalScene[] {
  requireIntegerTime(timeMs, 'Scene sample time');
  return scenes
    .map((scene) => {
      requireIntegerTime(scene.startMs, `Scene ${scene.id} start`);
      requireIntegerTime(scene.durationMs, `Scene ${scene.id} duration`);
      return scene;
    })
    .filter((scene) => scene.durationMs === 0
      ? timeMs === scene.startMs
      : timeMs >= scene.startMs && timeMs < scene.startMs + scene.durationMs)
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
}

export function validateTacticalTimeline(timeline: TacticalTimeline): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(timeline.durationMs) || timeline.durationMs < 0) {
    errors.push('Timeline duration must be a non-negative integer number of milliseconds.');
  }
  if (!Number.isInteger(timeline.playheadMs) || timeline.playheadMs < 0) {
    errors.push('Timeline playhead must be a non-negative integer number of milliseconds.');
  } else if (Number.isInteger(timeline.durationMs) && timeline.durationMs >= 0 && timeline.playheadMs > timeline.durationMs) {
    errors.push(`Timeline playhead ${timeline.playheadMs} exceeds duration ${timeline.durationMs}.`);
  }
  if (!Number.isFinite(timeline.playbackRate) || timeline.playbackRate <= 0) {
    errors.push('Timeline playback rate must be a positive finite number.');
  }

  const trackIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const track of timeline.tracks) {
    if (trackIds.has(track.id)) errors.push(`Timeline track id ${track.id} is duplicated.`);
    if (targetIds.has(track.targetId)) errors.push(`Timeline target ${track.targetId} has multiple tracks.`);
    trackIds.add(track.id);
    targetIds.add(track.targetId);
    try {
      const valid = validateTrack(track);
      if (Number.isInteger(timeline.durationMs) && timeline.durationMs >= 0) {
        for (const keyframe of valid.keyframes) {
          if (keyframe.timeMs > timeline.durationMs) {
            errors.push(`Keyframe ${keyframe.id} time ${keyframe.timeMs} exceeds timeline duration ${timeline.durationMs}.`);
          }
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid timeline track.');
    }
  }

  const markerIds = new Set<string>();
  for (const marker of timeline.markers) {
    if (markerIds.has(marker.id)) errors.push(`Timeline marker id ${marker.id} is duplicated.`);
    markerIds.add(marker.id);
    if (!Number.isInteger(marker.timeMs) || marker.timeMs < 0) {
      errors.push(`Timeline marker ${marker.id} time must be a non-negative integer millisecond value.`);
    } else if (Number.isInteger(timeline.durationMs) && timeline.durationMs >= 0 && marker.timeMs > timeline.durationMs) {
      errors.push(`Timeline marker ${marker.id} time ${marker.timeMs} exceeds timeline duration ${timeline.durationMs}.`);
    }
  }
  const possessionIds = new Set<string>();
  const possessionTimes = new Set<number>();
  for (const event of timeline.possessionEvents ?? []) {
    if (!event.id.trim()) errors.push('Possession event id is required.');
    if (possessionIds.has(event.id)) errors.push(`Possession event id ${event.id} is duplicated.`);
    if (possessionTimes.has(event.timeMs)) errors.push(`Possession event time ${event.timeMs} is duplicated.`);
    possessionIds.add(event.id);
    possessionTimes.add(event.timeMs);
    if (!Number.isInteger(event.timeMs) || event.timeMs < 0) {
      errors.push(`Possession event ${event.id} time must be a non-negative integer millisecond value.`);
    } else if (Number.isInteger(timeline.durationMs) && timeline.durationMs >= 0 && event.timeMs > timeline.durationMs) {
      errors.push(`Possession event ${event.id} time ${event.timeMs} exceeds timeline duration ${timeline.durationMs}.`);
    }
    if (event.holderTargetId && !targetIds.has(event.holderTargetId)) {
      errors.push(`Possession holder target ${event.holderTargetId} does not exist in the timeline.`);
    }
  }
  return errors;
}
