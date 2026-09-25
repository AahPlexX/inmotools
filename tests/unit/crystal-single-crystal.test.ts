import { describe, expect, it } from 'vitest';
import { simulateLaueBackReflection, simulateSingleCrystal } from '../../src/tools/crystal/single-crystal-engine';
import type { CrystalDocument } from '../../src/tools/crystal/crystal-types';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;
const doc: CrystalDocument = {
  version: 1, id: 't', name: 't', sourceFormat: 'empty', cell: cubic,
  sites: [
    { id: 'na', label: 'Na', element: 'Na', fractional: [0, 0, 0], occupancy: 1 },
    { id: 'cl', label: 'Cl', element: 'Cl', fractional: [0.5, 0.5, 0.5], occupancy: 1 },
  ],
  metadata: {}, provenance: [],
};

describe('crystal single-crystal engine', () => {
  it('lists Bragg-feasible reflections with structure-factor intensities at a fixed wavelength', () => {
    const pattern = simulateSingleCrystal(doc, { wavelength: 1.5406, minDSpacing: 1.0 });
    expect(pattern.reflections.length).toBeGreaterThan(0);
    for (const r of pattern.reflections) {
      expect(1.5406).toBeLessThan(2 * r.d);
      expect(Number.isFinite(r.intensity)).toBe(true);
      expect(Math.hypot(r.gVector[0], r.gVector[1], r.gVector[2])).toBeCloseTo(1 / r.d, 8);
    }
    // |F|² weighting active: (200) must outrank (111)
    const r200 = pattern.reflections.find((r) => r.hkl.join(',') === '2,0,0')!;
    const r111 = pattern.reflections.find((r) => r.hkl.join(',') === '1,1,1')!;
    expect(r200.intensity).toBeGreaterThan(r111.intensity);
  });

  it('simulates back-reflection Laue: wavelength solved per reflection from fixed geometry', () => {
    const pattern = simulateLaueBackReflection(doc, { minWavelength: 0.2, maxWavelength: 2.5, minDSpacing: 1.0 });
    for (const r of pattern.reflections) {
      expect(r.wavelength).toBeGreaterThanOrEqual(0.2);
      expect(r.wavelength).toBeLessThanOrEqual(2.5);
      // Laue condition: λ = 2d·sinθ with sinθ = -Gz/|G|
      expect(r.gVector[2]).toBeLessThan(0);
      expect(r.wavelength).toBeCloseTo(-2 * r.gVector[2] / (1 / r.d) ** 2, 8);
    }
  });

  it('rejects invalid wavelength bands and empty geometry', () => {
    expect(() => simulateLaueBackReflection(doc, { minWavelength: 0, maxWavelength: 1, minDSpacing: 1 })).toThrow(RangeError);
    expect(() => simulateLaueBackReflection(doc, { minWavelength: 2, maxWavelength: 1, minDSpacing: 1 })).toThrow(RangeError);
    expect(() => simulateSingleCrystal(doc, { wavelength: 0, minDSpacing: 1 })).toThrow(RangeError);
  });
});
