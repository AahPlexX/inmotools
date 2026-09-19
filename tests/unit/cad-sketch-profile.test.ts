import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CadSketch } from '../../src/tools/cad/sketch-types';
import type { CadKernelVector3 } from '../../src/tools/cad/kernel-contract';
import {
  alignmentRotation,
  buildSketchProfile3d,
  negate,
  negateComponent,
  perpendicularInPlane,
  resolveDatumPlaneFrame,
  resolveMidPlaneDatumPlaneFrame,
  resolveSketchAxis3d,
  resolveSketchPlane3d,
  resolveThreePointDatumPlaneFrame,
  resolveTwoPlaneDatumAxis,
  resolveTwoPointDatumAxis,
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

  it('resolves the midplane halfway between two parallel plane frames', () => {
    const lower = resolveDatumPlaneFrame('XY', 0);
    const upper = resolveDatumPlaneFrame('XY', 10);
    const frame = resolveMidPlaneDatumPlaneFrame(lower, upper);

    expect(frame.normal).toEqual([0, 0, 1]);
    expect(frame.point(3, 4)).toEqual([3, 4, 5]);
    expect(frame.vector(1, 0)).toEqual([1, 0, 0]);
  });

  it('resolves both bisector alignments for intersecting parent planes', () => {
    const xy = resolveDatumPlaneFrame('XY', 0);
    const yz = resolveDatumPlaneFrame('YZ', 0);
    const first = resolveMidPlaneDatumPlaneFrame(xy, yz);
    const flipped = resolveMidPlaneDatumPlaneFrame(xy, yz, true);

    expect(first.point(0, 0)).toEqual([0, 0, 0]);
    expect(flipped.point(0, 0)).toEqual([0, 0, 0]);
    expect(first.vector(1, 0)).toEqual([0, 1, 0]);
    expect(flipped.vector(1, 0)).toEqual([0, 1, 0]);
    expect(Math.abs(first.normal[0])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(Math.abs(first.normal[2])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(Math.abs(flipped.normal[0])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(Math.abs(flipped.normal[2])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(
      first.normal[0] * flipped.normal[0]
      + first.normal[1] * flipped.normal[1]
      + first.normal[2] * flipped.normal[2],
    ).toBeCloseTo(0, 8);
  });

  it('rejects coplanar parents because they do not define a distinct midplane', () => {
    const xy = resolveDatumPlaneFrame('XY', 0);
    expect(() => resolveMidPlaneDatumPlaneFrame(xy, xy)).toThrow(/coplanar/i);
  });

  it('resolves a three-point datum plane with the first point as origin and a right-handed in-plane frame', () => {
    const frame = resolveThreePointDatumPlaneFrame([1, 0, 0], [1, 1, 0], [1, 0, 1]);
    expect(frame.normal).toEqual([1, 0, 0]);
    // Local (2, 3) = origin + 2*xAxis + 3*yAxis = [1,0,0] + [0,2,0] + [0,0,3].
    expect(frame.point(2, 3)).toEqual([1, 2, 3]);
    expect(frame.vector(1, 0)).toEqual([0, 1, 0]);
  });

  it('reproduces the named XY origin frame from three points on it', () => {
    const frame = resolveThreePointDatumPlaneFrame([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    expect(frame.normal).toEqual([0, 0, 1]);
    expect(frame.point(3, 4)).toEqual([3, 4, 0]);
  });

  it('rejects three collinear points, which do not define a unique plane', () => {
    expect(() => resolveThreePointDatumPlaneFrame([0, 0, 0], [1, 0, 0], [2, 0, 0])).toThrow(/collinear/i);
  });

  it('rejects a three-point datum plane with a non-finite coordinate', () => {
    expect(() => resolveThreePointDatumPlaneFrame([0, 0, 0], [1, 0, 0], [0, Number.NaN, 0])).toThrow(/finite/i);
  });

  it('resolves a datum axis through two distinct 3D points', () => {
    expect(resolveTwoPointDatumAxis([1, 2, 3], [1, 7, 3])).toEqual({
      origin: [1, 2, 3],
      direction: [0, 1, 0],
    });
  });

  it('rejects coincident two-point datum-axis inputs', () => {
    expect(() => resolveTwoPointDatumAxis([1, 2, 3], [1, 2, 3])).toThrow(/coincident/i);
  });

  it('resolves the intersection axis of two nonparallel planes', () => {
    const axis = resolveTwoPlaneDatumAxis(
      resolveDatumPlaneFrame('XY', 0),
      resolveDatumPlaneFrame('YZ', 0),
    );
    expect(axis.origin).toEqual([0, 0, 0]);
    expect(axis.direction).toEqual([0, 1, 0]);
  });

  it('rejects parallel planes for a two-plane datum axis', () => {
    expect(() => resolveTwoPlaneDatumAxis(
      resolveDatumPlaneFrame('XY', 0),
      resolveDatumPlaneFrame('XY', 10),
    )).toThrow(/parallel/i);
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

// Independent vector math for proving alignmentRotation, deliberately not reusing
// any implementation detail under test (same spirit as the SVG arc-sweep proof).
function length3([x, y, z]: CadKernelVector3): number {
  return Math.hypot(x, y, z);
}

function normalize3(vector: CadKernelVector3): CadKernelVector3 {
  const length = length3(vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dot3([ax, ay, az]: CadKernelVector3, [bx, by, bz]: CadKernelVector3): number {
  return ax * bx + ay * by + az * bz;
}

function cross3([ax, ay, az]: CadKernelVector3, [bx, by, bz]: CadKernelVector3): CadKernelVector3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** Rodrigues' rotation formula: rotates `v` by `angle` about unit `axis`. */
function rotateByAxisAngle(v: CadKernelVector3, axis: CadKernelVector3, angle: number): CadKernelVector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const kCrossV = cross3(axis, v);
  const kDotV = dot3(axis, v);
  return [
    v[0] * cos + kCrossV[0] * sin + axis[0] * kDotV * (1 - cos),
    v[1] * cos + kCrossV[1] * sin + axis[1] * kDotV * (1 - cos),
    v[2] * cos + kCrossV[2] * sin + axis[2] * kDotV * (1 - cos),
  ];
}

function nonZeroVector3(): fc.Arbitrary<CadKernelVector3> {
  return fc.tuple(
    fc.float({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
    fc.float({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
    fc.float({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
  ).filter(([x, y, z]) => length3([x, y, z]) > 1e-3) as fc.Arbitrary<CadKernelVector3>;
}

describe('alignmentRotation (property-based)', () => {
  it('returns null when `to` already points the same direction as `from`, at any positive scale', () => {
    fc.assert(
      fc.property(nonZeroVector3(), fc.float({ min: Math.fround(0.01), max: 100, noNaN: true }), (from, scale) => {
        const to: CadKernelVector3 = [from[0] * scale, from[1] * scale, from[2] * scale];
        expect(alignmentRotation(from, to)).toBeNull();
      }),
    );
  });

  it('picks a perpendicular axis and a pi rotation for exactly antiparallel directions', () => {
    fc.assert(
      fc.property(nonZeroVector3(), fc.float({ min: Math.fround(0.01), max: 100, noNaN: true }), (from, scale) => {
        const to: CadKernelVector3 = [-from[0] * scale, -from[1] * scale, -from[2] * scale];
        const rotation = alignmentRotation(from, to);
        expect(rotation).not.toBeNull();
        const { axis, angle } = rotation!;
        expect(angle).toBeCloseTo(Math.PI, 6);
        expect(length3(axis)).toBeCloseTo(1, 6);
        expect(Math.abs(dot3(axis, normalize3(from)))).toBeLessThan(1e-6);
      }),
    );
  });

  it('produces a rotation that, applied via an independent Rodrigues formula, carries `from` exactly onto `to`', () => {
    fc.assert(
      fc.property(nonZeroVector3(), nonZeroVector3(), (from, to) => {
        const fromUnit = normalize3(from);
        const toUnit = normalize3(to);
        // Skip the (near-)parallel and (near-)antiparallel cases: those are covered by
        // their own dedicated properties above, and the axis is only well-defined here.
        fc.pre(Math.abs(dot3(fromUnit, toUnit)) < 1 - 1e-6);

        const rotation = alignmentRotation(from, to);
        expect(rotation).not.toBeNull();
        const { axis, angle } = rotation!;
        expect(length3(axis)).toBeCloseTo(1, 6);
        expect(angle).toBeGreaterThan(0);
        expect(angle).toBeLessThan(Math.PI);

        const rotated = rotateByAxisAngle(fromUnit, axis, angle);
        expect(rotated[0]).toBeCloseTo(toUnit[0], 5);
        expect(rotated[1]).toBeCloseTo(toUnit[1], 5);
        expect(rotated[2]).toBeCloseTo(toUnit[2], 5);
      }),
    );
  });
});

describe('perpendicularInPlane (property-based)', () => {
  it('returns a unit vector perpendicular to both the given direction and the plane normal', () => {
    fc.assert(
      fc.property(nonZeroVector3(), nonZeroVector3(), (direction, planeNormal) => {
        // Skip the degenerate case where direction is parallel to the plane's own normal -
        // there is no "in-plane sideways" direction for a line that isn't in the plane at all.
        const normalizedNormal = normalize3(planeNormal);
        const normalizedDirection = normalize3(direction);
        fc.pre(Math.abs(dot3(normalizedNormal, normalizedDirection)) < 1 - 1e-6);

        const perpendicular = perpendicularInPlane(direction, planeNormal);
        expect(length3(perpendicular)).toBeCloseTo(1, 6);
        expect(Math.abs(dot3(perpendicular, normalizedDirection))).toBeLessThan(1e-5);
        expect(Math.abs(dot3(perpendicular, normalizedNormal))).toBeLessThan(1e-5);
      }),
    );
  });
});
