import { describe, expect, it } from 'vitest';
import { buildClamp, buildScaleMatrix } from '../../src/tools/typography/fluid-engine';

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
