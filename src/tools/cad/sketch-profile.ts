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

export interface CadSketchWire3d {
  edges: CadSketchProfileEdge3d[];
}

export interface CadSketchProfile3d extends CadSketchWire3d {
  normal: CadKernelVector3;
}

export interface CadSketchAxis3d {
  origin: CadKernelVector3;
  direction: CadKernelVector3;
}

export interface CadSketchPlane3d {
  origin: CadKernelVector3;
  normal: CadKernelVector3;
}

export interface PlaneFrame {
  normal: CadKernelVector3;
  point(x: number, y: number): CadKernelVector3;
  vector(x: number, y: number): CadKernelVector3;
}

/** Resolved datum planes, keyed by the producing datum-plane feature's id. */
export type CadDatumPlaneFrames = ReadonlyMap<string, PlaneFrame>;

const EMPTY_DATUM_PLANES: CadDatumPlaneFrames = new Map();

interface TraversableEntity {
  entity: SketchLineEntity | SketchArcEntity | SketchSplineEntity;
  startPointId: string;
  endPointId: string;
}

const TAU = Math.PI * 2;

/** Negating an exact zero produces -0 in JS, which fails strict shape/equality checks downstream. */
function negateComponent(value: number): number {
  return value === 0 ? 0 : -value;
}

function namedOriginFrame(plane: 'XY' | 'XZ' | 'YZ'): PlaneFrame {
  switch (plane) {
    case 'XY':
      return {
        normal: [0, 0, 1],
        point: (x, y) => [x, y, 0],
        vector: (x, y) => [x, y, 0],
      };
    case 'XZ':
      return {
        normal: [0, 1, 0],
        point: (x, y) => [x, 0, negateComponent(y)],
        vector: (x, y) => [x, 0, negateComponent(y)],
      };
    case 'YZ':
      return {
        normal: [1, 0, 0],
        point: (x, y) => [0, x, y],
        vector: (x, y) => [0, x, y],
      };
  }
}

/**
 * Resolves an offset datum plane: parallel to `basePlane`, translated along
 * its normal by `distance`. In-plane axis directions are inherited unchanged
 * from the base plane, since a pure offset cannot rotate them - this is what
 * keeps the "offset" variant unambiguous without picking an arbitrary
 * in-plane rotation. Angle, mid-plane, three-point, tangent, and
 * face-derived datum planes are not yet supported and are rejected rather
 * than approximated.
 */
export function resolveDatumPlaneFrame(basePlane: 'XY' | 'XZ' | 'YZ', distance: number): PlaneFrame {
  if (!Number.isFinite(distance)) throw new Error('Datum plane offset distance must be finite.');
  const base = namedOriginFrame(basePlane);
  const [nx, ny, nz] = base.normal;
  const offset: CadKernelVector3 = [nx * distance, ny * distance, nz * distance];
  return {
    normal: base.normal,
    point: (x, y) => {
      const [px, py, pz] = base.point(x, y);
      return [px + offset[0], py + offset[1], pz + offset[2]];
    },
    vector: base.vector,
  };
}

function originPlaneFrame(sketch: CadSketch, datumPlanes: CadDatumPlaneFrames): PlaneFrame {
  if (sketch.plane.kind === 'datum') {
    const frame = datumPlanes.get(sketch.plane.datumId);
    if (!frame) throw new Error(`Sketch '${sketch.label}' references unresolved datum plane '${sketch.plane.datumId}'.`);
    return frame;
  }
  if (sketch.plane.kind === 'face') {
    throw new Error(`Sketch '${sketch.label}' face plane requires a resolved semantic face transform before exact profile construction.`);
  }
  return namedOriginFrame(sketch.plane.plane);
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

function adjacencyForEdges(edges: readonly TraversableEntity[]): Map<string, number[]> {
  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const pointId of [edge.startPointId, edge.endPointId]) {
      const next = adjacency.get(pointId) ?? [];
      next.push(index);
      adjacency.set(pointId, next);
    }
  });
  return adjacency;
}

function orderConnectedEdges(
  edges: readonly TraversableEntity[],
  startPointId: string,
): Array<{ entity: TraversableEntity['entity']; reversed: boolean }> {
  const adjacency = adjacencyForEdges(edges);
  const ordered: Array<{ entity: TraversableEntity['entity']; reversed: boolean }> = [];
  const used = new Set<number>();
  let currentPointId = startPointId;

  while (ordered.length < edges.length) {
    const nextIndex = (adjacency.get(currentPointId) ?? []).find((candidate) => !used.has(candidate));
    if (nextIndex === undefined) break;
    const edge = edges[nextIndex]!;
    const reversed = edge.endPointId === currentPointId;
    if (!reversed && edge.startPointId !== currentPointId) {
      throw new Error('Selected sketch entities are disconnected.');
    }
    ordered.push({ entity: edge.entity, reversed });
    used.add(nextIndex);
    currentPointId = reversed ? edge.startPointId : edge.endPointId;
  }

  if (used.size !== edges.length) throw new Error('Selected sketch entities must form one connected path.');
  return ordered;
}

function orderedLoop(entities: readonly SketchEntity[]): Array<{ entity: TraversableEntity['entity']; reversed: boolean }> {
  const traversables = entities.map(traversable);
  if (traversables.some((entry) => entry === null)) {
    throw new Error('Selected profile must be either one intrinsically closed curve or a connected closed profile loop.');
  }
  const edges = traversables as TraversableEntity[];
  if (edges.length < 2) throw new Error('Selected sketch entities do not form a closed profile.');

  const adjacency = adjacencyForEdges(edges);
  if ([...adjacency.values()].some((indices) => indices.length !== 2)) {
    throw new Error('Selected sketch entities do not form a closed profile.');
  }

  const startPointId = edges[0]!.startPointId;
  const ordered = orderConnectedEdges(edges, startPointId);
  const final = ordered.at(-1);
  if (!final) throw new Error('Selected sketch entities do not form a closed profile.');
  const finalEntity = traversable(final.entity)!;
  const finalPointId = final.reversed ? finalEntity.startPointId : finalEntity.endPointId;
  if (finalPointId !== startPointId) throw new Error('Selected sketch entities do not form a closed profile.');
  return ordered;
}

function orderedPath(entities: readonly SketchEntity[]): Array<{ entity: TraversableEntity['entity']; reversed: boolean }> {
  const traversables = entities.map(traversable);
  if (traversables.some((entry) => entry === null)) {
    throw new Error('Selected path must contain connected line, arc, or open spline entities.');
  }
  const edges = traversables as TraversableEntity[];
  if (edges.length === 0) throw new Error('A sketch path requires at least one selected curve.');

  const adjacency = adjacencyForEdges(edges);
  if ([...adjacency.values()].some((indices) => indices.length > 2)) {
    throw new Error('Selected sketch path cannot branch.');
  }
  const endpoints = [...adjacency.entries()].filter(([, indices]) => indices.length === 1).map(([pointId]) => pointId);
  if (endpoints.length !== 0 && endpoints.length !== 2) {
    throw new Error('Selected sketch entities must form one connected path.');
  }
  if (endpoints.length === 0) return orderedLoop(entities);
  return orderConnectedEdges(edges, endpoints[0]!);
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

export function negate([x, y, z]: CadKernelVector3): CadKernelVector3 {
  return [negateComponent(x), negateComponent(y), negateComponent(z)];
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

function selectedCurves(sketch: CadSketch, entityIds: readonly string[], label: string): SketchEntity[] {
  if (entityIds.length === 0) throw new Error(`A sketch ${label} requires at least one selected entity.`);
  if (new Set(entityIds).size !== entityIds.length) throw new Error(`Sketch ${label} entity ids must be unique.`);
  const requested = new Set(entityIds);
  const selected = sketch.entities.filter((entity) => requested.has(entity.id));
  if (selected.length !== requested.size) throw new Error(`Sketch ${label} contains an unknown entity id.`);
  if (selected.some((entity) => entity.construction)) throw new Error(`Construction geometry cannot be used as ${label} geometry.`);
  if (selected.some((entity) => entity.type === 'point')) throw new Error(`Point entities cannot be used as ${label} edges.`);
  return selected;
}

export function buildSketchProfile3d(
  sketch: CadSketch,
  profileEntityIds: readonly string[],
  datumPlanes: CadDatumPlaneFrames = EMPTY_DATUM_PLANES,
): CadSketchProfile3d {
  const frame = originPlaneFrame(sketch, datumPlanes);
  const points = finitePointMap(sketch);
  const selected = selectedCurves(sketch, profileEntityIds, 'profile');

  if (selected.length === 1) {
    const edge = intrinsicClosedEdge(selected[0]!, points, frame);
    if (!edge) throw new Error('Selected sketch entity does not form a closed profile.');
    return { normal: frame.normal, edges: [edge] };
  }

  const edges = orderedLoop(selected).map(({ entity, reversed }) => curveEdge(entity, reversed, points, frame));
  return { normal: frame.normal, edges };
}

export function buildSketchPath3d(
  sketch: CadSketch,
  pathEntityIds: readonly string[],
  datumPlanes: CadDatumPlaneFrames = EMPTY_DATUM_PLANES,
): CadSketchWire3d {
  const frame = originPlaneFrame(sketch, datumPlanes);
  const points = finitePointMap(sketch);
  const selected = selectedCurves(sketch, pathEntityIds, 'path');

  if (selected.length === 1) {
    const closed = intrinsicClosedEdge(selected[0]!, points, frame);
    if (closed) return { edges: [closed] };
    const single = traversable(selected[0]!);
    if (!single) throw new Error('Selected sketch entity cannot form an exact path.');
    return { edges: [curveEdge(single.entity, false, points, frame)] };
  }

  return {
    edges: orderedPath(selected).map(({ entity, reversed }) => curveEdge(entity, reversed, points, frame)),
  };
}

export function resolveSketchPlane3d(sketch: CadSketch, datumPlanes: CadDatumPlaneFrames = EMPTY_DATUM_PLANES): CadSketchPlane3d {
  const frame = originPlaneFrame(sketch, datumPlanes);
  return { origin: frame.point(0, 0), normal: frame.normal };
}

export function resolveSketchAxis3d(
  sketch: CadSketch,
  lineId: string,
  datumPlanes: CadDatumPlaneFrames = EMPTY_DATUM_PLANES,
): CadSketchAxis3d {
  const frame = originPlaneFrame(sketch, datumPlanes);
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
