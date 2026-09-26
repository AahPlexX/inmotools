import { createNormalizedPoint, metersToNormalized, normalizedToMeters } from './pitch-engine';
import { sampleTimelineTrack } from './timeline-engine';
import type { NormalizedPoint, PitchDimensions, TimelineTrack } from './tactics-types';

const EPSILON = 1e-9;

interface MeterPoint {
  xMeters: number;
  yMeters: number;
}

export interface AnalysisSite {
  id: string;
  position: NormalizedPoint;
}

export interface VoronoiCell {
  targetId: string;
  polygon: NormalizedPoint[];
  areaSquareMeters: number;
}

export interface ConvexTeamGeometry {
  hull: NormalizedPoint[];
  centroid: NormalizedPoint;
  widthMeters: number;
  depthMeters: number;
  areaSquareMeters: number;
  perimeterMeters: number;
}

export interface PassingLaneDefender {
  id: string;
  position: NormalizedPoint;
}

export interface PassingLaneClearance {
  nearestDefenderId: string | null;
  nearestCenterDistanceMeters: number;
  minimumClearanceMeters: number;
  blocked: boolean;
}

export interface VisionSector {
  center: NormalizedPoint;
  points: NormalizedPoint[];
  rotationDeg: number;
  angleDeg: number;
  rangeMeters: number;
}

export interface PositionalGrid {
  columns: number;
  rows: number;
  vertical: number[];
  horizontal: number[];
}

export interface DistanceRing {
  center: NormalizedPoint;
  radiusXMeters: number;
  radiusYMeters: number;
  radiusXNormalized: number;
  radiusYNormalized: number;
}

export interface TacticalTether {
  from: NormalizedPoint;
  to: NormalizedPoint;
  distanceMeters: number;
}

export interface TrajectorySample {
  timeMs: number;
  position: NormalizedPoint;
}

export interface OccupancyHeatCell {
  column: number;
  row: number;
  count: number;
  intensity: number;
}

export interface OccupancyHeatMap {
  columns: number;
  rows: number;
  totalSamples: number;
  cells: OccupancyHeatCell[];
}

export type TrajectorySource = 'authored' | 'imported';

export interface TrajectoryMetrics {
  source: TrajectorySource;
  distanceMeters: number;
  durationMs: number;
  averageSpeedMetersPerSecond: number;
  maxSegmentSpeedMetersPerSecond: number;
}

function requirePitch(pitch: PitchDimensions): PitchDimensions {
  if (!Number.isFinite(pitch.lengthMeters) || pitch.lengthMeters <= 0) {
    throw new RangeError('Pitch length must be a positive finite number.');
  }
  if (!Number.isFinite(pitch.widthMeters) || pitch.widthMeters <= 0) {
    throw new RangeError('Pitch width must be a positive finite number.');
  }
  return pitch;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
  return value;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return value;
}

function meterDistance(left: MeterPoint, right: MeterPoint): number {
  return Math.hypot(right.xMeters - left.xMeters, right.yMeters - left.yMeters);
}

function polygonAreaMeters(points: MeterPoint[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.xMeters * next.yMeters - next.xMeters * current.yMeters;
  }
  return Math.abs(twiceArea) / 2;
}

function clipHalfPlane(
  polygon: MeterPoint[],
  a: number,
  b: number,
  c: number,
): MeterPoint[] {
  if (!polygon.length) return [];
  const inside = (point: MeterPoint) => a * point.xMeters + b * point.yMeters <= c + EPSILON;
  const result: MeterPoint[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const startInside = inside(start);
    const endInside = inside(end);

    if (startInside && endInside) {
      result.push({ ...end });
      continue;
    }

    const denominator = a * (end.xMeters - start.xMeters) + b * (end.yMeters - start.yMeters);
    const intersection = () => {
      if (Math.abs(denominator) <= EPSILON) return { ...start };
      const t = (c - a * start.xMeters - b * start.yMeters) / denominator;
      return {
        xMeters: start.xMeters + (end.xMeters - start.xMeters) * t,
        yMeters: start.yMeters + (end.yMeters - start.yMeters) * t,
      };
    };

    if (startInside && !endInside) result.push(intersection());
    if (!startInside && endInside) {
      result.push(intersection());
      result.push({ ...end });
    }
  }
  return result;
}

export function computeEuclideanVoronoi(
  sites: AnalysisSite[],
  pitchInput: PitchDimensions,
): VoronoiCell[] {
  const pitch = requirePitch(pitchInput);
  const normalizedSites = sites.map((site) => ({
    id: site.id.trim(),
    position: createNormalizedPoint(site.position.x, site.position.y),
  }));
  if (normalizedSites.some((site) => !site.id)) throw new Error('Voronoi site id is required.');
  if (new Set(normalizedSites.map((site) => site.id)).size !== normalizedSites.length) {
    throw new Error('Voronoi site ids must be unique.');
  }

  const meterSites = normalizedSites.map((site) => ({
    ...site,
    meter: normalizedToMeters(site.position, pitch),
  }));

  return meterSites.map((site) => {
    let polygon: MeterPoint[] = [
      { xMeters: 0, yMeters: 0 },
      { xMeters: pitch.lengthMeters, yMeters: 0 },
      { xMeters: pitch.lengthMeters, yMeters: pitch.widthMeters },
      { xMeters: 0, yMeters: pitch.widthMeters },
    ];

    for (const other of meterSites) {
      if (other.id === site.id) continue;
      const dx = other.meter.xMeters - site.meter.xMeters;
      const dy = other.meter.yMeters - site.meter.yMeters;
      if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) {
        if (site.id.localeCompare(other.id) > 0) {
          polygon = [];
          break;
        }
        continue;
      }

      const a = 2 * dx;
      const b = 2 * dy;
      const c = other.meter.xMeters ** 2
        + other.meter.yMeters ** 2
        - site.meter.xMeters ** 2
        - site.meter.yMeters ** 2;
      polygon = clipHalfPlane(polygon, a, b, c);
      if (!polygon.length) break;
    }

    return {
      targetId: site.id,
      polygon: polygon.map((point) => metersToNormalized(point, pitch)),
      areaSquareMeters: polygonAreaMeters(polygon),
    };
  });
}

function cross(origin: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: NormalizedPoint[]): NormalizedPoint[] {
  const unique = [...new Map(
    points.map((point) => {
      const normalized = createNormalizedPoint(point.x, point.y);
      return [`${normalized.x}:${normalized.y}`, normalized] as const;
    }),
  ).values()].sort((left, right) => left.x - right.x || left.y - right.y);

  if (unique.length <= 1) return unique.map((point) => ({ ...point }));

  const lower: NormalizedPoint[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: NormalizedPoint[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper].map((point) => ({ ...point }));
}

function polygonCentroid(points: NormalizedPoint[]): NormalizedPoint {
  if (!points.length) return createNormalizedPoint(0.5, 0.5);
  if (points.length < 3) {
    return createNormalizedPoint(
      points.reduce((sum, point) => sum + point.x, 0) / points.length,
      points.reduce((sum, point) => sum + point.y, 0) / points.length,
    );
  }

  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const factor = current.x * next.y - next.x * current.y;
    twiceArea += factor;
    x += (current.x + next.x) * factor;
    y += (current.y + next.y) * factor;
  }
  if (Math.abs(twiceArea) <= EPSILON) {
    return createNormalizedPoint(
      points.reduce((sum, point) => sum + point.x, 0) / points.length,
      points.reduce((sum, point) => sum + point.y, 0) / points.length,
    );
  }
  return createNormalizedPoint(x / (3 * twiceArea), y / (3 * twiceArea));
}

export function computeConvexTeamGeometry(
  points: NormalizedPoint[],
  pitchInput: PitchDimensions,
): ConvexTeamGeometry {
  if (!points.length) throw new Error('Team geometry requires at least one point.');
  const pitch = requirePitch(pitchInput);
  const hull = convexHull(points);
  const meterHull = hull.map((point) => normalizedToMeters(point, pitch));
  const xs = points.map((point) => createNormalizedPoint(point.x, point.y).x);
  const ys = points.map((point) => createNormalizedPoint(point.x, point.y).y);
  let perimeterMeters = 0;
  if (meterHull.length === 2) perimeterMeters = 2 * meterDistance(meterHull[0]!, meterHull[1]!);
  if (meterHull.length > 2) {
    for (let index = 0; index < meterHull.length; index += 1) {
      perimeterMeters += meterDistance(meterHull[index]!, meterHull[(index + 1) % meterHull.length]!);
    }
  }

  return {
    hull,
    centroid: polygonCentroid(hull),
    widthMeters: (Math.max(...ys) - Math.min(...ys)) * pitch.widthMeters,
    depthMeters: (Math.max(...xs) - Math.min(...xs)) * pitch.lengthMeters,
    areaSquareMeters: polygonAreaMeters(meterHull),
    perimeterMeters,
  };
}

function pointToSegmentDistance(point: MeterPoint, start: MeterPoint, end: MeterPoint): number {
  const dx = end.xMeters - start.xMeters;
  const dy = end.yMeters - start.yMeters;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return meterDistance(point, start);
  const projection = Math.max(0, Math.min(1,
    ((point.xMeters - start.xMeters) * dx + (point.yMeters - start.yMeters) * dy) / lengthSquared,
  ));
  return meterDistance(point, {
    xMeters: start.xMeters + dx * projection,
    yMeters: start.yMeters + dy * projection,
  });
}

export function measurePassingLaneClearance(
  from: NormalizedPoint,
  to: NormalizedPoint,
  defenders: PassingLaneDefender[],
  pitchInput: PitchDimensions,
  defenderRadiusMeters: number,
): PassingLaneClearance {
  const pitch = requirePitch(pitchInput);
  const radius = requirePositive(defenderRadiusMeters, 'Defender radius');
  const start = normalizedToMeters(from, pitch);
  const end = normalizedToMeters(to, pitch);
  if (!defenders.length) {
    return {
      nearestDefenderId: null,
      nearestCenterDistanceMeters: Number.POSITIVE_INFINITY,
      minimumClearanceMeters: Number.POSITIVE_INFINITY,
      blocked: false,
    };
  }

  let nearestDefenderId: string | null = null;
  let nearestCenterDistanceMeters = Number.POSITIVE_INFINITY;
  for (const defender of defenders) {
    const id = defender.id.trim();
    if (!id) throw new Error('Defender id is required.');
    const distance = pointToSegmentDistance(normalizedToMeters(defender.position, pitch), start, end);
    if (distance < nearestCenterDistanceMeters) {
      nearestCenterDistanceMeters = distance;
      nearestDefenderId = id;
    }
  }
  const minimumClearanceMeters = nearestCenterDistanceMeters - radius;
  return {
    nearestDefenderId,
    nearestCenterDistanceMeters,
    minimumClearanceMeters,
    blocked: minimumClearanceMeters <= 0,
  };
}

export function createVisionSector(
  centerInput: NormalizedPoint,
  rotationDeg: number,
  angleDeg: number,
  rangeMeters: number,
  pitchInput: PitchDimensions,
): VisionSector {
  const pitch = requirePitch(pitchInput);
  const center = createNormalizedPoint(centerInput.x, centerInput.y);
  if (!Number.isFinite(rotationDeg)) throw new RangeError('Vision rotation must be finite.');
  if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg > 360) {
    throw new RangeError('Vision angle must be within (0, 360].');
  }
  const range = requirePositive(rangeMeters, 'Vision range');
  const origin = normalizedToMeters(center, pitch);
  const steps = Math.max(4, Math.ceil(angleDeg / 15));
  const startDeg = rotationDeg - angleDeg / 2;
  const points: NormalizedPoint[] = [{ ...center }];

  for (let index = 0; index <= steps; index += 1) {
    const degrees = startDeg + (angleDeg * index) / steps;
    const radians = degrees * Math.PI / 180;
    const meter = {
      xMeters: Math.min(pitch.lengthMeters, Math.max(0, origin.xMeters + Math.cos(radians) * range)),
      yMeters: Math.min(pitch.widthMeters, Math.max(0, origin.yMeters + Math.sin(radians) * range)),
    };
    points.push(metersToNormalized(meter, pitch));
  }

  return { center, points, rotationDeg, angleDeg, rangeMeters: range };
}

export function createPositionalGrid(columns: number, rows: number): PositionalGrid {
  const columnCount = requirePositiveInteger(columns, 'Grid columns');
  const rowCount = requirePositiveInteger(rows, 'Grid rows');
  return {
    columns: columnCount,
    rows: rowCount,
    vertical: Array.from({ length: Math.max(0, columnCount - 1) }, (_, index) => (index + 1) / columnCount),
    horizontal: Array.from({ length: Math.max(0, rowCount - 1) }, (_, index) => (index + 1) / rowCount),
  };
}

export function createDistanceRing(
  centerInput: NormalizedPoint,
  radiusMeters: number,
  pitchInput: PitchDimensions,
): DistanceRing {
  const pitch = requirePitch(pitchInput);
  const center = createNormalizedPoint(centerInput.x, centerInput.y);
  const radius = requirePositive(radiusMeters, 'Ring radius');
  return {
    center,
    radiusXMeters: radius,
    radiusYMeters: radius,
    radiusXNormalized: radius / pitch.lengthMeters,
    radiusYNormalized: radius / pitch.widthMeters,
  };
}

export function measureTether(
  fromInput: NormalizedPoint,
  toInput: NormalizedPoint,
  pitchInput: PitchDimensions,
): TacticalTether {
  const pitch = requirePitch(pitchInput);
  const from = createNormalizedPoint(fromInput.x, fromInput.y);
  const to = createNormalizedPoint(toInput.x, toInput.y);
  return {
    from,
    to,
    distanceMeters: meterDistance(normalizedToMeters(from, pitch), normalizedToMeters(to, pitch)),
  };
}

function requireIntegerTime(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer millisecond value.`);
  return value;
}

export function sampleAuthoredTrajectory(
  track: TimelineTrack,
  startMs: number,
  endMs: number,
  stepMs: number,
): TrajectorySample[] {
  const start = requireIntegerTime(startMs, 'Trajectory start');
  const end = requireIntegerTime(endMs, 'Trajectory end');
  const step = requirePositiveInteger(stepMs, 'Trajectory sample step');
  if (end < start) throw new RangeError('Trajectory end cannot be before start.');

  const times: number[] = [];
  for (let timeMs = start; timeMs <= end; timeMs += step) times.push(timeMs);
  if (times[times.length - 1] !== end) times.push(end);

  return times.flatMap((timeMs) => {
    const position = sampleTimelineTrack(track, timeMs).position;
    return position ? [{ timeMs, position: createNormalizedPoint(position.x, position.y) }] : [];
  });
}

export function buildOccupancyHeatMap(
  samples: TrajectorySample[],
  columns: number,
  rows: number,
): OccupancyHeatMap {
  const columnCount = requirePositiveInteger(columns, 'Heat-map columns');
  const rowCount = requirePositiveInteger(rows, 'Heat-map rows');
  const counts = Array.from({ length: columnCount * rowCount }, () => 0);

  for (const sample of samples) {
    requireIntegerTime(sample.timeMs, 'Trajectory sample time');
    const position = createNormalizedPoint(sample.position.x, sample.position.y);
    const column = Math.min(columnCount - 1, Math.floor(position.x * columnCount));
    const row = Math.min(rowCount - 1, Math.floor(position.y * rowCount));
    counts[row * columnCount + column]! += 1;
  }

  const maxCount = Math.max(0, ...counts);
  return {
    columns: columnCount,
    rows: rowCount,
    totalSamples: samples.length,
    cells: counts.map((count, index) => ({
      column: index % columnCount,
      row: Math.floor(index / columnCount),
      count,
      intensity: maxCount ? count / maxCount : 0,
    })),
  };
}

export function measureTrajectory(
  samplesInput: TrajectorySample[],
  pitchInput: PitchDimensions,
  source: TrajectorySource,
): TrajectoryMetrics {
  const pitch = requirePitch(pitchInput);
  if (source !== 'authored' && source !== 'imported') throw new Error('Trajectory source must be authored or imported.');
  if (!samplesInput.length) {
    return {
      source,
      distanceMeters: 0,
      durationMs: 0,
      averageSpeedMetersPerSecond: 0,
      maxSegmentSpeedMetersPerSecond: 0,
    };
  }

  const samples = samplesInput.map((sample) => ({
    timeMs: requireIntegerTime(sample.timeMs, 'Trajectory sample time'),
    position: createNormalizedPoint(sample.position.x, sample.position.y),
  })).sort((left, right) => left.timeMs - right.timeMs);

  let distanceMeters = 0;
  let maxSegmentSpeedMetersPerSecond = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const elapsedMs = current.timeMs - previous.timeMs;
    if (elapsedMs <= 0) throw new RangeError('Trajectory sample times must be strictly increasing.');
    const segmentDistance = meterDistance(
      normalizedToMeters(previous.position, pitch),
      normalizedToMeters(current.position, pitch),
    );
    distanceMeters += segmentDistance;
    maxSegmentSpeedMetersPerSecond = Math.max(
      maxSegmentSpeedMetersPerSecond,
      segmentDistance / (elapsedMs / 1000),
    );
  }

  const durationMs = samples[samples.length - 1]!.timeMs - samples[0]!.timeMs;
  return {
    source,
    distanceMeters,
    durationMs,
    averageSpeedMetersPerSecond: durationMs > 0 ? distanceMeters / (durationMs / 1000) : 0,
    maxSegmentSpeedMetersPerSecond,
  };
}
