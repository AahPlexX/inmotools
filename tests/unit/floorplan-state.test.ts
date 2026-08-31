import { describe, expect, it } from 'vitest';
import { commitProject, createInitialProject, redoState, undoState } from '../../src/tools/floorplan/state-engine';
import type { WallSegment, WallVertex } from '../../src/tools/floorplan/floorplan-types';

const vertex: WallVertex = { id: 'v1', position: { x: 0, y: 0 }, connectedWallIds: ['w1'] };
const wall: WallSegment = {
  id: 'w1',
  startVertexId: 'v1',
  endVertexId: 'v2',
  thickness: 150,
  height: 2700,
  state: 'new_construction',
  material: 'drywall_stud',
  isLoadBearing: false,
  openings: [],
};

describe('PlanCraft transactional state', () => {
  it('undoes and redoes a committed geometry edit', () => {
    const initial = createInitialProject('Test Plan');
    const edited = commitProject(initial, 'add wall', (project) => ({
      ...project,
      vertices: [...project.vertices, vertex, { ...vertex, id: 'v2', position: { x: 3000, y: 0 }, connectedWallIds: ['w1'] }],
      walls: [...project.walls, wall],
    }));

    expect(edited.present.walls).toHaveLength(1);
    const undone = undoState(edited);
    expect(undone.present.walls).toHaveLength(0);
    const redone = redoState(undone);
    expect(redone.present.walls).toHaveLength(1);
    expect(redone.present.walls[0]?.id).toBe('w1');
  });

  it('clears redo history after a new committed edit', () => {
    const initial = createInitialProject('Test Plan');
    const first = commitProject(initial, 'rename', (project) => ({ ...project, name: 'A' }));
    const undone = undoState(first);
    const divergent = commitProject(undone, 'rename differently', (project) => ({ ...project, name: 'B' }));
    expect(divergent.future).toHaveLength(0);
    expect(redoState(divergent).present.name).toBe('B');
  });

  it('caps committed undo history at one hundred states', () => {
    let state = createInitialProject('Test Plan');
    for (let index = 0; index < 110; index += 1) {
      state = commitProject(state, `rename ${index}`, (project) => ({ ...project, name: `Plan ${index}` }));
    }
    expect(state.past).toHaveLength(100);
    expect(state.present.name).toBe('Plan 109');
  });
});
