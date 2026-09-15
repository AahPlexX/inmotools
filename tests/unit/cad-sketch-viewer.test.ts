import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CadSketch, SketchSplineEntity, SketchVector2 } from '../../src/tools/cad/sketch-types';
import {
  computeArcSweep,
  computeCircularArcRenderParams,
  computeEllipseRenderParams,
  computeEllipticalArcRenderParams,
  computeSketchBounds,
  computeViewBox,
  describeSketchEntity,
  describeSketchViewerState,
  resolveSketchPoints,
  resolveSplinePolylinePoints,
  toViewPoint,
} from '../../src/tools/cad/CadSketchViewer';

const TAU_FOR_TEST = Math.PI * 2;

// ---------------------------------------------------------------------------
// resolveSketchPoints
// ---------------------------------------------------------------------------

describe('resolveSketchPoints', () => {
  it('collects only point entities, keyed by id', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'L',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'p1', type: 'point', x: 1, y: 2, construction: false },
        { id: 'p2', type: 'point', x: 3, y: 4, construction: true },
        { id: 'line-1', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      ],
      constraints: [],
    };
    const points = resolveSketchPoints(sketch);
    expect(points.size).toBe(2);
    expect(points.get('p1')).toEqual({ x: 1, y: 2 });
    expect(points.get('p2')).toEqual({ x: 3, y: 4 });
  });

  it('skips points with non-finite coordinates rather than including garbage', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'L',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'p1', type: 'point', x: Number.NaN, y: 0, construction: false },
        { id: 'p2', type: 'point', x: 0, y: Number.POSITIVE_INFINITY, construction: false },
        { id: 'p3', type: 'point', x: 5, y: 6, construction: false },
      ],
      constraints: [],
    };
    const points = resolveSketchPoints(sketch);
    expect([...points.keys()]).toEqual(['p3']);
  });
});

// ---------------------------------------------------------------------------
// computeSketchBounds
// ---------------------------------------------------------------------------

function rectangleSketch(): CadSketch {
  return {
    id: 's',
    label: 'Rectangle',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p1', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p2', type: 'point', x: 20, y: 0, construction: false },
      { id: 'p3', type: 'point', x: 20, y: 10, construction: false },
      { id: 'p4', type: 'point', x: 0, y: 10, construction: false },
      { id: 'line-bottom', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      { id: 'line-right', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
      { id: 'line-top', type: 'line', startPointId: 'p3', endPointId: 'p4', construction: false },
      { id: 'line-left', type: 'line', startPointId: 'p4', endPointId: 'p1', construction: false },
    ],
    constraints: [],
  };
}

describe('computeSketchBounds', () => {
  it('returns null for a sketch with no entities', () => {
    const sketch: CadSketch = { id: 's', label: 'Empty', plane: { kind: 'origin', plane: 'XY' }, entities: [], constraints: [] };
    expect(computeSketchBounds(sketch)).toBeNull();
  });

  it('returns null when no entity resolves to a finite point (all references broken)', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Broken',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [{ id: 'line-1', type: 'line', startPointId: 'missing-a', endPointId: 'missing-b', construction: false }],
      constraints: [],
    };
    expect(computeSketchBounds(sketch)).toBeNull();
  });

  it('unions bounds over line endpoints', () => {
    expect(computeSketchBounds(rectangleSketch())).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 10 });
  });

  it('expands a circle bound to its full radius extent, not just its center point', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Circle',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 10, y: 10, construction: false },
        { id: 'circle-1', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
      ],
      constraints: [],
    };
    expect(computeSketchBounds(sketch)).toEqual({ minX: 6, minY: 6, maxX: 14, maxY: 14 });
  });

  it('uses an arc\'s full defining circle as a conservative (never-clipping) bound', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Arc',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'start', type: 'point', x: 3, y: 0, construction: false },
        { id: 'end', type: 'point', x: 0, y: 3, construction: false },
        {
          id: 'arc-1',
          type: 'arc',
          centerPointId: 'center',
          startPointId: 'start',
          endPointId: 'end',
          clockwise: false,
          construction: false,
        },
      ],
      constraints: [],
    };
    // A quarter arc's chord bbox would only reach [0,3]x[0,3]; the conservative
    // full-circle bound correctly reaches the full [-3,3] range on both axes.
    expect(computeSketchBounds(sketch)).toEqual({ minX: -3, minY: -3, maxX: 3, maxY: 3 });
  });

  it('accounts for ellipse rotation when computing its axis-aligned extent', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Ellipse',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        // Major axis at 45 degrees, majorRadius = sqrt(50) ~= 7.071, minorRadius = 1.
        { id: 'major', type: 'point', x: 5, y: 5, construction: false },
        { id: 'ellipse-1', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 1, construction: false },
      ],
      constraints: [],
    };
    const bounds = computeSketchBounds(sketch)!;
    const majorRadius = Math.hypot(5, 5);
    const theta = Math.PI / 4;
    const expectedHalfExtent = Math.hypot(majorRadius * Math.cos(theta), 1 * Math.sin(theta));
    expect(bounds.maxX).toBeCloseTo(expectedHalfExtent, 6);
    expect(bounds.maxY).toBeCloseTo(expectedHalfExtent, 6);
    expect(bounds.minX).toBeCloseTo(-expectedHalfExtent, 6);
    expect(bounds.minY).toBeCloseTo(-expectedHalfExtent, 6);
  });

  it('unions bounds over spline fit points', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Spline',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'a', type: 'point', x: -5, y: 0, construction: false },
        { id: 'b', type: 'point', x: 0, y: 8, construction: false },
        { id: 'c', type: 'point', x: 5, y: 0, construction: false },
        { id: 'spline-1', type: 'spline', fitPointIds: ['a', 'b', 'c'], degree: 3, closed: false, construction: false },
      ],
      constraints: [],
    };
    expect(computeSketchBounds(sketch)).toEqual({ minX: -5, minY: 0, maxX: 5, maxY: 8 });
  });

  it('skips an entity whose points do not resolve, without throwing', () => {
    const sketch: CadSketch = {
      id: 's',
      label: 'Mixed',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'p1', type: 'point', x: 2, y: 3, construction: false },
        { id: 'line-broken', type: 'line', startPointId: 'p1', endPointId: 'does-not-exist', construction: false },
      ],
      constraints: [],
    };
    expect(computeSketchBounds(sketch)).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
  });

  it('property: the bounding box always contains every resolvable point entity', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
            x: fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
            y: fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (rawPoints) => {
          // De-duplicate ids: CadSketch point ids must be unique.
          const seen = new Set<string>();
          const points = rawPoints.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
          const sketch: CadSketch = {
            id: 's',
            label: 'Fuzz',
            plane: { kind: 'origin', plane: 'XY' },
            entities: points.map((p) => ({ id: p.id, type: 'point' as const, x: p.x, y: p.y, construction: false })),
            constraints: [],
          };
          const bounds = computeSketchBounds(sketch)!;
          for (const p of points) {
            expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
            expect(p.x).toBeLessThanOrEqual(bounds.maxX);
            expect(p.y).toBeGreaterThanOrEqual(bounds.minY);
            expect(p.y).toBeLessThanOrEqual(bounds.maxY);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// computeViewBox
// ---------------------------------------------------------------------------

describe('computeViewBox', () => {
  it('adds a proportional margin and flips y for display', () => {
    const viewBox = computeViewBox({ minX: 0, minY: 0, maxX: 20, maxY: 10 });
    expect(viewBox.width).toBeCloseTo(24.8, 6);
    expect(viewBox.height).toBeCloseTo(14.8, 6);
    expect(viewBox.minX).toBeCloseTo(-2.4, 6);
    expect(viewBox.minY).toBeCloseTo(-12.4, 6);
  });

  it('pads a degenerate (single-point) box up to a minimum span instead of collapsing to zero', () => {
    const viewBox = computeViewBox({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    expect(viewBox.width).toBeGreaterThan(0);
    expect(viewBox.height).toBeGreaterThan(0);
  });

  it('property: the mapped view box always contains toViewPoint of every corner of the input bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          minX: fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
          minY: fc.float({ min: Math.fround(-500), max: Math.fround(500), noNaN: true }),
          w: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
          h: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }),
        }),
        ({ minX, minY, w, h }) => {
          const bounds = { minX, minY, maxX: minX + w, maxY: minY + h };
          const viewBox = computeViewBox(bounds);
          for (const corner of [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
          ]) {
            const view = toViewPoint(corner);
            expect(view.x).toBeGreaterThanOrEqual(viewBox.minX - 1e-6);
            expect(view.x).toBeLessThanOrEqual(viewBox.minX + viewBox.width + 1e-6);
            expect(view.y).toBeGreaterThanOrEqual(viewBox.minY - 1e-6);
            expect(view.y).toBeLessThanOrEqual(viewBox.minY + viewBox.height + 1e-6);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// toViewPoint
// ---------------------------------------------------------------------------

describe('toViewPoint', () => {
  it('negates y (sketch y-up -> SVG y-down) and leaves x unchanged', () => {
    expect(toViewPoint({ x: 3, y: 4 })).toEqual({ x: 3, y: -4 });
    expect(toViewPoint({ x: -2, y: -5 })).toEqual({ x: -2, y: 5 });
  });
});

// ---------------------------------------------------------------------------
// computeArcSweep
// ---------------------------------------------------------------------------

describe('computeArcSweep', () => {
  it('a short (90 degree) counterclockwise sweep is a small, negative-direction (sweepFlag 0) arc', () => {
    const sweep = computeArcSweep(0, Math.PI / 2, false);
    expect(sweep).toEqual({ largeArcFlag: 0, sweepFlag: 0 });
  });

  it('the clockwise sweep between the same two angles must go the long way around (large arc)', () => {
    const sweep = computeArcSweep(0, Math.PI / 2, true);
    expect(sweep).toEqual({ largeArcFlag: 1, sweepFlag: 1 });
  });

  it('a sweep of exactly 180 degrees is not flagged as a large arc (SVG spec: > 180, not >=)', () => {
    expect(computeArcSweep(0, Math.PI, false).largeArcFlag).toBe(0);
  });

  it('a sweep of just over 180 degrees is flagged as a large arc', () => {
    expect(computeArcSweep(0, Math.PI + 0.01, false).largeArcFlag).toBe(1);
  });

  it('sweepFlag always mirrors the clockwise flag directly (see the derivation in CadSketchViewer.tsx)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(TAU_FOR_TEST), noNaN: true }),
        fc.float({ min: 0, max: Math.fround(TAU_FOR_TEST), noNaN: true }),
        fc.boolean(),
        (startAngle, endAngle, clockwise) => {
          const sweep = computeArcSweep(startAngle, endAngle, clockwise);
          expect(sweep.sweepFlag).toBe(clockwise ? 1 : 0);
        },
      ),
    );
  });
});

/**
 * Standard SVG "endpoint to center" elliptical-arc reconstruction (SVG 1.1
 * Implementation Notes), specialized to rx = ry = r and x-axis-rotation = 0
 * (a plain circular arc). Used below to independently verify, from the
 * *rendered* SVG semantics rather than from this module's own reasoning,
 * that `computeArcSweep`'s flags reconstruct the same center the sketch arc
 * was actually built from -- proving the y-flip / sweep-flag derivation
 * rather than just asserting it.
 */
function reconstructCircularArcCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  largeArcFlag: 0 | 1,
  sweepFlag: 0 | 1,
): SketchVector2 {
  const x1p = (x1 - x2) / 2;
  const y1p = (y1 - y2) / 2;
  const sumSq = x1p * x1p + y1p * y1p;
  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const coef = sign * Math.sqrt(Math.max(0, (r * r - sumSq) / sumSq));
  const cxp = coef * y1p;
  const cyp = coef * -x1p;
  return { x: cxp + (x1 + x2) / 2, y: cyp + (y1 + y2) / 2 };
}

describe('computeArcSweep against an independent SVG arc-center reconstruction (property-based)', () => {
  it('the flags this module computes always reconstruct the sketch arc\'s own (view-mapped) center', () => {
    fc.assert(
      fc.property(
        fc.record({
          centerX: fc.float({ min: Math.fround(-50), max: Math.fround(50), noNaN: true }),
          centerY: fc.float({ min: Math.fround(-50), max: Math.fround(50), noNaN: true }),
          radius: fc.float({ min: Math.fround(0.5), max: Math.fround(20), noNaN: true }),
          startAngleDeg: fc.integer({ min: 0, max: 359 }),
          sweepDeg: fc.integer({ min: 1, max: 179 }),
          clockwise: fc.boolean(),
        }),
        ({ centerX, centerY, radius, startAngleDeg, sweepDeg, clockwise }) => {
          const startAngle = (startAngleDeg * Math.PI) / 180;
          const endAngle = clockwise
            ? startAngle - (sweepDeg * Math.PI) / 180
            : startAngle + (sweepDeg * Math.PI) / 180;

          const center = { x: centerX, y: centerY };
          const start = { x: centerX + radius * Math.cos(startAngle), y: centerY + radius * Math.sin(startAngle) };
          const end = { x: centerX + radius * Math.cos(endAngle), y: centerY + radius * Math.sin(endAngle) };

          const params = computeCircularArcRenderParams(center, start, end, clockwise)!;
          const viewStart = toViewPoint(start);
          const viewEnd = toViewPoint(end);
          const reconstructed = reconstructCircularArcCenter(
            viewStart.x,
            viewStart.y,
            viewEnd.x,
            viewEnd.y,
            params.radius,
            params.largeArcFlag,
            params.sweepFlag,
          );
          const viewCenter = toViewPoint(center);
          expect(reconstructed.x).toBeCloseTo(viewCenter.x, 4);
          expect(reconstructed.y).toBeCloseTo(viewCenter.y, 4);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// computeCircularArcRenderParams
// ---------------------------------------------------------------------------

describe('computeCircularArcRenderParams', () => {
  it('returns null for a degenerate (zero-radius) arc', () => {
    const center = { x: 0, y: 0 };
    expect(computeCircularArcRenderParams(center, center, center, false)).toBeNull();
  });

  it('computes the radius from the start point and the correct flags', () => {
    const center = { x: 0, y: 0 };
    const start = { x: 5, y: 0 };
    const end = { x: 0, y: 5 };
    expect(computeCircularArcRenderParams(center, start, end, false)).toEqual({ radius: 5, largeArcFlag: 0, sweepFlag: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeEllipseRenderParams / computeEllipticalArcRenderParams
// ---------------------------------------------------------------------------

describe('computeEllipseRenderParams', () => {
  it('returns null for a degenerate (coincident center/major point) ellipse', () => {
    const center = { x: 0, y: 0 };
    expect(computeEllipseRenderParams(center, center, 3)).toBeNull();
  });

  it('returns null for a non-positive minor radius', () => {
    expect(computeEllipseRenderParams({ x: 0, y: 0 }, { x: 5, y: 0 }, 0)).toBeNull();
  });

  it('a major axis along +x needs no rotation', () => {
    const params = computeEllipseRenderParams({ x: 0, y: 0 }, { x: 5, y: 0 }, 2)!;
    expect(params.rx).toBeCloseTo(5, 6);
    expect(params.ry).toBe(2);
    expect(params.rotationDeg).toBeCloseTo(0, 6);
  });

  it('a major axis along sketch +y (visually "up") rotates -90 degrees in view space', () => {
    const params = computeEllipseRenderParams({ x: 0, y: 0 }, { x: 0, y: 5 }, 2)!;
    expect(params.rotationDeg).toBeCloseTo(-90, 6);
  });
});

describe('computeEllipticalArcRenderParams', () => {
  it('returns null for a degenerate ellipse', () => {
    const center = { x: 0, y: 0 };
    expect(computeEllipticalArcRenderParams(center, center, 2, { x: 1, y: 0 }, { x: 0, y: 1 }, false)).toBeNull();
  });

  it('reduces to the same sweep flags as the plain circular-arc case when rx equals ry (a circular special case)', () => {
    const center = { x: 0, y: 0 };
    const start = { x: 5, y: 0 };
    const end = { x: 0, y: 5 };
    const circular = computeCircularArcRenderParams(center, start, end, false)!;
    const elliptical = computeEllipticalArcRenderParams(center, { x: 5, y: 0 }, 5, start, end, false)!;
    expect(elliptical.largeArcFlag).toBe(circular.largeArcFlag);
    expect(elliptical.sweepFlag).toBe(circular.sweepFlag);
    expect(elliptical.rx).toBeCloseTo(circular.radius, 6);
    expect(elliptical.ry).toBeCloseTo(circular.radius, 6);
  });
});

// ---------------------------------------------------------------------------
// resolveSplinePolylinePoints
// ---------------------------------------------------------------------------

function splineEntity(fitPointIds: string[]): SketchSplineEntity {
  return { id: 'spline-1', type: 'spline', fitPointIds, degree: 3, closed: false, construction: false };
}

describe('resolveSplinePolylinePoints', () => {
  it('returns null for fewer than 2 fit points', () => {
    const points = new Map<string, SketchVector2>([['a', { x: 0, y: 0 }]]);
    expect(resolveSplinePolylinePoints(splineEntity(['a']), points)).toBeNull();
    expect(resolveSplinePolylinePoints(splineEntity([]), points)).toBeNull();
  });

  it('returns null when a referenced fit point does not resolve', () => {
    const points = new Map<string, SketchVector2>([['a', { x: 0, y: 0 }]]);
    expect(resolveSplinePolylinePoints(splineEntity(['a', 'missing']), points)).toBeNull();
  });

  it('resolves fit points in order as a plain polyline (not an evaluated curve)', () => {
    const points = new Map<string, SketchVector2>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 1, y: 5 }],
      ['c', { x: 2, y: 0 }],
    ]);
    expect(resolveSplinePolylinePoints(splineEntity(['a', 'b', 'c']), points)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// describeSketchViewerState / describeSketchEntity
// ---------------------------------------------------------------------------

describe('describeSketchViewerState', () => {
  it('describes an empty sketch', () => {
    expect(describeSketchViewerState(0)).toBe('Sketch viewer, no entities to display yet');
  });

  it('uses singular "entity" for exactly one', () => {
    expect(describeSketchViewerState(1)).toBe('Sketch viewer showing 1 entity');
  });

  it('uses plural "entities" otherwise', () => {
    expect(describeSketchViewerState(4)).toBe('Sketch viewer showing 4 entities');
  });
});

describe('describeSketchEntity', () => {
  it('labels a plain real-geometry entity', () => {
    const entity = { id: 'l1', type: 'line', startPointId: 'a', endPointId: 'b', construction: false } as const;
    expect(describeSketchEntity(entity, false)).toBe('line sketch entity');
  });

  it('flags construction geometry', () => {
    const entity = { id: 'l1', type: 'line', startPointId: 'a', endPointId: 'b', construction: true } as const;
    expect(describeSketchEntity(entity, false)).toBe('line sketch entity, construction geometry');
  });

  it('flags selection, and spaces out the "elliptical arc" type name', () => {
    const entity = {
      id: 'e1',
      type: 'elliptical-arc',
      centerPointId: 'c',
      majorAxisPointId: 'm',
      minorRadius: 1,
      startPointId: 's',
      endPointId: 'e',
      clockwise: false,
      construction: true,
    } as const;
    expect(describeSketchEntity(entity, true)).toBe('elliptical arc sketch entity, construction geometry, selected');
  });
});
