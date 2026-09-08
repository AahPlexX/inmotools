import { describe, expect, it } from 'vitest';
import { buildClamp, buildScaleMatrix, resolveClampAt, resolveGeneratedCssAt } from '../../src/tools/typography/fluid-engine';

describe('fluid scale math', () => {
  it('converts rem-per-pixel slope into a correct vw coefficient', () => {
    const result = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1280, unit: 'rem', rootFontPx: 16 });
    expect(result.css).toBe('clamp(1rem, calc(0.6667rem + 1.6667vw), 2rem)');
  });

  it('reproduces the audited endpoints for 1rem to 2rem over 320px to 1440px', () => {
    const input = { minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(buildClamp(input).css).toBe('clamp(1rem, calc(0.7143rem + 1.4286vw), 2rem)');
    expect(resolveGeneratedCssAt(input, 320)).toBeCloseTo(1, 4);
    expect(resolveGeneratedCssAt(input, 1440)).toBeCloseTo(2, 4);
  });

  it('makes the root-size assumption change the generated vw coefficient', () => {
    const sixteen = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem', rootFontPx: 16 });
    const twenty = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem', rootFontPx: 20 });
    expect(sixteen.vw).toBeCloseTo(1.428571, 5);
    expect(twenty.vw).toBeCloseTo(1.785714, 5);
    expect(resolveGeneratedCssAt({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem', rootFontPx: 20 }, 1440)).toBeCloseTo(2, 4);
  });

  it('rejects inverted ranges and invalid root sizes', () => {
    expect(() => buildClamp({ minValue: 1, maxValue: 2, minViewport: 1280, maxViewport: 320, unit: 'rem' })).toThrow();
    expect(() => buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1280, unit: 'rem', rootFontPx: 0 })).toThrow(/root font/i);
  });

  it('creates named scale steps without hardcoded counts', () => {
    const matrix = buildScaleMatrix({ minBase: 1, maxBase: 1.125, ratio: 1.25, steps: [-1, 0, 1] });
    expect(matrix.map((step) => step.name)).toEqual(['step--1', 'step-0', 'step-1']);
    expect(matrix[2].min).toBeCloseTo(1.25);
  });
});

describe('per-step clamp interpolation', () => {
  const input = { minBase: 1, maxBase: 2, ratio: 1.25, steps: [-1, 0, 1], minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };

  it('gives every step its own clamp rather than reusing the base preferred term', () => {
    const matrix = buildScaleMatrix(input);
    const preferred = matrix.map((step) => /calc\((.*?)\)/.exec(step.css)?.[1]);
    expect(new Set(preferred).size).toBe(3);
  });

  it('reaches each step own declared bounds in both arithmetic and generated CSS', () => {
    const step = buildScaleMatrix(input)[2];
    expect(step.min).toBeCloseTo(1.25, 4);
    expect(step.max).toBeCloseTo(2.5, 4);
    const clamp = { minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(resolveClampAt(clamp, 320)).toBeCloseTo(1.25, 4);
    expect(resolveClampAt(clamp, 1440)).toBeCloseTo(2.5, 4);
    expect(resolveGeneratedCssAt(clamp, 320)).toBeCloseTo(1.25, 4);
    expect(resolveGeneratedCssAt(clamp, 1440)).toBeCloseTo(2.5, 4);
  });

  it('interpolates midway between the endpoints', () => {
    const step = buildScaleMatrix(input)[1];
    const clamp = { minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };
    expect(resolveClampAt(clamp, 880)).toBeCloseTo(1.5, 3);
    expect(resolveGeneratedCssAt(clamp, 880)).toBeCloseTo(1.5, 3);
  });

  it('honours an arbitrary step range', () => {
    const wide = buildScaleMatrix({ ...input, steps: [-2, -1, 0, 1, 2, 3, 4] });
    expect(wide.map((step) => step.name)).toEqual(['step--2', 'step--1', 'step-0', 'step-1', 'step-2', 'step-3', 'step-4']);
  });
});

describe('resolveClampAt', () => {
  const clamp = { minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem' as const, rootFontPx: 16 };

  it('clamps below the minimum viewport and above the maximum', () => {
    expect(resolveClampAt(clamp, 100)).toBeCloseTo(1, 4);
    expect(resolveClampAt(clamp, 3000)).toBeCloseTo(2, 4);
  });

  it('produces different values at different widths', () => {
    const sizes = [320, 768, 1024, 1440].map((width) => resolveClampAt(clamp, width));
    expect(new Set(sizes.map((size) => size.toFixed(4))).size).toBe(4);
  });
});
