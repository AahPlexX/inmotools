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

  it('solves a circle radius as an explicit geometric degree of freedom', () => {
    const sketch: CadSketch = {
      id: 'circle-radius',
      label: 'Radius sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 3, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 0, y: 0, enabled: true },
        { id: 'radius-circle', type: 'radius', circleId: 'circle', value: 12, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    expect(result.degreesOfFreedom).toBe(0);
    const circle = result.sketch.entities.find((entity) => entity.id === 'circle' && entity.type === 'circle');
    expect(circle && circle.type === 'circle' ? circle.radius : Number.NaN).toBeCloseTo(12, 8);
  });

  it('solves perpendicular line geometry without requiring a vertical constraint', () => {
    const sketch: CadSketch = {
      id: 'perpendicular-lines',
      label: 'Perpendicular sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'origin', type: 'point', x: 0, y: 0, construction: false },
        { id: 'right', type: 'point', x: 8, y: 1, construction: false },
        { id: 'upper', type: 'point', x: 2, y: 6, construction: false },
        { id: 'base', type: 'line', startPointId: 'origin', endPointId: 'right', construction: false },
        { id: 'upright', type: 'line', startPointId: 'origin', endPointId: 'upper', construction: false },
      ],
      constraints: [
        { id: 'fix-origin', type: 'fixed-point', pointId: 'origin', x: 0, y: 0, enabled: true },
        { id: 'horizontal-base', type: 'horizontal', lineId: 'base', enabled: true },
        { id: 'base-length', type: 'distance', pointAId: 'origin', pointBId: 'right', value: 10, enabled: true },
        { id: 'upright-length', type: 'distance', pointAId: 'origin', pointBId: 'upper', value: 5, enabled: true },
        { id: 'perpendicular-pair', type: 'perpendicular', lineAId: 'base', lineBId: 'upright', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const upper = result.sketch.entities.find((entity) => entity.id === 'upper' && entity.type === 'point');
    expect(upper && upper.type === 'point' ? upper.x : Number.NaN).toBeCloseTo(0, 7);
    expect(Math.abs(upper && upper.type === 'point' ? upper.y : Number.NaN)).toBeCloseTo(5, 7);
  });

  it('solves line-circle tangency while preserving fixed line and center geometry', () => {
    const sketch: CadSketch = {
      id: 'line-circle-tangent',
      label: 'Tangent sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'line-start', type: 'point', x: -8, y: 5, construction: false },
        { id: 'line-end', type: 'point', x: 8, y: 5, construction: false },
        { id: 'line', type: 'line', startPointId: 'line-start', endPointId: 'line-end', construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 2, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 0, y: 0, enabled: true },
        { id: 'fix-line-start', type: 'fixed-point', pointId: 'line-start', x: -8, y: 5, enabled: true },
        { id: 'fix-line-end', type: 'fixed-point', pointId: 'line-end', x: 8, y: 5, enabled: true },
        { id: 'tangent', type: 'tangent', lineId: 'line', circleId: 'circle', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const circle = result.sketch.entities.find((entity) => entity.id === 'circle' && entity.type === 'circle');
    expect(circle && circle.type === 'circle' ? circle.radius : Number.NaN).toBeCloseTo(5, 7);
  });

  it('solves parallel line geometry while retaining independent line placement', () => {
    const sketch: CadSketch = {
      id: 'parallel-lines',
      label: 'Parallel sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'a1', type: 'point', x: 10, y: 0, construction: false },
        { id: 'b0', type: 'point', x: 0, y: 5, construction: false },
        { id: 'b1', type: 'point', x: 3, y: 6, construction: false },
        { id: 'a', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
        { id: 'b', type: 'line', startPointId: 'b0', endPointId: 'b1', construction: false },
      ],
      constraints: [
        { id: 'fix-a0', type: 'fixed-point', pointId: 'a0', x: 0, y: 0, enabled: true },
        { id: 'fix-a1', type: 'fixed-point', pointId: 'a1', x: 10, y: 0, enabled: true },
        { id: 'fix-b0', type: 'fixed-point', pointId: 'b0', x: 0, y: 5, enabled: true },
        { id: 'length-b', type: 'distance', pointAId: 'b0', pointBId: 'b1', value: 4, enabled: true },
        { id: 'parallel-pair', type: 'parallel', lineAId: 'a', lineBId: 'b', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const b1 = result.sketch.entities.find((entity) => entity.id === 'b1' && entity.type === 'point');
    expect(Math.abs((b1 && b1.type === 'point' ? b1.x : Number.NaN) - 0)).toBeCloseTo(4, 7);
    expect(b1 && b1.type === 'point' ? b1.y : Number.NaN).toBeCloseTo(5, 7);
  });

  it('solves concentric circles by sharing the same solved center', () => {
    const sketch: CadSketch = {
      id: 'concentric-circles',
      label: 'Concentric sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'c1-center', type: 'point', x: 2, y: 3, construction: false },
        { id: 'c2-center', type: 'point', x: 8, y: -4, construction: false },
        { id: 'c1', type: 'circle', centerPointId: 'c1-center', radius: 3, construction: false },
        { id: 'c2', type: 'circle', centerPointId: 'c2-center', radius: 7, construction: false },
      ],
      constraints: [
        { id: 'fix-c1-center', type: 'fixed-point', pointId: 'c1-center', x: 2, y: 3, enabled: true },
        { id: 'radius-c1', type: 'radius', circleId: 'c1', value: 3, enabled: true },
        { id: 'radius-c2', type: 'radius', circleId: 'c2', value: 7, enabled: true },
        { id: 'concentric', type: 'concentric', circleAId: 'c1', circleBId: 'c2', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const center = result.sketch.entities.find((entity) => entity.id === 'c2-center' && entity.type === 'point');
    expect(center && center.type === 'point' ? center.x : Number.NaN).toBeCloseTo(2, 8);
    expect(center && center.type === 'point' ? center.y : Number.NaN).toBeCloseTo(3, 8);
  });

  it('solves equal line lengths without duplicating a driving dimension', () => {
    const sketch: CadSketch = {
      id: 'equal-lines',
      label: 'Equal lines sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'a1', type: 'point', x: 6, y: 0, construction: false },
        { id: 'b0', type: 'point', x: 0, y: 4, construction: false },
        { id: 'b1', type: 'point', x: 3, y: 5, construction: false },
        { id: 'a', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
        { id: 'b', type: 'line', startPointId: 'b0', endPointId: 'b1', construction: false },
      ],
      constraints: [
        { id: 'fix-a0', type: 'fixed-point', pointId: 'a0', x: 0, y: 0, enabled: true },
        { id: 'fix-a1', type: 'fixed-point', pointId: 'a1', x: 6, y: 0, enabled: true },
        { id: 'fix-b0', type: 'fixed-point', pointId: 'b0', x: 0, y: 4, enabled: true },
        { id: 'horizontal-b', type: 'horizontal', lineId: 'b', enabled: true },
        { id: 'equal-length', type: 'equal-length', lineAId: 'a', lineBId: 'b', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const b1 = result.sketch.entities.find((entity) => entity.id === 'b1' && entity.type === 'point');
    expect(Math.abs(b1 && b1.type === 'point' ? b1.x : Number.NaN)).toBeCloseTo(6, 7);
    expect(b1 && b1.type === 'point' ? b1.y : Number.NaN).toBeCloseTo(4, 7);
  });

  it('solves equal circle radii while preserving independently fixed centers', () => {
    const sketch: CadSketch = {
      id: 'equal-radii',
      label: 'Equal radii sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'c1-center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'c2-center', type: 'point', x: 12, y: 0, construction: false },
        { id: 'c1', type: 'circle', centerPointId: 'c1-center', radius: 5, construction: false },
        { id: 'c2', type: 'circle', centerPointId: 'c2-center', radius: 2, construction: false },
      ],
      constraints: [
        { id: 'fix-c1-center', type: 'fixed-point', pointId: 'c1-center', x: 0, y: 0, enabled: true },
        { id: 'fix-c2-center', type: 'fixed-point', pointId: 'c2-center', x: 12, y: 0, enabled: true },
        { id: 'radius-c1', type: 'radius', circleId: 'c1', value: 5, enabled: true },
        { id: 'equal-radius', type: 'equal-radius', circleAId: 'c1', circleBId: 'c2', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const c2 = result.sketch.entities.find((entity) => entity.id === 'c2' && entity.type === 'circle');
    expect(c2 && c2.type === 'circle' ? c2.radius : Number.NaN).toBeCloseTo(5, 8);
  });

  function point(id: string, x: number, y: number) {
    return { id, type: 'point' as const, x, y, construction: false };
  }

  it('keeps an arc\'s endpoints on a common radius from its center without an explicit constraint', () => {
    const sketch: CadSketch = {
      id: 'arc-intrinsic-radius',
      label: 'Arc identity sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        point('center', 0, 0),
        point('start', 5, 0),
        point('end', 1, 5.9),
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [{ id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 0, y: 0, enabled: true }],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.degreesOfFreedom).toBe(3);
    const start = result.sketch.entities.find((entity) => entity.id === 'start' && entity.type === 'point');
    const end = result.sketch.entities.find((entity) => entity.id === 'end' && entity.type === 'point');
    const startRadius = start && start.type === 'point' ? Math.hypot(start.x, start.y) : Number.NaN;
    const endRadius = end && end.type === 'point' ? Math.hypot(end.x, end.y) : Number.NaN;
    expect(endRadius).toBeCloseTo(startRadius, 7);
  });

  it('solves an arc radius dimension by adjusting the shared radius from its center', () => {
    const sketch: CadSketch = {
      id: 'arc-radius-dimension',
      label: 'Arc radius sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        point('center', 0, 0),
        point('start', 5, 0),
        point('end', 0, 5),
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 0, y: 0, enabled: true },
        { id: 'radius-arc', type: 'radius', circleId: 'arc', value: 8, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.degreesOfFreedom).toBe(2);
    const start = result.sketch.entities.find((entity) => entity.id === 'start' && entity.type === 'point');
    const end = result.sketch.entities.find((entity) => entity.id === 'end' && entity.type === 'point');
    expect(start && start.type === 'point' ? Math.hypot(start.x, start.y) : Number.NaN).toBeCloseTo(8, 7);
    expect(end && end.type === 'point' ? Math.hypot(end.x, end.y) : Number.NaN).toBeCloseTo(8, 7);
  });

  it('shares a solved center between a circle and a concentric arc', () => {
    const sketch: CadSketch = {
      id: 'concentric-circle-arc',
      label: 'Concentric circle/arc sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        point('c1-center', 2, 3),
        { id: 'c1', type: 'circle', centerPointId: 'c1-center', radius: 4, construction: false },
        point('arc-center', 8, -4),
        point('arc-start', 9, -4),
        point('arc-end', 8, -3),
        { id: 'arc', type: 'arc', centerPointId: 'arc-center', startPointId: 'arc-start', endPointId: 'arc-end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'fix-c1-center', type: 'fixed-point', pointId: 'c1-center', x: 2, y: 3, enabled: true },
        { id: 'concentric', type: 'concentric', circleAId: 'c1', circleBId: 'arc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    const center = result.sketch.entities.find((entity) => entity.id === 'arc-center' && entity.type === 'point');
    expect(center && center.type === 'point' ? center.x : Number.NaN).toBeCloseTo(2, 7);
    expect(center && center.type === 'point' ? center.y : Number.NaN).toBeCloseTo(3, 7);
  });

  it('matches an arc\'s radius to a circle through an equal-radius constraint', () => {
    const sketch: CadSketch = {
      id: 'equal-radius-circle-arc',
      label: 'Equal radius circle/arc sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        point('c1-center', 0, 0),
        { id: 'c1', type: 'circle', centerPointId: 'c1-center', radius: 5, construction: false },
        point('arc-center', 12, 0),
        point('arc-start', 14, 0),
        point('arc-end', 12, 2),
        { id: 'arc', type: 'arc', centerPointId: 'arc-center', startPointId: 'arc-start', endPointId: 'arc-end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'fix-c1-center', type: 'fixed-point', pointId: 'c1-center', x: 0, y: 0, enabled: true },
        { id: 'fix-arc-center', type: 'fixed-point', pointId: 'arc-center', x: 12, y: 0, enabled: true },
        { id: 'radius-c1', type: 'radius', circleId: 'c1', value: 5, enabled: true },
        { id: 'equal-radius', type: 'equal-radius', circleAId: 'c1', circleBId: 'arc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    const start = result.sketch.entities.find((entity) => entity.id === 'arc-start' && entity.type === 'point');
    const center = result.sketch.entities.find((entity) => entity.id === 'arc-center' && entity.type === 'point');
    const radius =
      start && start.type === 'point' && center && center.type === 'point'
        ? Math.hypot(start.x - center.x, start.y - center.y)
        : Number.NaN;
    expect(radius).toBeCloseTo(5, 7);
  });

  it("isolates a fixed-point constraint that breaks an arc's radius identity", () => {
    const sketch: CadSketch = {
      id: 'arc-identity-conflict',
      label: 'Arc identity conflict sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        point('center', 0, 0),
        point('start', 5, 0),
        point('end', 0, 7),
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 0, y: 0, enabled: true },
        { id: 'fix-start', type: 'fixed-point', pointId: 'start', x: 5, y: 0, enabled: true },
        { id: 'fix-end', type: 'fixed-point', pointId: 'end', x: 0, y: 7, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(false);
    expect(result.constraintState).toBe('over');
    expect(result.conflicts).toContain('fix-end');
  });
});