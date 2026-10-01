import { describe, expect, it } from 'vitest';
import { structureFactor, structureFactorIntensity } from '../../src/tools/crystal/structure-factor-engine';
import type { CrystalDocument, CrystalSite } from '../../src/tools/crystal/crystal-types';

const site = (id: string, element: string, fractional: readonly [number, number, number]): CrystalSite => ({
  id, label: id, element, fractional, occupancy: 1,
});

const naclLike: CrystalDocument = {
  version: 1,
  id: 'test',
  name: 'test',
  sourceFormat: 'empty',
  cell: { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 },
  sites: [site('na', 'Na', [0, 0, 0]), site('cl', 'Cl', [0.5, 0.5, 0.5])],
  metadata: {},
  provenance: [],
};

describe('crystal structure factor engine', () => {
  it('computes F(200) = fNa + fCl and F(111) = fNa - fCl', () => {
    // Na Z=11 at origin, Cl Z=17 at (1/2,1/2,1/2): phase = pi*(h+k+l)
    const f200 = structureFactor(naclLike, [2, 0, 0]);
    expect(f200.real).toBeCloseTo(11 + 17, 8);
    expect(f200.imag).toBeCloseTo(0, 8);
    const f111 = structureFactor(naclLike, [1, 1, 1]);
    expect(f111.real).toBeCloseTo(11 - 17, 8);
    expect(f111.imag).toBeCloseTo(0, 8);
  });

  it('reports |F|^2 as intensity', () => {
    expect(structureFactorIntensity(naclLike, [2, 0, 0])).toBeCloseTo(28 * 28, 6);
    expect(structureFactorIntensity(naclLike, [1, 1, 1])).toBeCloseTo(36, 6);
  });

  it('is extinct for a zero Miller index and rejects unknown elements', () => {
    expect(() => structureFactor(naclLike, [0, 0, 0])).toThrow(RangeError);
    const bad: CrystalDocument = { ...naclLike, sites: [site('x', 'Qq', [0, 0, 0])] };
    expect(() => structureFactor(bad, [1, 0, 0])).toThrow(RangeError);
  });

  it('respects partial occupancy as a multiplier on the site contribution', () => {
    const partial: CrystalDocument = { ...naclLike, sites: [{ ...site('na', 'Na', [0, 0, 0]), occupancy: 0.5 }] };
    const f = structureFactor(partial, [1, 0, 0]);
    expect(f.real).toBeCloseTo(5.5, 8);
  });

  it('uses coherent neutron scattering lengths (not Z) in neutron mode', () => {
    // Na b=3.63 fm, Cl b=9.5792 fm (NIST NCNR) — very different ratio from Z=11/17,
    // so a bug that reused the X-ray model would not reproduce these values.
    const f200 = structureFactor(naclLike, [2, 0, 0], 'neutron');
    expect(f200.real).toBeCloseTo(3.63 + 9.5792, 8);
    const f111 = structureFactor(naclLike, [1, 1, 1], 'neutron');
    expect(f111.real).toBeCloseTo(3.63 - 9.5792, 8);
    expect(structureFactorIntensity(naclLike, [1, 1, 1], 'neutron')).toBeCloseTo((3.63 - 9.5792) ** 2, 6);
  });

  it('defaults to the X-ray (Z-based) model when radiation is omitted, unchanged from before', () => {
    expect(structureFactor(naclLike, [2, 0, 0]).real).toBeCloseTo(structureFactor(naclLike, [2, 0, 0], 'xray').real, 10);
  });

  it('rejects neutron mode for an element with no verified scattering length', () => {
    const noB: CrystalDocument = { ...naclLike, sites: [site('x', 'X', [0, 0, 0])] };
    expect(() => structureFactor(noB, [1, 0, 0], 'neutron')).toThrow(/neutron coherent scattering length/);
  });
});
