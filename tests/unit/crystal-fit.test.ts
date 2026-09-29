import { describe, expect, it } from 'vitest';
import { fitLeastSquares, type FitParameter } from '../../src/tools/crystal/fit-engine';

const xs = Array.from({ length: 20 }, (_, index) => index * 0.25);
const observed = xs.map((x) => 2 * Math.exp(-0.5 * x));
const residuals = (values: readonly number[]): number[] =>
  xs.map((x, index) => values[0]! * Math.exp(-values[1]! * x) - observed[index]!);
const start = (): FitParameter[] => [
  { name: 'a', value: 1, free: true },
  { name: 'b', value: 1, free: true },
];

describe('bounded least-squares fit core', () => {
  it('recovers exact exponential parameters and reports convergence honestly', () => {
    const result = fitLeastSquares(start(), residuals);
    expect(result.converged).toBe(true);
    expect(result.termination).toBe('converged');
    expect(result.parameters[0]!.value).toBeCloseTo(2, 6);
    expect(result.parameters[1]!.value).toBeCloseTo(0.5, 6);
    expect(result.chiSquare).toBeLessThan(result.initialChiSquare);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('keeps fixed parameters untouched and clamps free parameters to their bounds', () => {
    const result = fitLeastSquares(
      [{ name: 'a', value: 2, free: false }, { name: 'b', value: 1, free: true, min: 0.6, max: 2 }],
      residuals,
    );
    expect(result.parameters[0]!.value).toBe(2);
    expect(result.parameters[1]!.value).toBeGreaterThanOrEqual(0.6 - 1e-12);
    expect(result.parameters[1]!.value).toBeCloseTo(0.6, 6);
  });

  it('never reports a run that ran out of iterations as converged', () => {
    const result = fitLeastSquares(start(), residuals, { maxIterations: 1 });
    expect(result.converged).toBe(false);
    expect(result.termination).toBe('max-iterations');
    expect(result.iterations).toBe(1);
  });

  it('rejects runs with no free parameters, non-finite residuals or out-of-bounds starts', () => {
    expect(() => fitLeastSquares([{ name: 'a', value: 1, free: false }], residuals)).toThrow(RangeError);
    expect(() => fitLeastSquares(start(), () => [Number.NaN])).toThrow(RangeError);
    expect(() => fitLeastSquares([{ name: 'a', value: 5, free: true, min: 0, max: 1 }], residuals)).toThrow(RangeError);
  });
});
