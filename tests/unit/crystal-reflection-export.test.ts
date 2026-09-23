import { describe, expect, it } from 'vitest';
import { exportCrystal } from '../../src/tools/crystal/structure-export-engine';
import type { CrystalDocument } from '../../src/tools/crystal/crystal-types';

const doc: CrystalDocument = {
  version: 1, id: 't', name: 'NaCl test', sourceFormat: 'empty',
  cell: { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 },
  sites: [
    { id: 'na', label: 'Na', element: 'Na', fractional: [0, 0, 0], occupancy: 1 },
    { id: 'cl', label: 'Cl', element: 'Cl', fractional: [0.5, 0.5, 0.5], occupancy: 1 },
  ],
  metadata: {}, provenance: [],
};

describe('crystal reflection table export', () => {
  it('exports a reflections CSV with d-spacings and structure-factor intensities', () => {
    const result = exportCrystal(doc, 'reflections-csv');
    expect(result.filename).toMatch(/\.csv$/);
    expect(result.mime).toContain('csv');
    const lines = result.text.trim().split('\n');
    expect(lines[0]).toContain('h,k,l,d');
    const row200 = lines.find((l) => l.startsWith('2,0,0,'))!;
    expect(row200).toBeDefined();
    expect(row200).toContain('2.5'); // d-spacing
    expect(row200).toContain('784'); // |F|²
    const row111 = lines.find((l) => l.startsWith('1,1,1,'))!;
    expect(row111).toContain('36'); // |F|²
  });

  it('exports an hkl reflection file with fixed-width indices and |F|²', () => {
    const result = exportCrystal(doc, 'reflections-hkl');
    expect(result.filename).toMatch(/\.hkl$/);
    const row200 = result.text.split('\n').find((l) => l.trim().startsWith('2 0 0'))!;
    expect(row200).toContain('784.00');
  });

  it('degrades honestly when a site lacks a verified scattering factor', () => {
    const degraded: CrystalDocument = { ...doc, sites: [{ id: 'x', label: 'X', element: 'X', fractional: [0, 0, 0], occupancy: 1 }] };
    const result = exportCrystal(degraded, 'reflections-csv');
    expect(result.text).toContain('# structure factors unavailable');
    expect(result.text.split('\n').some((l) => l.startsWith('1,0,0,'))).toBe(true);
  });

  it('rejects a degenerate cell', () => {
    const bad: CrystalDocument = { ...doc, cell: { ...doc.cell, a: 0 } };
    expect(() => exportCrystal(bad, 'reflections-csv')).toThrow(RangeError);
  });
});
