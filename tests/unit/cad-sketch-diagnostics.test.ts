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
});