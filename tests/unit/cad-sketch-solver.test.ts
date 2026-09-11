import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function constrainedLine(): CadSketch {
  return {
    id: 'sketch-1',
    label: 'Line sketch',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 7, y: 2, construction: false },
      { id: 'l1', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
    ],
    constraints: [
      { id: 'fix-p0', type: 'fixed-point', pointId: 'p0', x: 0, y: 0, enabled: true },
      { id: 'horizontal-l1', type: 'horizontal', lineId: 'l1', enabled: true },
      { id: 'length-l1', type: 'distance', pointAId: 'p0', pointBId: 'p1', value: 10, enabled: true },
    ],
  };
}

describe('CAD constrained sketch solver', () => {
  it('solves a fully constrained line without violating hard constraints', () => {
    const result = solveSketch(constrainedLine());
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.residual).toBeLessThan(1e-8);

    const point = result.sketch.entities.find((entity) => entity.id === 'p1' && entity.type === 'point');
    expect(point && point.type === 'point' ? point.x : Number.NaN).toBeCloseTo(10, 8);
    expect(point && point.type === 'point' ? point.y : Number.NaN).toBeCloseTo(0, 8);
  });

  it('reports remaining degrees of freedom for an under-constrained sketch', () => {
    const sketch: CadSketch = {
      ...constrainedLine(),
      constraints: [{ id: 'horizontal-l1', type: 'horizontal', lineId: 'l1', enabled: true }],
    };
    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('under');
    expect(result.degreesOfFreedom).toBeGreaterThan(0);
    expect(result.conflicts).toEqual([]);
  });

  it('isolates conflicting constraints instead of silently dropping them', () => {
    const sketch: CadSketch = {
      ...constrainedLine(),
      constraints: [
        { id: 'fix-p0', type: 'fixed-point', pointId: 'p0', x: 0, y: 0, enabled: true },
        { id: 'fix-p1', type: 'fixed-point', pointId: 'p1', x: 10, y: 0, enabled: true },
        { id: 'impossible-length', type: 'distance', pointAId: 'p0', pointBId: 'p1', value: 12, enabled: true },
      ],
    };
    const result = solveSketch(sketch);
    expect(result.converged).toBe(false);
    expect(result.constraintState).toBe('over');
    expect(result.conflicts).toContain('impossible-length');
  });

  it('supports a soft drag target while hard constraints remain satisfied', () => {
    const result = solveSketch(constrainedLine(), {
      dragTarget: { pointId: 'p1', x: 25, y: 12, weight: 0.05 },
    });
    expect(result.converged).toBe(true);
    const point = result.sketch.entities.find((entity) => entity.id === 'p1' && entity.type === 'point');
    expect(point && point.type === 'point' ? point.x : Number.NaN).toBeCloseTo(10, 6);
    expect(point && point.type === 'point' ? point.y : Number.NaN).toBeCloseTo(0, 6);
  });

  it('keeps disabled constraints out of solving and conflict analysis', () => {
    const sketch: CadSketch = {
      ...constrainedLine(),
      constraints: [
        ...constrainedLine().constraints,
        { id: 'disabled-conflict', type: 'distance', pointAId: 'p0', pointBId: 'p1', value: 99, enabled: false },
      ],
    };
    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.conflicts).not.toContain('disabled-conflict');
  });
});
