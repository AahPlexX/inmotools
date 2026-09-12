import { solveSketch } from './sketch-solver';
import type {
  CadSketch,
  SketchCircleEntity,
  SketchConstraint,
  SketchLineEntity,
  SketchPointEntity,
} from './sketch-types';

export interface SketchInferenceOptions {
  linearTolerance?: number;
  coincidenceTolerance?: number;
  tangentTolerance?: number;
}

export interface SketchConstraintProposal {
  constraint: SketchConstraint;
  confidence: number;
  reason: string;
  residual: number;
}

const DEFAULT_LINEAR_TOLERANCE = 1e-3;
const DEFAULT_COINCIDENCE_TOLERANCE = 1e-3;
const DEFAULT_TANGENT_TOLERANCE = 1e-3;
const MIN_LENGTH = 1e-12;

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function confidence(residual: number, tolerance: number): number {
  return clamp01(1 - residual / tolerance);
}

function pointMap(sketch: CadSketch): Map<string, SketchPointEntity> {
  const result = new Map<string, SketchPointEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
      throw new Error(`Sketch point '${entity.id}' must have finite coordinates.`);
    }
    if (result.has(entity.id)) throw new Error(`Duplicate sketch point '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function lines(sketch: CadSketch): SketchLineEntity[] {
  return sketch.entities.filter((entity): entity is SketchLineEntity => entity.type === 'line');
}

function circles(sketch: CadSketch): SketchCircleEntity[] {
  return sketch.entities.filter((entity): entity is SketchCircleEntity => entity.type === 'circle');
}

function lineEndpoints(
  line: SketchLineEntity,
  points: Map<string, SketchPointEntity>,
): [SketchPointEntity, SketchPointEntity] {
  const start = points.get(line.startPointId);
  const end = points.get(line.endPointId);
  if (!start || !end) throw new Error(`Sketch line '${line.id}' references missing endpoint geometry.`);
  return [start, end];
}

function circleCenter(circle: SketchCircleEntity, points: Map<string, SketchPointEntity>): SketchPointEntity {
  const center = points.get(circle.centerPointId);
  if (!center) throw new Error(`Sketch circle '${circle.id}' references missing center point '${circle.centerPointId}'.`);
  if (!Number.isFinite(circle.radius) || circle.radius <= 0) throw new Error(`Sketch circle '${circle.id}' radius must be positive.`);
  return center;
}

function unorderedPairKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('\u0000');
}

function existingRelationships(constraints: readonly SketchConstraint[]): {
  horizontal: Set<string>;
  vertical: Set<string>;
  coincident: Set<string>;
  tangent: Set<string>;
} {
  const horizontal = new Set<string>();
  const vertical = new Set<string>();
  const coincident = new Set<string>();
  const tangent = new Set<string>();
  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'horizontal':
        horizontal.add(constraint.lineId);
        break;
      case 'vertical':
        vertical.add(constraint.lineId);
        break;
      case 'coincident':
        coincident.add(unorderedPairKey(constraint.pointAId, constraint.pointBId));
        break;
      case 'tangent':
        tangent.add(`${constraint.lineId}\u0000${constraint.circleId}`);
        break;
      default:
        break;
    }
  }
  return { horizontal, vertical, coincident, tangent };
}

function inferredRelationshipKey(constraint: SketchConstraint): string | null {
  switch (constraint.type) {
    case 'horizontal':
      return `horizontal\u0000${constraint.lineId}`;
    case 'vertical':
      return `vertical\u0000${constraint.lineId}`;
    case 'coincident':
      return `coincident\u0000${unorderedPairKey(constraint.pointAId, constraint.pointBId)}`;
    case 'tangent':
      return `tangent\u0000${constraint.lineId}\u0000${constraint.circleId}`;
    default:
      return null;
  }
}

function proposalId(type: string, ...ids: string[]): string {
  return `proposal:${type}:${ids.join(':')}`;
}

function compareProposals(a: SketchConstraintProposal, b: SketchConstraintProposal): number {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  if (a.residual !== b.residual) return a.residual - b.residual;
  return a.constraint.id.localeCompare(b.constraint.id);
}

export function proposeSketchConstraints(
  sketch: CadSketch,
  options: SketchInferenceOptions = {},
): SketchConstraintProposal[] {
  const linearTolerance = positiveFinite(options.linearTolerance ?? DEFAULT_LINEAR_TOLERANCE, 'Linear inference tolerance');
  const coincidenceTolerance = positiveFinite(
    options.coincidenceTolerance ?? DEFAULT_COINCIDENCE_TOLERANCE,
    'Coincidence inference tolerance',
  );
  const tangentTolerance = positiveFinite(options.tangentTolerance ?? DEFAULT_TANGENT_TOLERANCE, 'Tangent inference tolerance');
  const points = pointMap(sketch);
  const lineEntities = lines(sketch);
  const circleEntities = circles(sketch);
  const existing = existingRelationships(sketch.constraints);
  const proposals: SketchConstraintProposal[] = [];

  for (const line of lineEntities) {
    const [start, end] = lineEndpoints(line, points);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= MIN_LENGTH) continue;

    const horizontalResidual = Math.abs(dy);
    if (horizontalResidual <= linearTolerance && !existing.horizontal.has(line.id)) {
      proposals.push({
        constraint: {
          id: proposalId('horizontal', line.id),
          type: 'horizontal',
          lineId: line.id,
          enabled: true,
        },
        confidence: confidence(horizontalResidual, linearTolerance),
        residual: horizontalResidual,
        reason: `Line '${line.id}' is within ${linearTolerance} sketch units of horizontal.`,
      });
    }

    const verticalResidual = Math.abs(dx);
    if (verticalResidual <= linearTolerance && !existing.vertical.has(line.id)) {
      proposals.push({
        constraint: {
          id: proposalId('vertical', line.id),
          type: 'vertical',
          lineId: line.id,
          enabled: true,
        },
        confidence: confidence(verticalResidual, linearTolerance),
        residual: verticalResidual,
        reason: `Line '${line.id}' is within ${linearTolerance} sketch units of vertical.`,
      });
    }
  }

  const pointEntities = [...points.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (let left = 0; left < pointEntities.length; left += 1) {
    for (let right = left + 1; right < pointEntities.length; right += 1) {
      const a = pointEntities[left]!;
      const b = pointEntities[right]!;
      const separation = Math.hypot(b.x - a.x, b.y - a.y);
      const pair = unorderedPairKey(a.id, b.id);
      if (separation > coincidenceTolerance || existing.coincident.has(pair)) continue;
      const [pointAId, pointBId] = [a.id, b.id].sort((first, second) => first.localeCompare(second));
      proposals.push({
        constraint: {
          id: proposalId('coincident', pointAId!, pointBId!),
          type: 'coincident',
          pointAId: pointAId!,
          pointBId: pointBId!,
          enabled: true,
        },
        confidence: confidence(separation, coincidenceTolerance),
        residual: separation,
        reason: `Points '${pointAId}' and '${pointBId}' are within ${coincidenceTolerance} sketch units.`,
      });
    }
  }

  for (const line of lineEntities) {
    const [start, end] = lineEndpoints(line, points);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (length <= MIN_LENGTH) continue;

    for (const circle of circleEntities) {
      const relationKey = `${line.id}\u0000${circle.id}`;
      if (existing.tangent.has(relationKey)) continue;
      const center = circleCenter(circle, points);
      const projection = ((center.x - start.x) * dx + (center.y - start.y) * dy) / lengthSquared;
      if (projection < 0 || projection > 1) continue;
      const signedArea = dx * (center.y - start.y) - dy * (center.x - start.x);
      const centerDistance = Math.abs(signedArea) / length;
      const tangentResidual = Math.abs(centerDistance - circle.radius);
      if (tangentResidual > tangentTolerance) continue;
      proposals.push({
        constraint: {
          id: proposalId('tangent', line.id, circle.id),
          type: 'tangent',
          lineId: line.id,
          circleId: circle.id,
          enabled: true,
        },
        confidence: confidence(tangentResidual, tangentTolerance),
        residual: tangentResidual,
        reason: `Line '${line.id}' is within ${tangentTolerance} sketch units of tangency with circle '${circle.id}'.`,
      });
    }
  }

  return proposals.sort(compareProposals);
}

export function acceptSketchConstraintProposal(
  sketch: CadSketch,
  proposal: SketchConstraintProposal,
): CadSketch {
  const relationshipKey = inferredRelationshipKey(proposal.constraint);
  if (!relationshipKey || !proposal.constraint.id.startsWith(`proposal:${proposal.constraint.type}:`)) {
    throw new Error(`Constraint '${proposal.constraint.id}' is not an accept-able inferred relationship.`);
  }

  const duplicate = sketch.constraints.some((constraint) => inferredRelationshipKey(constraint) === relationshipKey);
  if (duplicate) {
    throw new Error(`Sketch already has an equivalent constraint for proposal '${proposal.constraint.id}'.`);
  }

  const candidate: CadSketch = {
    ...sketch,
    entities: sketch.entities.map((entity) => ({ ...entity })),
    constraints: [...sketch.constraints.map((constraint) => ({ ...constraint })), { ...proposal.constraint }],
  };
  const solved = solveSketch(candidate);
  if (!solved.converged) {
    throw new Error(`Constraint proposal '${proposal.constraint.id}' is no longer satisfiable in the current sketch.`);
  }
  return solved.sketch;
}
