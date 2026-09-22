import { describe, expect, it } from 'vitest';
import {
  dSpacing,
  reciprocalLatticeParameters,
  millerToCartesian,
  planeNormal,
} from '../../src/tools/crystal/reciprocal-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal reciprocal engine', () => {
  it('computes reciprocal lattice parameters dual to a triclinic cell', () => {
    const cell = { a: 4.1, b: 5.2, c: 6.3, alpha: 78, beta: 83, gamma: 71 };
    const reciprocal = reciprocalLatticeParameters(cell);
    expect(reciprocal.aStar).toBeCloseTo(1 / (4.1 * Math.sin((71 * Math.PI) / 180) * Math.sin((78 * Math.PI) / 180) / Math.sin((83 * Math.PI) / 180) * Math.sin((83 * Math.PI) / 180)), -2);
    expect(reciprocal.aStar).toBeGreaterThan(0);
    expect(reciprocal.alphaStar).toBeGreaterThan(0);
    expect(reciprocal.alphaStar).toBeLessThan(180);
  });

  it('computes d-spacing for a cubic cell', () => {
    expect(dSpacing(cubic, [1, 0, 0])).toBeCloseTo(5, 10);
    expect(dSpacing(cubic, [1, 1, 0])).toBeCloseTo(5 / Math.SQRT2, 10);
    expect(dSpacing(cubic, [1, 1, 1])).toBeCloseTo(5 / Math.sqrt(3), 10);
  });

  it('rejects a zero Miller index and a singular cell', () => {
    expect(() => dSpacing(cubic, [0, 0, 0])).toThrow(RangeError);
    expect(() => dSpacing({ ...cubic, a: 0 }, [1, 0, 0])).toThrow(RangeError);
  });

  it('maps a Miller index to a cartesian plane normal', () => {
    const normal = planeNormal(cubic, [0, 0, 1]);
    expect(normal[0]).toBeCloseTo(0, 10);
    expect(normal[1]).toBeCloseTo(0, 10);
    expect(normal[2]).toBeCloseTo(1, 10);
    const v = millerToCartesian(cubic, [1, 0, 0]);
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(0.2, 10);
  });
});
