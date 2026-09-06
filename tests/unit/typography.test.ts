import { describe, expect, it } from 'vitest';
import { buildClamp, buildScaleMatrix, resolveClampAt } from '../../src/tools/typography/fluid-engine';

describe('fluid scale math', () => {
  it('builds a deterministic accessible clamp expression', () => {
    const result = buildClamp({ minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1280, unit: 'rem' });
    expect(result.css).toBe('clamp(1rem, calc(0.6667rem + 0.1042vw), 2rem)');
  });

  it('rejects inverted viewport ranges', () => {
    expect(() => buildClamp({ minValue: 1, maxValue: 2, minViewport: 1280, maxViewport: 320, unit: 'rem' })).toThrow();
  });

  it('creates named scale steps without hardcoded counts', () => {
    const matrix = buildScaleMatrix({ minBase: 1, maxBase: 1.125, ratio: 1.25, steps: [-1, 0, 1] });
    expect(matrix.map((step) => step.name)).toEqual(['step--1', 'step-0', 'step-1']);
    expect(matrix[2].min).toBeCloseTo(1.25);
  });
});


describe('per-step clamp interpolation', () => {
  const input = { minBase: 1, maxBase: 2, ratio: 1.25, steps: [-1, 0, 1], minViewport: 320, maxViewport: 1440, unit: 'rem' };

  it('gives every step its own clamp rather than reusing the base preferred term', () => {
    const matrix = buildScaleMatrix(input);
    const preferred = matrix.map((step) => /calc\((.*?)\)/.exec(step.css)?.[1]);
    // Three distinct interpolations, not one repeated.
    expect(new Set(preferred).size).toBe(3);
  });

  it('reaches each step\'s own declared bounds at the viewport endpoints', () => {
    // The defect this guards: step-1 stayed pinned at its minimum until roughly
    // 1041px and topped out at 2rem instead of its declared 2.5rem.
    const step = buildScaleMatrix(input)[2];
    expect(step.min).toBeCloseTo(1.25, 4);
    expect(step.max).toBeCloseTo(2.5, 4);
    expect(resolveClampAt({ minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' }, 320)).toBeCloseTo(1.25, 4);
    expect(resolveClampAt({ minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' }, 1440)).toBeCloseTo(2.5, 4);
  });

  it('interpolates midway between the endpoints', () => {
    const step = buildScaleMatrix(input)[1];
    const middle = resolveClampAt({ minValue: step.min, maxValue: step.max, minViewport: 320, maxViewport: 1440, unit: 'rem' }, 880);
    expect(middle).toBeCloseTo(1.5, 3);
  });

  it('honours an arbitrary step range', () => {
    const wide = buildScaleMatrix({ ...input, steps: [-2, -1, 0, 1, 2, 3, 4] });
    expect(wide.map((step) => step.name)).toEqual(['step--2', 'step--1', 'step-0', 'step-1', 'step-2', 'step-3', 'step-4']);
  });
});

describe('resolveClampAt', () => {
  const clamp = { minValue: 1, maxValue: 2, minViewport: 320, maxViewport: 1440, unit: 'rem' };

  it('clamps below the minimum viewport and above the maximum', () => {
    expect(resolveClampAt(clamp, 100)).toBeCloseTo(1, 4);
    expect(resolveClampAt(clamp, 3000)).toBeCloseTo(2, 4);
  });

  it('produces different values at different widths, which is what makes a preview honest', () => {
    const sizes = [320, 768, 1024, 1440].map((width) => resolveClampAt(clamp, width));
    expect(new Set(sizes.map((size) => size.toFixed(4))).size).toBe(4);
  });
});
