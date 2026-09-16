import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

describe('CAD positional sketch constraints', () => {
  it('solves a point to the exact midpoint of a fixed line', () => {
    const sketch: CadSketch = {
      id: 'midpoint-sketch',
      label: 'Midpoint sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'start', type: 'point', x: -6, y: 2, construction: false },
        { id: 'end', type: 'point', x: 10, y: 6, construction: false },
        { id: 'mid', type: 'point', x: 1, y: 9, construction: false },
        { id: 'line', type: 'line', startPointId: 'start', endPointId: 'end', construction: false },
      ],
      constraints: [
        { id: 'fix-start', type: 'fixed-point', pointId: 'start', x: -6, y: 2, enabled: true },
        { id: 'fix-end', type: 'fixed-point', pointId: 'end', x: 10, y: 6, enabled: true },
        { id: 'midpoint', type: 'midpoint', pointId: 'mid', lineId: 'line', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const midpoint = result.sketch.entities.find((entity) => entity.id === 'mid' && entity.type === 'point');
    expect(midpoint && midpoint.type === 'point' ? midpoint.x : Number.NaN).toBeCloseTo(2, 8);
    expect(midpoint && midpoint.type === 'point' ? midpoint.y : Number.NaN).toBeCloseTo(4, 8);
  });

  it('constrains a point to a line while preserving one along-line degree of freedom', () => {
    const sketch: CadSketch = {
      id: 'point-on-line-sketch',
      label: 'Point on line sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'start', type: 'point', x: -5, y: 0, construction: false },
        { id: 'end', type: 'point', x: 9, y: 0, construction: false },
        { id: 'point', type: 'point', x: 2, y: 3, construction: false },
        { id: 'line', type: 'line', startPointId: 'start', endPointId: 'end', construction: false },
      ],
      constraints: [
        { id: 'fix-start', type: 'fixed-point', pointId: 'start', x: -5, y: 0, enabled: true },
        { id: 'fix-end', type: 'fixed-point', pointId: 'end', x: 9, y: 0, enabled: true },
        { id: 'point-on-line', type: 'point-on-line', pointId: 'point', lineId: 'line', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('under');
    expect(result.degreesOfFreedom).toBe(1);
    const point = result.sketch.entities.find((entity) => entity.id === 'point' && entity.type === 'point');
    expect(point && point.type === 'point' ? point.y : Number.NaN).toBeCloseTo(0, 8);
  });

  it('constrains a point to a circle while preserving one angular degree of freedom', () => {
    const sketch: CadSketch = {
      id: 'point-on-circle-sketch',
      label: 'Point on circle sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 1, y: -2, construction: false },
        { id: 'point', type: 'point', x: 9, y: 2, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 5, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 1, y: -2, enabled: true },
        { id: 'radius', type: 'radius', circleId: 'circle', value: 5, enabled: true },
        { id: 'point-on-circle', type: 'point-on-circle', pointId: 'point', circleId: 'circle', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('under');
    expect(result.degreesOfFreedom).toBe(1);
    const point = result.sketch.entities.find((entity) => entity.id === 'point' && entity.type === 'point');
    const x = point && point.type === 'point' ? point.x : Number.NaN;
    const y = point && point.type === 'point' ? point.y : Number.NaN;
    expect(Math.hypot(x - 1, y + 2)).toBeCloseTo(5, 8);
  });
});