import type { CadSketch, SketchArcEntity, SketchEntity, SketchLineEntity, SketchSplineEntity } from './sketch-types';
import type { CadKernelVector3 } from './kernel-contract';

export type CadSketchProfileEdge3d =
  | { kind: 'line'; start: CadKernelVector3; end: CadKernelVector3 }
  | { kind: 'arc'; start: CadKernelVector3; mid: CadKernelVector3; end: CadKernelVector3 }
  | { kind: 'circle'; center: CadKernelVector3; normal: CadKernelVector3; radius: number }
  | {
      kind: 'spline';
      points: CadKernelVector3[];
      periodic: boolean;
      startTangent?: CadKernelVector3;
      endTangent?: CadKernelVector3;
    };

export interface CadSketchProfile3d {
  normal: CadKernelVector3;
  edges: CadSketchProfileEdge3d[];
}

export interface CadSketchAxis3d {
  origin: CadKernelVector3;
  direction: CadKernelVector3;
}

interface PlaneFrame {
  normal: CadKernelVector3;
  point(x: number, y: number): CadKernelVector3;
  vector(x: number, y: number): CadKernelVector3;
}

interface TraversableEntity {
  entity: SketchLineEntity | SketchArcEntity | SketchSplineEntity;
  startPointId: string;
  endPointId: string;
}

const TAU = Math.PI * 2;

function originPlaneFrame(sketch: CadSketch): PlaneFrame {
  if (sketch.plane.kind === 'datum') {
    throw new Error(`Sketch '${sketch.label}' datum plane requires a resolved datum transform before exact profile construction.`);
  }
  if (sketch.plane.kind === 'face') {
    throw new Error(`Sketch '${sketch.label}' face plane requires a resolved semantic face transform before exact profile construction.`);
  }

  switch (sketch.plane.plane) {
    case 'XY':
      return {
        normal: [0, 0, 1],
        point: (x, y) => [x, y, 0],
        vector: (x, y) => [x, y, 0],
      };
    case 'XZ':
      return {
        normal: [0, 1, 0],
        point: (x, y) => [x, 0, -y],
        vector: (x, y) => [x, 0, -y],
      };
    case 'YZ':
      return {
        normal: [1, 0, 0],
        point: (x, y) => [0, x, y],
        vector: (x, y) => [0, x, y],
      };
  }
}

function finitePointMap(sketch: CadSketch): Map<string, { x: number; y: number }> {
  const points = new Map<string, { x: number; y: number }>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
      throw new Error(`Sketch point '${entity.id}' must have finite coordinates.`);
    }
    if (points.has(entity.id)) throw new Error(`Sketch contains duplicate point id '${entity.id}'.`);
    points.set(entity.id, { x: entity.x, y: entity.y });
  }
  return points;
}

function pointById(points: ReadonlyMap<string, { x: number; y: number }>, id: string): { x: number; y: number } {
  const point = points.get(id);
  if (!point) throw new Error(`Sketch profile references missing point '${id}'.`);
  return point;
}

function traversable(entity: SketchEntity): TraversableEntity | null {
  switch (entity.type) {
    case 'line':
    case 'arc':
      return { entity, startPointId: entity.startPointId, endPointId: entity.endPointId };
    case 'spline': {
      if (entity.closed) return null;
      const startPointId = entity.fitPointIds[0];
      const endPointId = entity.fitPointIds.at(-1);
      if (!startPointId || !endPointId) throw new Error(`Spline '${entity.id}' requires fit points.`);
      return { entity, startPointId, endPointId };
    }
    default:
      return null;
  }
}

function orderedLoop(entities: readonly SketchEntity[]): Array<{ entity: TraversableEntity['entity']; reversed: boolean }> {
  const traversables = entities.map(traversable);
  if (traversables.some((entry) => entry === null)) {
    throw new Error('Selected profile must be either one intrinsically closed curve or a connected closed profile loop.');
  }
  const edges = traversables as TraversableEntity[];
  if (edges.length < 2) throw new Error('Selected sketch entities do not form a closed profile.');

  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const pointId of [edge.startPointId, edge.endPointId]) {
      const next = adjacency.get(pointId) ?? [];
      next.push(index);
      adjacency.set(pointId, next);
    }
  });
  if ([...adjacency.values()].some((indices) => indices.length !== 2)) {
    throw new Error('Selected sketch entities do not form a closed profile.');
  }

  const ordered: Array<{ entity: TraversableEntity['entity']; reversed: boolean }> = [];
  const used = new Set<number>();
  let edgeIndex = 0;
  let currentPointId = edges[0]!.startPointId;

  while (ordered.length < edges.length) {
    const edge = edges[edgeIndex]!;
    if (used.has(edgeIndex)) throw new Error('Selected sketch entities do not form one closed profile loop.');
    const reversed = edge.endPointId === currentPointId;
    if (!reversed && edge.startPointId !== currentPointId) {
      throw new Error('Selected sketch entities are disconnected.');
    }
    ordered.push({ entity: edge.entity, reversed });
    used.add(edgeIndex);
    currentPointId = reversed ? edge.startPointId : edge.endPointId;
    if (ordered.length === edges.length) break;
    const nextIndex = (adjacency.get(currentPointId) ?? []).find((candidate) => !used.has(candidate));
    if (nextIndex === undefined) throw new Error('Selected sketch entities do not form a closed profile.');
    edgeIndex = nextIndex;
  }

  const first = edges[0]!;
  const initialPointId = ordered[0]!.reversed ? first.endPointId : first.startPointId;
  if (currentPointId !== initialPointId) throw new Error('Selected sketch entities do not form a closed profile.');
  return ordered;
}

function positiveAngle(value: number): number {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function arcMidpoint(
  entity: SketchArcEntity,
  reversed: boolean,
  points: ReadonlyMap<string, { x: number; y: number }>,
): { x: number; y: number } {
  const center = pointById(points, entity.centerPointId);
  const start = pointById(points, reversed ? entity.endPointId : entity.startPointId);
  const end = pointById(points, reversed ? entity.startPointId : entity.endPointId);
  const clockwise = reversed ? !entity.clockwise : entity.clockwise;
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const delta = clockwise
    ? -positiveAngle(startAngle - endAngle)
    : positiveAngle(endAngle - startAngle);
  if (Math.abs(delta) < 1e-12) throw new Error(`Arc '${entity.id}' has coincident angular endpoints.`);
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const angle = startAngle + delta / 2;
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function negate([x, y, z]: CadKernelVector3): CadKernelVector3 {
  return [-x, -y, -z];
}

function curveEdge(
  entity: TraversableEntity['entity'],
  reversed: boolean,
  points: ReadonlyMap<string, { x: number; y: number }>,
  frame: PlaneFrame,
): CadSketchProfileEdge3d {
  if (entity.type === 'line') {
    const start = pointById(points, reversed ? entity.endPointId : entity.startPointId);
    const end = pointById(points, reversed ? entity.startPointId : entity.endPointId);
    return { kind: 'line', start: frame.point(start.x, start.y), end: frame.point(end.x, end.y) };
  }
  if (entity.type === 'arc') {
    const start = pointById(points, reversed ? entity.endPointId : entity.startPointId);
    const end = pointById(points, reversed ? entity.startPointId : entity.endPointId);
    const mid = arcMidpoint(entity, reversed, points);
    return {
      kind: 'arc',
      start: frame.point(start.x, start.y),
      mid: frame.point(mid.x, mid.y),
      end: frame.point(end.x, end.y),
    };
  }

  const fitPoints = (reversed ? [...entity.fitPointIds].reverse() : entity.fitPointIds)
    .map((id) => pointById(points, id))
    .map((point) => frame.point(point.x, point.y));
  const originalStart = entity.startTangent ? frame.vector(entity.startTangent.x, entity.startTangent.y) : undefined;
  const originalEnd = entity.endTangent ? frame.vector(entity.endTangent.x, entity.endTangent.y) : undefined;
  return {
    kind: 'spline',
    points: fitPoints,
    periodic: false,
    ...(reversed && originalEnd ? { startTangent: negate(originalEnd) } : !reversed && originalStart ? { startTangent: originalStart } : {}),
    ...(reversed && originalStart ? { endTangent: negate(originalStart) } : !reversed && originalEnd ? { endTangent: originalEnd } : {}),
  };
}

function intrinsicClosedEdge(
  entity: SketchEntity,
  points: ReadonlyMap<string, { x: number; y: number }>,
  frame: PlaneFrame,
): CadSketchProfileEdge3d | null {
  if (entity.type === 'circle') {
    const center = pointById(points, entity.centerPointId);
    if (!Number.isFinite(entity.radius) || entity.radius <= 0) throw new Error(`Circle '${entity.id}' requires a positive radius.`);
    return { kind: 'circle', center: frame.point(center.x, center.y), normal: frame.normal, radius: entity.radius };
  }
  if (entity.type === 'spline' && entity.closed) {
    return {
      kind: 'spline',
      points: entity.fitPointIds.map((id) => pointById(points, id)).map((point) => frame.point(point.x, point.y)),
      periodic: true,
    };
  }
  if (entity.type === 'ellipse' || entity.type === 'elliptical-arc') {
    throw new Error(`Exact profile construction for '${entity.type}' requires oriented ellipse support and is not implemented yet.`);
  }
  return null;
}

export function buildSketchProfile3d(sketch: CadSketch, profileEntityIds: readonly string[]): CadSketchProfile3d {
  if (profileEntityIds.length === 0) throw new Error('A sketch profile requires at least one selected entity.');
  if (new Set(profileEntityIds).size !== profileEntityIds.length) throw new Error('Sketch profile entity ids must be unique.');

  const frame = originPlaneFrame(sketch);
  const points = finitePointMap(sketch);
  const requested = new Set(profileEntityIds);
  const selected = sketch.entities.filter((entity) => requested.has(entity.id));
  if (selected.length !== requested.size) throw new Error('Sketch profile contains an unknown entity id.');
  if (selected.some((entity) => entity.construction)) throw new Error('Construction geometry cannot be used as profile geometry.');
  if (selected.some((entity) => entity.type === 'point')) throw new Error('Point entities cannot be used as profile edges.');

  if (selected.length === 1) {
    const edge = intrinsicClosedEdge(selected[0]!, points, frame);
    if (!edge) throw new Error('Selected sketch entity does not form a closed profile.');
    return { normal: frame.normal, edges: [edge] };
  }

  const edges = orderedLoop(selected).map(({ entity, reversed }) => curveEdge(entity, reversed, points, frame));
  return { normal: frame.normal, edges };
}

export function resolveSketchAxis3d(sketch: CadSketch, lineId: string): CadSketchAxis3d {
  const frame = originPlaneFrame(sketch);
  const points = finitePointMap(sketch);
  const entity = sketch.entities.find((candidate) => candidate.id === lineId);
  if (!entity || entity.type !== 'line') throw new Error(`Revolve axis '${lineId}' must reference a sketch line.`);
  const start = pointById(points, entity.startPointId);
  const end = pointById(points, entity.endPointId);
  const origin = frame.point(start.x, start.y);
  const end3d = frame.point(end.x, end.y);
  const direction: CadKernelVector3 = [end3d[0] - origin[0], end3d[1] - origin[1], end3d[2] - origin[2]];
  if (Math.hypot(...direction) <= 1e-12) throw new Error(`Revolve axis '${lineId}' must have non-zero length.`);
  return { origin, direction };
}
