import type {
  CadSketch,
  SketchEntity,
  SketchPointEntity,
  SketchSplineEntity,
  SketchVector2,
} from './sketch-types';

export interface SketchEntityTopology {
  closed: boolean;
  endpointPointIds: string[];
}

export interface SketchGeometryIssue {
  entityId: string;
  message: string;
}

const DEFAULT_GEOMETRY_TOLERANCE = 1e-8;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finiteVector(vector: SketchVector2 | undefined): boolean {
  return vector === undefined || (finite(vector.x) && finite(vector.y));
}

function vectorMagnitude(vector: SketchVector2 | undefined): number {
  return vector ? Math.hypot(vector.x, vector.y) : Number.POSITIVE_INFINITY;
}

function pointMap(sketch: CadSketch): Map<string, SketchPointEntity> {
  const result = new Map<string, SketchPointEntity>();
  for (const entity of sketch.entities) {
    if (entity.type === 'point') result.set(entity.id, entity);
  }
  return result;
}

function requirePoint(
  points: Map<string, SketchPointEntity>,
  pointId: string,
  entityId: string,
  role: string,
  issues: SketchGeometryIssue[],
): SketchPointEntity | undefined {
  const point = points.get(pointId);
  if (!point) issues.push({ entityId, message: `${role} point '${pointId}' does not exist.` });
  return point;
}

function distance(a: SketchPointEntity, b: SketchPointEntity): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function validSpline(
  entity: SketchSplineEntity,
  points: Map<string, SketchPointEntity>,
  tolerance: number,
  issues: SketchGeometryIssue[],
): void {
  if (entity.fitPointIds.length < (entity.closed ? 3 : 2)) {
    issues.push({
      entityId: entity.id,
      message: `Spline requires at least ${entity.closed ? 3 : 2} fit points.`,
    });
    return;
  }
  if (!Number.isInteger(entity.degree) || entity.degree < 1 || entity.degree > 5) {
    issues.push({ entityId: entity.id, message: 'Spline degree must be an integer from 1 through 5.' });
  }
  if (!finiteVector(entity.startTangent) || !finiteVector(entity.endTangent)) {
    issues.push({ entityId: entity.id, message: 'Spline tangent vectors must be finite.' });
  }
  if (vectorMagnitude(entity.startTangent) <= tolerance || vectorMagnitude(entity.endTangent) <= tolerance) {
    issues.push({ entityId: entity.id, message: 'Spline tangent vectors must be non-zero when supplied.' });
  }

  let previous: SketchPointEntity | undefined;
  for (const pointId of entity.fitPointIds) {
    const point = requirePoint(points, pointId, entity.id, 'Fit', issues);
    if (point && previous && distance(previous, point) <= tolerance) {
      issues.push({ entityId: entity.id, message: 'Spline contains consecutive coincident fit points.' });
      break;
    }
    if (point) previous = point;
  }
}

export function sketchEntityTopology(entity: SketchEntity): SketchEntityTopology {
  switch (entity.type) {
    case 'line':
    case 'arc':
    case 'elliptical-arc':
      return { closed: false, endpointPointIds: [entity.startPointId, entity.endPointId] };
    case 'circle':
    case 'ellipse':
      return { closed: true, endpointPointIds: [] };
    case 'spline':
      if (entity.closed) return { closed: true, endpointPointIds: [] };
      if (entity.fitPointIds.length === 0) return { closed: false, endpointPointIds: [] };
      if (entity.fitPointIds.length === 1) return { closed: false, endpointPointIds: [entity.fitPointIds[0]!] };
      return {
        closed: false,
        endpointPointIds: [entity.fitPointIds[0]!, entity.fitPointIds[entity.fitPointIds.length - 1]!],
      };
    case 'point':
      return { closed: false, endpointPointIds: [] };
  }
}

export function validateSketchEntityGeometry(
  sketch: CadSketch,
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
): SketchGeometryIssue[] {
  if (!finite(tolerance) || tolerance <= 0) throw new Error('Sketch geometry tolerance must be a positive finite number.');

  const issues: SketchGeometryIssue[] = [];
  const points = pointMap(sketch);
  const seenIds = new Set<string>();

  for (const entity of sketch.entities) {
    if (seenIds.has(entity.id)) {
      issues.push({ entityId: entity.id, message: `Duplicate sketch entity id '${entity.id}'.` });
      continue;
    }
    seenIds.add(entity.id);

    if (entity.type === 'point') {
      if (!finite(entity.x) || !finite(entity.y)) {
        issues.push({ entityId: entity.id, message: 'Point coordinates must be finite.' });
      }
      continue;
    }

    if (entity.type === 'line') {
      const start = requirePoint(points, entity.startPointId, entity.id, 'Start', issues);
      const end = requirePoint(points, entity.endPointId, entity.id, 'End', issues);
      if (start && end && distance(start, end) <= tolerance) {
        issues.push({ entityId: entity.id, message: 'Line endpoints must not be coincident.' });
      }
      continue;
    }

    if (entity.type === 'circle') {
      requirePoint(points, entity.centerPointId, entity.id, 'Center', issues);
      if (!finite(entity.radius) || entity.radius <= tolerance) {
        issues.push({ entityId: entity.id, message: 'Circle radius must be a positive finite value.' });
      }
      continue;
    }

    if (entity.type === 'arc') {
      const center = requirePoint(points, entity.centerPointId, entity.id, 'Center', issues);
      const start = requirePoint(points, entity.startPointId, entity.id, 'Start', issues);
      const end = requirePoint(points, entity.endPointId, entity.id, 'End', issues);
      if (center && start && end) {
        const startRadius = distance(center, start);
        const endRadius = distance(center, end);
        const scale = Math.max(1, startRadius, endRadius);
        if (startRadius <= tolerance || endRadius <= tolerance) {
          issues.push({ entityId: entity.id, message: 'Arc start and end points must differ from its center.' });
        } else if (Math.abs(startRadius - endRadius) > tolerance * scale) {
          issues.push({ entityId: entity.id, message: 'Arc start and end points must share one radius from the center.' });
        }
      }
      continue;
    }

    if (entity.type === 'ellipse' || entity.type === 'elliptical-arc') {
      const center = requirePoint(points, entity.centerPointId, entity.id, 'Center', issues);
      const major = requirePoint(points, entity.majorAxisPointId, entity.id, 'Major-axis', issues);
      const minorRadius = entity.minorRadius;
      if (!finite(minorRadius) || minorRadius <= tolerance) {
        issues.push({ entityId: entity.id, message: 'Ellipse minor radius must be a positive finite value.' });
      }
      let majorRadius = 0;
      if (center && major) {
        majorRadius = distance(center, major);
        if (majorRadius <= tolerance) {
          issues.push({ entityId: entity.id, message: 'Ellipse major axis must have non-zero length.' });
        } else if (finite(minorRadius) && minorRadius > majorRadius + tolerance) {
          issues.push({ entityId: entity.id, message: 'Ellipse minor radius cannot exceed its major radius.' });
        }
      }

      if (entity.type === 'elliptical-arc') {
        const start = requirePoint(points, entity.startPointId, entity.id, 'Start', issues);
        const end = requirePoint(points, entity.endPointId, entity.id, 'End', issues);
        if (center && major && start && end && majorRadius > tolerance && minorRadius > tolerance) {
          const ux = (major.x - center.x) / majorRadius;
          const uy = (major.y - center.y) / majorRadius;
          const vx = -uy;
          const vy = ux;
          for (const [role, point] of [['start', start], ['end', end]] as const) {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            const normalizedX = (dx * ux + dy * uy) / majorRadius;
            const normalizedY = (dx * vx + dy * vy) / minorRadius;
            const ellipseResidual = normalizedX * normalizedX + normalizedY * normalizedY - 1;
            if (Math.abs(ellipseResidual) > Math.max(1e-7, tolerance * 10)) {
              issues.push({ entityId: entity.id, message: `Elliptical-arc ${role} point must lie on its ellipse.` });
            }
          }
        }
      }
      continue;
    }

    validSpline(entity, points, tolerance, issues);
  }

  return issues;
}
