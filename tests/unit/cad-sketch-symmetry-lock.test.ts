import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

describe('CAD symmetry and geometry lock constraints', () => {
  it('mirrors one point across a fixed construction axis', () => {
    const sketch: CadSketch = {
      id: 'symmetry-sketch',
      label: 'Symmetry sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'axis-start', type: 'point', x: 0, y: -10, construction: true },
        { id: 'axis-end', type: 'point', x: 0, y: 10, construction: true },
        { id: 'left', type: 'point', x: -4, y: 3, construction: false },
        { id: 'right', type: 'point', x: 2, y: 8, construction: false },
        { id: 'axis', type: 'line', startPointId: 'axis-start', endPointId: 'axis-end', construction: true },
      ],
      constraints: [
        { id: 'lock-axis', type: 'fixed-entity', entityId: 'axis', enabled: true },
        { id: 'lock-left', type: 'fixed-point', pointId: 'left', x: -4, y: 3, enabled: true },
        { id: 'mirror-points', type: 'symmetric-points', pointAId: 'left', pointBId: 'right', axisLineId: 'axis', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    expect(result.degreesOfFreedom).toBe(0);
    const right = result.sketch.entities.find((entity) => entity.id === 'right' && entity.type === 'point');
    expect(right && right.type === 'point' ? right.x : Number.NaN).toBeCloseTo(4, 8);
    expect(right && right.type === 'point' ? right.y : Number.NaN).toBeCloseTo(3, 8);
  });

  it('locks a line by preserving both endpoint coordinates', () => {
    const sketch: CadSketch = {
      id: 'locked-line',
      label: 'Locked line',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'start', type: 'point', x: -3, y: 7, construction: false },
        { id: 'end', type: 'point', x: 11, y: -2, construction: false },
        { id: 'line', type: 'line', startPointId: 'start', endPointId: 'end', construction: false },
      ],
      constraints: [{ id: 'lock-line', type: 'fixed-entity', entityId: 'line', enabled: true }],
    };

    const result = solveSketch(sketch, { dragTarget: { pointId: 'end', x: 50, y: 50 } });
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    expect(result.degreesOfFreedom).toBe(0);
    const start = result.sketch.entities.find((entity) => entity.id === 'start' && entity.type === 'point');
    const end = result.sketch.entities.find((entity) => entity.id === 'end' && entity.type === 'point');
    expect(start && start.type === 'point' ? [start.x, start.y] : []).toEqual([-3, 7]);
    expect(end && end.type === 'point' ? [end.x, end.y] : []).toEqual([11, -2]);
  });

  it('locks a circle by preserving center and radius', () => {
    const sketch: CadSketch = {
      id: 'locked-circle',
      label: 'Locked circle',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 5, y: -4, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 8, construction: false },
      ],
      constraints: [{ id: 'lock-circle', type: 'fixed-entity', entityId: 'circle', enabled: true }],
    };

    const result = solveSketch(sketch, { dragTarget: { pointId: 'center', x: -30, y: 40 } });
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    expect(result.degreesOfFreedom).toBe(0);
    const center = result.sketch.entities.find((entity) => entity.id === 'center' && entity.type === 'point');
    const circle = result.sketch.entities.find((entity) => entity.id === 'circle' && entity.type === 'circle');
    expect(center && center.type === 'point' ? [center.x, center.y] : []).toEqual([5, -4]);
    expect(circle && circle.type === 'circle' ? circle.radius : Number.NaN).toBeCloseTo(8, 8);
  });
});