import type {
  Point2D,
  PolygonMetrics,
  RoomFace,
  ViewTransform,
  WallSegment,
  WallVertex,
} from './floorplan-types';

const EPSILON = 1e-8;
const SQ_METERS_TO_SQ_FEET = 10.76391041671;

export const clampZoom = (scale: number) => Math.min(5, Math.max(0.01, Number.isFinite(scale) ? scale : 1));

export const worldToScreen = (point: Point2D, transform: ViewTransform): Point2D => {
  const scale = clampZoom(transform.scale);
  return { x: point.x * scale + transform.panX, y: point.y * scale + transform.panY };
};

export const screenToWorld = (point: Point2D, transform: ViewTransform): Point2D => {
  const scale = clampZoom(transform.scale);
  return { x: (point.x - transform.panX) / scale, y: (point.y - transform.panY) / scale };
};

const distance = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

export const polygonMetrics = (points: readonly Point2D[]): PolygonMetrics => {
  if (points.length === 0) {
    return {
      signedAreaSqMm: 0,
      areaSqMm: 0,
      areaSqMeters: 0,
      areaSqFeet: 0,
      perimeterMm: 0,
      perimeterMeters: 0,
      centroid: { x: 0, y: 0 },
    };
  }

  let doubleArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  let perimeterMm = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    doubleArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
    perimeterMm += distance(current, next);
  }

  const signedAreaSqMm = doubleArea / 2;
  const areaSqMm = Math.abs(signedAreaSqMm);
  const centroid = Math.abs(doubleArea) <= EPSILON
    ? {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      }
    : {
        x: centroidX / (3 * doubleArea),
        y: centroidY / (3 * doubleArea),
      };

  return {
    signedAreaSqMm,
    areaSqMm,
    areaSqMeters: areaSqMm / 1_000_000,
    areaSqFeet: (areaSqMm / 1_000_000) * SQ_METERS_TO_SQ_FEET,
    perimeterMm,
    perimeterMeters: perimeterMm / 1000,
    centroid,
  };
};

const polygonAxes = (polygon: readonly Point2D[]) => polygon.map((point, index) => {
  const next = polygon[(index + 1) % polygon.length]!;
  const dx = next.x - point.x;
  const dy = next.y - point.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
});

const projection = (polygon: readonly Point2D[], axis: Point2D) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
};

export const satOverlap = (a: readonly Point2D[], b: readonly Point2D[]) => {
  if (a.length < 3 || b.length < 3) return false;
  for (const axis of [...polygonAxes(a), ...polygonAxes(b)]) {
    const pa = projection(a, axis);
    const pb = projection(b, axis);
    if (Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min) <= EPSILON) return false;
  }
  return true;
};

export const circleIntersectsPolygon = (center: Point2D, radius: number, polygon: readonly Point2D[]) => {
  if (polygon.length < 3 || radius <= 0) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects = ((pi.y > center.y) !== (pj.y > center.y))
      && center.x < ((pj.x - pi.x) * (center.y - pi.y)) / ((pj.y - pi.y) || EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  if (inside) return true;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const lengthSq = ab.x * ab.x + ab.y * ab.y || 1;
    const t = Math.max(0, Math.min(1, ((center.x - a.x) * ab.x + (center.y - a.y) * ab.y) / lengthSq));
    const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    if (distance(center, closest) < radius - EPSILON) return true;
  }
  return false;
};

const cycleKey = (ids: readonly string[]) => {
  if (ids.length === 0) return '';
  const rotations = (sequence: readonly string[]) => sequence.map((_, index) => [
    ...sequence.slice(index),
    ...sequence.slice(0, index),
  ].join('|'));
  return [...rotations(ids), ...rotations([...ids].reverse())].sort()[0]!;
};

export const extractRoomFaces = (vertices: readonly WallVertex[], walls: readonly WallSegment[]): RoomFace[] => {
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const outgoing = new Map<string, string[]>();
  const add = (from: string, to: string) => outgoing.set(from, [...(outgoing.get(from) ?? []), to]);
  for (const wall of walls) {
    if (!vertexById.has(wall.startVertexId) || !vertexById.has(wall.endVertexId)) continue;
    add(wall.startVertexId, wall.endVertexId);
    add(wall.endVertexId, wall.startVertexId);
  }

  for (const [vertexId, neighbors] of outgoing) {
    const origin = vertexById.get(vertexId)!.position;
    neighbors.sort((a, b) => {
      const pa = vertexById.get(a)!.position;
      const pb = vertexById.get(b)!.position;
      return Math.atan2(pa.y - origin.y, pa.x - origin.x) - Math.atan2(pb.y - origin.y, pb.x - origin.x);
    });
  }

  const visited = new Set<string>();
  const cycles: { ids: string[]; metrics: PolygonMetrics }[] = [];
  for (const [startId, neighbors] of outgoing) {
    for (const nextId of neighbors) {
      const firstEdge = `${startId}>${nextId}`;
      if (visited.has(firstEdge)) continue;
      const ids: string[] = [];
      let from = startId;
      let to = nextId;
      let closed = false;
      const guardLimit = Math.max(16, walls.length * 4 + 8);
      for (let guard = 0; guard < guardLimit; guard += 1) {
        const edgeKey = `${from}>${to}`;
        if (visited.has(edgeKey) && edgeKey !== firstEdge) break;
        visited.add(edgeKey);
        ids.push(from);
        const atTarget = outgoing.get(to) ?? [];
        const reverseIndex = atTarget.indexOf(from);
        if (reverseIndex < 0 || atTarget.length === 0) break;
        const candidate = atTarget[(reverseIndex - 1 + atTarget.length) % atTarget.length]!;
        from = to;
        to = candidate;
        if (from === startId && to === nextId) {
          closed = true;
          break;
        }
      }
      if (!closed || ids.length < 3) continue;
      const points = ids.map((id) => vertexById.get(id)!.position);
      const metrics = polygonMetrics(points);
      if (metrics.areaSqMm > EPSILON) cycles.push({ ids, metrics });
    }
  }

  const deduped = new Map<string, { ids: string[]; metrics: PolygonMetrics }>();
  for (const cycle of cycles) deduped.set(cycleKey(cycle.ids), cycle);
  const unique = [...deduped.values()];
  if (unique.length > 1) {
    let exteriorIndex = 0;
    for (let index = 1; index < unique.length; index += 1) {
      if (unique[index]!.metrics.areaSqMm > unique[exteriorIndex]!.metrics.areaSqMm) exteriorIndex = index;
    }
    const allSameBoundary = new Set(unique.map((cycle) => cycleKey(cycle.ids))).size === 1;
    if (!allSameBoundary) unique.splice(exteriorIndex, 1);
  }

  return unique.map((cycle, index) => ({
    id: `room-${index + 1}`,
    boundaryVertexIds: cycle.ids,
    name: `Room ${index + 1}`,
    areaSqMeters: cycle.metrics.areaSqMeters,
    areaSqFeet: cycle.metrics.areaSqFeet,
    perimeterMeters: cycle.metrics.perimeterMeters,
    centroid: cycle.metrics.centroid,
    finishMaterial: 'none',
  }));
};

export const constrainAngle = (start: Point2D, end: Point2D, incrementDegrees = 45): Point2D => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return end;
  const increment = (incrementDegrees * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / increment) * increment;
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
};

export const snapToGrid = (point: Point2D, gridMm: number): Point2D => {
  const grid = Math.max(1, Math.round(gridMm));
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
};
