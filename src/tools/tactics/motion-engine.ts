import type {
  NormalizedPoint,
  TacticalMotionPath,
  TacticalMotionPathKind,
  TimelineTrack,
} from './tactics-types';

function clonePoint(point: NormalizedPoint): NormalizedPoint {
  return { x: point.x, y: point.y };
}

function requireNormalized(point: NormalizedPoint, label: string): NormalizedPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must use finite coordinates.`);
  }
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new RangeError(`${label} must stay inside normalized pitch bounds.`);
  }
  return clonePoint(point);
}

function requiredControlCount(kind: TacticalMotionPathKind): number {
  if (kind === 'linear') return 0;
  if (kind === 'quadratic-bezier') return 1;
  return 2;
}
export function createMotionPath(
  kind: TacticalMotionPathKind,
  controlPoints: NormalizedPoint[],
): TacticalMotionPath {
  const required = requiredControlCount(kind);
  if (controlPoints.length !== required) {
    const words = required === 1 ? 'one control point' : required === 2 ? 'two control points' : 'no control points';
    throw new Error(`${kind} requires ${words}.`);
  }
  return {
    kind,
    controlPoints: controlPoints.map((point, index) => requireNormalized(point, `Motion control ${index + 1}`)),
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

function linearPoint(start: NormalizedPoint, end: NormalizedPoint, progress: number): NormalizedPoint {
  return { x: mix(start.x, end.x, progress), y: mix(start.y, end.y, progress) };
}
export function sampleMotionPath(
  start: NormalizedPoint,
  end: NormalizedPoint,
  path: TacticalMotionPath,
  progress: number,
): NormalizedPoint {
  const from = requireNormalized(start, 'Motion start');
  const to = requireNormalized(end, 'Motion end');
  if (!Number.isFinite(progress)) throw new RangeError('Motion progress must be finite.');
  const t = clampUnit(progress);
  const valid = createMotionPath(path.kind, path.controlPoints);
  if (valid.kind === 'linear') return linearPoint(from, to, t);

  if (valid.kind === 'quadratic-bezier') {
    const control = valid.controlPoints[0]!;
    const inverse = 1 - t;
    return {
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
    };
  }

  const first = valid.controlPoints[0]!;
  const second = valid.controlPoints[1]!;
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * from.x + 3 * inverse ** 2 * t * first.x + 3 * inverse * t ** 2 * second.x + t ** 3 * to.x,
    y: inverse ** 3 * from.y + 3 * inverse ** 2 * t * first.y + 3 * inverse * t ** 2 * second.y + t ** 3 * to.y,
  };
}
export function setKeyframeMotionPath(
  track: TimelineTrack,
  keyframeId: string,
  path: TacticalMotionPath,
): TimelineTrack {
  const ordered = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  const index = ordered.findIndex((keyframe) => keyframe.id === keyframeId);
  if (index < 0) throw new Error(`Keyframe ${keyframeId} does not exist.`);
  if (index === ordered.length - 1) throw new Error(`Keyframe ${keyframeId} has no next keyframe for a motion path.`);
  const validPath = createMotionPath(path.kind, path.controlPoints);
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => keyframe.id === keyframeId
      ? {
          ...keyframe,
          position: keyframe.position ? clonePoint(keyframe.position) : undefined,
          motionPath: {
            kind: validPath.kind,
            controlPoints: validPath.controlPoints.map(clonePoint),
          },
        }
      : {
          ...keyframe,
          position: keyframe.position ? clonePoint(keyframe.position) : undefined,
          motionPath: keyframe.motionPath
            ? { kind: keyframe.motionPath.kind, controlPoints: keyframe.motionPath.controlPoints.map(clonePoint) }
            : undefined,
        }),
  };
}
