import { describe, expect, it } from 'vitest';
import {
  buildOccupancyHeatMap,
  computeConvexTeamGeometry,
  computeEuclideanVoronoi,
  createDistanceRing,
  createPositionalGrid,
  createVisionSector,
  measurePassingLaneClearance,
  measureTether,
  measureTrajectory,
  sampleAuthoredTrajectory,
} from '../../src/tools/tactics/analysis-engine';
import type { PitchDimensions, TimelineTrack } from '../../src/tools/tactics/tactics-types';

const pitch: PitchDimensions = { lengthMeters: 100, widthMeters: 50 };

describe('Tactical spatial analysis', () => {
  it('builds physical-Euclidean Voronoi territory clipped to the pitch', () => {
    const cells = computeEuclideanVoronoi([
      { id: 'left', position: { x: 0.25, y: 0.5 } },
      { id: 'right', position: { x: 0.75, y: 0.5 } },
    ], pitch);

    expect(cells).toHaveLength(2);
    const left = cells.find((cell) => cell.targetId === 'left')!;
    const right = cells.find((cell) => cell.targetId === 'right')!;
    expect(left.areaSquareMeters).toBeCloseTo(2500, 6);
    expect(right.areaSquareMeters).toBeCloseTo(2500, 6);
    expect(Math.max(...left.polygon.map((point) => point.x))).toBeCloseTo(0.5, 8);
    expect(Math.min(...right.polygon.map((point) => point.x))).toBeCloseTo(0.5, 8);
  });

  it('derives convex hull, centroid, width, depth, area and perimeter in physical units', () => {
    const geometry = computeConvexTeamGeometry([
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
      { x: 0.5, y: 0.5 },
    ], pitch);

    expect(geometry.hull).toHaveLength(4);
    expect(geometry.centroid.x).toBeCloseTo(0.5, 12);
    expect(geometry.centroid.y).toBeCloseTo(0.5, 12);
    expect(geometry.widthMeters).toBeCloseTo(30, 12);
    expect(geometry.depthMeters).toBeCloseTo(60, 12);
    expect(geometry.areaSquareMeters).toBeCloseTo(1800, 8);
    expect(geometry.perimeterMeters).toBeCloseTo(180, 8);
  });

  it('reports geometric passing-lane clearance without converting it into a probability', () => {
    const result = measurePassingLaneClearance(
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
      [
        { id: 'near', position: { x: 0.5, y: 0.52 } },
        { id: 'far', position: { x: 0.5, y: 0.8 } },
      ],
      pitch,
      1.5,
    );

    expect(result.nearestDefenderId).toBe('near');
    expect(result.nearestCenterDistanceMeters).toBeCloseTo(1, 8);
    expect(result.minimumClearanceMeters).toBeCloseTo(-0.5, 8);
    expect(result.blocked).toBe(true);
  });

  it('builds authored orientation sectors using physical range and pitch dimensions', () => {
    const sector = createVisionSector(
      { x: 0.5, y: 0.5 },
      0,
      90,
      10,
      pitch,
    );
    expect(sector.center).toEqual({ x: 0.5, y: 0.5 });
    expect(sector.points[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(sector.points.some((point) => point.x > 0.59)).toBe(true);
    expect(sector.rangeMeters).toBe(10);
    expect(sector.angleDeg).toBe(90);
  });

  it('creates configurable positional-play grids without implying an official formation', () => {
    const grid = createPositionalGrid(5, 3);
    expect(grid.vertical).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(grid.horizontal[0]).toBeCloseTo(1 / 3, 12);
    expect(grid.horizontal[1]).toBeCloseTo(2 / 3, 12);
  });

  it('creates physical distance rings and dynamic tethers', () => {
    const ring = createDistanceRing({ x: 0.5, y: 0.5 }, 10, pitch);
    expect(ring.radiusXMeters).toBe(10);
    expect(ring.radiusYMeters).toBe(10);
    expect(ring.radiusXNormalized).toBeCloseTo(0.1, 12);
    expect(ring.radiusYNormalized).toBeCloseTo(0.2, 12);

    const tether = measureTether({ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, pitch);
    expect(tether.distanceMeters).toBeCloseTo(10, 12);
  });

  it('samples authored motion into an occupancy heat map', () => {
    const track: TimelineTrack = {
      id: 'runner-track',
      targetId: 'runner',
      keyframes: [
        { id: 'start', timeMs: 0, position: { x: 0.1, y: 0.1 }, interpolation: 'linear' },
        { id: 'finish', timeMs: 1000, position: { x: 0.9, y: 0.9 }, interpolation: 'hold' },
      ],
    };
    const samples = sampleAuthoredTrajectory(track, 0, 1000, 500);
    expect(samples.map((sample) => sample.timeMs)).toEqual([0, 500, 1000]);

    const heat = buildOccupancyHeatMap(samples, 2, 2);
    expect(heat.totalSamples).toBe(3);
    expect(heat.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(3);
    expect(Math.max(...heat.cells.map((cell) => cell.intensity))).toBe(1);
  });

  it('measures distance and speed from authored or imported trajectory samples', () => {
    const metrics = measureTrajectory([
      { timeMs: 0, position: { x: 0, y: 0 } },
      { timeMs: 1000, position: { x: 0.1, y: 0 } },
      { timeMs: 3000, position: { x: 0.1, y: 0.2 } },
    ], pitch, 'imported');

    expect(metrics.source).toBe('imported');
    expect(metrics.distanceMeters).toBeCloseTo(20, 8);
    expect(metrics.durationMs).toBe(3000);
    expect(metrics.averageSpeedMetersPerSecond).toBeCloseTo(20 / 3, 8);
    expect(metrics.maxSegmentSpeedMetersPerSecond).toBeCloseTo(10, 8);
  });
});
