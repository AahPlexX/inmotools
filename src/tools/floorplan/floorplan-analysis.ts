import { circleIntersectsPolygon, extractRoomFaces, satOverlap } from './geometry-engine';
import { createSnapIndex, type SnapTarget } from './snap-index';
import type { FloorplanProject, PlanComponent, Point2D } from './floorplan-types';

export interface ClearanceViolation {
  readonly id: string;
  readonly componentId: string;
  readonly otherComponentId?: string;
  readonly rule: 'overlap' | 'ada_turning_circle' | 'ada_door_approach' | 'ada_fixture_clearance' | 'wall_clearance';
  readonly message: string;
}

export interface FloorplanAnalysis {
  readonly rooms: ReturnType<typeof extractRoomFaces>;
  readonly snapTargets: readonly SnapTarget[];
  readonly clearanceViolations: readonly ClearanceViolation[];
  readonly elapsedMs: number;
}

const rotatePoint = (point: Point2D, degrees: number): Point2D => {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
};

const clearancePolygon = (component: PlanComponent): Point2D[] => {
  const halfW = Math.max(0, component.clearance.dimensions.x / 2 + component.clearance.bufferOffset);
  const halfD = Math.max(0, component.clearance.dimensions.y / 2 + component.clearance.bufferOffset);
  return [
    { x: -halfW, y: -halfD }, { x: halfW, y: -halfD }, { x: halfW, y: halfD }, { x: -halfW, y: halfD },
  ].map((point) => {
    const rotated = rotatePoint(point, component.rotation);
    return { x: component.position.x + rotated.x, y: component.position.y + rotated.y };
  });
};

const pointSegmentDistance = (point: Point2D, start: Point2D, end: Point2D) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
};

export const analyzeFloorplan = (project: FloorplanProject): FloorplanAnalysis => {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rooms = extractRoomFaces(project.vertices, project.walls);
  const vertexById = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  const snapTargets: SnapTarget[] = project.vertices.map((vertex) => ({ id: vertex.id, point: vertex.position, kind: 'vertex' }));
  for (const wall of project.walls) {
    const start = vertexById.get(wall.startVertexId);
    const end = vertexById.get(wall.endVertexId);
    if (!start || !end) continue;
    snapTargets.push({ id: `${wall.id}:mid`, kind: 'midpoint', point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } });
  }
  for (const component of project.components) snapTargets.push({ id: component.id, point: component.position, kind: 'component' });
  createSnapIndex(snapTargets);

  const clearanceViolations: ClearanceViolation[] = [];
  for (const component of project.components) {
    if (component.clearance.adaRuleKey === 'ada_turning_circle' && Math.min(component.clearance.dimensions.x, component.clearance.dimensions.y) < 1525) {
      clearanceViolations.push({ id: `${component.id}:ada-turn`, componentId: component.id, rule: 'ada_turning_circle', message: 'ADA turning-space guide requires a 1525 mm clear diameter.' });
    }
    if (component.clearance.adaRuleKey === 'ada_door_approach' && component.clearance.dimensions.x < 455) {
      clearanceViolations.push({ id: `${component.id}:ada-door`, componentId: component.id, rule: 'ada_door_approach', message: 'Door approach guide requires 455 mm latch-side pull clearance.' });
    }
  }

  for (let left = 0; left < project.components.length; left += 1) {
    const a = project.components[left]!;
    for (let right = left + 1; right < project.components.length; right += 1) {
      const b = project.components[right]!;
      const aCircle = a.clearance.shape === 'circle';
      const bCircle = b.clearance.shape === 'circle';
      let overlaps = false;
      if (aCircle && bCircle) {
        const ar = a.clearance.dimensions.x / 2 + a.clearance.bufferOffset;
        const br = b.clearance.dimensions.x / 2 + b.clearance.bufferOffset;
        overlaps = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < ar + br;
      } else if (aCircle) {
        overlaps = circleIntersectsPolygon(a.position, a.clearance.dimensions.x / 2 + a.clearance.bufferOffset, clearancePolygon(b));
      } else if (bCircle) {
        overlaps = circleIntersectsPolygon(b.position, b.clearance.dimensions.x / 2 + b.clearance.bufferOffset, clearancePolygon(a));
      } else {
        overlaps = satOverlap(clearancePolygon(a), clearancePolygon(b));
      }
      if (overlaps) clearanceViolations.push({ id: `${a.id}:${b.id}`, componentId: a.id, otherComponentId: b.id, rule: 'overlap', message: 'Component clearance envelopes overlap.' });
    }
  }

  for (const component of project.components) {
    const radius = component.clearance.shape === 'circle'
      ? component.clearance.dimensions.x / 2 + component.clearance.bufferOffset
      : Math.min(component.clearance.dimensions.x, component.clearance.dimensions.y) / 2 + component.clearance.bufferOffset;
    for (const wall of project.walls) {
      const start = vertexById.get(wall.startVertexId);
      const end = vertexById.get(wall.endVertexId);
      if (!start || !end) continue;
      if (pointSegmentDistance(component.position, start, end) < radius + wall.thickness / 2) {
        clearanceViolations.push({ id: `${component.id}:${wall.id}:wall`, componentId: component.id, rule: 'wall_clearance', message: 'Component clearance envelope intersects a wall.' });
        break;
      }
    }
  }

  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { rooms, snapTargets, clearanceViolations, elapsedMs: Math.max(0, ended - started) };
};
