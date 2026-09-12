import { describe, expect, it } from 'vitest';
import { createStarterStructure } from '../../src/tools/crystal/starter-structures';
import {
  expandSupercell,
  findPeriodicBonds,
  findPeriodicBondsWithDiagnostics,
  generatePeriodicImages,
  minimumImageFractionalDelta,
  periodicDistance,
  wrapFractional,
} from '../../src/tools/crystal/periodic-engine';
import { measureAngle, measureDihedral } from '../../src/tools/crystal/measurement-engine';
import type { UnitCell } from '../../src/tools/crystal/crystal-types';

const cubic: UnitCell = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 };

describe('periodic crystal geometry', () => {
  it('wraps fractional coordinates and uses the minimum image across a boundary', () => {
    expect(wrapFractional([1.25, -0.1, 2])).toEqual([0.25, 0.9, 0]);
    const delta = minimumImageFractionalDelta([0.95, 0, 0], [0.05, 0, 0]);
    expect(delta[0]).toBeCloseTo(0.1, 12);
    expect(periodicDistance([0.95, 0, 0], [0.05, 0, 0], cubic)).toBeCloseTo(0.5, 10);
  });

  it('expands a BCC cell deterministically, scales the cell and enforces the site limit', () => {
    const bcc = createStarterStructure('bcc');
    const expanded = expandSupercell(bcc, [2, 2, 2]);
    expect(expanded.sites).toHaveLength(bcc.sites.length * 8);
    expect(expanded.cell.a).toBeCloseTo(bcc.cell.a * 2, 12);
    expect(expanded.cell.b).toBeCloseTo(bcc.cell.b * 2, 12);
    expect(expanded.cell.c).toBeCloseTo(bcc.cell.c * 2, 12);
    expect(expanded.sites[0]!.id).toMatch(/@0,0,0$/);
    expect(expanded.provenance.at(-1)?.kind).toBe('supercell');
    expect(() => expandSupercell(bcc, [100, 100, 100], 50_000)).toThrow(/limit|sites/i);
  });

  it('generates stable periodic image identities for a requested image shell', () => {
    const bcc = createStarterStructure('bcc');
    const images = generatePeriodicImages(bcc, 1);
    expect(images).toHaveLength(bcc.sites.length * 27);
    expect(images.some((image) => image.id === `${bcc.sites[0]!.id}@-1,0,1`)).toBe(true);
    expect(images.some((image) => image.image[0] === 0 && image.image[1] === 0 && image.image[2] === 0)).toBe(true);
  });

  it('finds radius-based periodic bonds and reports unsupported element radii rather than guessing', () => {
    const bcc = createStarterStructure('bcc');
    const bonds = findPeriodicBonds(bcc);
    expect(bonds.length).toBeGreaterThan(0);
    expect(bonds.every((bond) => bond.distance > 0)).toBe(true);

    const illustrative = createStarterStructure('sc');
    const result = findPeriodicBondsWithDiagnostics(illustrative);
    expect(result.diagnostics.some((message) => /radius|unsupported|skip/i.test(message))).toBe(true);
  });

  it('measures orthogonal angles and a signed dihedral using periodic vectors', () => {
    const unit: UnitCell = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 };
    expect(measureAngle([0.1, 0, 0], [0, 0, 0], [0, 0.1, 0], unit)).toBeCloseTo(90, 10);
    const dihedral = measureDihedral([0, 0.1, 0], [0, 0, 0], [0.1, 0, 0], [0.1, 0, 0.1], unit);
    expect(Math.abs(dihedral)).toBeCloseTo(90, 10);
  });

  it('rejects invalid repeat counts and shells explicitly', () => {
    const bcc = createStarterStructure('bcc');
    expect(() => expandSupercell(bcc, [0, 2, 2])).toThrow(/repeat|positive|integer/i);
    expect(() => generatePeriodicImages(bcc, -1)).toThrow(/shell|nonnegative|integer/i);
  });
});