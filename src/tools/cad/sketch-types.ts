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

export type SketchEntity = SketchPointEntity | SketchLineEntity;

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

export type SketchConstraint =
  | FixedPointConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | DistanceConstraint
  | CoincidentConstraint;

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
