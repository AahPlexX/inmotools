import { describe, expect, it } from 'vitest';
import {
  extractRoomFaces,
  polygonMetrics,
  satOverlap,
  screenToWorld,
  worldToScreen,
} from '../../src/tools/floorplan/geometry-engine';
import { createSnapIndex } from '../../src/tools/floorplan/snap-index';
import type { Point2D, WallSegment, WallVertex } from '../../src/tools/floorplan/floorplan-types';

const rectangleVertices: WallVertex[] = [
  { id: 'v1', position: { x: 0, y: 0 }, connectedWallIds: ['w1', 'w4'] },
  { id: 'v2', position: { x: 6000, y: 0 }, connectedWallIds: ['w1', 'w2'] },
  { id: 'v3', position: { x: 6000, y: 4000 }, connectedWallIds: ['w2', 'w3'] },
  { id: 'v4', position: { x: 0, y: 4000 }, connectedWallIds: ['w3', 'w4'] },
];

const wall = (id: string, startVertexId: string, endVertexId: string): WallSegment => ({
  id,
  startVertexId,
  endVertexId,
  thickness: 150,
  height: 2700,
  state: 'existing',
  material: 'drywall_stud',
  isLoadBearing: false,
  openings: [],
});

const rectangleWalls: WallSegment[] = [
  wall('w1', 'v1', 'v2'),
  wall('w2', 'v2', 'v3'),
  wall('w3', 'v3', 'v4'),
  wall('w4', 'v4', 'v1'),
];

describe('PlanCraft geometry', () => {
  it('round-trips world and screen coordinates at extreme supported zoom levels', () => {
    const point = { x: 12345, y: -6789 };
    for (const scale of [0.01, 5]) {
      const screen = worldToScreen(point, { scale, panX: 412.5, panY: -93.25 });
      const restored = screenToWorld(screen, { scale, panX: 412.5, panY: -93.25 });
      expect(restored.x).toBeCloseTo(point.x, 8);
      expect(restored.y).toBeCloseTo(point.y, 8);
    }
  });

  it('computes shoelace area, perimeter and centroid for a rectangle', () => {
    const metrics = polygonMetrics(rectangleVertices.map((vertex) => vertex.position));
    expect(metrics.areaSqMm).toBe(24_000_000);
    expect(metrics.areaSqMeters).toBe(24);
    expect(metrics.perimeterMm).toBe(20_000);
    expect(metrics.centroid).toEqual({ x: 3000, y: 2000 });
  });

  it('treats edge-touching convex clearance boxes as adjacent rather than overlapping', () => {
    const a: Point2D[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    const touching: Point2D[] = [{ x: 1000, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 1000, y: 1000 }];
    const overlap: Point2D[] = [{ x: 900, y: 0 }, { x: 1900, y: 0 }, { x: 1900, y: 1000 }, { x: 900, y: 1000 }];
    expect(satOverlap(a, touching)).toBe(false);
    expect(satOverlap(a, overlap)).toBe(true);
  });

  it('extracts one interior room face from a closed wall cycle', () => {
    const rooms = extractRoomFaces(rectangleVertices, rectangleWalls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.areaSqMeters).toBeCloseTo(24, 6);
    expect(rooms[0]?.areaSqFeet).toBeCloseTo(258.33385, 4);
    expect(rooms[0]?.centroid).toEqual({ x: 3000, y: 2000 });
  });

  it('queries nearby snap targets deterministically', () => {
    const index = createSnapIndex(rectangleVertices.map((vertex) => ({ id: vertex.id, point: vertex.position, kind: 'vertex' as const })));
    const matches = index.withinRadius({ x: 20, y: 15 }, 50);
    expect(matches.map((match) => match.id)).toEqual(['v1']);
    expect(index.nearest({ x: 5900, y: 50 }, 200)?.id).toBe('v2');
  });
});
