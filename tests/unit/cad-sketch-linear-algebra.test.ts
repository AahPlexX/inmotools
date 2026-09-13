import { describe, expect, it } from 'vitest';
import {
  numericalRank,
  solveDampedNormalEquations,
} from '../../src/tools/cad/sketch-linear-algebra';

describe('CAD sketch ml-matrix numerical layer', () => {
  it('solves a damped Gauss-Newton normal-equation step', () => {
    const delta = solveDampedNormalEquations(
      [
        [1, 0],
        [0, 1],
      ],
      [2, -3],
      1e-9,
    );

    expect(delta).not.toBeNull();
    expect(delta![0]).toBeCloseTo(-2, 7);
    expect(delta![1]).toBeCloseTo(3, 7);
  });

  it('returns a finite minimum-norm step for rank-deficient geometry when damping is zero', () => {
    const delta = solveDampedNormalEquations(
      [
        [1, 1],
        [2, 2],
      ],
      [1, 2],
      0,
    );

    expect(delta).not.toBeNull();
    expect(delta!.every(Number.isFinite)).toBe(true);
    expect(delta![0]).toBeCloseTo(-0.5, 7);
    expect(delta![1]).toBeCloseTo(-0.5, 7);
  });

  it('computes numerical rank with an explicit tolerance rather than exact equality', () => {
    expect(numericalRank([[1, 0], [0, 1e-10]], 1e-8)).toBe(1);
    expect(numericalRank([[1, 0], [0, 1e-6]], 1e-8)).toBe(2);
    expect(numericalRank([], 1e-8)).toBe(0);
  });
});
