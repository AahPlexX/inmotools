import { describe, expect, it } from 'vitest';
import {
  buildInterpolatingSpline,
  evaluateSpline,
  evaluateSplineDerivative,
} from '../../src/tools/cad/sketch-spline';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function pointAt(sketch: CadSketch, id: string) {
  const entity = sketch.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.type !== 'point') throw new Error(`Missing point '${id}'.`);
  return entity;
}

function openSketch(withTangents = false): CadSketch {
  return {
    id: 'open-spline',
    label: 'Open spline',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 4, y: 6, construction: false },
      { id: 'p2', type: 'point', x: 8, y: 1, construction: false },
      {
        id: 'spline',
        type: 'spline',
        fitPointIds: ['p0', 'p1', 'p2'],
        degree: 3,
        closed: false,
        ...(withTangents
          ? { startTangent: { x: 3, y: 0 }, endTangent: { x: 2, y: -1 } }
          : {}),
        construction: false,
      },
    ],
    constraints: [],
  };
}

describe('CAD interpolating spline evaluator', () => {
  it('interpolates every fit point for a degree-three spline with only three fit points', () => {
    const sketch = openSketch();
    const before = JSON.stringify(sketch);
    const curve = buildInterpolatingSpline(sketch, 'spline');

    expect(curve.degree).toBe(3);
    expect(curve.fitParameters).toHaveLength(3);
    curve.fitParameters.forEach((parameter, index) => {
      const expected = pointAt(sketch, `p${index}`);
      const actual = evaluateSpline(curve, parameter);
      expect(actual.x).toBeCloseTo(expected.x, 8);
      expect(actual.y).toBeCloseTo(expected.y, 8);
    });
    expect(JSON.stringify(sketch)).toBe(before);
  });

  it('honors explicit open-spline endpoint tangent vectors as normalized-parameter derivatives', () => {
    const sketch = openSketch(true);
    const curve = buildInterpolatingSpline(sketch, 'spline');

    expect(evaluateSplineDerivative(curve, 0)).toEqual(
      expect.objectContaining({ x: expect.closeTo(3, 7), y: expect.closeTo(0, 7) }),
    );
    expect(evaluateSplineDerivative(curve, 1)).toEqual(
      expect.objectContaining({ x: expect.closeTo(2, 7), y: expect.closeTo(-1, 7) }),
    );
  });

  it('builds a periodic closed spline that interpolates its fit points and closes position and derivative', () => {
    const sketch: CadSketch = {
      id: 'closed-spline',
      label: 'Closed spline',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'p1', type: 'point', x: 8, y: 0, construction: false },
        { id: 'p2', type: 'point', x: 4, y: 7, construction: false },
        { id: 'spline', type: 'spline', fitPointIds: ['p0', 'p1', 'p2'], degree: 3, closed: true, construction: false },
      ],
      constraints: [],
    };
    const curve = buildInterpolatingSpline(sketch, 'spline');

    curve.fitParameters.forEach((parameter, index) => {
      const expected = pointAt(sketch, `p${index}`);
      const actual = evaluateSpline(curve, parameter);
      expect(actual.x).toBeCloseTo(expected.x, 7);
      expect(actual.y).toBeCloseTo(expected.y, 7);
    });

    const start = evaluateSpline(curve, 0);
    const end = evaluateSpline(curve, 1);
    const startDerivative = evaluateSplineDerivative(curve, 0);
    const endDerivative = evaluateSplineDerivative(curve, 1);
    expect(end.x).toBeCloseTo(start.x, 8);
    expect(end.y).toBeCloseTo(start.y, 8);
    expect(endDerivative.x).toBeCloseTo(startDerivative.x, 7);
    expect(endDerivative.y).toBeCloseTo(startDerivative.y, 7);
  });

  it('preserves degree-one semantics as an interpolating polyline basis', () => {
    const sketch = openSketch();
    const spline = sketch.entities.find((entity) => entity.id === 'spline');
    if (!spline || spline.type !== 'spline') throw new Error('Missing spline.');
    spline.degree = 1;
    const curve = buildInterpolatingSpline(sketch, 'spline');

    curve.fitParameters.forEach((parameter, index) => {
      const actual = evaluateSpline(curve, parameter);
      const expected = pointAt(sketch, `p${index}`);
      expect(actual.x).toBeCloseTo(expected.x, 8);
      expect(actual.y).toBeCloseTo(expected.y, 8);
    });
  });

  it('rejects endpoint tangent handles on a closed periodic spline instead of silently ignoring them', () => {
    const sketch = openSketch(true);
    const spline = sketch.entities.find((entity) => entity.id === 'spline');
    if (!spline || spline.type !== 'spline') throw new Error('Missing spline.');
    spline.closed = true;

    expect(() => buildInterpolatingSpline(sketch, 'spline')).toThrow(/closed spline.*endpoint tangent/i);
  });
});
