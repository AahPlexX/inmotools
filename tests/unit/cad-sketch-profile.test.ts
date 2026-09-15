import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CadSketch } from '../../src/tools/cad/sketch-types';
import {
  buildSketchProfile3d,
  negate,
  negateComponent,
  resolveDatumPlaneFrame,
  resolveSketchAxis3d,
  resolveSketchPlane3d,
} from '../../src/tools/cad/sketch-profile';

function rectangleSketch(plane: CadSketch['plane'] = { kind: 'origin', plane: 'XY' }): CadSketch {
  return {
    id: 'sketch-1',
    label: 'Rectangle',
    plane,
    entities: [
      { id: 'p1', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p2', type: 'point', x: 20, y: 0, construction: false },
      { id: 'p3', type: 'point', x: 20, y: 10, construction: false },
      { id: 'p4', type: 'point', x: 0, y: 10, construction: false },
      { id: 'axis-a', type: 'point', x: -5, y: 0, construction: true },
      { id: 'axis-b', type: 'point', x: -5, y: 10, construction: true },
      { id: 'line-bottom', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      { id: 'line-right', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
      { id: 'line-top', type: 'line', startPointId: 'p3', endPointId: 'p4', construction: false },
      { id: 'line-left', type: 'line', startPointId: 'p4', endPointId: 'p1', construction: false },
      { id: 'axis', type: 'line', startPointId: 'axis-a', endPointId: 'axis-b', construction: true },
    ],
    constraints: [],
  };
}

describe('CAD sketch profile bridge', () => {
  it('orders a closed rectangle and maps XY coordinates into exact 3D profile edges', () => {
    const result = buildSketchProfile3d(
      rectangleSketch(),
      ['line-top', 'line-bottom', 'line-left', 'line-right'],
    );

    expect(result.normal).toEqual([0, 0, 1]);
    expect(result.edges).toEqual([
      { kind: 'line', start: [0, 0, 0], end: [20, 0, 0] },
      { kind: 'line', start: [20, 0, 0], end: [20, 10, 0] },
      { kind: 'line', start: [20, 10, 0], end: [0, 10, 0] },
      { kind: 'line', start: [0, 10, 0], end: [0, 0, 0] },
    ]);
  });

  it('maps the origin XZ plane with a deterministic right-handed basis', () => {
    const result = buildSketchProfile3d(
      rectangleSketch({ kind: 'origin', plane: 'XZ' }),
      ['line-bottom', 'line-right', 'line-top', 'line-left'],
    );

    expect(result.normal).toEqual([0, 1, 0]);
    expect(result.edges[1]).toEqual({ kind: 'line', start: [20, 0, 0], end: [20, 0, -10] });
  });

  it('resolves a construction line into a 3D revolve axis without treating it as profile geometry', () => {
    const axis = resolveSketchAxis3d(rectangleSketch(), 'axis');
    expect(axis).toEqual({ origin: [-5, 0, 0], direction: [0, 10, 0] });
  });

  it('supports exact circular profile regions as a single closed edge', () => {
    const sketch: CadSketch = {
      id: 'sketch-circle',
      label: 'Circle',
      plane: { kind: 'origin', plane: 'YZ' },
      entities: [
        { id: 'center', type: 'point', x: 4, y: 6, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 3, construction: false },
      ],
      constraints: [],
    };

    expect(buildSketchProfile3d(sketch, ['circle'])).toEqual({
      normal: [1, 0, 0],
      edges: [{ kind: 'circle', center: [0, 4, 6], normal: [1, 0, 0], radius: 3 }],
    });
  });

  it('rejects open selected profiles instead of manufacturing a closing edge', () => {
    const sketch = rectangleSketch();
    expect(() => buildSketchProfile3d(sketch, ['line-bottom', 'line-right', 'line-top']))
      .toThrow(/closed profile/i);
  });

  it('rejects unresolved datum and face planes instead of silently placing them on an origin plane', () => {
    expect(() => buildSketchProfile3d(
      rectangleSketch({ kind: 'datum', datumId: 'datum-1' }),
      ['line-bottom', 'line-right', 'line-top', 'line-left'],
    )).toThrow(/unresolved datum plane 'datum-1'/i);
  });

  it('resolves an offset datum plane parallel to its base origin plane', () => {
    const frame = resolveDatumPlaneFrame('XY', 12);
    expect(frame.normal).toEqual([0, 0, 1]);
    expect(frame.point(3, 4)).toEqual([3, 4, 12]);
    // In-plane axis directions are inherited unchanged from the base plane; only the origin moves.
    expect(frame.vector(1, 0)).toEqual([1, 0, 0]);
  });

  it('rejects a non-finite datum plane offset', () => {
    expect(() => resolveDatumPlaneFrame('XZ', Number.NaN)).toThrow(/finite/i);
  });

  it('places a profile on a resolved offset datum plane', () => {
    const datumPlanes = new Map([['datum-1', resolveDatumPlaneFrame('XY', 12)]]);
    const result = buildSketchProfile3d(
      rectangleSketch({ kind: 'datum', datumId: 'datum-1' }),
      ['line-bottom', 'line-right', 'line-top', 'line-left'],
      datumPlanes,
    );
    expect(result.normal).toEqual([0, 0, 1]);
    expect(result.edges[0]).toEqual({ kind: 'line', start: [0, 0, 12], end: [20, 0, 12] });
  });

  it('resolves a sketch plane through a datum plane for mirror and similar whole-plane consumers', () => {
    const datumPlanes = new Map([['datum-1', resolveDatumPlaneFrame('YZ', -5)]]);
    const plane = resolveSketchPlane3d(rectangleSketch({ kind: 'datum', datumId: 'datum-1' }), datumPlanes);
    expect(plane).toEqual({ origin: [-5, 0, 0], normal: [1, 0, 0] });
  });
});

// Property-based coverage for the exact bug class that shipped twice this session
// (an inline `-x` producing -0 for an exact-zero component, which fails strict
// downstream equality even though it's numerically identical to 0). Hand-picked
// examples only prove the cases someone thought to pick; these hold for every
// finite number, including values nobody would have thought to hand-write.
describe('negateComponent / negate (property-based)', () => {
  it('never returns -0, for any finite input including exact zero', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (value) => {
        const result = negateComponent(value);
        expect(Object.is(result, -0)).toBe(false);
      }),
    );
  });

  it('is its own inverse for any finite input (negating twice returns the original)', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (value) => {
        expect(negateComponent(negateComponent(value))).toBe(value === 0 ? 0 : value);
      }),
    );
  });

  it('preserves magnitude for any finite input', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (value) => {
        expect(Math.abs(negateComponent(value))).toBeCloseTo(Math.abs(value), 10);
      }),
    );
  });

  it('negates a full vector component-wise with no -0 leaking through any axis', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.float({ noNaN: true, noDefaultInfinity: true }),
        ),
        ([x, y, z]) => {
          const [nx, ny, nz] = negate([x, y, z]);
          expect([Object.is(nx, -0), Object.is(ny, -0), Object.is(nz, -0)]).toEqual([false, false, false]);
        },
      ),
    );
  });
});
