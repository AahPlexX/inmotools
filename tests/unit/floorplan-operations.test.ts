import { describe, expect, it } from 'vitest';
import { analyzeFloorplan } from '../../src/tools/floorplan/floorplan-analysis';
import { addWall, deleteSelection, duplicateComponent, hitTest, mergeVertex, moveVertex, placeOpening, splitWall } from '../../src/tools/floorplan/plan-operations';
import { createInitialProject, parseProjectJson } from '../../src/tools/floorplan/state-engine';
import type { FloorplanProject, HostedOpening, WallSegment } from '../../src/tools/floorplan/floorplan-types';

const wall = (id: string, startVertexId: string, endVertexId: string, openings: HostedOpening[] = []): WallSegment => ({
  id, startVertexId, endVertexId, thickness: 150, height: 2700, state: 'new_construction', material: 'drywall_stud', isLoadBearing: false, openings,
});
const door = (id: string, offsetRatio: number): HostedOpening => ({ id, type: 'door_single', offsetRatio, width: 915, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false });

/** 4000 × 3000 mm room: a(0,0) b(4000,0) c(4000,3000) d(0,3000). */
const room = (): FloorplanProject => ({
  ...createInitialProject('Ops').present,
  vertices: [
    { id: 'a', position: { x: 0, y: 0 }, connectedWallIds: ['ab', 'da'] },
    { id: 'b', position: { x: 4000, y: 0 }, connectedWallIds: ['ab', 'bc'] },
    { id: 'c', position: { x: 4000, y: 3000 }, connectedWallIds: ['bc', 'cd'] },
    { id: 'd', position: { x: 0, y: 3000 }, connectedWallIds: ['cd', 'da'] },
  ],
  walls: [wall('ab', 'a', 'b'), wall('bc', 'b', 'c'), wall('cd', 'c', 'd'), wall('da', 'd', 'a')],
});

const idMaker = () => { let n = 0; return (prefix: string) => `${prefix}-${(n += 1)}`; };

describe('PlanCraft plan operations', () => {
  it('splits both host walls when a partition runs wall-to-wall, producing two rooms', () => {
    const result = addWall(room(), { point: { x: 2000, y: 0 }, hostWallId: 'ab' }, { point: { x: 2000, y: 3000 }, hostWallId: 'cd' }, idMaker());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.walls).toHaveLength(7);
    expect(result.joinedExisting).toBe(true);
    const rooms = analyzeFloorplan(result.project).rooms;
    expect(rooms).toHaveLength(2);
    expect(rooms.map((item) => Math.round(item.areaSqMeters))).toEqual([6, 6]);
    for (const vertex of result.project.vertices) {
      const touching = result.project.walls.filter((item) => item.startVertexId === vertex.id || item.endVertexId === vertex.id).map((item) => item.id).sort();
      expect([...vertex.connectedWallIds].sort()).toEqual(touching);
    }
  });

  it('keeps each opening on the half of a split wall that contains it, at the same position', () => {
    const project: FloorplanProject = { ...room(), walls: [wall('ab', 'a', 'b', [door('left', 0.25), door('right', 0.75)]), ...room().walls.slice(1)] };
    const split = splitWall(project, 'ab', { x: 2000, y: 10 }, 'v-new', 'ab-2');
    const first = split.walls.find((item) => item.id === 'ab')!;
    const second = split.walls.find((item) => item.id === 'ab-2')!;
    expect(first.endVertexId).toBe('v-new');
    expect(second.startVertexId).toBe('v-new');
    expect(first.openings.map((item) => [item.id, item.offsetRatio])).toEqual([['left', 0.5]]);
    expect(second.openings.map((item) => [item.id, item.offsetRatio])).toEqual([['right', 0.5]]);
    // The junction lands on the wall centerline even when the click was 10 mm off it.
    expect(split.vertices.find((item) => item.id === 'v-new')!.position).toEqual({ x: 2000, y: 0 });
  });

  it('refuses a zero-length wall, a duplicate wall, and a wall lying along another', () => {
    const make = idMaker();
    expect(addWall(room(), { point: { x: 0, y: 0 }, vertexId: 'a' }, { point: { x: 0, y: 0 }, vertexId: 'a' }, make).ok).toBe(false);
    expect(addWall(room(), { point: { x: 0, y: 0 }, vertexId: 'a' }, { point: { x: 4000, y: 0 }, vertexId: 'b' }, make).ok).toBe(false);
    expect(addWall(room(), { point: { x: 1000, y: 0 }, hostWallId: 'ab' }, { point: { x: 3000, y: 0 }, hostWallId: 'ab' }, make).ok).toBe(false);
  });

  it('continues from open floor without joining anything', () => {
    const result = addWall(room(), { point: { x: 6000, y: 0 } }, { point: { x: 8000, y: 0 } }, idMaker());
    expect(result.ok && result.joinedExisting).toBe(false);
  });

  it('fits an opening inside its wall and refuses walls that are too short or already occupied', () => {
    const placed = placeOpening(room(), 'ab', 0.02, door('d1', 0));
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.project.walls[0]!.openings[0]!.offsetRatio).toBeCloseTo(457.5 / 4000, 10);
    expect(placeOpening(placed.project, 'ab', 0.1, door('d2', 0)).ok).toBe(false);
    const tiny: FloorplanProject = { ...room(), vertices: room().vertices.map((vertex) => vertex.id === 'b' ? { ...vertex, position: { x: 600, y: 0 } } : vertex) };
    const refused = placeOpening(tiny, 'ab', 0.5, door('d3', 0));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toMatch(/shorter than/);
  });

  it('moves a corner and merges it onto another corner without leaving zero-length or duplicate walls', () => {
    const moved = moveVertex(room(), 'c', { x: 5000, y: 3000 });
    expect(moved.vertices.find((item) => item.id === 'c')!.position).toEqual({ x: 5000, y: 3000 });
    // Collapse corner d onto a: wall da becomes zero-length and is removed; cd now ends at a.
    const merged = mergeVertex(room(), 'd', 'a');
    expect(merged.vertices.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.walls.map((item) => item.id).sort()).toEqual(['ab', 'bc', 'cd']);
    expect(merged.walls.find((item) => item.id === 'cd')!.endVertexId).toBe('a');
    expect([...merged.vertices.find((item) => item.id === 'a')!.connectedWallIds].sort()).toEqual(['ab', 'cd']);
  });

  it('duplicates a component beside the original and deletes every selectable kind', () => {
    const withSofa: FloorplanProject = {
      ...room(),
      components: [{ id: 'sofa', category: 'living', symbolKey: 'sofa-3-seat', position: { x: 2000, y: 1500 }, rotation: 90, scale: { x: 1, y: 1 }, layerId: 'furniture', clearance: { shape: 'rectangle', dimensions: { x: 2200, y: 900 }, bufferOffset: 450 } }],
      dimensions: [{ id: 'dim', start: { x: 0, y: -500 }, end: { x: 4000, y: -500 }, layerId: 'dimensions' }],
      walls: [wall('ab', 'a', 'b', [door('door', 0.5)]), ...room().walls.slice(1)],
    };
    const copy = duplicateComponent(withSofa, 'sofa', 'sofa-copy', 300)!;
    expect(copy.components.find((item) => item.id === 'sofa-copy')).toMatchObject({ position: { x: 2300, y: 1800 }, rotation: 90 });
    expect(copy.selectedId).toBe('sofa-copy');
    expect(deleteSelection(withSofa, 'dim')!.dimensions).toEqual([]);
    expect(deleteSelection(withSofa, 'door')!.walls[0]!.openings).toEqual([]);
    expect(deleteSelection(withSofa, 'sofa')!.components).toEqual([]);
    expect(deleteSelection(withSofa, 'ab')!.walls.map((item) => item.id)).toEqual(['bc', 'cd', 'da']);
    expect(deleteSelection(withSofa, 'nothing')).toBeUndefined();
  });

  it('hit-tests openings before their wall, components by footprint, and dimensions by distance', () => {
    const project: FloorplanProject = {
      ...room(),
      walls: [wall('ab', 'a', 'b', [door('door', 0.5)]), ...room().walls.slice(1)],
      components: [{ id: 'bed', category: 'bedroom', symbolKey: 'queen-bed', position: { x: 2000, y: 1500 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 'furniture', clearance: { shape: 'rectangle', dimensions: { x: 1525, y: 2030 }, bufferOffset: 760 } }],
      dimensions: [{ id: 'dim', start: { x: 0, y: -600 }, end: { x: 4000, y: -600 }, layerId: 'dimensions' }],
    };
    const scale = 0.1; // 10 px screen tolerance = 100 mm
    expect(hitTest(project, { x: 2100, y: 20 }, scale)).toEqual({ kind: 'opening', id: 'door', wallId: 'ab' });
    expect(hitTest(project, { x: 500, y: 20 }, scale)).toEqual({ kind: 'wall', id: 'ab' });
    expect(hitTest(project, { x: 2700, y: 2400 }, scale)).toEqual({ kind: 'component', id: 'bed' });
    expect(hitTest(project, { x: 1000, y: -560 }, scale)).toEqual({ kind: 'dimension', id: 'dim' });
    expect(hitTest(project, { x: 20, y: 30 }, scale)).toEqual({ kind: 'vertex', id: 'a' });
    expect(hitTest(project, { x: 1000, y: 1000 }, scale)).toBeUndefined();
  });
});

describe('PlanCraft backup validation', () => {
  it('restores a valid backup and names what is wrong with a broken one', () => {
    expect(parseProjectJson(JSON.stringify(room())).walls).toHaveLength(4);
    expect(() => parseProjectJson('not json')).toThrow(/isn't a PlanCraft backup/);
    expect(() => parseProjectJson(JSON.stringify({ schemaVersion: 2 }))).toThrow(/newer version/);
    expect(() => parseProjectJson(JSON.stringify({ ...room(), walls: 'x' }))).toThrow(/walls/);
    expect(() => parseProjectJson(JSON.stringify({ ...room(), walls: [wall('bad', 'a', 'missing')] }))).toThrow(/corner that isn't in the file/);
    expect(() => parseProjectJson(JSON.stringify({ ...room(), vertices: [{ id: 'a', position: { x: 'NaN', y: 0 }, connectedWallIds: [] }] }))).toThrow(/coordinates/);
  });

  it('fills defaults an older backup may lack instead of rejecting it', () => {
    const { layers: _layers, dimensions: _dimensions, ...legacy } = room();
    const restored = parseProjectJson(JSON.stringify(legacy));
    expect(restored.layers.map((layer) => layer.id)).toContain('walls');
    expect(restored.dimensions).toEqual([]);
  });
});
