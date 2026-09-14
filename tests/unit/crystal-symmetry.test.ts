import { describe, expect, it } from 'vitest';
import { createStarterStructure, updateCrystalSite } from '../../src/tools/crystal/document-engine';
import { analyzeCrystalSymmetry, crystalToMoyoCell } from '../../src/tools/crystal/symmetry-engine';

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
