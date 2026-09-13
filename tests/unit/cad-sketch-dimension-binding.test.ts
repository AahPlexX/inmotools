import { describe, expect, it } from 'vitest';
import { bindSketchDimensionExpressions, measureSketchReferenceDimension } from '../../src/tools/cad/sketch-dimensions';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadParameterDefinition } from '../../src/tools/cad/parameter-engine';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

const originPlane = { kind: 'origin', plane: 'XY' } as const;

describe('CAD sketch dimension binding and reference dimensions', () => {
  it('binds a driving length formula to canonical millimeters before solving', () => {
    const parameters: CadParameterDefinition[] = [
      { id: 'p-width', name: 'width', expression: '100 mm', dimension: 'length' },
      { id: 'p-inset', name: 'inset', expression: '10 mm', dimension: 'length' },
    ];
    const sketch: CadSketch = {
      id: 'sketch-formula-length',
      label: 'Formula length',
      plane: originPlane,
      entities: [
        { id: 'a', type: 'point', x: 0, y: 0, construction: false },
        { id: 'b', type: 'point', x: 5, y: 2, construction: false },
      ],
      constraints: [
        { id: 'fix-a', type: 'fixed-point', pointId: 'a', x: 0, y: 0, enabled: true },
        { id: 'dx', type: 'horizontal-distance', pointAId: 'a', pointBId: 'b', value: 5, expression: 'width - inset * 2', enabled: true },
        { id: 'dy', type: 'vertical-distance', pointAId: 'a', pointBId: 'b', value: 2, expression: '0 mm', enabled: true },
      ],
    };

    const bound = bindSketchDimensionExpressions(sketch, parameters);
    const dx = bound.constraints.find((constraint) => constraint.id === 'dx');
    expect(dx && 'value' in dx ? dx.value : undefined).toBeCloseTo(80, 12);

    const result = solveSketch(bound);
    expect(result.converged).toBe(true);
    expect(result.constraintState).toBe('fully');
    const point = result.sketch.entities.find((entity) => entity.id === 'b');
    expect(point?.type).toBe('point');
    if (point?.type === 'point') {
      expect(point.x).toBeCloseTo(80, 8);
      expect(point.y).toBeCloseTo(0, 8);
    }
  });

  it('binds an angle parameter using canonical radians', () => {
    const parameters: CadParameterDefinition[] = [
      { id: 'p-tilt', name: 'tilt', expression: '30 deg', dimension: 'angle' },
    ];
    const sketch: CadSketch = {
      id: 'sketch-formula-angle',
      label: 'Formula angle',
      plane: originPlane,
      entities: [
        { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'a1', type: 'point', x: 10, y: 0, construction: false },
        { id: 'b0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'b1', type: 'point', x: 8, y: 2, construction: false },
        { id: 'line-a', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
        { id: 'line-b', type: 'line', startPointId: 'b0', endPointId: 'b1', construction: false },
      ],
      constraints: [
        { id: 'angle', type: 'angle', lineAId: 'line-a', lineBId: 'line-b', value: 0, expression: 'tilt', enabled: true },
      ],
    };

    const bound = bindSketchDimensionExpressions(sketch, parameters);
    const angle = bound.constraints.find((constraint) => constraint.id === 'angle');
    expect(angle && 'value' in angle ? angle.value : undefined).toBeCloseTo(Math.PI / 6, 12);
  });

  it('rejects formula dimensions that do not match the constraint dimension', () => {
    const sketch: CadSketch = {
      id: 'sketch-bad-dimension',
      label: 'Bad dimension',
      plane: originPlane,
      entities: [
        { id: 'a', type: 'point', x: 0, y: 0, construction: false },
        { id: 'b', type: 'point', x: 10, y: 0, construction: false },
        { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b', construction: false },
      ],
      constraints: [
        { id: 'length', type: 'length', lineId: 'line', value: 10, expression: '2', enabled: true },
      ],
    };

    expect(() => bindSketchDimensionExpressions(sketch, [])).toThrow(/length.*scalar|scalar.*length/i);
  });

  it('measures reference dimensions without mutating or constraining geometry', () => {
    const sketch: CadSketch = {
      id: 'sketch-reference',
      label: 'Reference dimensions',
      plane: originPlane,
      entities: [
        { id: 'o', type: 'point', x: 0, y: 0, construction: false },
        { id: 'p', type: 'point', x: 3, y: 4, construction: false },
        { id: 'x', type: 'point', x: 10, y: 0, construction: false },
        { id: 'line-op', type: 'line', startPointId: 'o', endPointId: 'p', construction: false },
        { id: 'line-ox', type: 'line', startPointId: 'o', endPointId: 'x', construction: true },
        { id: 'circle', type: 'circle', centerPointId: 'o', radius: 7, construction: false },
      ],
      constraints: [],
    };
    const before = JSON.stringify(sketch);

    expect(measureSketchReferenceDimension(sketch, { type: 'distance', pointAId: 'o', pointBId: 'p' })).toEqual({ dimension: 'length', value: 5 });
    expect(measureSketchReferenceDimension(sketch, { type: 'horizontal-distance', pointAId: 'o', pointBId: 'p' })).toEqual({ dimension: 'length', value: 3 });
    expect(measureSketchReferenceDimension(sketch, { type: 'vertical-distance', pointAId: 'o', pointBId: 'p' })).toEqual({ dimension: 'length', value: 4 });
    expect(measureSketchReferenceDimension(sketch, { type: 'length', lineId: 'line-op' })).toEqual({ dimension: 'length', value: 5 });
    expect(measureSketchReferenceDimension(sketch, { type: 'radius', circleId: 'circle' })).toEqual({ dimension: 'length', value: 7 });
    expect(measureSketchReferenceDimension(sketch, { type: 'diameter', circleId: 'circle' })).toEqual({ dimension: 'length', value: 14 });
    expect(measureSketchReferenceDimension(sketch, { type: 'angle', lineAId: 'line-ox', lineBId: 'line-op' }).value).toBeCloseTo(Math.atan2(4, 3), 12);
    expect(JSON.stringify(sketch)).toBe(before);
  });
});
