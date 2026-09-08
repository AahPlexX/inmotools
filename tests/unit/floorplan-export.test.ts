import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { describePdfPlacement, exportDxf, exportPdf, exportSvg, serializeProject } from '../../src/tools/floorplan/export-engine';
import { createInitialProject } from '../../src/tools/floorplan/state-engine';
import type { FloorplanProject } from '../../src/tools/floorplan/floorplan-types';

const projectFixture = (): FloorplanProject => ({
  ...createInitialProject('Export Test').present,
  scaleNotation: '1:50',
  vertices: [
    { id: 'v1', position: { x: 0, y: 0 }, connectedWallIds: ['w1'] },
    { id: 'v2', position: { x: 4200, y: 0 }, connectedWallIds: ['w1'] },
  ],
  walls: [{
    id: 'w1', startVertexId: 'v1', endVertexId: 'v2', thickness: 150, height: 2700,
    state: 'existing', material: 'drywall_stud', isLoadBearing: false,
    openings: [
      { id: 'd1', type: 'door_single', offsetRatio: 0.3, width: 915, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false },
      { id: 'win1', type: 'window_casement', offsetRatio: 0.72, width: 1200, nominalHeight: 1200, sillHeight: 900, flipSide: false, flipHand: false },
    ],
  }],
  components: [
    { id: 'sofa1', category: 'living', symbolKey: 'sofa-3-seat', position: { x: 1300, y: 1400 }, rotation: 90, scale: { x: 1, y: 1 }, layerId: 'furniture', clearance: { shape: 'rectangle', dimensions: { x: 2200, y: 900 }, bufferOffset: 450 } },
    { id: 'outlet1', category: 'mep', symbolKey: 'duplex-120v', position: { x: 3200, y: 1100 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 'mep', clearance: { shape: 'rectangle', dimensions: { x: 120, y: 60 }, bufferOffset: 0 } },
    { id: 'ada1', category: 'office', symbolKey: 'ada-turning-circle', position: { x: 3000, y: 2500 }, rotation: 0, scale: { x: 1, y: 1 }, layerId: 'clearance', clearance: { shape: 'circle', dimensions: { x: 1525, y: 1525 }, bufferOffset: 0, adaRuleKey: 'ada_turning_circle' } },
  ],
  dimensions: [{ id: 'dim1', start: { x: 0, y: -500 }, end: { x: 4200, y: -500 }, label: '4200 mm', layerId: 'dimensions' }],
});

describe('PlanCraft exports', () => {
  it('creates a layered SVG containing every populated plan layer', () => {
    const svg = exportSvg(projectFixture());
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="');
    expect(svg).toContain('id="layer-walls"');
    expect(svg).toContain('data-wall-id="w1"');
    expect(svg).toContain('id="layer-doors"');
    expect(svg).toContain('data-opening-id="d1"');
    expect(svg).toContain('id="layer-windows"');
    expect(svg).toContain('data-opening-id="win1"');
    expect(svg).toContain('id="layer-furniture"');
    expect(svg).toContain('data-component-id="sofa1"');
    expect(svg).toContain('id="layer-mep"');
    expect(svg).toContain('data-component-id="outlet1"');
    expect(svg).toContain('id="layer-clearance"');
    expect(svg).toContain('data-clearance-id="ada1"');
    expect(svg).toContain('id="layer-dimensions"');
    expect(svg).toContain('data-dimension-id="dim1"');
  });

  it('expands export bounds far enough to contain a wide door swing', () => {
    const project: FloorplanProject = {
      ...createInitialProject('Door Bounds').present,
      vertices: [
        { id: 'a', position: { x: 0, y: 0 }, connectedWallIds: ['wall'] },
        { id: 'b', position: { x: 4000, y: 0 }, connectedWallIds: ['wall'] },
      ],
      walls: [{
        id: 'wall', startVertexId: 'a', endVertexId: 'b', thickness: 150, height: 2700,
        state: 'existing', material: 'drywall_stud', isLoadBearing: false,
        openings: [{ id: 'door', type: 'door_single', offsetRatio: 0.5, width: 2000, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false }],
      }],
    };
    const svg = exportSvg(project);
    const match = /viewBox="([^"]+)"/.exec(svg);
    expect(match).not.toBeNull();
    const [, minY, , height] = match![1]!.split(/\s+/).map(Number);
    expect(minY + height).toBeGreaterThan(2000);
  });

  it('keeps R12 and R2000 DXF vocabularies version-correct while exporting all populated layers', () => {
    const r12 = exportDxf(projectFixture(), 'r12');
    expect(r12).toContain('AC1009');
    expect(r12).toContain('LINE');
    expect(r12).not.toContain('LWPOLYLINE');
    expect(r12).not.toContain('MTEXT');
    for (const layer of ['WALLS', 'DOORS', 'WINDOWS', 'FURNITURE', 'MEP', 'CLEARANCE', 'DIMENSIONS']) expect(r12).toContain(`8\n${layer}\n`);

    const r2000 = exportDxf(projectFixture(), 'r2000');
    expect(r2000).toContain('AC1015');
    expect(r2000).toContain('LWPOLYLINE');
    for (const layer of ['WALLS', 'DOORS', 'WINDOWS', 'FURNITURE', 'MEP', 'CLEARANCE', 'DIMENSIONS']) expect(r2000).toContain(`8\n${layer}\n`);
  });

  it('labels fitted PDF placement honestly and preserves nominal scale only as metadata', () => {
    const placement = describePdfPlacement(projectFixture(), 'arch-d');
    expect(placement.placementLabel).toBe('Fit to page — not printed at physical scale');
    expect(placement.projectScaleMetadata).toBe('1:50');
    expect(placement.pointsPerMm).toBeGreaterThan(0);
  });

  it('creates a readable one-page PDF without dropping the project', async () => {
    const bytes = await exportPdf(projectFixture(), 'arch-d');
    expect(bytes.byteLength).toBeGreaterThan(500);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('serializes a human-readable lossless project payload', () => {
    const json = serializeProject(projectFixture());
    const parsed = JSON.parse(json) as FloorplanProject;
    expect(parsed.name).toBe('Export Test');
    expect(parsed.walls[0]?.openings[0]?.id).toBe('d1');
    expect(parsed.components.map((item) => item.id)).toEqual(['sofa1', 'outlet1', 'ada1']);
    expect(json).toContain('\n  "walls"');
  });
});
