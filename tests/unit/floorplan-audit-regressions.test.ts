import { describe, expect, it } from 'vitest';
import { analyzeFloorplan } from '../../src/tools/floorplan/floorplan-analysis';
import * as exportEngine from '../../src/tools/floorplan/export-engine';
import { createInitialProject } from '../../src/tools/floorplan/state-engine';
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
    expect(analysis.clearanceViolations.some((violation) => violation.componentId === 'wide' && violation.rule === 'wall_clearance')).toBe(true);
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
