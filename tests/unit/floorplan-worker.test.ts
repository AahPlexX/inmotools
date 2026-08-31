import { describe, expect, it } from 'vitest';
import { analyzeFloorplan } from '../../src/tools/floorplan/floorplan-analysis';
import type { FloorplanProject } from '../../src/tools/floorplan/floorplan-types';
import { createInitialProject } from '../../src/tools/floorplan/state-engine';

const closedRoom = (): FloorplanProject => ({
  ...createInitialProject('Worker').present,
  vertices: [
    { id: 'a', position: { x: 0, y: 0 }, connectedWallIds: ['ab', 'da'] },
    { id: 'b', position: { x: 4000, y: 0 }, connectedWallIds: ['ab', 'bc'] },
    { id: 'c', position: { x: 4000, y: 3000 }, connectedWallIds: ['bc', 'cd'] },
    { id: 'd', position: { x: 0, y: 3000 }, connectedWallIds: ['cd', 'da'] },
  ],
  walls: [
    ['ab', 'a', 'b'], ['bc', 'b', 'c'], ['cd', 'c', 'd'], ['da', 'd', 'a'],
  ].map(([id, startVertexId, endVertexId]) => ({
    id: id!, startVertexId: startVertexId!, endVertexId: endVertexId!, thickness: 150, height: 2700,
    state: 'existing' as const, material: 'drywall_stud' as const, isLoadBearing: false, openings: [],
  })),
  components: [{
    id: 'chair', category: 'office', symbolKey: 'task-chair', position: { x: 2000, y: 1500 }, rotation: 0,
    scale: { x: 1, y: 1 }, layerId: 'furniture',
    clearance: { shape: 'circle', dimensions: { x: 900, y: 900 }, bufferOffset: 0, adaRuleKey: 'ada_turning_circle' },
  }],
});

describe('PlanCraft worker analysis', () => {
  it('returns room metrics, snap targets and clearance violations from one project snapshot', () => {
    const result = analyzeFloorplan(closedRoom());
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]?.areaSqMeters).toBeCloseTo(12, 6);
    expect(result.snapTargets.filter((target) => target.kind === 'vertex')).toHaveLength(4);
    expect(result.snapTargets.filter((target) => target.kind === 'midpoint')).toHaveLength(4);
    expect(result.clearanceViolations.some((violation) => violation.componentId === 'chair')).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
