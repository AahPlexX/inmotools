import {
  evaluateParameterDefinitions,
  evaluateParameterExpression,
  type CadDimension,
  type CadParameterDefinition,
  type CadParameterValue,
} from './parameter-engine';
import type {
  CadSketch,
  SketchCircleEntity,
  SketchConstraint,
  SketchLineEntity,
  SketchPointEntity,
} from './sketch-types';

export type SketchReferenceDimension =
  | { type: 'distance'; pointAId: string; pointBId: string }
  | { type: 'horizontal-distance'; pointAId: string; pointBId: string }
  | { type: 'vertical-distance'; pointAId: string; pointBId: string }
  | { type: 'length'; lineId: string }
  | { type: 'radius'; circleId: string }
  | { type: 'diameter'; circleId: string }
  | { type: 'angle'; lineAId: string; lineBId: string };

type DrivingDimensionConstraint = Extract<
  SketchConstraint,
  { type: 'distance' | 'horizontal-distance' | 'vertical-distance' | 'length' | 'radius' | 'diameter' | 'angle' }
>;

const DIMENSION_BY_CONSTRAINT: Record<DrivingDimensionConstraint['type'], CadDimension> = {
  distance: 'length',
  'horizontal-distance': 'length',
  'vertical-distance': 'length',
  length: 'length',
  radius: 'length',
  diameter: 'length',
  angle: 'angle',
};

function parameterRecord(definitions: readonly CadParameterDefinition[]): Record<string, CadParameterValue> {
  return Object.fromEntries(evaluateParameterDefinitions(definitions));
}

function isDrivingDimensionConstraint(constraint: SketchConstraint): constraint is DrivingDimensionConstraint {
  return constraint.type in DIMENSION_BY_CONSTRAINT;
}

export function bindSketchDimensionExpressions(
  sketch: CadSketch,
  definitions: readonly CadParameterDefinition[],
): CadSketch {
  const parameters = parameterRecord(definitions);
  const constraints = sketch.constraints.map((constraint) => {
    if (!isDrivingDimensionConstraint(constraint) || !constraint.expression?.trim()) return constraint;

    const evaluated = evaluateParameterExpression(constraint.expression, parameters);
    const expected = DIMENSION_BY_CONSTRAINT[constraint.type];
    if (evaluated.dimension !== expected) {
      throw new Error(
        `Sketch ${constraint.type} dimension '${constraint.id}' requires ${expected} but expression evaluates to ${evaluated.dimension}.`,
      );
    }
    return { ...constraint, value: evaluated.value };
  });

  return { ...sketch, constraints };
}

function point(sketch: CadSketch, id: string): SketchPointEntity {
  const entity = sketch.entities.find((candidate): candidate is SketchPointEntity => candidate.type === 'point' && candidate.id === id);
  if (!entity) throw new Error(`Reference dimension references missing point '${id}'.`);
  return entity;
}

function line(sketch: CadSketch, id: string): SketchLineEntity {
  const entity = sketch.entities.find((candidate): candidate is SketchLineEntity => candidate.type === 'line' && candidate.id === id);
  if (!entity) throw new Error(`Reference dimension references missing line '${id}'.`);
  return entity;
}

function circle(sketch: CadSketch, id: string): SketchCircleEntity {
  const entity = sketch.entities.find((candidate): candidate is SketchCircleEntity => candidate.type === 'circle' && candidate.id === id);
  if (!entity) throw new Error(`Reference dimension references missing circle '${id}'.`);
  if (!Number.isFinite(entity.radius) || entity.radius <= 0) {
    throw new Error(`Reference dimension circle '${id}' radius must be a positive finite number.`);
  }
  return entity;
}

function lineVector(sketch: CadSketch, lineId: string): [number, number] {
  const entity = line(sketch, lineId);
  const start = point(sketch, entity.startPointId);
  const end = point(sketch, entity.endPointId);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) <= 1e-12) throw new Error(`Reference dimension line '${lineId}' must have non-zero length.`);
  return [dx, dy];
}

export function measureSketchReferenceDimension(
  sketch: CadSketch,
  reference: SketchReferenceDimension,
): CadParameterValue {
  switch (reference.type) {
    case 'distance': {
      const a = point(sketch, reference.pointAId);
      const b = point(sketch, reference.pointBId);
      return { dimension: 'length', value: Math.hypot(b.x - a.x, b.y - a.y) };
    }
    case 'horizontal-distance': {
      const a = point(sketch, reference.pointAId);
      const b = point(sketch, reference.pointBId);
      return { dimension: 'length', value: b.x - a.x };
    }
    case 'vertical-distance': {
      const a = point(sketch, reference.pointAId);
      const b = point(sketch, reference.pointBId);
      return { dimension: 'length', value: b.y - a.y };
    }
    case 'length': {
      const [dx, dy] = lineVector(sketch, reference.lineId);
      return { dimension: 'length', value: Math.hypot(dx, dy) };
    }
    case 'radius':
      return { dimension: 'length', value: circle(sketch, reference.circleId).radius };
    case 'diameter':
      return { dimension: 'length', value: circle(sketch, reference.circleId).radius * 2 };
    case 'angle': {
      const [adx, ady] = lineVector(sketch, reference.lineAId);
      const [bdx, bdy] = lineVector(sketch, reference.lineBId);
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      const cosine = Math.max(-1, Math.min(1, (adx * bdx + ady * bdy) / scale));
      return { dimension: 'angle', value: Math.acos(cosine) };
    }
  }
}
