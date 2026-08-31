import { describe, expect, it } from 'vitest';
import { hostedOpeningGeometry, wallVisualStyle } from '../../src/tools/floorplan/render-engine';
import type { HostedOpening, WallSegment } from '../../src/tools/floorplan/floorplan-types';

const baseWall: WallSegment = {
  id: 'w', startVertexId: 'a', endVertexId: 'b', thickness: 150, height: 2700,
  state: 'existing', material: 'drywall_stud', isLoadBearing: false, openings: [],
};

const door: HostedOpening = {
  id: 'd', type: 'door_single', offsetRatio: 0.5, width: 900, nominalHeight: 2100,
  sillHeight: 0, flipSide: false, flipHand: false,
};

describe('PlanCraft rendering geometry', () => {
  it('maps wall states to distinct visual treatments', () => {
    expect(wallVisualStyle(baseWall).stroke).toBe('#334155');
    expect(wallVisualStyle({ ...baseWall, state: 'new_construction' }).stroke).toBe('#38bdf8');
    expect(wallVisualStyle({ ...baseWall, state: 'demolition' }).stroke).toBe('#f43f5e');
    expect(wallVisualStyle({ ...baseWall, state: 'demolition' }).dash.length).toBeGreaterThan(0);
  });

  it('projects a hosted door onto its parent wall with a true-width leaf and swing center', () => {
    const geometry = hostedOpeningGeometry({ x: 0, y: 0 }, { x: 4000, y: 0 }, door);
    expect(geometry.center).toEqual({ x: 2000, y: 0 });
    expect(geometry.jambA.x).toBeCloseTo(1550, 6);
    expect(geometry.jambB.x).toBeCloseTo(2450, 6);
    expect(geometry.radius).toBe(900);
    expect(geometry.leafEnd.x).toBeCloseTo(1550, 6);
    expect(geometry.leafEnd.y).toBeCloseTo(900, 6);
  });
});
