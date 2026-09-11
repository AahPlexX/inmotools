import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

describe('CAD dimensional sketch constraints', () => {
  it('solves horizontal and vertical point distances independently', () => {
    const sketch: CadSketch = {
      id: 'directional-distance',
      label: 'Directional distance sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'anchor', type: 'point', x: 2, y: 4, construction: false },
        { id: 'target', type: 'point', x: 12, y: 12, construction: false },
      ],
      constraints: [
        { id: 'fix-anchor', type: 'fixed-point', pointId: 'anchor', x: 2, y: 4, enabled: true },
        { id: 'dx', type: 'horizontal-distance', pointAId: 'anchor', pointBId: 'target', value: 7, enabled: true },
        { id: 'dy', type: 'vertical-distance', pointAId: 'anchor', pointBId: 'target', value: -3, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const target = result.sketch.entities.find((entity) => entity.id === 'target' && entity.type === 'point');
    expect(target && target.type === 'point' ? target.x : Number.NaN).toBeCloseTo(9, 8);
    expect(target && target.type === 'point' ? target.y : Number.NaN).toBeCloseTo(1, 8);
  });

  it('uses an explicit line-length constraint without exposing endpoint IDs to the caller', () => {
    const sketch: CadSketch = {
      id: 'line-length',
      label: 'Line length sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'start', type: 'point', x: 0, y: 0, construction: false },
        { id: 'end', type: 'point', x: 3, y: 4, construction: false },
        { id: 'line', type: 'line', startPointId: 'start', endPointId: 'end', construction: false },
      ],
      constraints: [
        { id: 'fix-start', type: 'fixed-point', pointId: 'start', x: 0, y: 0, enabled: true },
        { id: 'horizontal', type: 'horizontal', lineId: 'line', enabled: true },
        { id: 'length', type: 'length', lineId: 'line', value: 14, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const end = result.sketch.entities.find((entity) => entity.id === 'end' && entity.type === 'point');
    expect(Math.abs(end && end.type === 'point' ? end.x : Number.NaN)).toBeCloseTo(14, 8);
    expect(end && end.type === 'point' ? end.y : Number.NaN).toBeCloseTo(0, 8);
  });

  it('solves a circle from a diameter dimension', () => {
    const sketch: CadSketch = {
      id: 'diameter-sketch',
      label: 'Diameter sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 3, y: -5, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 2, construction: false },
      ],
      constraints: [
        { id: 'fix-center', type: 'fixed-point', pointId: 'center', x: 3, y: -5, enabled: true },
        { id: 'diameter', type: 'diameter', circleId: 'circle', value: 18, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const circle = result.sketch.entities.find((entity) => entity.id === 'circle' && entity.type === 'circle');
    expect(circle && circle.type === 'circle' ? circle.radius : Number.NaN).toBeCloseTo(9, 8);
  });

  it('solves the angle between two lines using canonical radians', () => {
    const sketch: CadSketch = {
      id: 'angle-sketch',
      label: 'Angle sketch',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'origin', type: 'point', x: 0, y: 0, construction: false },
        { id: 'base-end', type: 'point', x: 10, y: 0, construction: false },
        { id: 'tip', type: 'point', x: 3, y: 6, construction: false },
        { id: 'base', type: 'line', startPointId: 'origin', endPointId: 'base-end', construction: false },
        { id: 'arm', type: 'line', startPointId: 'origin', endPointId: 'tip', construction: false },
      ],
      constraints: [
        { id: 'lock-base', type: 'fixed-entity', entityId: 'base', enabled: true },
        { id: 'arm-length', type: 'length', lineId: 'arm', value: 5, enabled: true },
        { id: 'arm-angle', type: 'angle', lineAId: 'base', lineBId: 'arm', value: Math.PI / 3, enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const tip = result.sketch.entities.find((entity) => entity.id === 'tip' && entity.type === 'point');
    expect(tip && tip.type === 'point' ? tip.x : Number.NaN).toBeCloseTo(2.5, 7);
    expect(Math.abs(tip && tip.type === 'point' ? tip.y : Number.NaN)).toBeCloseTo((5 * Math.sqrt(3)) / 2, 7);
  });
});