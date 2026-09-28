import { describe, expect, it } from 'vitest';
import {
  cagliotiFwhm,
  estimateRietveldPhaseFractions,
  marchDollaseFactor,
  pickProfilePeaks,
  sampleBroadeningFwhm,
  simulateMultiPhaseProfile,
} from '../../src/tools/crystal/powder-analysis-engine';
import { simulatePowderPattern } from '../../src/tools/crystal/diffraction-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal advanced powder analysis', () => {
  it('models instrumental, size, strain and preferred-orientation terms with explicit bounded formulas', () => {
    expect(cagliotiFwhm(40, { u: 0.01, v: -0.002, w: 0.004 })).toBeGreaterThan(0);
    expect(sampleBroadeningFwhm(40, 1.5406, { crystalliteSizeNm: 80, microstrain: 0.001 })).toBeGreaterThan(0);
    expect(marchDollaseFactor(cubic, [1, 0, 0], [1, 0, 0], 1)).toBeCloseTo(1, 12);
  });

  it('combines scaled phase profiles, picks peaks and estimates phase fractions only with complete ZMV inputs', () => {
    const first = simulatePowderPattern(cubic, { kind: 'xray', wavelength: 1.5406, minDSpacing: 2.1 });
    const secondCell = { ...cubic, a: 4.5, b: 4.5, c: 4.5 };
    const second = simulatePowderPattern(secondCell, { kind: 'xray', wavelength: 1.5406, minDSpacing: 2.1 });
    const profile = simulateMultiPhaseProfile([
      { id: 'a', pattern: first, scale: 2 },
      { id: 'b', pattern: second, scale: 1 },
    ], {
      step: 0.04,
      eta: 0.5,
      caglioti: { u: 0, v: 0, w: 0.01 },
      crystalliteSizeNm: 100,
      microstrain: 0.0005,
    });
    expect(profile.points.length).toBeGreaterThan(10);
    expect(profile.phaseIds).toEqual(['a', 'b']);
    expect(profile.assumptions.some((entry) => entry.includes('Caglioti'))).toBe(true);

    const peaks = pickProfilePeaks(profile.points, { minRelativeHeight: 0.05, minSeparation: 0.08 });
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.every((peak) => peak.intensity > 0)).toBe(true);

    const fractions = estimateRietveldPhaseFractions([
      { id: 'a', scale: 2, z: 4, formulaMass: 60, cellVolume: 125 },
      { id: 'b', scale: 1, z: 2, formulaMass: 100, cellVolume: 90 },
    ]);
    expect(fractions.reduce((sum, phase) => sum + phase.weightFraction, 0)).toBeCloseTo(1, 12);
    expect(() => estimateRietveldPhaseFractions([
      { id: 'a', scale: 2, z: null, formulaMass: 60, cellVolume: 125 },
    ])).toThrow(/requires/i);
  });
});
