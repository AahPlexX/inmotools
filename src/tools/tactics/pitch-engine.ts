import type {
  NormalizedPoint,
  PitchDimensions,
  PitchRuleProfile,
} from './tactics-types';

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNormalized(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1].`);
  }
}

function canonicalUnit(value: number): number {
  return Number(value.toFixed(12));
}

export function isNormalizedPoint(point: NormalizedPoint): boolean {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1;
}

export function createNormalizedPoint(x: number, y: number): NormalizedPoint {
  assertNormalized(x, 'x');
  assertNormalized(y, 'y');
  return { x: canonicalUnit(x), y: canonicalUnit(y) };
}

export function normalizedToMeters(
  point: NormalizedPoint,
  pitch: PitchDimensions,
): { xMeters: number; yMeters: number } {
  const normalized = createNormalizedPoint(point.x, point.y);
  assertFinitePositive(pitch.lengthMeters, 'Pitch length');
  assertFinitePositive(pitch.widthMeters, 'Pitch width');
  return {
    xMeters: normalized.x * pitch.lengthMeters,
    yMeters: normalized.y * pitch.widthMeters,
  };
}

export function metersToNormalized(
  point: { xMeters: number; yMeters: number },
  pitch: PitchDimensions,
): NormalizedPoint {
  assertFinitePositive(pitch.lengthMeters, 'Pitch length');
  assertFinitePositive(pitch.widthMeters, 'Pitch width');
  return createNormalizedPoint(
    point.xMeters / pitch.lengthMeters,
    point.yMeters / pitch.widthMeters,
  );
}

export function mirrorHorizontal(point: NormalizedPoint): NormalizedPoint {
  const normalized = createNormalizedPoint(point.x, point.y);
  return createNormalizedPoint(1 - normalized.x, normalized.y);
}

export function mirrorVertical(point: NormalizedPoint): NormalizedPoint {
  const normalized = createNormalizedPoint(point.x, point.y);
  return createNormalizedPoint(normalized.x, 1 - normalized.y);
}

export interface SnapOptions {
  gridStep?: number;
  xGuides?: number[];
  yGuides?: number[];
  threshold: number;
}

export interface SnapResult {
  point: NormalizedPoint;
  snappedX: boolean;
  snappedY: boolean;
}

function nearestSnap(
  value: number,
  guides: number[],
  gridStep: number | undefined,
  threshold: number,
): { value: number; snapped: boolean } {
  const candidates = guides.filter((guide) => Number.isFinite(guide) && guide >= 0 && guide <= 1);

  if (gridStep !== undefined) {
    if (!Number.isFinite(gridStep) || gridStep <= 0 || gridStep > 1) {
      throw new RangeError('Grid step must be within (0, 1].');
    }
    candidates.push(Math.min(1, Math.max(0, Math.round(value / gridStep) * gridStep)));
  }

  let nearest = value;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = candidate;
    }
  }

  if (distance <= threshold) {
    return { value: nearest, snapped: true };
  }
  return { value, snapped: false };
}

export function snapNormalizedPoint(point: NormalizedPoint, options: SnapOptions): SnapResult {
  const normalized = createNormalizedPoint(point.x, point.y);
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
    throw new RangeError('Snap threshold must be within [0, 1].');
  }

  const x = nearestSnap(normalized.x, options.xGuides ?? [], options.gridStep, options.threshold);
  const y = nearestSnap(normalized.y, options.yGuides ?? [], options.gridStep, options.threshold);

  return {
    point: createNormalizedPoint(x.value, y.value),
    snappedX: x.snapped,
    snappedY: y.snapped,
  };
}

function trainingProfile(teamSize: number): PitchRuleProfile {
  return {
    id: `training-${teamSize}v${teamSize}`,
    label: `${teamSize}v${teamSize} training format`,
    format: `${teamSize}v${teamSize}`,
    teamSize,
    editable: true,
    provenance: {
      kind: 'tool-default',
      authoritative: false,
      sourceTitle: 'InMo Tools editable training starter',
      sourceDate: '2026-09-21',
      note: 'A neutral editable starter, not a governing-body ruleset.',
    },
  };
}

export const trainingFormatProfiles: PitchRuleProfile[] = [1, 2, 3, 4, 5, 7, 9, 11].map(trainingProfile);
