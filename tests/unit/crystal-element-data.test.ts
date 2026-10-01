import { describe, expect, it } from 'vitest';
import { ELEMENTS, getElementReference } from '../../src/tools/crystal/element-data';
import { structureFactor } from '../../src/tools/crystal/structure-factor-engine';
import type { CrystalDocument } from '../../src/tools/crystal/crystal-types';

const doc = (element: string): CrystalDocument => ({
  version: 1, id: 't', name: 't', sourceFormat: 'empty',
  cell: { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 },
  sites: [{ id: 's', label: 's', element, fractional: [0, 0, 0], occupancy: 1 }],
  metadata: {}, provenance: [],
});

describe('crystal element reference data', () => {
  const real = Object.values(ELEMENTS).filter((e) => e.symbol !== 'X');

  it('keys match symbols and atomic numbers are unique and positive', () => {
    for (const [key, e] of Object.entries(ELEMENTS)) expect(e.symbol).toBe(key);
    const numbers = real.map((e) => e.atomicNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((z) => z > 0)).toBe(true);
  });

  it('covers the common structural elements that used to be missing', () => {
    for (const symbol of ['Li', 'Mn', 'Ni', 'Ba', 'Pb', 'U', 'Au', 'La']) {
      expect(getElementReference(symbol), symbol).toBeDefined();
    }
  });

  it('every real element has a positive weight and radius', () => {
    for (const e of real) {
      expect(e.atomicWeight, e.symbol).toBeGreaterThan(0);
      expect(e.covalentRadius, e.symbol).toBeGreaterThan(0);
    }
  });

  it('spot-checks weights against the CIAAW abridged table', () => {
    expect(ELEMENTS.Pb!.atomicWeight).toBe(207.2);
    expect(ELEMENTS.U!.atomicWeight).toBe(238.03);
    expect(ELEMENTS.Ba!.atomicWeight).toBe(137.33);
  });

  it('neutron mode uses signed lengths and refuses absorbers with complex values', () => {
    expect(structureFactor(doc('Mn'), [1, 0, 0], 'neutron').real).toBeCloseTo(-3.75, 8);
    expect(structureFactor(doc('Ba'), [1, 0, 0], 'neutron').real).toBeCloseTo(5.07, 8);
    for (const symbol of ['B', 'Cd', 'In', 'Sm', 'Gd']) {
      expect(() => structureFactor(doc(symbol), [1, 0, 0], 'neutron'), symbol).toThrow(RangeError);
      expect(structureFactor(doc(symbol), [1, 0, 0], 'xray').real).toBeGreaterThan(0);
    }
  });
});
