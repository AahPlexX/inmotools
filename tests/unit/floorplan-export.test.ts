import { describe, expect, it } from 'vitest';
import { exportDxf, exportSvg, serializeProject } from '../../src/tools/floorplan/export-engine';
import { createInitialProject } from '../../src/tools/floorplan/state-engine';
import type { FloorplanProject } from '../../src/tools/floorplan/floorplan-types';

const projectFixture = (): FloorplanProject => ({
  ...createInitialProject('Export Test').present,
  vertices: [
    { id: 'v1', position: { x: 0, y: 0 }, connectedWallIds: ['w1'] },
    { id: 'v2', position: { x: 4200, y: 0 }, connectedWallIds: ['w1'] },
  ],
  walls: [{
    id: 'w1', startVertexId: 'v1', endVertexId: 'v2', thickness: 150, height: 2700,
    state: 'existing', material: 'drywall_stud', isLoadBearing: false,
    openings: [{ id: 'd1', type: 'door_single', offsetRatio: 0.5, width: 915, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false }],
  }],
});

describe('PlanCraft exports', () => {
  it('creates a layered millimeter SVG', () => {
    const svg = exportSvg(projectFixture());
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="');
    expect(svg).toContain('id="layer-walls"');
    expect(svg).toContain('id="layer-doors"');
    expect(svg).toContain('4200');
  });

  it('keeps R12 and R2000 DXF entity vocabularies version-correct', () => {
    const r12 = exportDxf(projectFixture(), 'r12');
    expect(r12).toContain('AC1009');
    expect(r12).toContain('LINE');
    expect(r12).not.toContain('LWPOLYLINE');
    expect(r12).not.toContain('MTEXT');

    const r2000 = exportDxf(projectFixture(), 'r2000');
    expect(r2000).toContain('AC1015');
    expect(r2000).toContain('LWPOLYLINE');
  });

  it('serializes a human-readable lossless project payload', () => {
    const json = serializeProject(projectFixture());
    const parsed = JSON.parse(json) as FloorplanProject;
    expect(parsed.name).toBe('Export Test');
    expect(parsed.walls[0]?.openings[0]?.id).toBe('d1');
    expect(json).toContain('\n  "walls"');
  });
});
