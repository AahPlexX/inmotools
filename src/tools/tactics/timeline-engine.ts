import type {
  InterpolationKind,
  NormalizedPoint,
  TacticalKeyframe,
  TacticalTimeline,
  TimelineMarker,
  TimelineTrack,
} from './tactics-types';

export interface SampledTimelineState {
  position?: NormalizedPoint;
  rotationDeg?: number;
  visible?: boolean;
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
  const x = interpolateNumber(leftState.position?.x, rightState.position?.x, progress);
  const y = interpolateNumber(leftState.position?.y, rightState.position?.y, progress);
  const rotationDeg = interpolateNumber(leftState.rotationDeg, rightState.rotationDeg, progress);
  return {
    position: x === undefined || y === undefined ? undefined : { x: clampUnit(x), y: clampUnit(y) },
    rotationDeg,
    visible: leftState.visible,
  };
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
