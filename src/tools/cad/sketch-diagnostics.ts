import type { CadSketch, SketchLineEntity, SketchPointEntity } from './sketch-types';

interface ConnectableEntity {
  entityId: string;
  startPointId: string;
  endPointId: string;
}

export interface SketchProfileDiagnosticsOptions {
  gapTolerance?: number;
  geometryTolerance?: number;
}

export interface SketchClosedRegion {
  entityIds: string[];
}

export interface SketchOpenEndpoint {
  pointId: string;
  x: number;
  y: number;
}

export interface SketchGapDiagnostic {
  pointAId: string;
  pointBId: string;
  distance: number;
}

export interface SketchEntityPairDiagnostic {
  entityAId: string;
  entityBId: string;
}

export interface SketchIntersectionDiagnostic extends SketchEntityPairDiagnostic {
  x: number;
  y: number;
}

export interface SketchProfileDiagnostics {
  closedRegions: SketchClosedRegion[];
  openEndpoints: SketchOpenEndpoint[];
  gaps: SketchGapDiagnostic[];
  duplicates: SketchEntityPairDiagnostic[];
  overlaps: SketchEntityPairDiagnostic[];
  selfIntersections: SketchIntersectionDiagnostic[];
}

interface LineSegment {
  entity: SketchLineEntity;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const DEFAULT_GAP_TOLERANCE = 1e-6;
const DEFAULT_GEOMETRY_TOLERANCE = 1e-9;

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
  return value;
}

function finitePoint(point: SketchPointEntity): SketchPointEntity {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Sketch point '${point.id}' must have finite coordinates.`);
  }
  return point;
}

function pointMap(sketch: CadSketch): Map<string, SketchPointEntity> {
  const points = new Map<string, SketchPointEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (points.has(entity.id)) throw new Error(`Duplicate sketch point '${entity.id}'.`);
    points.set(entity.id, finitePoint(entity));
  }
  return points;
}

function lineSegments(sketch: CadSketch, points: Map<string, SketchPointEntity>): LineSegment[] {
  const result: LineSegment[] = [];
  for (const entity of sketch.entities) {
    if (entity.type !== 'line' || entity.construction) continue;
    const start = points.get(entity.startPointId);
    const end = points.get(entity.endPointId);
    if (!start || !end) throw new Error(`Sketch line '${entity.id}' references missing endpoint geometry.`);
    result.push({ entity, ax: start.x, ay: start.y, bx: end.x, by: end.y });
  }
  return result;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function samePoint(ax: number, ay: number, bx: number, by: number, tolerance: number): boolean {
  return distance(ax, ay, bx, by) <= tolerance;
}

function duplicateSegments(a: LineSegment, b: LineSegment, tolerance: number): boolean {
  const sameDirection = samePoint(a.ax, a.ay, b.ax, b.ay, tolerance)
    && samePoint(a.bx, a.by, b.bx, b.by, tolerance);
  const reverseDirection = samePoint(a.ax, a.ay, b.bx, b.by, tolerance)
    && samePoint(a.bx, a.by, b.ax, b.ay, tolerance);
  return sameDirection || reverseDirection;
}

function collinearOverlapLength(a: LineSegment, b: LineSegment, tolerance: number): number {
  const adx = a.bx - a.ax;
  const ady = a.by - a.ay;
  const bdx = b.bx - b.ax;
  const bdy = b.by - b.ay;
  const aLength = Math.hypot(adx, ady);
  const bLength = Math.hypot(bdx, bdy);
  if (aLength <= tolerance || bLength <= tolerance) return 0;

  const directionCross = Math.abs(cross(adx, ady, bdx, bdy));
  if (directionCross > tolerance * Math.max(1, aLength * bLength)) return 0;
  const offsetCross = Math.abs(cross(adx, ady, b.ax - a.ax, b.ay - a.ay));
  if (offsetCross > tolerance * Math.max(1, aLength)) return 0;

  const ux = adx / aLength;
  const uy = ady / aLength;
  const project = (x: number, y: number) => (x - a.ax) * ux + (y - a.ay) * uy;
  const b0 = project(b.ax, b.ay);
  const b1 = project(b.bx, b.by);
  const lower = Math.max(0, Math.min(b0, b1));
  const upper = Math.min(aLength, Math.max(b0, b1));
  return Math.max(0, upper - lower);
}

function interiorIntersection(
  a: LineSegment,
  b: LineSegment,
  tolerance: number,
): { x: number; y: number } | null {
  const rx = a.bx - a.ax;
  const ry = a.by - a.ay;
  const sx = b.bx - b.ax;
  const sy = b.by - b.ay;
  const denominator = cross(rx, ry, sx, sy);
  const scale = Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy));
  if (Math.abs(denominator) <= tolerance * scale) return null;

  const qpx = b.ax - a.ax;
  const qpy = b.ay - a.ay;
  const t = cross(qpx, qpy, sx, sy) / denominator;
  const u = cross(qpx, qpy, rx, ry) / denominator;
  const parameterTolerance = Math.min(0.25, tolerance);
  if (t <= parameterTolerance || t >= 1 - parameterTolerance || u <= parameterTolerance || u >= 1 - parameterTolerance) {
    return null;
  }
  return { x: a.ax + t * rx, y: a.ay + t * ry };
}

function connectableEntities(sketch: CadSketch, points: Map<string, SketchPointEntity>): ConnectableEntity[] {
  const result: ConnectableEntity[] = [];
  const requirePoint = (pointId: string, entityId: string) => {
    if (!points.has(pointId)) throw new Error(`Sketch entity '${entityId}' references missing endpoint geometry.`);
  };
  for (const entity of sketch.entities) {
    if (entity.construction) continue;
    if (entity.type === 'line' || entity.type === 'arc' || entity.type === 'elliptical-arc') {
      requirePoint(entity.startPointId, entity.id);
      requirePoint(entity.endPointId, entity.id);
      result.push({ entityId: entity.id, startPointId: entity.startPointId, endPointId: entity.endPointId });
    } else if (entity.type === 'spline' && !entity.closed) {
      const first = entity.fitPointIds[0];
      const last = entity.fitPointIds[entity.fitPointIds.length - 1];
      if (first === undefined || last === undefined) {
        throw new Error(`Sketch spline '${entity.id}' requires at least one fit point.`);
      }
      requirePoint(first, entity.id);
      requirePoint(last, entity.id);
      result.push({ entityId: entity.id, startPointId: first, endPointId: last });
    }
  }
  return result;
}

function intrinsicClosedRegions(sketch: CadSketch): SketchClosedRegion[] {
  const regions: SketchClosedRegion[] = [];
  for (const entity of sketch.entities) {
    if (entity.construction) continue;
    if (entity.type === 'circle' || entity.type === 'ellipse' || (entity.type === 'spline' && entity.closed)) {
      regions.push({ entityIds: [entity.id] });
    }
  }
  return regions;
}

function adjacencyForEntities(entities: readonly ConnectableEntity[]): Map<string, ConnectableEntity[]> {
  const adjacency = new Map<string, ConnectableEntity[]>();
  const add = (pointId: string, entity: ConnectableEntity) => {
    const entries = adjacency.get(pointId) ?? [];
    entries.push(entity);
    adjacency.set(pointId, entries);
  };
  for (const entity of entities) {
    add(entity.startPointId, entity);
    add(entity.endPointId, entity);
  }
  return adjacency;
}

function entityComponents(
  entities: readonly ConnectableEntity[],
  adjacency: Map<string, ConnectableEntity[]>,
): ConnectableEntity[][] {
  const visited = new Set<string>();
  const components: ConnectableEntity[][] = [];
  for (const start of entities) {
    if (visited.has(start.entityId)) continue;
    const queue = [start];
    const component: ConnectableEntity[] = [];
    visited.add(start.entityId);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      component.push(current);
      for (const pointId of [current.startPointId, current.endPointId]) {
        for (const neighbor of adjacency.get(pointId) ?? []) {
          if (visited.has(neighbor.entityId)) continue;
          visited.add(neighbor.entityId);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function closedEntityRegion(
  component: readonly ConnectableEntity[],
  adjacency: Map<string, ConnectableEntity[]>,
): SketchClosedRegion | null {
  if (component.length < 3) return null;
  const componentIds = new Set(component.map((entity) => entity.entityId));
  const pointIds = new Set(component.flatMap((entity) => [entity.startPointId, entity.endPointId]));
  for (const pointId of pointIds) {
    const degree = (adjacency.get(pointId) ?? []).filter((entity) => componentIds.has(entity.entityId)).length;
    if (degree !== 2) return null;
  }

  const ordered: string[] = [];
  const used = new Set<string>();
  const first = component[0]!;
  const startPointId = first.startPointId;
  let current = first;
  let pointId = startPointId;

  while (ordered.length < component.length) {
    ordered.push(current.entityId);
    used.add(current.entityId);
    const nextPointId = current.startPointId === pointId ? current.endPointId : current.startPointId;
    if (nextPointId === startPointId) {
      return ordered.length === component.length ? { entityIds: ordered } : null;
    }
    const next = (adjacency.get(nextPointId) ?? []).find(
      (candidate) => componentIds.has(candidate.entityId) && !used.has(candidate.entityId),
    );
    if (!next) return null;
    pointId = nextPointId;
    current = next;
  }
  return null;
}

export function analyzeSketchProfiles(
  sketch: CadSketch,
  options: SketchProfileDiagnosticsOptions = {},
): SketchProfileDiagnostics {
  const gapTolerance = positiveFinite(options.gapTolerance ?? DEFAULT_GAP_TOLERANCE, 'Gap tolerance');
  const geometryTolerance = positiveFinite(
    options.geometryTolerance ?? DEFAULT_GEOMETRY_TOLERANCE,
    'Geometry tolerance',
  );
  const points = pointMap(sketch);
  const lines = lineSegments(sketch, points);
  const entities = connectableEntities(sketch, points);
  const adjacency = adjacencyForEntities(entities);

  const closedRegions: SketchClosedRegion[] = [];
  for (const component of entityComponents(entities, adjacency)) {
    const region = closedEntityRegion(component, adjacency);
    if (region) closedRegions.push(region);
  }
  closedRegions.push(...intrinsicClosedRegions(sketch));

  const openEndpoints: SketchOpenEndpoint[] = [];
  for (const [pointId, incident] of adjacency) {
    if (incident.length !== 1) continue;
    const point = points.get(pointId);
    if (!point) continue;
    openEndpoints.push({ pointId, x: point.x, y: point.y });
  }

  const gaps: SketchGapDiagnostic[] = [];
  for (let left = 0; left < openEndpoints.length; left += 1) {
    for (let right = left + 1; right < openEndpoints.length; right += 1) {
      const a = openEndpoints[left]!;
      const b = openEndpoints[right]!;
      const separation = distance(a.x, a.y, b.x, b.y);
      if (separation > geometryTolerance && separation <= gapTolerance) {
        gaps.push({ pointAId: a.pointId, pointBId: b.pointId, distance: separation });
      }
    }
  }

  const duplicates: SketchEntityPairDiagnostic[] = [];
  const overlaps: SketchEntityPairDiagnostic[] = [];
  const selfIntersections: SketchIntersectionDiagnostic[] = [];
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const a = lines[left]!;
      const b = lines[right]!;
      const pair = { entityAId: a.entity.id, entityBId: b.entity.id };
      if (duplicateSegments(a, b, geometryTolerance)) {
        duplicates.push(pair);
        continue;
      }
      if (collinearOverlapLength(a, b, geometryTolerance) > geometryTolerance) {
        overlaps.push(pair);
        continue;
      }
      const intersection = interiorIntersection(a, b, geometryTolerance);
      if (intersection) selfIntersections.push({ ...pair, ...intersection });
    }
  }

  return { closedRegions, openEndpoints, gaps, duplicates, overlaps, selfIntersections };
}
