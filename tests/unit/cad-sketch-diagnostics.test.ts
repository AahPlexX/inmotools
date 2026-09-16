import { describe, expect, it } from 'vitest';
import { analyzeSketchProfiles } from '../../src/tools/cad/sketch-diagnostics';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function squareSketch(): CadSketch {
  return {
    id: 'square',
    label: 'Square',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 10, y: 0, construction: false },
      { id: 'p2', type: 'point', x: 10, y: 10, construction: false },
      { id: 'p3', type: 'point', x: 0, y: 10, construction: false },
      { id: 'l0', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
      { id: 'l1', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      { id: 'l2', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
      { id: 'l3', type: 'line', startPointId: 'p3', endPointId: 'p0', construction: false },
    ],
    constraints: [],
  };
}

describe('CAD sketch profile diagnostics', () => {
  it('identifies a closed line region without mutating the sketch', () => {
    const sketch = squareSketch();
    const before = JSON.stringify(sketch);

    const result = analyzeSketchProfiles(sketch);

    expect(result.closedRegions).toHaveLength(1);
    expect(result.closedRegions[0]?.entityIds).toEqual(['l0', 'l1', 'l2', 'l3']);
    expect(result.openEndpoints).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(JSON.stringify(sketch)).toBe(before);
  });

  it('reports a micro-gap between otherwise connectable open endpoints', () => {
    const sketch: CadSketch = {
      ...squareSketch(),
      id: 'gap',
      entities: [
        { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'p1', type: 'point', x: 10, y: 0, construction: false },
        { id: 'p2', type: 'point', x: 10, y: 10, construction: false },
        { id: 'p3', type: 'point', x: 0, y: 0.0005, construction: false },
        { id: 'l0', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
        { id: 'l1', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
        { id: 'l2', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
      ],
    };

    const result = analyzeSketchProfiles(sketch, { gapTolerance: 0.001 });

    expect(result.closedRegions).toEqual([]);
    expect(result.openEndpoints.map((endpoint) => endpoint.pointId).sort()).toEqual(['p0', 'p3']);
    expect(result.gaps).toEqual([
      expect.objectContaining({ pointAId: 'p0', pointBId: 'p3', distance: expect.any(Number) }),
    ]);
    expect(result.gaps[0]?.distance).toBeCloseTo(0.0005, 8);
  });

  it('reports duplicate and partially overlapping line geometry deterministically', () => {
    const sketch: CadSketch = {
      id: 'overlap',
      label: 'Overlap',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'a1', type: 'point', x: 10, y: 0, construction: false },
        { id: 'b0', type: 'point', x: 10, y: 0, construction: false },
        { id: 'b1', type: 'point', x: 0, y: 0, construction: false },
        { id: 'c0', type: 'point', x: 4, y: 0, construction: false },
        { id: 'c1', type: 'point', x: 14, y: 0, construction: false },
        { id: 'a', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
        { id: 'b', type: 'line', startPointId: 'b0', endPointId: 'b1', construction: false },
        { id: 'c', type: 'line', startPointId: 'c0', endPointId: 'c1', construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch);

    expect(result.duplicates).toEqual([{ entityAId: 'a', entityBId: 'b' }]);
    expect(result.overlaps).toEqual([
      { entityAId: 'a', entityBId: 'c' },
      { entityAId: 'b', entityBId: 'c' },
    ]);
  });

  it('reports interior line crossings as self-intersections but ignores shared endpoints', () => {
    const sketch: CadSketch = {
      id: 'crossing',
      label: 'Crossing',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
        { id: 'a1', type: 'point', x: 10, y: 10, construction: false },
        { id: 'b0', type: 'point', x: 0, y: 10, construction: false },
        { id: 'b1', type: 'point', x: 10, y: 0, construction: false },
        { id: 'c1', type: 'point', x: 15, y: 15, construction: false },
        { id: 'a', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
        { id: 'b', type: 'line', startPointId: 'b0', endPointId: 'b1', construction: false },
        { id: 'c', type: 'line', startPointId: 'a1', endPointId: 'c1', construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch);

    expect(result.selfIntersections).toEqual([
      expect.objectContaining({ entityAId: 'a', entityBId: 'b', x: 5, y: 5 }),
    ]);
    expect(result.selfIntersections.some((entry) => entry.entityBId === 'c')).toBe(false);
  });

  it('treats each non-construction circle as an intrinsically closed region', () => {
    const sketch: CadSketch = {
      id: 'circle-profile',
      label: 'Circle',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 2, y: 3, construction: false },
        { id: 'circle', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch);

    expect(result.closedRegions).toEqual([{ entityIds: ['circle'] }]);
  });

  it('treats full ellipses and closed splines as intrinsic closed regions while ignoring construction curves', () => {
    const sketch: CadSketch = {
      id: 'advanced-closed',
      label: 'Advanced closed profiles',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 8, y: 0, construction: false },
        { id: 's0', type: 'point', x: 12, y: 0, construction: false },
        { id: 's1', type: 'point', x: 16, y: 4, construction: false },
        { id: 's2', type: 'point', x: 20, y: 0, construction: false },
        { id: 'ellipse', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 4, construction: false },
        { id: 'construction-ellipse', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 2, construction: true },
        { id: 'closed-spline', type: 'spline', fitPointIds: ['s0', 's1', 's2'], degree: 2, closed: true, construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch);

    expect(result.closedRegions).toEqual([
      { entityIds: ['ellipse'] },
      { entityIds: ['closed-spline'] },
    ]);
  });

  it('uses arc and line endpoints together to recognize mixed closed profiles', () => {
    const sketch: CadSketch = {
      id: 'mixed-loop',
      label: 'Mixed loop',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'p0', type: 'point', x: 5, y: 0, construction: false },
        { id: 'p1', type: 'point', x: 0, y: 5, construction: false },
        { id: 'p2', type: 'point', x: -5, y: 0, construction: false },
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'p0', endPointId: 'p1', clockwise: false, construction: false },
        { id: 'line-a', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
        { id: 'line-b', type: 'line', startPointId: 'p2', endPointId: 'p0', construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch);

    expect(result.closedRegions).toEqual([{ entityIds: ['arc', 'line-a', 'line-b'] }]);
    expect(result.openEndpoints).toEqual([]);
  });

  it('includes open spline and elliptical-arc endpoints in open-endpoint and micro-gap diagnostics', () => {
    const sketch: CadSketch = {
      id: 'advanced-open',
      label: 'Advanced open profiles',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 8, y: 0, construction: false },
        { id: 'e0', type: 'point', x: 8, y: 0, construction: false },
        { id: 'e1', type: 'point', x: 0, y: 4, construction: false },
        { id: 's0', type: 'point', x: 0.0005, y: 4, construction: false },
        { id: 's1', type: 'point', x: 4, y: 8, construction: false },
        { id: 's2', type: 'point', x: 8, y: 8, construction: false },
        { id: 'elliptical-arc', type: 'elliptical-arc', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 4, startPointId: 'e0', endPointId: 'e1', clockwise: false, construction: false },
        { id: 'open-spline', type: 'spline', fitPointIds: ['s0', 's1', 's2'], degree: 2, closed: false, construction: false },
      ],
      constraints: [],
    };

    const result = analyzeSketchProfiles(sketch, { gapTolerance: 0.001 });

    expect(result.openEndpoints.map((endpoint) => endpoint.pointId).sort()).toEqual(['e0', 'e1', 's0', 's2']);
    expect(result.gaps).toEqual([
      expect.objectContaining({ pointAId: 'e1', pointBId: 's0', distance: expect.any(Number) }),
    ]);
  });
});