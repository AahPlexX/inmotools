import { describe, expect, it } from 'vitest';
import { buildClamp, buildScaleMatrix, resolveClampAt, resolveGeneratedCssAt } from '../../src/tools/typography/fluid-engine';

describe('fluid scale math', () => {
  it('converts rem-per-pixel slope into a correct vw coefficient', () => {
    const result = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1280, unit: 'rem', rootFontPx: 16 });
    expect(result.css).toBe('clamp(1rem, calc(0.6667rem + 1.6667vw), 2rem)');
  });

  it('validates the serialized expression at both audited endpoints', () => {
    const input = { minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(buildClamp(input).css).toBe('clamp(1rem, calc(0.7143rem + 1.4286vw), 2rem)');
    expect(resolveGeneratedCssAt(input, 320)).toBeCloseTo(1, 4);
    expect(resolveGeneratedCssAt(input, 1440)).toBeCloseTo(2, 4);
  });

  it('increases emitted precision instead of collapsing tiny valid clamps to zero', () => {
    const input = { minValue: 0.00001, maxValue: 0.00002, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    const clamp = buildClamp(input);
    expect(clamp.css).not.toContain('clamp(0rem');
    expect(clamp.css).not.toContain('calc(0rem + 0vw)');
    expect(resolveGeneratedCssAt(input, 320)).toBeCloseTo(0.00001, 8);
    expect(resolveGeneratedCssAt(input, 1440)).toBeCloseTo(0.00002, 8);
  });

  it('makes the root-size assumption change the generated vw coefficient', () => {
    const sixteen = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem', rootFontPx: 16 });
    const twenty = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem', rootFontPx: 20 });
    expect(sixteen.vw).toBeCloseTo(1.428571, 5);
    expect(twenty.vw).toBeCloseTo(1.785714, 5);
  });

  it('supports px output and rejects invalid ranges, roots, ratios, and fractional scale steps', () => {
    expect(buildClamp({ minValue: 16, maxValue: 32, minViewport: 320, maxViewport: 1440, unit: 'px' }).css).toBe('clamp(16px, calc(11.4286px + 1.4286vw), 32px)');
    expect(() => buildClamp({ minValue: 1, maxValue: 2, minViewport: 1280, maxViewport: 320, unit: 'rem' })).toThrow();
    expect(() => buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1280, unit: 'rem', rootFontPx: 0 })).toThrow(/root font/i);
    expect(() => buildScaleMatrix({ minBase: 1, maxBase: 2, ratio: 0, steps: [0] })).toThrow(/ratio/i);
    expect(() => buildScaleMatrix({ minBase: 1, maxBase: 2, ratio: 1.25, steps: [0.5] })).toThrow(/whole numbers/i);
  });

  it('creates named scale steps without hardcoded counts', () => {
    const matrix = buildScaleMatrix({ minBase: 1, maxBase: 1.125, ratio: 1.25, steps: [-1, 0, 1] });
    expect(matrix.map((step) => step.name)).toEqual(['step--1', 'step-0', 'step-1']);
  });
});

describe('per-step clamp interpolation', () => {
  const input = { minBase: 1, maxBase: 2, ratio: 1.25, steps: [-1, 0, 1], minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };

  it('gives every step its own clamp and reaches its bounds', () => {
    const matrix = buildScaleMatrix(input);
    const preferred = matrix.map((step) => /calc\((.*?)\)/.exec(step.css)?.[1]);
    expect(new Set(preferred).size).toBe(3);
    const step = matrix[2];
    const clamp = { minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(resolveClampAt(clamp, 320)).toBeCloseTo(1.25, 4);
    expect(resolveGeneratedCssAt(clamp, 1440)).toBeCloseTo(2.5, 4);
  });

  it('interpolates midway and honours an arbitrary integer step range', () => {
    const step = buildScaleMatrix(input)[1];
    const clamp = { minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(resolveGeneratedCssAt(clamp, 880)).toBeCloseTo(1.5, 3);
    const wide = buildScaleMatrix({ ...input, steps: [-2, -1, 0, 1, 2, 3, 4] });
    expect(wide).toHaveLength(7);
  });
});
