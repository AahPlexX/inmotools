import { describe, expect, it } from 'vitest';
import {
  fromMillimeters,
  fromRadians,
  toMillimeters,
  toRadians,
} from '../../src/tools/cad/units';

describe('CAD canonical unit conversions', () => {
  it('round-trips supported length units through canonical millimeters', () => {
    const cases = [
      ['mm', 25.4],
      ['cm', 2.54],
      ['m', 0.0254],
      ['in', 1],
      ['ft', 1 / 12],
    ] as const;

    for (const [unit, input] of cases) {
      const millimeters = toMillimeters(input, unit);
      expect(millimeters).toBeCloseTo(25.4, 10);
      expect(fromMillimeters(millimeters, unit)).toBeCloseTo(input, 10);
    }
  });

  it('round-trips degrees and radians through canonical radians', () => {
    expect(toRadians(180, 'deg')).toBeCloseTo(Math.PI, 12);
    expect(fromRadians(Math.PI, 'deg')).toBeCloseTo(180, 12);
    expect(toRadians(Math.PI / 2, 'rad')).toBeCloseTo(Math.PI / 2, 12);
  });

  it('rejects non-finite values instead of polluting the project model', () => {
    expect(() => toMillimeters(Number.NaN, 'mm')).toThrow(/finite/i);
    expect(() => toMillimeters(Number.POSITIVE_INFINITY, 'in')).toThrow(/finite/i);
    expect(() => toRadians(Number.NEGATIVE_INFINITY, 'deg')).toThrow(/finite/i);
  });
});
