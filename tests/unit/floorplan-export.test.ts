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

  it('writes the complete section, table, and handle structure a DXF R2000 reader requires', () => {
    const dxf = exportDxf(projectFixture(), 'r2000');
    for (const section of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) expect(dxf).toContain(`0\nSECTION\n2\n${section}\n`);
    for (const table of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']) expect(dxf).toContain(`0\nTABLE\n2\n${table}\n`);
    expect(dxf).toContain('9\n$INSUNITS\n70\n4\n');
    expect(dxf).toContain('2\n*Model_Space\n');
    expect(dxf).toContain('2\n*Paper_Space\n');
    expect(dxf).toContain('3\nACAD_GROUP\n');
    expect(dxf).toContain('100\nAcDbPolyline\n');
    // Handles live after the HEADER; the header's own $HANDSEED value is not a handle.
    const lines = dxf.slice(dxf.indexOf('0\nSECTION\n2\nCLASSES\n')).split('\n');
    const handles: number[] = [];
    for (let index = 0; index < lines.length - 1; index += 2) if (lines[index] === '5' || lines[index] === '105') handles.push(Number.parseInt(lines[index + 1]!, 16));
    expect(new Set(handles).size).toBe(handles.length);
    const seed = Number.parseInt(/\$HANDSEED\n5\n([0-9A-F]+)\n/.exec(dxf)![1]!, 16);
    expect(Math.max(...handles)).toBeLessThan(seed);
  });

  it('flips Y so a CAD program shows the plan the same way up as the canvas', () => {
    const project: FloorplanProject = {
      ...projectFixture(),
      vertices: [
        { id: 'v1', position: { x: 0, y: 0 }, connectedWallIds: ['w1'] },
        { id: 'v2', position: { x: 0, y: 3000 }, connectedWallIds: ['w1'] },
      ],
      walls: [{ ...projectFixture().walls[0]!, openings: [] }],
      components: [],
      dimensions: [],
    };
    const r12 = exportDxf(project, 'r12');
    expect(r12).toContain('10\n0\n20\n0\n30\n0\n11\n0\n21\n-3000\n');
  });

  it('draws door swing arcs in every export format', async () => {
    expect(exportSvg(projectFixture())).toMatch(/<path data-door-swing="d1" d="M [^"]+ A 915 915 0 0 [01] /);
    expect(exportDxf(projectFixture(), 'r12')).toContain('0\nARC\n8\nDOORS\n');
    expect(exportDxf(projectFixture(), 'r2000')).toContain('100\nAcDbArc\n');
    const bytes = await exportPdf(projectFixture(), 'arch-d');
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('labels rooms and furniture, and writes dimensions in the chosen display units', () => {
    const project: FloorplanProject = {
      ...projectFixture(),
      units: 'imperial',
      rooms: [{ id: 'room-1', boundaryVertexIds: ['v1', 'v2'], name: 'Kitchen', areaSqMeters: 12.3456, areaSqFeet: 132.9, perimeterMeters: 14, centroid: { x: 2000, y: 1500 }, finishMaterial: 'none' }],
      dimensions: [{ id: 'dim1', start: { x: 0, y: -500 }, end: { x: 4200, y: -500 }, layerId: 'dimensions' }],
    };
    const svg = exportSvg(project);
    expect(svg).toContain('Kitchen · 133 ft²');
    expect(svg).toContain('>3-Seat Sofa<');
    expect(svg).toContain(`>13'-9 3/8&quot;<`);
    const dxf = exportDxf(project, 'r2000');
    expect(dxf).toContain('1\nKitchen - 133 sq ft\n');
    expect(dxf).toContain(`1\n13'-9 3/8"\n`);
    // DXF before R2007 is not UTF-8; other characters travel as \U+XXXX escapes.
    const accented = exportDxf({ ...project, rooms: [{ ...project.rooms[0]!, name: 'Küche' }] }, 'r2000');
    expect(accented).toContain('1\nK\\U+00FCche - 133 sq ft\n');
  });

  it('gives the SVG a white sheet so opening cut-outs never show on dark viewers', () => {
    expect(exportSvg(projectFixture())).toMatch(/<rect data-sheet="background" [^>]*fill="#ffffff"/);
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
