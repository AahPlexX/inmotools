import { describe, expect, it } from 'vitest';
import {
  enumerateReflections,
  simulatePowderPattern,
  twoThetaFor,
  type RadiationType,
} from '../../src/tools/crystal/diffraction-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal diffraction engine', () => {
  it('enumerates unique reflections within a d-spacing limit, ordered by d', () => {
    const reflections = enumerateReflections(cubic, { minDSpacing: 1.0 });
    expect(reflections.length).toBeGreaterThan(0);
    for (let i = 1; i < reflections.length; i += 1) {
      expect(reflections[i - 1]!.d).toBeGreaterThanOrEqual(reflections[i]!.d);
    }
    const keys = new Set(reflections.map((r) => r.hkl.join(',')));
    expect(keys.size).toBe(reflections.length);
  });

  it('applies systematic absences for an fcc lattice', () => {
    const all = enumerateReflections(cubic, { minDSpacing: 1.0 });
    const fcc = enumerateReflections(cubic, { minDSpacing: 1.0, centering: 'F' });
    const hklAllowed = (h: number, k: number, l: number) =>
      (h % 2 === 0 && k % 2 === 0 && l % 2 === 0) || (h % 2 !== 0 && k % 2 !== 0 && l % 2 !== 0);
    for (const r of fcc) expect(hklAllowed(r.hkl[0], r.hkl[1], r.hkl[2])).toBe(true);
    expect(fcc.length).toBeLessThan(all.length);
  });

  it('computes Bragg two-theta from wavelength and d-spacing', () => {
    // Cu Kα ~ 1.5406 Å on d = 5 Å -> 2θ = 2*asin(1.5406/10)
    const twoTheta = twoThetaFor(1.5406, 5);
    expect(twoTheta).toBeCloseTo((2 * Math.asin(1.5406 / 10) * 180) / Math.PI, 10);
  });

  it('rejects impossible Bragg geometry and bad inputs', () => {
    expect(() => twoThetaFor(11, 5)).toThrow(RangeError); // sinθ > 1
    expect(() => enumerateReflections(cubic, { minDSpacing: 0 })).toThrow(RangeError);
    expect(() => enumerateReflections(cubic, { minDSpacing: 1, maxReflections: 0 })).toThrow(RangeError);
  });

  it('produces a bounded powder pattern with intensities for a radiation type', () => {
    const kinds: RadiationType[] = ['xray', 'neutron', 'electron'];
    for (const kind of kinds) {
      const pattern = simulatePowderPattern(cubic, { kind, wavelength: 1.5406, minDSpacing: 1.0 });
      expect(pattern.reflections.length).toBeGreaterThan(0);
      for (const r of pattern.reflections) {
        expect(Number.isFinite(r.twoTheta)).toBe(true);
        expect(r.twoTheta).toBeGreaterThan(0);
        expect(r.intensity).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
