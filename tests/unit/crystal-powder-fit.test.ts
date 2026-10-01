import { describe, expect, it } from 'vitest';
import { createStarterStructure } from '../../src/tools/crystal/document-engine';
import { simulatePowderPattern } from '../../src/tools/crystal/diffraction-engine';
import { evaluatePowderModel, fitPowderPattern, type PowderModelParameters } from '../../src/tools/crystal/powder-fit-engine';
import type { ObservedPattern } from '../../src/tools/crystal/observed-pattern-engine';

const document = createStarterStructure('nacl');
const setup = { wavelength: 1.5406, minDSpacing: 1.0 } as const;
const truth: PowderModelParameters = { scale: 3, zero: 0.1, background0: 5, background1: 2, fwhm: 0.25, eta: 0.5 };

function syntheticObserved(): ObservedPattern {
  const pattern = simulatePowderPattern(document.cell, { kind: 'xray', ...setup, document });
  const xs = Array.from({ length: 1401 }, (_, index) => 20 + index * 0.05);
  const ys = evaluatePowderModel(pattern.reflections, truth, xs);
  return { name: 'synthetic', xAxis: 'twoTheta', peaks: xs.map((position, index) => ({ position, intensity: ys[index]! })) };
}

describe('powder pattern fitting', () => {
  it('recovers scale, zero shift, background and width from a synthetic trace', () => {
    const result = fitPowderPattern(document, syntheticObserved(), setup);
    expect(result.fit.converged).toBe(true);
    const value = (name: string) => result.fit.parameters.find((parameter) => parameter.name === name)!.value;
    expect(value('scale')).toBeCloseTo(truth.scale, 2);
    expect(value('zero')).toBeCloseTo(truth.zero, 3);
    expect(value('background0')).toBeCloseTo(truth.background0, 2);
    expect(value('background1')).toBeCloseTo(truth.background1, 2);
    expect(value('fwhm')).toBeCloseTo(truth.fwhm, 3);
    expect(result.rp).toBeLessThan(1e-3);
    expect(result.rwp).toBeLessThan(1e-3);
    expect(result.calculated).toHaveLength(1401);
  });

  it('lists the active parameters and honours fixed overrides', () => {
    const result = fitPowderPattern(document, syntheticObserved(), {
      ...setup,
      overrides: { zero: { value: 0.1, free: false }, background1: { value: 2, free: false } },
    });
    expect(result.activeParameters).toEqual(['scale', 'background0', 'fwhm']);
    expect(result.fit.parameters.find((parameter) => parameter.name === 'zero')!.value).toBe(0.1);
  });

  it('rejects d-axis data and traces that are too short to fit', () => {
    const observed = syntheticObserved();
    expect(() => fitPowderPattern(document, { ...observed, xAxis: 'd' }, setup)).toThrow(RangeError);
    expect(() => fitPowderPattern(document, { ...observed, peaks: observed.peaks.slice(0, 3) }, setup)).toThrow(RangeError);
  });
});
