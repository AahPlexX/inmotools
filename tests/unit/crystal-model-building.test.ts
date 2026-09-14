import { describe, expect, it } from 'vitest';
import { fractionalToCartesian } from '../../src/tools/crystal/cell-engine';
import {
  addCrystalSite,
  createEmptyCrystal,
  createStarterStructure,
  setCrystalCell,
} from '../../src/tools/crystal/document-engine';
import {
  applyStrain,
  buildSlab,
  compareMappedStructures,
  createDomainOverlay,
  createInterstitial,
  createSubstitution,
  createVacancy,
  defectConcentration,
  reconstructPeriodicMolecule,
  transformBasis,
} from '../../src/tools/crystal/model-building-engine';
import type { Mat3 } from '../../src/tools/crystal/crystal-types';

const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const ZERO: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

describe('crystal model building engine', () => {
  it('applies the identity basis transform without moving sites or changing the cell', () => {
    const source = createStarterStructure('bcc');
    const transformed = transformBasis(source, IDENTITY);

    expect(transformed.cell).toEqual(source.cell);
    expect(transformed.sites).toEqual(source.sites);
    expect(transformed).not.toBe(source);
    expect(transformed.provenance.at(-1)?.kind).toBe('basis-transform');
  });

  it('supports a unimodular axis exchange and preserves fractional geometry in the rebased cell', () => {
    let source = createEmptyCrystal('Orthorhombic basis fixture');
    source = setCrystalCell(source, { a: 3, b: 5, c: 7, alpha: 90, beta: 90, gamma: 90 });
    source = addCrystalSite(source, { label: 'C1', element: 'C', fractional: [0.2, 0.3, 0.4], occupancy: 1 });
    const exchange: Mat3 = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];

    const transformed = transformBasis(source, exchange);
    expect(transformed.cell.a).toBeCloseTo(5, 12);
    expect(transformed.cell.b).toBeCloseTo(3, 12);
    expect(transformed.cell.c).toBeCloseTo(7, 12);
    expect(transformed.sites[0]!.fractional).toEqual([0.3, 0.2, 0.4]);
    expect(Math.hypot(...fractionalToCartesian(transformed.sites[0]!.fractional, transformed.cell)))
      .toBeCloseTo(Math.hypot(...fractionalToCartesian(source.sites[0]!.fractional, source.cell)), 12);
  });

  it('applies an explicit origin shift and wraps the resulting fractional coordinates', () => {
    const source = createStarterStructure('bcc');
    const shifted = transformBasis(source, IDENTITY, [0.25, 0, 0]);
    expect(shifted.sites[0]!.fractional).toEqual([0.75, 0, 0]);
    expect(shifted.sites[1]!.fractional).toEqual([0.25, 0.5, 0.5]);
  });

  it('rejects singular and non-unimodular basis transforms instead of silently changing multiplicity', () => {
    const source = createStarterStructure('bcc');
    expect(() => transformBasis(source, [[1, 0, 0], [0, 0, 0], [0, 0, 1]])).toThrow(/singular|determinant/i);
    expect(() => transformBasis(source, [[2, 0, 0], [0, 1, 0], [0, 0, 1]])).toThrow(/unimodular|multiplicity/i);
    expect(source.sites).toHaveLength(2);
  });

  it('treats strain as a homogeneous small-strain tensor and leaves zero strain unchanged', () => {
    const source = createStarterStructure('bcc');
    const unchanged = applyStrain(source, ZERO);
    expect(unchanged.cell).toEqual(source.cell);

    const expanded = applyStrain(source, [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.1]]);
    expect(expanded.cell.a).toBeCloseTo(source.cell.a * 1.1, 10);
    expect(expanded.cell.b).toBeCloseTo(source.cell.b * 1.1, 10);
    expect(expanded.cell.c).toBeCloseTo(source.cell.c * 1.1, 10);
    expect(expanded.sites.map((site) => site.fractional)).toEqual(source.sites.map((site) => site.fractional));
  });

  it('creates vacancy, substitution and interstitial models immutably with provenance', () => {
    const source = createStarterStructure('bcc');
    const vacancy = createVacancy(source, source.sites[0]!.id);
    const substitution = createSubstitution(source, source.sites[0]!.id, 'Ni');
    const interstitial = createInterstitial(source, { label: 'Cint', element: 'C', fractional: [0.25, 0.25, 0.25], occupancy: 1 });

    expect(vacancy.sites).toHaveLength(source.sites.length - 1);
    expect(vacancy.provenance.at(-1)?.kind).toBe('vacancy');
    expect(substitution.sites[0]!.element).toBe('Ni');
    expect(substitution.provenance.at(-1)?.kind).toBe('substitution');
    expect(interstitial.sites).toHaveLength(source.sites.length + 1);
    expect(interstitial.sites.at(-1)?.id).toMatch(/^user-site-/);
    expect(interstitial.provenance.at(-1)?.kind).toBe('interstitial');
    expect(source.sites[0]!.element).toBe('Fe');
  });

  it('reports defect concentration from deterministic site identity and chemistry changes', () => {
    const source = createStarterStructure('bcc');
    expect(defectConcentration(source, createVacancy(source, source.sites[0]!.id))).toBeCloseTo(0.5, 12);
    expect(defectConcentration(source, createSubstitution(source, source.sites[0]!.id, 'Ni'))).toBeCloseTo(0.5, 12);
  });

  it('compares structures only when stable site mapping is unambiguous', () => {
    const source = createStarterStructure('bcc');
    const moved = {
      ...source,
      sites: source.sites.map((site, index) => index === 0
        ? { ...site, fractional: [0.1, 0, 0] as const }
        : site),
    };
    const comparison = compareMappedStructures(source, moved);
    expect(comparison.siteDeltas).toHaveLength(source.sites.length);
    expect(comparison.siteDeltas[0]!.aSiteId).toBe(source.sites[0]!.id);
    expect(comparison.siteDeltas[0]!.distance).toBeGreaterThan(0);

    expect(() => compareMappedStructures(source, createVacancy(source, source.sites[0]!.id)))
      .toThrow(/mapping|site ids/i);
  });

  it('reconstructs a periodic molecule split across the reference-cell boundary', () => {
    let molecule = createEmptyCrystal('Periodic molecule');
    molecule = setCrystalCell(molecule, { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 });
    molecule = addCrystalSite(molecule, { label: 'C1', element: 'C', fractional: [0.95, 0.5, 0.5], occupancy: 1 });
    molecule = addCrystalSite(molecule, { label: 'C2', element: 'C', fractional: [0.05, 0.5, 0.5], occupancy: 1 });

    const reconstructed = reconstructPeriodicMolecule(molecule, molecule.sites[0]!.id);
    expect(reconstructed).toHaveLength(2);
    expect(reconstructed[0]!.siteId).toBe(molecule.sites[0]!.id);
    const second = reconstructed.find((item) => item.siteId === molecule.sites[1]!.id)!;
    expect(second.image).toEqual([1, 0, 0]);
    expect(second.fractional[0]).toBeCloseTo(1.05, 12);
  });

  it('builds a bounded cubic (100) slab with the requested material thickness and vacuum', () => {
    const source = createStarterStructure('bcc');
    const slab = buildSlab(source, { hkl: [1, 0, 0], thickness: 6, vacuum: 4, offset: 0 });

    expect(slab.sites.length).toBeGreaterThan(0);
    expect(slab.cell.c).toBeCloseTo(10, 10);
    expect(slab.cell.alpha).toBeCloseTo(90, 10);
    expect(slab.cell.beta).toBeCloseTo(90, 10);
    expect(slab.sites.every((site) => site.fractional[2] >= -1e-10 && site.fractional[2] < 0.6 + 1e-10)).toBe(true);
    expect(slab.provenance.at(-1)?.kind).toBe('slab');
  });

  it('creates deterministic identity and rotated domain overlays in Cartesian space', () => {
    const source = createStarterStructure('bcc');
    const identity = createDomainOverlay(source, IDENTITY);
    expect(identity[1]!.position).toEqual(fractionalToCartesian(source.sites[1]!.fractional, source.cell));

    const quarterTurn: Mat3 = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
    const rotated = createDomainOverlay(source, quarterTurn);
    const original = fractionalToCartesian(source.sites[1]!.fractional, source.cell);
    expect(rotated[1]!.position[0]).toBeCloseTo(-original[1], 12);
    expect(rotated[1]!.position[1]).toBeCloseTo(original[0], 12);
    expect(rotated[1]!.position[2]).toBeCloseTo(original[2], 12);
  });

  it('rejects invalid slab and domain requests before producing partial output', () => {
    const source = createStarterStructure('bcc');
    expect(() => buildSlab(source, { hkl: [0, 0, 0], thickness: 5, vacuum: 3, offset: 0 })).toThrow(/miller|hkl/i);
    expect(() => buildSlab(source, { hkl: [1, 0, 0], thickness: 0, vacuum: 3, offset: 0 })).toThrow(/thickness/i);
    expect(() => buildSlab(source, { hkl: [1, 0, 0], thickness: 5, vacuum: -1, offset: 0 })).toThrow(/vacuum/i);
    expect(() => createDomainOverlay(source, [[1, 0, 0], [0, 0, 0], [0, 0, 1]])).toThrow(/singular|determinant/i);
  });
});
