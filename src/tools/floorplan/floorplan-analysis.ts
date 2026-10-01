import { circleIntersectsPolygon, extractRoomFaces, satOverlap } from './geometry-engine';
import { createSnapIndex, type SnapTarget } from './snap-index';
import { getSymbolDefinition } from './symbol-library';
import { formatLength } from './units';
import type { ClearanceEnvelope, FloorplanProject, PlanComponent, Point2D } from './floorplan-types';

export type ClearanceRule = 'collision' | 'wall_collision' | 'access_blocked' | 'ada_turning_circle' | 'ada_fixture_clearance';

export interface ClearanceViolation {
  readonly id: string;
  readonly componentId: string;
  /** The other component involved; absent when the conflict is with a wall. */
  readonly otherComponentId?: string;
  readonly rule: ClearanceRule;
  readonly message: string;
}

export interface FloorplanAnalysis {
  readonly rooms: ReturnType<typeof extractRoomFaces>;
  readonly snapTargets: readonly SnapTarget[];
  readonly clearanceViolations: readonly ClearanceViolation[];
  readonly elapsedMs: number;
}

export type PlanShape =
  | { readonly kind: 'polygon'; readonly points: readonly Point2D[] }
  | { readonly kind: 'circle'; readonly center: Point2D; readonly radius: number };

/** Stable key for naming a room: its boundary vertex ids, sorted. */
export const roomKey = (boundaryVertexIds: readonly string[]) => [...boundaryVertexIds].sort().join('|');

// 2010 ADA Standards 604.2: water-closet centerline 16"–18" (405–455 mm) from the side wall.
// The 604.3.1 clearance (60" × 56") is measured from that side wall and the rear wall.
const ADA_WATER_CLOSET_CENTERLINE_MM = 455;

const rotatePoint = (point: Point2D, degrees: number): Point2D => {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
};

const localRectangle = (component: PlanComponent, minX: number, minY: number, maxX: number, maxY: number): PlanShape => ({
  kind: 'polygon',
  points: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }].map((point) => {
    const rotated = rotatePoint(point, component.rotation);
    return { x: component.position.x + rotated.x, y: component.position.y + rotated.y };
  }),
});

const symbolOf = (component: PlanComponent) => getSymbolDefinition(component.symbolKey);
/** The library clearance wins over the copy stored in older saves, so rule corrections reach existing plans. */
const clearanceOf = (component: PlanComponent): ClearanceEnvelope => symbolOf(component)?.clearance ?? component.clearance;
const componentSize = (component: PlanComponent) => {
  const symbol = symbolOf(component);
  return {
    width: Math.max(1, (symbol?.width ?? component.clearance.dimensions.x) * component.scale.x),
    depth: Math.max(1, (symbol?.depth ?? component.clearance.dimensions.y) * component.scale.y),
  };
};

export const componentName = (component: PlanComponent) => symbolOf(component)?.label ?? component.symbolKey;
const isPlanningGuide = (component: PlanComponent) => clearanceOf(component).adaRuleKey === 'ada_turning_circle';
const isSeating = (component: PlanComponent) => symbolOf(component)?.glyph === 'chair';
const isTable = (component: PlanComponent) => symbolOf(component)?.glyph === 'rect' || component.symbolKey === 'round-table-1200';
const isMep = (component: PlanComponent) => component.category === 'mep';

/** The floor area the item itself occupies. */
export const componentFootprint = (component: PlanComponent): PlanShape => {
  const { width, depth } = componentSize(component);
  if (symbolOf(component)?.glyph === 'circle') return { kind: 'circle', center: component.position, radius: Math.max(width, depth) / 2 };
  return localRectangle(component, -width / 2, -depth / 2, width / 2, depth / 2);
};

/** The floor that must stay clear to use the item, or undefined when it needs none. */
export const accessZone = (component: PlanComponent): PlanShape | undefined => {
  const clearance = clearanceOf(component);
  const { width, depth } = componentSize(component);
  if (clearance.shape === 'circle') return { kind: 'circle', center: component.position, radius: clearance.dimensions.x / 2 + clearance.bufferOffset };
  if (clearance.adaRuleKey === 'ada_fixture_clearance') {
    const minX = -ADA_WATER_CLOSET_CENTERLINE_MM;
    return localRectangle(component, minX, -depth / 2, minX + clearance.dimensions.x, -depth / 2 + clearance.dimensions.y);
  }
  if (clearance.bufferOffset <= 0) return undefined;
  return localRectangle(component, -width / 2, depth / 2, width / 2, depth / 2 + clearance.bufferOffset);
};

const shapesOverlap = (a: PlanShape, b: PlanShape) => {
  if (a.kind === 'polygon' && b.kind === 'polygon') return satOverlap(a.points, b.points);
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < a.radius + b.radius - 1e-6;
  const circle = a.kind === 'circle' ? a : b as Extract<PlanShape, { kind: 'circle' }>;
  const polygon = a.kind === 'polygon' ? a : b as Extract<PlanShape, { kind: 'polygon' }>;
  return circleIntersectsPolygon(circle.center, circle.radius, polygon.points);
};

const wallPolygon = (start: Point2D, end: Point2D, thickness: number): Point2D[] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return [];
  const half = Math.max(0, thickness) / 2;
  const nx = -dy / length * half;
  const ny = dx / length * half;
  return [
    { x: start.x + nx, y: start.y + ny },
    { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny },
    { x: start.x - nx, y: start.y - ny },
  ];
};

export const buildSnapTargets = (project: FloorplanProject): SnapTarget[] => {
  const vertexById = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  const snapTargets: SnapTarget[] = project.vertices.map((vertex) => ({ id: vertex.id, point: vertex.position, kind: 'vertex' }));
  for (const wall of project.walls) {
    const start = vertexById.get(wall.startVertexId);
    const end = vertexById.get(wall.endVertexId);
    if (!start || !end) continue;
    snapTargets.push({ id: `${wall.id}:mid`, kind: 'midpoint', point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } });
  }
  for (const component of project.components) snapTargets.push({ id: component.id, point: component.position, kind: 'component' });
  return snapTargets;
};

const clearanceViolationsOf = (project: FloorplanProject): ClearanceViolation[] => {
  const units = project.units ?? 'metric';
  const vertexById = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  const wallShapes: PlanShape[] = project.walls.flatMap((wall) => {
    const start = vertexById.get(wall.startVertexId);
    const end = vertexById.get(wall.endVertexId);
    const points = start && end ? wallPolygon(start, end, wall.thickness) : [];
    return points.length ? [{ kind: 'polygon' as const, points }] : [];
  });
  const solid = project.components.filter((component) => !isMep(component) && !isPlanningGuide(component));
  const footprints = new Map(solid.map((component) => [component.id, componentFootprint(component)]));
  const violations: ClearanceViolation[] = [];

  // Items occupying the same floor. Seating may tuck under tables and desks.
  for (let left = 0; left < solid.length; left += 1) {
    const a = solid[left]!;
    for (let right = left + 1; right < solid.length; right += 1) {
      const b = solid[right]!;
      if ((isSeating(a) && isTable(b)) || (isSeating(b) && isTable(a))) continue;
      if (shapesOverlap(footprints.get(a.id)!, footprints.get(b.id)!)) {
        violations.push({ id: `${a.id}:${b.id}:collision`, componentId: a.id, otherComponentId: b.id, rule: 'collision', message: `${componentName(a)} overlaps ${componentName(b)}.` });
      }
    }
  }

  // Items that run into a wall.
  for (const component of solid) {
    if (wallShapes.some((wall) => shapesOverlap(footprints.get(component.id)!, wall))) {
      violations.push({ id: `${component.id}:wall-collision`, componentId: component.id, rule: 'wall_collision', message: `${componentName(component)} runs into a wall.` });
    }
  }

  // Space needed to use an item. Access aisles may overlap each other; they are blocked
  // only by other items or walls. Movable seating does not block ordinary access zones,
  // but it does obstruct ADA turning space and water-closet clearance.
  for (const component of project.components) {
    const zone = accessZone(component);
    if (!zone) continue;
    const clearance = clearanceOf(component);
    const adaRule = clearance.adaRuleKey === 'ada_turning_circle' || clearance.adaRuleKey === 'ada_fixture_clearance' ? clearance.adaRuleKey : undefined;
    const rule: ClearanceRule = adaRule ?? 'access_blocked';
    const describe = (obstruction: string) => {
      if (rule === 'ada_turning_circle') return `The 60" (1525 mm) turning space is obstructed by ${obstruction}.`;
      if (rule === 'ada_fixture_clearance') return `The toilet's 60" × 56" ADA clearance is obstructed by ${obstruction}.`;
      return `${componentName(component)} needs ${formatLength(clearance.bufferOffset, units)} clear in front; ${obstruction} is in the way.`;
    };
    for (const other of solid) {
      if (other.id === component.id) continue;
      if (!adaRule && isSeating(other)) continue;
      if (shapesOverlap(zone, footprints.get(other.id)!)) {
        violations.push({ id: `${component.id}:${other.id}:${rule}`, componentId: component.id, otherComponentId: other.id, rule, message: describe(`the ${componentName(other).toLowerCase()}`) });
      }
    }
    if (wallShapes.some((wall) => shapesOverlap(zone, wall))) {
      violations.push({ id: `${component.id}:${rule}:wall`, componentId: component.id, rule, message: describe('a wall') });
    }
  }
  return violations;
};

export const analyzeFloorplan = (project: FloorplanProject): FloorplanAnalysis => {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const names = project.roomNames ?? {};
  const rooms = extractRoomFaces(project.vertices, project.walls).map((room) => {
    const name = names[roomKey(room.boundaryVertexIds)]?.trim();
    return name ? { ...room, name } : room;
  });
  const snapTargets = buildSnapTargets(project);
  createSnapIndex(snapTargets);
  const clearanceViolations = clearanceViolationsOf(project);
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { rooms, snapTargets, clearanceViolations, elapsedMs: Math.max(0, ended - started) };
};
