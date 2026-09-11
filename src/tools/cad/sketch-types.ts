export interface SketchPointEntity {
  id: string;
  type: 'point';
  x: number;
  y: number;
  construction: boolean;
}

export interface SketchLineEntity {
  id: string;
  type: 'line';
  startPointId: string;
  endPointId: string;
  construction: boolean;
}

export interface SketchCircleEntity {
  id: string;
  type: 'circle';
  centerPointId: string;
  radius: number;
  construction: boolean;
}

export type SketchEntity = SketchPointEntity | SketchLineEntity | SketchCircleEntity;

interface ConstraintBase {
  id: string;
  enabled: boolean;
}

export interface FixedPointConstraint extends ConstraintBase {
  type: 'fixed-point';
  pointId: string;
  x: number;
  y: number;
}

export interface HorizontalConstraint extends ConstraintBase {
  type: 'horizontal';
  lineId: string;
}

export interface VerticalConstraint extends ConstraintBase {
  type: 'vertical';
  lineId: string;
}

export interface DistanceConstraint extends ConstraintBase {
  type: 'distance';
  pointAId: string;
  pointBId: string;
  value: number;
}

export interface CoincidentConstraint extends ConstraintBase {
  type: 'coincident';
  pointAId: string;
  pointBId: string;
}

export interface RadiusConstraint extends ConstraintBase {
  type: 'radius';
  circleId: string;
  value: number;
}

export interface PerpendicularConstraint extends ConstraintBase {
  type: 'perpendicular';
  lineAId: string;
  lineBId: string;
}

export interface ParallelConstraint extends ConstraintBase {
  type: 'parallel';
  lineAId: string;
  lineBId: string;
}

export interface TangentConstraint extends ConstraintBase {
  type: 'tangent';
  lineId: string;
  circleId: string;
}

export interface ConcentricConstraint extends ConstraintBase {
  type: 'concentric';
  circleAId: string;
  circleBId: string;
}

export interface EqualLengthConstraint extends ConstraintBase {
  type: 'equal-length';
  lineAId: string;
  lineBId: string;
}

export interface EqualRadiusConstraint extends ConstraintBase {
  type: 'equal-radius';
  circleAId: string;
  circleBId: string;
}

export type SketchConstraint =
  | FixedPointConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | DistanceConstraint
  | CoincidentConstraint
  | RadiusConstraint
  | PerpendicularConstraint
  | ParallelConstraint
  | TangentConstraint
  | ConcentricConstraint
  | EqualLengthConstraint
  | EqualRadiusConstraint;

export type SketchPlane =
  | { kind: 'origin'; plane: 'XY' | 'XZ' | 'YZ' }
  | { kind: 'datum'; datumId: string }
  | { kind: 'face'; topologyRefId: string };

export interface CadSketch {
  id: string;
  label: string;
  plane: SketchPlane;
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export interface SketchDragTarget {
  pointId: string;
  x: number;
  y: number;
  weight?: number;
}

export interface SketchSolveOptions {
  tolerance?: number;
  maxIterations?: number;
  dragTarget?: SketchDragTarget;
}

export interface SketchSolveResult {
  sketch: CadSketch;
  converged: boolean;
  constraintState: 'under' | 'fully' | 'over';
  degreesOfFreedom: number;
  residual: number;
  conflicts: string[];
  iterations: number;
}