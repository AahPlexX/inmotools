import { solveSketch } from './sketch-solver';
import type { CadSketch, SketchSolveOptions, SketchSolveResult } from './sketch-types';

export interface SketchConstraintAnalysis {
  converged: boolean;
  constraintState: SketchSolveResult['constraintState'];
  degreesOfFreedom: number;
  residual: number;
  conflicts: string[];
}

export function analyzeSketchConstraints(
  sketch: CadSketch,
  options: SketchSolveOptions = {},
): SketchConstraintAnalysis {
  const result = solveSketch(sketch, options);
  return {
    converged: result.converged,
    constraintState: result.constraintState,
    degreesOfFreedom: result.degreesOfFreedom,
    residual: result.residual,
    conflicts: [...result.conflicts],
  };
}
