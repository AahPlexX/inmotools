import { describe, expect, it } from 'vitest';
import { buildInterpolatingSpline, evaluateSpline } from '../../src/tools/cad/sketch-spline';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function cubicSplineSketch(): CadSketch {
  return {
    id: 'spline-membership',
    label: 'Spline membership',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 4, y: 6, construction: false },
      { id: 'p2', type: 'point', x: 8, y: 1, construction: false },
      { id: 'spline', type: 'spline', fitPointIds: ['p0', 'p1', 'p2'], degree: 3, closed: false, construction: false },
    ],
    constraints: [],
  };
}

function horizontalSplineWithLine(vertical = false): CadSketch {
  return {
    id: vertical ? 'bad-tangent' : 'good-tangent',
    label: 'Spline tangency',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 's0', type: 'point', x: 0, y: 0, construction: false },
      { id: 's1', type: 'point', x: 10, y: 0, construction: false },
      { id: 'spline', type: 'spline', fitPointIds: ['s0', 's1'], degree: 1, closed: false, construction: false },
      ...(vertical
        ? [
            { id: 'l0', type: 'point' as const, x: 5, y: -2, construction: false },
            { id: 'l1', type: 'point' as const, x: 5, y: 2, construction: false },
          ]
        : [
            { id: 'l0', type: 'point' as const, x: 2, y: 0, construction: false },
            { id: 'l1', type: 'point' as const, x: 8, y: 0, construction: false },
          ]),
      { id: 'line', type: 'line', startPointId: 'l0', endPointId: 'l1', construction: false },
    ],
    constraints: [
      { id: 'fix-spline', type: 'fixed-entity', entityId: 'spline', enabled: true },
      { id: 'fix-line', type: 'fixed-entity', entityId: 'line', enabled: true },
      { id: 'tangent-spline', type: 'tangent-curve', lineId: 'line', curveId: 'spline', parameter: 0.5, enabled: true },
    ],
  } as CadSketch;
}

describe('CAD spline constraints', () => {
  it('solves the contact parameter for a fixed point constrained to an interpolating spline', () => {
    const sketch = cubicSplineSketch();
    const curve = buildInterpolatingSpline(sketch, 'spline');
    const contact = evaluateSpline(curve, 0.5);
    sketch.entities.push({ id: 'target', type: 'point', x: contact.x, y: contact.y, construction: false });
    sketch.constraints.push(
      { id: 'fix-spline', type: 'fixed-entity', entityId: 'spline', enabled: true },
      { id: 'fix-target', type: 'fixed-point', pointId: 'target', x: contact.x, y: contact.y, enabled: true },
      { id: 'on-spline', type: 'point-on-curve', pointId: 'target', curveId: 'spline', parameter: 0.1, enabled: true } as never,
    );

    const result = solveSketch(sketch);
    expect(result.converged).toBe(true);
    const resolved = result.sketch.constraints.find((constraint) => constraint.id === 'on-spline') as typeof sketch.constraints[number] & { parameter?: number };
    expect(resolved.parameter).toBeCloseTo(0.5, 6);
  });

  it('accepts a fixed line that is exactly tangent to a degree-one spline', () => {
    const result = solveSketch(horizontalSplineWithLine(false));
    expect(result.converged).toBe(true);
    const resolved = result.sketch.constraints.find((constraint) => constraint.id === 'tangent-spline') as typeof result.sketch.constraints[number] & { parameter?: number };
    expect(resolved.parameter).toBeCloseTo(0.5, 8);
  });

  it('rejects an intersecting fixed line when its direction is not tangent to the spline', () => {
    const result = solveSketch(horizontalSplineWithLine(true));
    expect(result.converged).toBe(false);
    expect(result.conflicts).toContain('tangent-spline');
  });
});
