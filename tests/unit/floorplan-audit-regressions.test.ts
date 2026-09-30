import { describe, expect, it } from 'vitest';
import { analyzeFloorplan } from '../../src/tools/floorplan/floorplan-analysis';
import * as exportEngine from '../../src/tools/floorplan/export-engine';
import { createInitialProject } from '../../src/tools/floorplan/state-engine';
import { getSymbolDefinition } from '../../src/tools/floorplan/symbol-library';
import type { FloorplanProject } from '../../src/tools/floorplan/floorplan-types';

const baseProject = (name: string): FloorplanProject => createInitialProject(name).present;

const simpleWallProject = (): FloorplanProject => ({
  ...baseProject('Wall export audit'),
  vertices: [
    { id: 'a', position: { x: 0, y: 0 }, connectedWallIds: ['wall'] },
    { id: 'b', position: { x: 4000, y: 0 }, connectedWallIds: ['wall'] },
  ],
  walls: [{
    id: 'wall', startVertexId: 'a', endVertexId: 'b', thickness: 150, height: 2700,
    state: 'existing', material: 'drywall_stud', isLoadBearing: false,
    openings: [{ id: 'door', type: 'door_single', offsetRatio: 0.5, width: 1000, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false }],
  }],
});

const r12WallLines = (dxf: string) => dxf.split('0\nLINE\n').slice(1).flatMap((chunk) => {
  if (!chunk.includes('8\nWALLS\n')) return [];
  const value = (code: number) => Number(new RegExp(`(?:^|\\n)${code}\\n(-?\\d+(?:\\.\\d+)?)`).exec(`\n${chunk}`)?.[1]);
  return [[value(10), value(20), value(11), value(21)]];
});

describe('PlanCraft September audit regressions', () => {
  it('tests a rectangular clearance envelope against wall thickness instead of a small-radius approximation', () => {
    const project: FloorplanProject = {
      ...baseProject('Rectangle wall clearance'),
      vertices: [
        { id: 'a', position: { x: 950, y: -2000 }, connectedWallIds: ['wall'] },
        { id: 'b', position: { x: 950, y: 2000 }, connectedWallIds: ['wall'] },
      ],
      walls: [{ id: 'wall', startVertexId: 'a', endVertexId: 'b', thickness: 150, height: 2700, state: 'existing', material: 'drywall_stud', isLoadBearing: false, openings: [] }],
      components: [{
        id: 'wide', category: 'office', symbolKey: 'desk', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 'furniture',
        clearance: { shape: 'rectangle', dimensions: { x: 1800, y: 200 }, bufferOffset: 0 },
      }],
    };

    const analysis = analyzeFloorplan(project);
    expect(analysis.clearanceViolations.some((violation) => violation.componentId === 'wide' && violation.rule === 'wall_collision')).toBe(true);
  });

  it('subtracts hosted opening intervals from DXF wall centerlines', () => {
    const dxf = exportEngine.exportDxf(simpleWallProject(), 'r12');
    expect(r12WallLines(dxf)).toEqual([
      [0, 0, 1500, 0],
      [2500, 0, 4000, 0],
    ]);
  });

  it('includes dimension label extents when computing SVG export bounds', () => {
    const project: FloorplanProject = {
      ...baseProject('Dimension bounds'),
      dimensions: [{
        id: 'long-label', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, layerId: 'dimensions',
        label: 'DIMENSION LABEL THAT MUST REMAIN INSIDE THE EXPORTED VIEWBOX',
      }],
    };
    const svg = exportEngine.exportSvg(project);
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
    expect(viewBox).toBeDefined();
    expect(viewBox?.[0]).toBeLessThan(-2000);
  });

  it('honors an explicit export-layer selection instead of always emitting every populated layer', () => {
    const project: FloorplanProject = {
      ...simpleWallProject(),
      components: [{
        id: 'chair', category: 'office', symbolKey: 'task-chair', position: { x: 1000, y: 1000 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 'furniture',
        clearance: { shape: 'rectangle', dimensions: { x: 600, y: 600 }, bufferOffset: 0 },
      }],
      dimensions: [{ id: 'dim', start: { x: 0, y: -500 }, end: { x: 4000, y: -500 }, layerId: 'dimensions' }],
    };
    const exportDxf = exportEngine.exportDxf as (project: FloorplanProject, version: 'r12', options?: { layers?: string[] }) => string;
    const dxf = exportDxf(project, 'r12', { layers: ['walls'] });
    expect(dxf).toContain('8\nWALLS\n');
    expect(dxf).not.toContain('8\nFURNITURE\n');
    expect(dxf).not.toContain('8\nDIMENSIONS\n');
    expect(dxf).not.toContain('8\nDOORS\n');
  });

  it('supports a real 1:50 PDF placement instead of labeling every PDF as fit-to-page', () => {
    const describe = exportEngine.describePdfPlacement as (project: FloorplanProject, sheet: 'arch-d', options?: { pdfScale?: 'fit' | 20 | 50 | 100 }) => { pointsPerMm: number; placementLabel: string };
    const placement = describe(simpleWallProject(), 'arch-d', { pdfScale: 50 });
    expect(placement.placementLabel).toBe('Physical scale 1:50');
    expect(placement.pointsPerMm).toBeCloseTo(72 / 25.4 / 50, 10);
  });
});

// Clearance model (F10/F11): footprints collide with footprints and walls; an access zone
// sits in front of an item and is only blocked by other footprints or walls.
const wallProject = (walls: readonly (readonly [string, number, number, number, number])[]): FloorplanProject => {
  const vertices = walls.flatMap(([id, x1, y1, x2, y2]) => [
    { id: `${id}-a`, position: { x: x1, y: y1 }, connectedWallIds: [id] },
    { id: `${id}-b`, position: { x: x2, y: y2 }, connectedWallIds: [id] },
  ]);
  return {
    ...baseProject('Clearance'),
    vertices,
    walls: walls.map(([id]) => ({ id, startVertexId: `${id}-a`, endVertexId: `${id}-b`, thickness: 150, height: 2700, state: 'existing' as const, material: 'drywall_stud' as const, isLoadBearing: false, openings: [] })),
  };
};
const place = (id: string, symbolKey: string, x: number, y: number, rotation = 0) => {
  const symbol = getSymbolDefinition(symbolKey)!;
  return { id, category: symbol.category, symbolKey, position: { x, y }, rotation, scale: { x: 1, y: 1 }, layerId: symbol.category === 'mep' ? 'mep' : 'furniture', clearance: symbol.clearance };
};
const rulesFor = (project: FloorplanProject) => analyzeFloorplan(project).clearanceViolations.map((violation) => `${violation.componentId}:${violation.rule}:${violation.otherComponentId ?? 'wall'}`);

describe('PlanCraft clearance model', () => {
  it('accepts a sofa pushed against a wall and a nightstand beside the bed', () => {
    const project: FloorplanProject = {
      ...wallProject([['north', 0, 0, 6000, 0]]),
      components: [
        place('sofa', 'sofa-3-seat', 2000, 75 + 450),
        place('bed', 'queen-bed', 4500, 75 + 1015),
        place('stand', 'nightstand', 4500 + 762.5 + 275, 75 + 225),
      ],
    };
    expect(rulesFor(project)).toEqual([]);
  });

  it('reports two items occupying the same floor', () => {
    const project: FloorplanProject = { ...baseProject('Overlap'), components: [place('a', 'sofa-3-seat', 0, 0), place('b', 'armchair', 900, 200)] };
    expect(rulesFor(project)).toEqual(['a:collision:b']);
  });

  it('reports an item that runs into a wall', () => {
    const project: FloorplanProject = { ...wallProject([['north', 0, 0, 6000, 0]]), components: [place('sofa', 'sofa-3-seat', 2000, 300)] };
    expect(rulesFor(project)).toEqual(['sofa:wall_collision:wall']);
  });

  it('reports furniture placed in the space in front of another item', () => {
    const project: FloorplanProject = { ...baseProject('Access'), components: [place('sofa', 'sofa-3-seat', 0, 0), place('table', 'coffee-table', 0, 450 + 200 + 300)] };
    expect(rulesFor(project)).toEqual(['sofa:access_blocked:table']);
  });

  it('lets chairs sit in a dining table clearance', () => {
    const project: FloorplanProject = { ...baseProject('Dining'), components: [place('table', 'dining-6', 0, 0), place('chair', 'dining-chair', 0, 450 + 250)] };
    expect(rulesFor(project)).toEqual([]);
  });

  it('checks a toilet against the ADA 60" × 56" water-closet clearance (604.3.1)', () => {
    // Rear wall face at y = 75, side wall face at x = -455 from the toilet centerline (604.2 allows 16"–18").
    const walls = wallProject([['rear', -3000, 0, 3000, 0], ['side', -530, 0, -530, 3000]]);
    const toilet = place('wc', 'toilet', 0, 75 + 350);
    expect(rulesFor({ ...walls, components: [toilet] })).toEqual([]);
    // A vanity 900 mm to the side is outside a 30" × 48" space but inside the 60"-wide clearance.
    expect(rulesFor({ ...walls, components: [toilet, place('vanity', 'base-cabinet', 900, 75 + 300)] })).toContain('wc:ada_fixture_clearance:vanity');
  });

  it('applies the current library clearance to toilets saved with the old 30" × 48" envelope', () => {
    const stale = { ...place('wc', 'toilet', 0, 425), clearance: { shape: 'rectangle' as const, dimensions: { x: 760, y: 1220 }, bufferOffset: 0, adaRuleKey: 'ada_fixture_clearance' as const } };
    const project: FloorplanProject = { ...baseProject('Stale'), components: [stale, place('vanity', 'base-cabinet', 900, 375)] };
    expect(rulesFor(project)).toContain('wc:ada_fixture_clearance:vanity');
  });

  it('flags an obstructed ADA turning space', () => {
    const project: FloorplanProject = { ...baseProject('Turning'), components: [place('turn', 'ada-turning-circle', 0, 0), place('chair', 'armchair', 600, 0)] };
    expect(rulesFor(project)).toEqual(['turn:ada_turning_circle:chair']);
  });

  it('never reports wall-mounted MEP devices as collisions', () => {
    const project: FloorplanProject = { ...wallProject([['north', 0, 0, 6000, 0]]), components: [place('outlet', 'duplex-120v', 2000, 0), place('sofa', 'sofa-3-seat', 2000, 75 + 450)] };
    expect(rulesFor(project)).toEqual([]);
  });
});
