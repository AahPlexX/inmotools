import { describe, expect, it } from 'vitest';
import { createStarterStructure } from '../../src/tools/crystal/document-engine';
import {
  differenceFourierGrid,
  parseObservedReflections,
  rankResidualDensityPeaks,
  reflectionResiduals,
} from '../../src/tools/crystal/reflection-refinement-engine';

describe('crystal observed-reflection and difference-Fourier analysis', () => {
  it('parses bounded reflection data, reports exact residual metrics, and ranks a finite difference map', () => {
    const parsed = parseObservedReflections('demo.hkl', [
      '1 0 0 10 1',
      '0 1 0 20 2',
      '0 0 1 15 1.5',
      '0 0 0 0 0',
    ].join('\n'));

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ hkl: [1, 0, 0], observedAmplitude: 10, sigma: 1 });

    const metrics = reflectionResiduals([
      { observedAmplitude: 10, calculatedAmplitude: 9, weight: 1 },
      { observedAmplitude: 20, calculatedAmplitude: 18, weight: 1 },
    ]);
    expect(metrics.r1).toBeCloseTo(0.1, 12);
    expect(metrics.weightedR2).toBeGreaterThanOrEqual(0);
    expect(metrics.formulae.r1).toContain('Σ');

    const document = createStarterStructure('bcc');
    const grid = differenceFourierGrid(document, parsed, { nx: 4, ny: 4, nz: 4 });
    expect(grid.dimensions).toEqual([4, 4, 4]);
    expect(grid.values).toHaveLength(64);
    expect(grid.values.every(Number.isFinite)).toBe(true);
    expect(grid.modelDependentPhases).toBe(true);

    const peaks = rankResidualDensityPeaks(grid, 3);
    expect(peaks.maxima.length).toBeLessThanOrEqual(3);
    expect(peaks.minima.length).toBeLessThanOrEqual(3);
    expect(peaks.maxima.every((peak) => Number.isFinite(peak.value))).toBe(true);
    expect(peaks.minima.every((peak) => Number.isFinite(peak.value))).toBe(true);
  });
});
