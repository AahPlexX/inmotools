import { describe, expect, it } from 'vitest';
import { createStarterStructure, updateCrystalSite } from '../../src/tools/crystal/document-engine';
import {
  analyzeCrystalSymmetry,
  applySymmetryOperation,
  crystalToMoyoCell,
  generateEquivalentSites,
  reflectionAllowed,
  standardizeCrystal,
  validateSourceSymmetry,
} from '../../src/tools/crystal/symmetry-engine';
import type { CrystalSymmetryOperation } from '../../src/tools/crystal/symmetry-types';

describe('crystal symmetry adapter', () => {
  it('maps the canonical lattice row-major without mutating fractional positions', () => {
    const source = createStarterStructure('bcc');
    const before = source.sites.map((site) => [...site.fractional]);
    const cell = crystalToMoyoCell(source);

    expect(cell.lattice.basis).toEqual([
      source.cell.a, 0, 0,
      0, source.cell.b, 0,
      0, 0, source.cell.c,
    ]);
    expect(cell.positions).toEqual(before);
    expect(source.sites.map((site) => site.fractional)).toEqual(before);
    expect(cell.numbers).toEqual([26, 26]);
  });

  it('detects Im-3m BCC and returns normalized symmetry metadata', async () => {
    const result = await analyzeCrystalSymmetry(createStarterStructure('bcc'), 1e-4);
    expect(result.number).toBe(229);
    expect(result.hmSymbol).toMatch(/I\s*m.*-?3.*m/i);
    expect(result.hallNumber).toBeGreaterThan(0);
    expect(result.crystalSystem).toBe('cubic');
    expect(result.pointGroup).toBe('m-3m');
    expect(result.pearsonSymbol).toMatch(/^cI/i);
    expect(result.operations.length).toBeGreaterThan(1);
    expect(result.wyckoffs).toHaveLength(2);
    expect(result.siteSymmetrySymbols).toHaveLength(2);
    expect(result.orbits).toHaveLength(2);
    expect(result.standardized.sites.length).toBeGreaterThan(0);
    expect(result.primitive.sites.length).toBeGreaterThan(0);
    expect(result.tolerance).toBeCloseTo(1e-4, 12);
  });

  it('fails visibly for an element without a verified atomic-number mapping', async () => {
    const source = createStarterStructure('bcc');
    const unsupported = updateCrystalSite(source, source.sites[0]!.id, { element: 'Qq' });
    await expect(analyzeCrystalSymmetry(unsupported)).rejects.toThrow(/atomic number|unsupported element/i);
  });

  it('does not silently coerce partial occupancy or explicit disorder into an ordered symmetry model', async () => {
    const source = createStarterStructure('bcc');
    const partial = updateCrystalSite(source, source.sites[0]!.id, { occupancy: 0.5 });
    await expect(analyzeCrystalSymmetry(partial)).rejects.toThrow(/occupancy|disorder/i);

    const disordered = updateCrystalSite(source, source.sites[0]!.id, { disorderAssembly: 'A', disorderGroup: '1' });
    await expect(analyzeCrystalSymmetry(disordered)).rejects.toThrow(/occupancy|disorder/i);
  });

  it('rejects invalid tolerances before invoking the symmetry kernel', async () => {
    await expect(analyzeCrystalSymmetry(createStarterStructure('bcc'), 0)).rejects.toThrow(/tolerance/i);
    await expect(analyzeCrystalSymmetry(createStarterStructure('bcc'), Number.NaN)).rejects.toThrow(/tolerance/i);
  });
});

describe('crystal symmetry operations', () => {
  const identity: CrystalSymmetryOperation = {
    rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    translation: [0, 0, 0],
  };
  const inversion: CrystalSymmetryOperation = {
    rotation: [-1, 0, 0, 0, -1, 0, 0, 0, -1],
    translation: [0, 0, 0],
  };

  it('applies operations in wrapped fractional coordinates', () => {
    expect(applySymmetryOperation([0.1, 0.2, 0.3], identity)).toEqual([0.1, 0.2, 0.3]);
    const inverted = applySymmetryOperation([0.1, 0.2, 0.3], inversion);
    expect(inverted[0]).toBeCloseTo(0.9, 12);
    expect(inverted[1]).toBeCloseTo(0.8, 12);
    expect(inverted[2]).toBeCloseTo(0.7, 12);
  });

  it('generates deduplicated equivalent sites without mutating the source', async () => {
    const bcc = createStarterStructure('bcc');
    const before = bcc.sites.map((site) => [...site.fractional]);
    const result = await analyzeCrystalSymmetry(bcc, 1e-4);
    const generated = generateEquivalentSites(bcc, result);

    expect(generated.sites).toHaveLength(2);
    expect(generated.sites.every((site) => site.fractional.every((value) => value >= 0 && value < 1))).toBe(true);
    expect(generated.provenance.at(-1)?.kind).toBe('symmetry-equivalent-sites');
    expect(bcc.sites.map((site) => [...site.fractional])).toEqual(before);
  });

  it('standardizes to conventional and primitive cells with provenance', async () => {
    const bcc = createStarterStructure('bcc');
    const result = await analyzeCrystalSymmetry(bcc, 1e-4);

    expect(standardizeCrystal(bcc, result, 'conventional').sites).toHaveLength(2);
    expect(standardizeCrystal(bcc, result, 'primitive').sites).toHaveLength(1);
    expect(standardizeCrystal(bcc, result, 'primitive').provenance.at(-1)?.kind).toBe('symmetry-standardize');
  });

  it('reports BCC h+k+l extinction conditions from the operation set', async () => {
    const result = await analyzeCrystalSymmetry(createStarterStructure('bcc'), 1e-4);
    expect(reflectionAllowed([1, 0, 0], result.operations)).toBe(false);
    expect(reflectionAllowed([0, 1, 0], result.operations)).toBe(false);
    expect(reflectionAllowed([1, 1, 0], result.operations)).toBe(true);
    expect(reflectionAllowed([2, 0, 0], result.operations)).toBe(true);
    expect(() => reflectionAllowed([0.5, 0, 0], result.operations)).toThrow(/integer/i);
    expect(() => reflectionAllowed([1, 0, 0], result.operations, 0)).toThrow(/tolerance/i);
  });

  it('flags operations that no longer map an edited structure onto itself', async () => {
    const bcc = createStarterStructure('bcc');
    const result = await analyzeCrystalSymmetry(bcc, 1e-4);
    expect(validateSourceSymmetry(bcc, result, 1e-4)).toEqual([]);

    const moved = updateCrystalSite(bcc, bcc.sites[1]!.id, { fractional: [0.13, 0.5, 0.5] });
    const findings = validateSourceSymmetry(moved, result, 1e-4);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.severity).toBe('warning');
    expect(findings[0]!.siteIds.length).toBeGreaterThan(0);
  });
});
