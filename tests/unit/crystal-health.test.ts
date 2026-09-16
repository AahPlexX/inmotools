import { describe, expect, it } from 'vitest';
import { cellVolume } from '../../src/tools/crystal/cell-engine';
import { createStarterStructure } from '../../src/tools/crystal/document-engine';
import type { CrystalDocument } from '../../src/tools/crystal/crystal-types';
import {
  computeBondValenceSums,
  summarizeComposition,
  validateCrystalStructure,
} from '../../src/tools/crystal/structure-health-engine';

describe('Crystal composition and structure health', () => {
  it('reports occupancy-weighted NaCl composition, formula mass and density', () => {
    const document = createStarterStructure('nacl');
    const summary = summarizeComposition(document);

    expect(summary.formula).toMatch(/Na4.*Cl4|Cl4.*Na4/);
    expect(summary.reducedFormula).toMatch(/NaCl|ClNa/);
    expect(summary.formulaMass).toBeCloseTo(58.44, 1);
    expect(summary.cellMass).toBeCloseTo(4 * 58.44, 0);
    expect(summary.density).toBeGreaterThan(2);
    expect(summary.density).toBeLessThan(2.3);
    expect(summary.fractions.Na).toBeCloseTo(0.5, 10);
    expect(summary.fractions.Cl).toBeCloseTo(0.5, 10);
    expect(cellVolume(document.cell)).toBeGreaterThan(0);
  });

  it('weights partial occupancy rather than rounding it to a whole atom', () => {
    const source = createStarterStructure('cscl');
    const document: CrystalDocument = {
      ...source,
      sites: source.sites.map((site, index) => index === 0 ? { ...site, occupancy: 0.5 } : site),
    };
    const summary = summarizeComposition(document);

    expect(summary.fractions.Cs).toBeCloseTo(1 / 3, 10);
    expect(summary.fractions.Cl).toBeCloseTo(2 / 3, 10);
    expect(summary.cellMass).toBeCloseTo(132.91 * 0.5 + 35.45, 8);
  });

  it('separates invalid occupancy errors from short-contact warnings', () => {
    const source = createStarterStructure('bcc');
    const document: CrystalDocument = {
      ...source,
      sites: [
        { ...source.sites[0]!, occupancy: 1.2 },
        { ...source.sites[1]!, fractional: [0.01, 0, 0] },
      ],
    };
    const findings = validateCrystalStructure(document);

    expect(findings.some((item) => item.severity === 'error' && /occupancy/i.test(item.message))).toBe(true);
    expect(findings.some((item) => item.severity === 'warning' && /contact/i.test(item.message))).toBe(true);
  });

  it('reports unsupported elements without inventing atomic masses', () => {
    const source = createStarterStructure('sc');
    const summary = summarizeComposition(source);
    const findings = validateCrystalStructure(source);

    expect(summary.formulaMass).toBe(0);
    expect(summary.density).toBe(0);
    expect(findings.some((item) => /mass|element/i.test(item.message))).toBe(true);
  });

  it('returns an explicit diagnostic instead of guessing missing bond-valence parameters', () => {
    const source = createStarterStructure('nacl');
    const results = computeBondValenceSums(source);

    expect(results).toHaveLength(source.sites.length);
    expect(results.every((item) => item.value === null)).toBe(true);
    expect(results.every((item) => item.diagnostic && /oxidation|parameter/i.test(item.diagnostic))).toBe(true);
  });
});