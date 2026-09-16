import { describe, expect, it } from 'vitest';
import {
  cartesianToFractional,
  cellToMatrix,
  cellVolume,
  fractionalToCartesian,
  metricTensor,
  reciprocalMatrix,
  validateCell,
} from '../../src/tools/crystal/cell-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal cell engine', () => {
  it('computes a cubic 125 Å³ cell, metric tensor, and reciprocal basis', () => {
    expect(cellVolume(cubic)).toBeCloseTo(125, 10);
    expect(cellToMatrix(cubic)[0]).toEqual([5, 0, 0]);
    expect(metricTensor(cubic)[0][0]).toBeCloseTo(25, 10);
    expect(reciprocalMatrix(cubic)[0][0]).toBeCloseTo(0.2, 10);
  });

  it('round-trips fractional coordinates in a triclinic cell', () => {
    const cell = { a: 4.1, b: 5.2, c: 6.3, alpha: 78, beta: 83, gamma: 71 };
    const fractional = [0.17, 0.42, 0.88] as const;
    const restored = cartesianToFractional(fractionalToCartesian(fractional, cell), cell);
    restored.forEach((value, index) => expect(value).toBeCloseTo(fractional[index]!, 10));
  });

  it('builds a reciprocal basis dual to a triclinic direct basis', () => {
    const cell = { a: 4.1, b: 5.2, c: 6.3, alpha: 78, beta: 83, gamma: 71 };
    const direct = cellToMatrix(cell);
    const reciprocal = reciprocalMatrix(cell);
    const dot = (left: readonly number[], right: readonly number[]) => left.reduce((sum, value, index) => sum + value * right[index]!, 0);

    for (let directIndex = 0; directIndex < 3; directIndex += 1) {
      for (let reciprocalIndex = 0; reciprocalIndex < 3; reciprocalIndex += 1) {
        expect(dot(direct[directIndex]!, reciprocal[reciprocalIndex]!)).toBeCloseTo(directIndex === reciprocalIndex ? 1 : 0, 10);
      }
    }
  });

  it('rejects singular, nonfinite, and nonphysical cells', () => {
    expect(validateCell({ ...cubic, a: 0 }).ok).toBe(false);
    expect(validateCell({ ...cubic, gamma: 180 }).ok).toBe(false);
    expect(validateCell({ ...cubic, a: Number.NaN }).ok).toBe(false);
    expect(validateCell({ a: 1, b: 1, c: 1, alpha: 10, beta: 10, gamma: 179 }).ok).toBe(false);
  });
});
