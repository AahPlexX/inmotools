import type { CameraState, NormalizedPoint, PitchDimensions } from './tactics-types';

export interface PitchPoint3D {
  x: number;
  y: number;
  z: number;
}

export const CAMERA_PRESET_IDS = ['tactical', 'broadcast', 'touchline', 'goal-line'] as const;
export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

function validatePitch(pitch: PitchDimensions): void {
  if (
    !Number.isFinite(pitch.lengthMeters) || pitch.lengthMeters <= 0
    || !Number.isFinite(pitch.widthMeters) || pitch.widthMeters <= 0
  ) {
    throw new RangeError('3D pitch dimensions must be positive finite metre values.');
  }
}

function validateNormalizedPoint(point: NormalizedPoint): void {
  if (
    !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1
  ) {
    throw new RangeError('3D projection requires normalized [0, 1] pitch coordinates.');
  }
}

export function normalizedPointToPitch3D(
  point: NormalizedPoint,
  pitch: PitchDimensions,
  elevationMeters = 0,
): PitchPoint3D {
  validatePitch(pitch);
  validateNormalizedPoint(point);
  if (!Number.isFinite(elevationMeters) || elevationMeters < 0) {
    throw new RangeError('3D elevation must be a non-negative finite metre value.');
  }
  return {
    x: (point.x - 0.5) * pitch.lengthMeters,
    y: elevationMeters,
    z: (point.y - 0.5) * pitch.widthMeters,
  };
}

export function pitch3DToNormalizedPoint(
  point: Pick<PitchPoint3D, 'x' | 'z'>,
  pitch: PitchDimensions,
): NormalizedPoint {
  validatePitch(pitch);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new RangeError('3D pitch coordinates must be finite.');
  }
  const normalized = {
    x: point.x / pitch.lengthMeters + 0.5,
    y: point.z / pitch.widthMeters + 0.5,
  };
  validateNormalizedPoint(normalized);
  return normalized;
}

function cloneCamera(camera: CameraState): CameraState {
  return {
    ...camera,
    position: { ...camera.position },
    target: { ...camera.target },
  };
}

export function validateCameraState(camera: CameraState): CameraState {
  if (!camera.id.trim()) throw new Error('Camera state id is required.');
  if (!Number.isInteger(camera.timeMs) || camera.timeMs < 0) {
    throw new RangeError('Camera time must be a non-negative integer millisecond value.');
  }
  for (const [label, vector] of [['position', camera.position], ['target', camera.target]] as const) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new RangeError(`Camera ${label} must use finite 3D coordinates.`);
    }
  }
  if (
    !Number.isFinite(camera.fieldOfViewDeg)
    || camera.fieldOfViewDeg < 10
    || camera.fieldOfViewDeg > 120
  ) {
    throw new RangeError('Camera field of view must be between 10 and 120 degrees.');
  }
  return cloneCamera(camera);
}

export function createCameraPresetState(
  preset: CameraPresetId,
  pitch: PitchDimensions,
  timeMs = 0,
): CameraState {
  validatePitch(pitch);
  if (!CAMERA_PRESET_IDS.includes(preset)) throw new Error(`Unknown camera preset: ${String(preset)}.`);
  if (!Number.isInteger(timeMs) || timeMs < 0) {
    throw new RangeError('Camera preset time must be a non-negative integer millisecond value.');
  }
  const span = Math.max(pitch.lengthMeters, pitch.widthMeters);
  const presets: Record<CameraPresetId, Omit<CameraState, 'id' | 'timeMs'>> = {
    tactical: {
      position: { x: 0, y: span * 0.9, z: 0.01 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
    },
    broadcast: {
      position: { x: 0, y: span * 0.32, z: pitch.widthMeters * 0.9 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 42,
    },
    touchline: {
      position: { x: -pitch.lengthMeters * 0.2, y: span * 0.18, z: pitch.widthMeters * 0.72 },
      target: { x: pitch.lengthMeters * 0.08, y: 0, z: 0 },
      fieldOfViewDeg: 48,
    },
    'goal-line': {
      position: { x: -pitch.lengthMeters * 0.62, y: span * 0.16, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 50,
    },
  };
  return validateCameraState({
    id: `camera-${preset}-${timeMs}`,
    timeMs,
    ...presets[preset],
  });
}

function lerp(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

function interpolateCamera(left: CameraState, right: CameraState, timeMs: number): CameraState {
  if (right.timeMs <= left.timeMs) return cloneCamera(right);
  const progress = Math.min(1, Math.max(0, (timeMs - left.timeMs) / (right.timeMs - left.timeMs)));
  return {
    id: left.id,
    timeMs,
    position: {
      x: lerp(left.position.x, right.position.x, progress),
      y: lerp(left.position.y, right.position.y, progress),
      z: lerp(left.position.z, right.position.z, progress),
    },
    target: {
      x: lerp(left.target.x, right.target.x, progress),
      y: lerp(left.target.y, right.target.y, progress),
      z: lerp(left.target.z, right.target.z, progress),
    },
    fieldOfViewDeg: lerp(left.fieldOfViewDeg, right.fieldOfViewDeg, progress),
  };
}

export function sampleCameraState(
  states: CameraState[],
  timeMs: number,
  pitch: PitchDimensions,
): CameraState {
  if (!Number.isInteger(timeMs) || timeMs < 0) {
    throw new RangeError('Camera sample time must be a non-negative integer millisecond value.');
  }
  const sorted = states.map(validateCameraState)
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  if (!sorted.length) return createCameraPresetState('tactical', pitch, timeMs);
  if (timeMs <= sorted[0]!.timeMs) return { ...cloneCamera(sorted[0]!), timeMs };
  const last = sorted.at(-1)!;
  if (timeMs >= last.timeMs) return { ...cloneCamera(last), timeMs };
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index]!;
    const right = sorted[index + 1]!;
    if (left.timeMs <= timeMs && timeMs <= right.timeMs) {
      return interpolateCamera(left, right, timeMs);
    }
  }
  return { ...cloneCamera(last), timeMs };
}

export function upsertCameraState(states: CameraState[], nextInput: CameraState): CameraState[] {
  const next = validateCameraState(nextInput);
  const withoutSameTime = states
    .map(validateCameraState)
    .filter((state) => state.timeMs !== next.timeMs && state.id !== next.id);
  return [...withoutSameTime, next]
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
}
