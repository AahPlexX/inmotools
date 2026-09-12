export interface SketchVector2 {
  x: number;
  y: number;
}

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

export interface SketchArcEntity {
  id: string;
  type: 'arc';
  centerPointId: string;
  startPointId: string;
  endPointId: string;
  clockwise: boolean;
  construction: boolean;
}

export interface SketchEllipseEntity {
  id: string;
  type: 'ellipse';
  centerPointId: string;
  majorAxisPointId: string;
  minorRadius: number;
  construction: boolean;
}

export interface SketchEllipticalArcEntity {
  id: string;
  type: 'elliptical-arc';
  centerPointId: string;
  majorAxisPointId: string;
  minorRadius: number;
  startPointId: string;
  endPointId: string;
  clockwise: boolean;
  construction: boolean;
}

export interface SketchSplineEntity {
  id: string;
  type: 'spline';
  fitPointIds: string[];
  degree: number;
  closed: boolean;
  startTangent?: SketchVector2;
  endTangent?: SketchVector2;
  construction: boolean;
}

export type SketchEntity =
  | SketchPointEntity
  | SketchLineEntity
  | SketchCircleEntity
  | SketchArcEntity
  | SketchEllipseEntity
  | SketchEllipticalArcEntity
  | SketchSplineEntity;

interface ConstraintBase {
  id: string;
  enabled: boolean;
}

interface DrivingDimensionConstraintBase extends ConstraintBase {
  value: number;
  expression?: string;
}

export interface FixedPointConstraint extends ConstraintBase {
  type: 'fixed-point';
  pointId: string;
  x: number;
  y: number;
}

export interface FixedEntityConstraint extends ConstraintBase {
  type: 'fixed-entity';
  entityId: string;
}

export interface HorizontalConstraint extends ConstraintBase {
  type: 'horizontal';
  lineId: string;
}

export interface VerticalConstraint extends ConstraintBase {
  type: 'vertical';
  lineId: string;
}

export interface DistanceConstraint extends DrivingDimensionConstraintBase {
  type: 'distance';
  pointAId: string;
  pointBId: string;
}

export interface HorizontalDistanceConstraint extends DrivingDimensionConstraintBase {
  type: 'horizontal-distance';
  pointAId: string;
  pointBId: string;
}

export interface VerticalDistanceConstraint extends DrivingDimensionConstraintBase {
  type: 'vertical-distance';
  pointAId: string;
  pointBId: string;
}

export interface LengthConstraint extends DrivingDimensionConstraintBase {
  type: 'length';
  lineId: string;
}

export interface CoincidentConstraint extends ConstraintBase {
  type: 'coincident';
  pointAId: string;
  pointBId: string;
}

export interface RadiusConstraint extends DrivingDimensionConstraintBase {
  type: 'radius';
  circleId: string;
}

export interface DiameterConstraint extends DrivingDimensionConstraintBase {
  type: 'diameter';
  circleId: string;
}

export interface AngleConstraint extends DrivingDimensionConstraintBase {
  type: 'angle';
  lineAId: string;
  lineBId: string;
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

export interface MidpointConstraint extends ConstraintBase {
  type: 'midpoint';
  pointId: string;
  lineId: string;
}

export interface PointOnLineConstraint extends ConstraintBase {
  type: 'point-on-line';
  pointId: string;
  lineId: string;
}

export interface PointOnCircleConstraint extends ConstraintBase {
  type: 'point-on-circle';
  pointId: string;
  circleId: string;
}

export interface SymmetricPointsConstraint extends ConstraintBase {
  type: 'symmetric-points';
  pointAId: string;
  pointBId: string;
  axisLineId: string;
}

export type SketchConstraint =
  | FixedPointConstraint
  | FixedEntityConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | DistanceConstraint
  | HorizontalDistanceConstraint
  | VerticalDistanceConstraint
  | LengthConstraint
  | CoincidentConstraint
  | RadiusConstraint
  | DiameterConstraint
  | AngleConstraint
  | PerpendicularConstraint
  | ParallelConstraint
  | TangentConstraint
  | ConcentricConstraint
  | EqualLengthConstraint
  | EqualRadiusConstraint
  | MidpointConstraint
  | PointOnLineConstraint
  | PointOnCircleConstraint
  | SymmetricPointsConstraint;

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
