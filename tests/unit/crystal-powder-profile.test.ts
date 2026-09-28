import { describe, expect, it } from 'vitest';
import { broadenPowderPattern, simulatePowderPattern } from '../../src/tools/crystal/diffraction-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;
const base = () => simulatePowderPattern(cubic, { kind: 'xray', wavelength: 1.5406, minDSpacing: 2.4 });

describe('crystal powder profile broadening', () => {
  it('convolves sticks into a continuous profile peaking at stick positions', () => {
    const pattern = base();
    const profile = broadenPowderPattern(pattern, { profileShape: 'gaussian', fwhm: 0.15, step: 0.02 });
    expect(profile.length).toBeGreaterThan(10);
    expect(profile.length).toBeLessThanOrEqual(20_000);
    // group sticks into degenerate families (same 2theta): Friedel-uncollapsed
    // equivalents share a position, and the profile argmax must sit on the
    // family with the greatest summed intensity
    const familySum = new Map<number, number>();
    for (const r of pattern.reflections) {
      familySum.set(r.twoTheta, (familySum.get(r.twoTheta) ?? 0) + r.intensity);
    }
    const strongestPosition = [...familySum.entries()].reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
    const globalMax = profile.reduce((a, b) => (a.intensity >= b.intensity ? a : b));
    expect(Math.abs(globalMax.twoTheta - strongestPosition)).toBeLessThan(0.15);
    // and the profile value at every other family position stays below it
    for (const [position] of familySum) {
      if (position === strongestPosition) continue;
      const atOther = profile.reduce((best, p) => (Math.abs(p.twoTheta - position) < Math.abs(best.twoTheta - position) ? p : best));
      expect(atOther.intensity).toBeLessThan(globalMax.intensity);
    }
  });

  it('supports lorentzian and pseudo-voigt shapes with heavier tails than gaussian', () => {
    const pattern = base();
    const g = broadenPowderPattern(pattern, { profileShape: 'gaussian', fwhm: 0.2, step: 0.02 });
    const l = broadenPowderPattern(pattern, { profileShape: 'lorentzian', fwhm: 0.2, step: 0.02 });
    const pv = broadenPowderPattern(pattern, { profileShape: 'pseudo-voigt', fwhm: 0.2, step: 0.02, eta: 0.4 });
    const first = pattern.reflections[pattern.reflections.length - 1]!.twoTheta;
    const tailX = first + 1.0;
    const tailOf = (pts: readonly { twoTheta: number; intensity: number }[]) =>
      pts.reduce((best, p) => (Math.abs(p.twoTheta - tailX) < Math.abs(best.twoTheta - tailX) ? p : best)).intensity;
    expect(tailOf(l)).toBeGreaterThan(tailOf(g));
    expect(tailOf(pv)).toBeGreaterThan(tailOf(g));
    expect(tailOf(pv)).toBeLessThan(tailOf(l));
  });

  it('rejects invalid profile parameters and enforces the point cap', () => {
    const pattern = base();
    expect(() => broadenPowderPattern(pattern, { profileShape: 'gaussian', fwhm: 0, step: 0.02 })).toThrow(RangeError);
    expect(() => broadenPowderPattern(pattern, { profileShape: 'gaussian', fwhm: 0.1, step: 0 })).toThrow(RangeError);
    expect(() => broadenPowderPattern(pattern, { profileShape: 'pseudo-voigt', fwhm: 0.1, step: 0.02, eta: 1.5 })).toThrow(RangeError);
    expect(() => broadenPowderPattern(pattern, { profileShape: 'gaussian', fwhm: 0.001, step: 0.0001 })).toThrow(RangeError); // point cap
  });
});
