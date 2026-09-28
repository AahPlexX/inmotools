import { describe, expect, it } from 'vitest';
import {
  refineLeastSquares,
  type RefinementObservation,
  type RefinementParameter,
} from '../../src/tools/crystal/refinement-engine';

describe('crystal bounded least-squares refinement', () => {
  it('fits free bounded parameters while preserving fixed parameters and reports convergence evidence', () => {
    const observations: readonly RefinementObservation[] = [
      { x: 0, observed: 1, weight: 1 },
      { x: 1, observed: 3, weight: 1 },
      { x: 2, observed: 5, weight: 1 },
      { x: 3, observed: 7, weight: 1 },
      { x: 4, observed: 9, weight: 1 },
    ];
    const parameters: readonly RefinementParameter[] = [
      { id: 'scale', label: 'Scale', kind: 'scale', value: 0.5, min: 0, max: 4, fixed: false },
      { id: 'background', label: 'Background', kind: 'background', value: 0, min: -2, max: 3, fixed: false },
      { id: 'zero', label: 'Zero shift', kind: 'zero-shift', value: 0.25, min: -1, max: 1, fixed: true },
    ];

    const result = refineLeastSquares(
      observations,
      parameters,
      (x, values) => values.scale! * x + values.background!,
      { maxIterations: 40, tolerance: 1e-10 },
    );

    expect(result.converged).toBe(true);
    expect(result.terminationReason).toBe('converged');
    expect(result.iterations).toBeLessThanOrEqual(40);
    expect(result.activeParameterIds).toEqual(['scale', 'background']);
    expect(result.parameters.scale).toBeCloseTo(2, 6);
    expect(result.parameters.background).toBeCloseTo(1, 6);
    expect(result.parameters.zero).toBe(0.25);
    expect(result.changes.zero).toBe(0);
    expect(result.metrics.rwp).toBeLessThan(1e-7);
    expect(result.metrics.weightedSse).toBeLessThan(1e-12);
  });
});
