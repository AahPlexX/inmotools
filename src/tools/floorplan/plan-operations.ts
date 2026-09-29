/**
 * Pure plan edits and queries used by the PlanCraft workspace.
 *
 * Every function takes a FloorplanProject and returns a new one (or a query
 * result) without side effects, so each rule is unit-testable and undo/redo
 * stays a matter of keeping snapshots.
 */
import { componentFootprint } from './floorplan-analysis';
import { formatLength } from './units';
import type { FloorplanProject, HostedOpening, Point2D, WallSegment } from './floorplan-types';

export interface WallEndpoint {
  readonly point: Point2D;
  /** An existing corner the point snapped to. */
  readonly vertexId?: string;
  /** An existing wall whose centerline the point snapped to; that wall is split here. */
  readonly hostWallId?: string;
}

export type AddWallResult =
  | { readonly ok: true; readonly project: FloorplanProject; readonly wallId: string; readonly endVertexId: string; readonly joinedExisting: boolean }
  | { readonly ok: false; readonly reason: string };

export type PlaceOpeningResult = { readonly ok: true; readonly project: FloorplanProject } | { readonly ok: false; readonly reason: string };

export type HitTarget =
  | { readonly kind: 'vertex'; readonly id: string }
  | { readonly kind: 'opening'; readonly id: string; readonly wallId: string }
  | { readonly kind: 'component'; readonly id: string }
  | { readonly kind: 'dimension'; readonly id: string }
  | { readonly kind: 'wall'; readonly id: string };

export const DEFAULT_WALL: Omit<WallSegment, 'id' | 'startVertexId' | 'endVertexId'> = {
  thickness: 150, height: 2700, state: 'new_construction', material: 'drywall_stud', isLoadBearing: false, openings: [],
};

const MIN_SEGMENT_MM = 1;
const distance = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);
const vertexPositions = (project: FloorplanProject) => new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
const layerVisible = (project: FloorplanProject, id: string) => project.layers.find((layer) => layer.id === id)?.visible !== false;

/** Recomputes every corner's wall list; optionally drops corners no wall uses. */
const withConnections = (project: FloorplanProject, dropOrphans = false): FloorplanProject => {
  const byVertex = new Map<string, string[]>();
  for (const wall of project.walls) {
    for (const id of [wall.startVertexId, wall.endVertexId]) byVertex.set(id, [...(byVertex.get(id) ?? []), wall.id]);
  }
  return {
    ...project,
    vertices: project.vertices
      .filter((vertex) => !dropOrphans || byVertex.has(vertex.id))
      .map((vertex) => ({ ...vertex, connectedWallIds: [...new Set(byVertex.get(vertex.id) ?? [])] })),
  };
};

export interface WallProjection {
  readonly wall: WallSegment;
  /** Position along the wall, 0 at its start corner and 1 at its end corner. */
  readonly ratio: number;
  readonly point: Point2D;
  readonly distance: number;
  readonly length: number;
}

/** The closest point on any wall centerline. */
export const projectOntoWalls = (project: FloorplanProject, point: Point2D): WallProjection | undefined => {
  const positions = vertexPositions(project);
  let best: WallProjection | undefined;
  for (const wall of project.walls) {
    const start = positions.get(wall.startVertexId);
    const end = positions.get(wall.endVertexId);
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
    const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const gap = distance(point, projected);
    if (!best || gap < best.distance) best = { wall, ratio, point: projected, distance: gap, length: Math.sqrt(lengthSq) };
  }
  return best;
};

/**
 * Splits a wall at the point on its centerline nearest `point`, creating corner
 * `vertexId`. The original id keeps the first half; `newWallId` is the second.
 * Openings stay at the same physical position on whichever half contains their center.
 */
export const splitWall = (project: FloorplanProject, wallId: string, point: Point2D, vertexId: string, newWallId: string): FloorplanProject => {
  const positions = vertexPositions(project);
  const wall = project.walls.find((item) => item.id === wallId);
  const start = wall && positions.get(wall.startVertexId);
  const end = wall && positions.get(wall.endVertexId);
  if (!wall || !start || !end) return project;
  const length = distance(start, end);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / (length * length || 1)));
  const at = t * length;
  if (at < MIN_SEGMENT_MM || length - at < MIN_SEGMENT_MM) return project;
  const junction = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  const firstOpenings: HostedOpening[] = [];
  const secondOpenings: HostedOpening[] = [];
  for (const opening of wall.openings) {
    const center = opening.offsetRatio * length;
    if (center < at) firstOpenings.push({ ...opening, offsetRatio: center / at });
    else secondOpenings.push({ ...opening, offsetRatio: (center - at) / (length - at) });
  }
  const first: WallSegment = { ...wall, endVertexId: vertexId, openings: firstOpenings };
  const second: WallSegment = { ...wall, id: newWallId, startVertexId: vertexId, openings: secondOpenings };
  return withConnections({
    ...project,
    vertices: [...project.vertices, { id: vertexId, position: junction, connectedWallIds: [] }],
    walls: project.walls.flatMap((item) => (item.id === wallId ? [first, second] : [item])),
  });
};

/**
 * Adds a wall between two endpoints. An endpoint on an existing corner reuses it;
 * one on a wall centerline splits that wall so rooms close properly (T junction).
 */
export const addWall = (
  project: FloorplanProject,
  start: WallEndpoint,
  end: WallEndpoint,
  makeId: (prefix: string) => string,
  template: Partial<Omit<WallSegment, 'id' | 'startVertexId' | 'endVertexId' | 'openings'>> = {},
): AddWallResult => {
  if (distance(start.point, end.point) < MIN_SEGMENT_MM) return { ok: false, reason: 'Pick a second point away from the first.' };
  if (start.hostWallId && start.hostWallId === end.hostWallId) return { ok: false, reason: 'That wall would sit on top of an existing wall.' };
  let next = project;
  const resolve = (endpoint: WallEndpoint): { id: string; joined: boolean } => {
    if (endpoint.vertexId && next.vertices.some((vertex) => vertex.id === endpoint.vertexId)) return { id: endpoint.vertexId, joined: true };
    const host = endpoint.hostWallId ? next.walls.find((wall) => wall.id === endpoint.hostWallId) : undefined;
    if (host) {
      const positions = vertexPositions(next);
      // A point at the very end of the host wall is that wall's corner, not a new junction.
      for (const cornerId of [host.startVertexId, host.endVertexId]) {
        const corner = positions.get(cornerId);
        if (corner && distance(corner, endpoint.point) < MIN_SEGMENT_MM) return { id: cornerId, joined: true };
      }
      const id = makeId('vertex');
      next = splitWall(next, host.id, endpoint.point, id, makeId('wall'));
      return { id, joined: true };
    }
    const id = makeId('vertex');
    next = { ...next, vertices: [...next.vertices, { id, position: endpoint.point, connectedWallIds: [] }] };
    return { id, joined: false };
  };
  const startCorner = resolve(start);
  const endCorner = resolve(end);
  if (startCorner.id === endCorner.id) return { ok: false, reason: 'Pick a second point away from the first.' };
  const duplicate = next.walls.some((wall) => (wall.startVertexId === startCorner.id && wall.endVertexId === endCorner.id)
    || (wall.startVertexId === endCorner.id && wall.endVertexId === startCorner.id));
  if (duplicate) return { ok: false, reason: 'Those two corners are already joined by a wall.' };
  const wallId = makeId('wall');
  const wall: WallSegment = { ...DEFAULT_WALL, ...template, id: wallId, startVertexId: startCorner.id, endVertexId: endCorner.id, openings: [] };
  return {
    ok: true,
    project: withConnections({ ...next, walls: [...next.walls, wall], selectedId: wallId }),
    wallId,
    endVertexId: endCorner.id,
    joinedExisting: endCorner.joined,
  };
};

/** Hosts an opening on a wall, nudged so it fits between the wall's ends. */
export const placeOpening = (project: FloorplanProject, wallId: string, ratio: number, opening: HostedOpening): PlaceOpeningResult => {
  const units = project.units ?? 'metric';
  const positions = vertexPositions(project);
  const wall = project.walls.find((item) => item.id === wallId);
  const start = wall && positions.get(wall.startVertexId);
  const end = wall && positions.get(wall.endVertexId);
  if (!wall || !start || !end) return { ok: false, reason: 'That wall no longer exists.' };
  const length = distance(start, end);
  if (length < opening.width) return { ok: false, reason: `This wall (${formatLength(length, units)}) is shorter than the ${formatLength(opening.width, units)} opening.` };
  const half = opening.width / 2 / length;
  const offsetRatio = Math.max(half, Math.min(1 - half, ratio));
  const center = offsetRatio * length;
  const blocked = wall.openings.some((other) => other.id !== opening.id
    && Math.abs(other.offsetRatio * length - center) < (other.width + opening.width) / 2 - MIN_SEGMENT_MM);
  if (blocked) return { ok: false, reason: 'Another door or window already takes up that part of the wall.' };
  const placed = { ...opening, offsetRatio };
  return {
    ok: true,
    project: { ...project, walls: project.walls.map((item) => (item.id === wallId ? { ...item, openings: [...item.openings.filter((other) => other.id !== opening.id), placed] } : item)), selectedId: opening.id },
  };
};

export const moveVertex = (project: FloorplanProject, vertexId: string, point: Point2D): FloorplanProject => ({
  ...project,
  vertices: project.vertices.map((vertex) => (vertex.id === vertexId ? { ...vertex, position: point } : vertex)),
});

/** Joins corner `fromId` into `intoId`, dropping walls that collapse to nothing or duplicate another. */
export const mergeVertex = (project: FloorplanProject, fromId: string, intoId: string): FloorplanProject => {
  if (fromId === intoId) return project;
  const seen = new Set<string>();
  const walls = project.walls
    .map((wall) => ({
      ...wall,
      startVertexId: wall.startVertexId === fromId ? intoId : wall.startVertexId,
      endVertexId: wall.endVertexId === fromId ? intoId : wall.endVertexId,
    }))
    .filter((wall) => {
      if (wall.startVertexId === wall.endVertexId) return false;
      const key = [wall.startVertexId, wall.endVertexId].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const selectedId = walls.some((wall) => wall.id === project.selectedId) || project.components.some((item) => item.id === project.selectedId) ? project.selectedId : undefined;
  return withConnections({ ...project, walls, selectedId }, true);
};

export const duplicateComponent = (project: FloorplanProject, id: string, newId: string, offset: number): FloorplanProject | undefined => {
  const source = project.components.find((component) => component.id === id);
  if (!source) return undefined;
  const copy = { ...source, id: newId, position: { x: source.position.x + offset, y: source.position.y + offset } };
  return { ...project, components: [...project.components, copy], selectedId: newId };
};

/** Removes whatever `id` names (wall, opening, component, or dimension); undefined when nothing matches. */
export const deleteSelection = (project: FloorplanProject, id: string): FloorplanProject | undefined => {
  if (project.walls.some((wall) => wall.id === id)) {
    return withConnections({ ...project, walls: project.walls.filter((wall) => wall.id !== id), selectedId: undefined }, true);
  }
  if (project.components.some((component) => component.id === id)) {
    return { ...project, components: project.components.filter((component) => component.id !== id), selectedId: undefined };
  }
  if (project.walls.some((wall) => wall.openings.some((opening) => opening.id === id))) {
    return { ...project, walls: project.walls.map((wall) => ({ ...wall, openings: wall.openings.filter((opening) => opening.id !== id) })), selectedId: undefined };
  }
  if (project.dimensions.some((dimension) => dimension.id === id)) {
    return { ...project, dimensions: project.dimensions.filter((dimension) => dimension.id !== id), selectedId: undefined };
  }
  return undefined;
};

const pointInPolygon = (point: Point2D, polygon: readonly Point2D[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const segmentDistance = (point: Point2D, start: Point2D, end: Point2D) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
};

const HIT_TOLERANCE_PX = 10;
const VERTEX_RADIUS_PX = 8;

/**
 * What sits under `point` (plan millimeters) at view `scale` (pixels per mm).
 * Priority: wall corner, door/window, component, dimension, wall. Items on hidden
 * layers are not hit. Among overlapping components the smallest wins, so a
 * nightstand can be picked from on top of a larger piece.
 */
export const hitTest = (project: FloorplanProject, point: Point2D, scale: number): HitTarget | undefined => {
  const tolerance = HIT_TOLERANCE_PX / scale;
  const positions = vertexPositions(project);
  const wallsVisible = layerVisible(project, 'walls');

  if (wallsVisible) {
    const corner = project.vertices
      .map((vertex) => ({ vertex, gap: distance(vertex.position, point) }))
      .filter((item) => item.gap <= VERTEX_RADIUS_PX / scale)
      .sort((a, b) => a.gap - b.gap)[0];
    if (corner) return { kind: 'vertex', id: corner.vertex.id };
  }

  let opening: { id: string; wallId: string; gap: number } | undefined;
  for (const wall of project.walls) {
    const start = positions.get(wall.startVertexId);
    const end = positions.get(wall.endVertexId);
    if (!start || !end) continue;
    const length = distance(start, end) || 1;
    const ux = (end.x - start.x) / length;
    const uy = (end.y - start.y) / length;
    for (const item of wall.openings) {
      if (!layerVisible(project, item.type.startsWith('door') ? 'doors' : 'windows')) continue;
      const center = { x: start.x + ux * item.offsetRatio * length, y: start.y + uy * item.offsetRatio * length };
      const along = (point.x - center.x) * ux + (point.y - center.y) * uy;
      const across = Math.abs((point.x - center.x) * uy - (point.y - center.y) * ux);
      if (Math.abs(along) <= item.width / 2 && across <= wall.thickness / 2 + tolerance && (!opening || across < opening.gap)) opening = { id: item.id, wallId: wall.id, gap: across };
    }
  }
  if (opening) return { kind: 'opening', id: opening.id, wallId: opening.wallId };

  const components = project.components
    .filter((component) => layerVisible(project, component.category === 'mep' ? 'mep' : component.layerId))
    .map((component) => {
      const footprint = componentFootprint(component);
      const inside = footprint.kind === 'circle' ? distance(footprint.center, point) <= footprint.radius : pointInPolygon(point, footprint.points);
      const area = footprint.kind === 'circle' ? Math.PI * footprint.radius ** 2 : Math.abs(footprint.points.reduce((sum, a, index) => {
        const b = footprint.points[(index + 1) % footprint.points.length]!;
        return sum + a.x * b.y - b.x * a.y;
      }, 0) / 2);
      // Small wall devices are a few pixels wide, so their center also counts.
      return { component, hit: inside || distance(component.position, point) <= tolerance, area };
    })
    .filter((item) => item.hit)
    .sort((a, b) => a.area - b.area);
  if (components[0]) return { kind: 'component', id: components[0].component.id };

  if (layerVisible(project, 'dimensions')) {
    const dimension = project.dimensions
      .map((item) => ({ item, gap: segmentDistance(point, item.start, item.end) }))
      .filter((entry) => entry.gap <= tolerance)
      .sort((a, b) => a.gap - b.gap)[0];
    if (dimension) return { kind: 'dimension', id: dimension.item.id };
  }

  if (wallsVisible) {
    const wall = project.walls
      .map((item) => {
        const start = positions.get(item.startVertexId);
        const end = positions.get(item.endVertexId);
        return { item, gap: start && end ? segmentDistance(point, start, end) - item.thickness / 2 : Number.POSITIVE_INFINITY };
      })
      .filter((entry) => entry.gap <= tolerance)
      .sort((a, b) => a.gap - b.gap)[0];
    if (wall) return { kind: 'wall', id: wall.item.id };
  }
  return undefined;
};
