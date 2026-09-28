import { describe, expect, it } from 'vitest';
import { ewaldIntersection, reflectionsInBraggRange } from '../../src/tools/crystal/ewald-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal Ewald sphere engine', () => {
  it('reports which reflections satisfy the Bragg condition for Cu Kα', () => {
    // λ = 1.5406 Å; (100) at d=5 → λ < 2d so diffracts; high-order fine reflections beyond 1/(2d) limit do not
    const hits = reflectionsInBraggRange(cubic, { wavelength: 1.5406, minDSpacing: 0.8 });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(1.5406).toBeLessThan(2 * hit.d + 1e-9);
      expect(Number.isFinite(hit.scatteringVectorLength)).toBe(true);
    }
    // must be a subset of all enumerated reflections
    expect(hits.every((h) => h.d >= 0.8)).toBe(true);
  });

  it('marks (100) as intersecting for λ=1.5406 on a 5 Å cubic cell', () => {
    const result = ewaldIntersection(cubic, [1, 0, 0], 1.5406);
    expect(result.diffracts).toBe(true);
    expect(result.scatteringVectorLength).toBeCloseTo(0.2, 10);
    expect(result.twoTheta).toBeCloseTo((2 * Math.asin(1.5406 / 10) * 180) / Math.PI, 10);
  });

  it('reports non-diffraction when wavelength exceeds 2d', () => {
    const result = ewaldIntersection(cubic, [1, 0, 0], 12);
    expect(result.diffracts).toBe(false);
    expect(result.twoTheta).toBeNull();
  });

  it('rejects non-positive wavelength and degenerate indices', () => {
    expect(() => ewaldIntersection(cubic, [1, 0, 0], 0)).toThrow(RangeError);
    expect(() => ewaldIntersection(cubic, [0, 0, 0], 1.5406)).toThrow(RangeError);
  });
});
