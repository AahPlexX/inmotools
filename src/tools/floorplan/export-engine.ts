import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSymbolDefinition } from './symbol-library';
import type { FloorplanDimension, FloorplanProject, HostedOpening, PlanComponent, Point2D, WallSegment } from './floorplan-types';

export type DxfVersion = 'r12' | 'r2000';
export type PdfSheet = 'arch-d' | 'arch-c' | 'letter' | 'a4';
export type ExportLayerId = 'walls' | 'doors' | 'windows' | 'furniture' | 'mep' | 'clearance' | 'dimensions';
export type PdfScale = 'fit' | 20 | 48 | 50 | 100;
export interface ExportOptions { readonly layers?: readonly ExportLayerId[]; }
export interface PdfExportOptions extends ExportOptions { readonly pdfScale?: PdfScale; }

export const ALL_EXPORT_LAYERS: readonly ExportLayerId[] = ['walls', 'doors', 'windows', 'furniture', 'mep', 'clearance', 'dimensions'];

const vertexMap = (project: FloorplanProject) => new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
const rotatePoint = (point: Point2D, center: Point2D, degrees: number): Point2D => {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

const componentDimensions = (component: PlanComponent) => {
  const symbol = getSymbolDefinition(component.symbolKey);
  return {
    width: Math.max(1, (symbol?.width ?? component.clearance.dimensions.x) * component.scale.x),
    depth: Math.max(1, (symbol?.depth ?? component.clearance.dimensions.y) * component.scale.y),
    circular: symbol?.glyph === 'circle' || symbol?.glyph === 'chair',
  };
};

const rectangleCorners = (center: Point2D, width: number, depth: number, rotation = 0): Point2D[] => [
  { x: center.x - width / 2, y: center.y - depth / 2 },
  { x: center.x + width / 2, y: center.y - depth / 2 },
  { x: center.x + width / 2, y: center.y + depth / 2 },
  { x: center.x - width / 2, y: center.y + depth / 2 },
].map((point) => rotatePoint(point, center, rotation));

const clearanceSize = (component: PlanComponent) => ({
  width: Math.max(1, component.clearance.dimensions.x + component.clearance.bufferOffset * 2),
  depth: Math.max(1, component.clearance.dimensions.y + component.clearance.bufferOffset * 2),
});

interface OpeningGeometry {
  readonly jambA: Point2D;
  readonly jambB: Point2D;
  readonly hinge: Point2D;
  readonly leafEnd: Point2D;
}

const openingGeometry = (start: Point2D, end: Point2D, opening: HostedOpening): OpeningGeometry => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const center = { x: start.x + dx * opening.offsetRatio, y: start.y + dy * opening.offsetRatio };
  const half = opening.width / 2;
  const jambA = { x: center.x - ux * half, y: center.y - uy * half };
  const jambB = { x: center.x + ux * half, y: center.y + uy * half };
  const hinge = opening.flipHand ? jambB : jambA;
  const baseAngle = Math.atan2(uy, ux) + (opening.flipHand ? Math.PI : 0);
  const leafAngle = baseAngle + (opening.flipSide ? -1 : 1) * Math.PI / 2;
  return {
    jambA,
    jambB,
    hinge,
    leafEnd: { x: hinge.x + Math.cos(leafAngle) * opening.width, y: hinge.y + Math.sin(leafAngle) * opening.width },
  };
};

export const wallVisibleSegments = (start: Point2D, end: Point2D, openings: readonly HostedOpening[]): readonly [Point2D, Point2D][] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return [];
  const clampDistance = (value: number) => Math.max(0, Math.min(length, value));
  const intervals = openings.map((opening) => {
    const center = clampDistance(opening.offsetRatio * length);
    const halfWidth = Math.max(0, opening.width) / 2;
    return [clampDistance(center - halfWidth), clampDistance(center + halfWidth)] as const;
  }).filter(([from, to]) => to - from > 1e-9).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [from, to] of intervals) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1e-9) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }

  const pointAt = (distance: number): Point2D => ({ x: start.x + dx * distance / length, y: start.y + dy * distance / length });
  const segments: Array<[Point2D, Point2D]> = [];
  let cursor = 0;
  for (const [from, to] of merged) {
    if (from > cursor + 1e-9) segments.push([pointAt(cursor), pointAt(from)]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < length - 1e-9) segments.push([pointAt(cursor), end]);
  return segments;
};

const dimensionLabel = (dimension: FloorplanDimension) => dimension.label ?? `${Math.round(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y))} mm`;
const DIMENSION_SVG_FONT_SIZE = 120;
const estimatedDimensionTextWidth = (value: string) => Math.max(DIMENSION_SVG_FONT_SIZE * 0.6, [...value].length * DIMENSION_SVG_FONT_SIZE * 0.62);

const dimensionLabelExtentPoints = (dimension: FloorplanDimension): Point2D[] => {
  const midX = (dimension.start.x + dimension.end.x) / 2;
  const midY = (dimension.start.y + dimension.end.y) / 2 - 25;
  const width = estimatedDimensionTextWidth(dimensionLabel(dimension));
  const aboveBaseline = DIMENSION_SVG_FONT_SIZE;
  const belowBaseline = DIMENSION_SVG_FONT_SIZE * 0.25;
  return [
    { x: midX - width / 2, y: midY - aboveBaseline },
    { x: midX + width / 2, y: midY - aboveBaseline },
    { x: midX + width / 2, y: midY + belowBaseline },
    { x: midX - width / 2, y: midY + belowBaseline },
  ];
};

const projectBounds = (project: FloorplanProject) => {
  const points: Point2D[] = [
    ...project.vertices.map((vertex) => vertex.position),
    ...project.dimensions.flatMap((dimension) => [dimension.start, dimension.end, ...dimensionLabelExtentPoints(dimension)]),
  ];
  const vertices = vertexMap(project);
  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) continue;
    const halfThickness = Math.max(1, wall.thickness / 2);
    points.push(
      { x: start.x - halfThickness, y: start.y - halfThickness },
      { x: start.x + halfThickness, y: start.y + halfThickness },
      { x: end.x - halfThickness, y: end.y - halfThickness },
      { x: end.x + halfThickness, y: end.y + halfThickness },
    );
    for (const opening of wall.openings) {
      const geometry = openingGeometry(start, end, opening);
      points.push(geometry.jambA, geometry.jambB);
      if (opening.type.startsWith('door')) points.push(geometry.hinge, geometry.leafEnd);
    }
  }
  for (const component of project.components) {
    const dimensions = componentDimensions(component);
    points.push(...rectangleCorners(component.position, dimensions.width, dimensions.depth, component.rotation));
    const clearance = clearanceSize(component);
    points.push(...rectangleCorners(component.position, clearance.width, clearance.depth, component.rotation));
  }
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 10_000, maxY: 7_000, width: 10_000, height: 7_000 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const isExportLayerId = (value: string): value is ExportLayerId => (ALL_EXPORT_LAYERS as readonly string[]).includes(value);
const projectVisibleLayers = (project: FloorplanProject): ExportLayerId[] => project.layers
  .filter((layer) => layer.visible && isExportLayerId(layer.id))
  .map((layer) => layer.id);
const layerSet = (project: FloorplanProject, options: ExportOptions = {}) => new Set<ExportLayerId>(options.layers ?? projectVisibleLayers(project));
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const wallSvg = (project: FloorplanProject, wall: WallSegment) => {
  const vertices = vertexMap(project);
  const start = vertices.get(wall.startVertexId);
  const end = vertices.get(wall.endVertexId);
  if (!start || !end) return '';
  const stroke = wall.state === 'demolition' ? '#f43f5e' : wall.state === 'new_construction' ? '#38bdf8' : '#334155';
  const dash = wall.state === 'demolition' ? ' stroke-dasharray="300 180"' : '';
  return `<line data-wall-id="${xml(wall.id)}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${stroke}" stroke-width="${wall.thickness}"${dash}/>`;
};

const openingSvg = (project: FloorplanProject, wall: WallSegment, opening: HostedOpening) => {
  const vertices = vertexMap(project);
  const start = vertices.get(wall.startVertexId);
  const end = vertices.get(wall.endVertexId);
  if (!start || !end) return '';
  const geometry = openingGeometry(start, end, opening);
  const erase = `<line x1="${geometry.jambA.x}" y1="${geometry.jambA.y}" x2="${geometry.jambB.x}" y2="${geometry.jambB.y}" stroke="#ffffff" stroke-width="${wall.thickness + 8}"/>`;
  if (opening.type.startsWith('door')) {
    return `<g data-opening-id="${xml(opening.id)}">${erase}<line x1="${geometry.hinge.x}" y1="${geometry.hinge.y}" x2="${geometry.leafEnd.x}" y2="${geometry.leafEnd.y}" stroke="#0f172a" stroke-width="18"/></g>`;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * 20;
  const ny = dx / length * 20;
  return `<g data-opening-id="${xml(opening.id)}">${erase}<line x1="${geometry.jambA.x + nx}" y1="${geometry.jambA.y + ny}" x2="${geometry.jambB.x + nx}" y2="${geometry.jambB.y + ny}" stroke="#0f172a" stroke-width="10"/><line x1="${geometry.jambA.x - nx}" y1="${geometry.jambA.y - ny}" x2="${geometry.jambB.x - nx}" y2="${geometry.jambB.y - ny}" stroke="#0f172a" stroke-width="10"/></g>`;
};

const componentSvg = (component: PlanComponent) => {
  const dimensions = componentDimensions(component);
  const { x, y } = component.position;
  if (dimensions.circular) return `<circle data-component-id="${xml(component.id)}" cx="${x}" cy="${y}" r="${Math.max(dimensions.width, dimensions.depth) / 2}" fill="#e2e8f0" stroke="#64748b" stroke-width="12"/>`;
  return `<rect data-component-id="${xml(component.id)}" x="${x - dimensions.width / 2}" y="${y - dimensions.depth / 2}" width="${dimensions.width}" height="${dimensions.depth}" transform="rotate(${component.rotation} ${x} ${y})" fill="#e2e8f0" stroke="#64748b" stroke-width="12"/>`;
};

const clearanceSvg = (component: PlanComponent) => {
  const size = clearanceSize(component);
  const { x, y } = component.position;
  if (component.clearance.shape === 'circle') return `<circle data-clearance-id="${xml(component.id)}" cx="${x}" cy="${y}" r="${Math.max(size.width, size.depth) / 2}" fill="none" stroke="#f43f5e" stroke-width="10" stroke-dasharray="80 50"/>`;
  return `<rect data-clearance-id="${xml(component.id)}" x="${x - size.width / 2}" y="${y - size.depth / 2}" width="${size.width}" height="${size.depth}" transform="rotate(${component.rotation} ${x} ${y})" fill="none" stroke="#f43f5e" stroke-width="10" stroke-dasharray="80 50"/>`;
};

export const exportSvg = (project: FloorplanProject, options: ExportOptions = {}) => {
  const selected = layerSet(project, options);
  const bounds = projectBounds(project);
  const padding = Math.max(500, Math.max(bounds.width, bounds.height) * 0.05);
  const viewBox = [bounds.minX - padding, bounds.minY - padding, bounds.width + padding * 2, bounds.height + padding * 2].join(' ');
  const walls = selected.has('walls') ? project.walls.map((wall) => wallSvg(project, wall)).join('') : '';
  const doors = selected.has('doors') ? project.walls.flatMap((wall) => wall.openings.filter((opening) => opening.type.startsWith('door')).map((opening) => openingSvg(project, wall, opening))).join('') : '';
  const windows = selected.has('windows') ? project.walls.flatMap((wall) => wall.openings.filter((opening) => !opening.type.startsWith('door')).map((opening) => openingSvg(project, wall, opening))).join('') : '';
  const furniture = selected.has('furniture') ? project.components.filter((component) => component.category !== 'mep' && component.layerId !== 'clearance').map(componentSvg).join('') : '';
  const mep = selected.has('mep') ? project.components.filter((component) => component.category === 'mep').map(componentSvg).join('') : '';
  const clearances = selected.has('clearance') ? project.components.map(clearanceSvg).join('') : '';
  const dimensions = selected.has('dimensions') ? project.dimensions.map((dimension) => {
    const midX = (dimension.start.x + dimension.end.x) / 2;
    const midY = (dimension.start.y + dimension.end.y) / 2;
    return `<g data-dimension-id="${xml(dimension.id)}"><line x1="${dimension.start.x}" y1="${dimension.start.y}" x2="${dimension.end.x}" y2="${dimension.end.y}" stroke="#64748b" stroke-width="8"/><text x="${midX}" y="${midY - 25}" text-anchor="middle" font-size="${DIMENSION_SVG_FONT_SIZE}" fill="#334155">${xml(dimensionLabel(dimension))}</text></g>`;
  }).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${xml(project.name)} floor plan">
  <g id="layer-walls">${walls}</g>
  <g id="layer-doors">${doors}</g>
  <g id="layer-windows">${windows}</g>
  <g id="layer-furniture">${furniture}</g>
  <g id="layer-mep">${mep}</g>
  <g id="layer-clearance">${clearances}</g>
  <g id="layer-dimensions">${dimensions}</g>
</svg>`;
};

const dxfPair = (code: number | string, value: number | string) => `${code}\n${value}\n`;
const dxfLine = (layer: string, start: Point2D, end: Point2D) => [dxfPair(0, 'LINE'), dxfPair(8, layer), dxfPair(10, start.x), dxfPair(20, start.y), dxfPair(30, 0), dxfPair(11, end.x), dxfPair(21, end.y), dxfPair(31, 0)].join('');
const dxfPolyline2000 = (layer: string, points: readonly Point2D[], closed = false) => [
  dxfPair(0, 'LWPOLYLINE'), dxfPair(8, layer), dxfPair(90, points.length), dxfPair(70, closed ? 1 : 0),
  ...points.flatMap((point) => [dxfPair(10, point.x), dxfPair(20, point.y)]),
].join('');
const dxfCircle = (layer: string, center: Point2D, radius: number) => [dxfPair(0, 'CIRCLE'), dxfPair(8, layer), dxfPair(10, center.x), dxfPair(20, center.y), dxfPair(30, 0), dxfPair(40, radius)].join('');
const dxfText = (layer: string, point: Point2D, value: string, height = 120) => [dxfPair(0, 'TEXT'), dxfPair(8, layer), dxfPair(10, point.x), dxfPair(20, point.y), dxfPair(30, 0), dxfPair(40, height), dxfPair(1, value.replace(/[\r\n]/g, ' '))].join('');
const dxfSegment = (version: DxfVersion, layer: string, start: Point2D, end: Point2D) => version === 'r12' ? dxfLine(layer, start, end) : dxfPolyline2000(layer, [start, end]);
const dxfPolygon = (version: DxfVersion, layer: string, points: readonly Point2D[]) => version === 'r12'
  ? points.map((point, index) => dxfLine(layer, point, points[(index + 1) % points.length]!)).join('')
  : dxfPolyline2000(layer, points, true);

export const exportDxf = (project: FloorplanProject, version: DxfVersion, options: ExportOptions = {}) => {
  const selected = layerSet(project, options);
  const vertices = vertexMap(project);
  const entities: string[] = [];
  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) continue;
    if (selected.has('walls')) for (const [segmentStart, segmentEnd] of wallVisibleSegments(start, end, wall.openings)) entities.push(dxfSegment(version, 'WALLS', segmentStart, segmentEnd));
    for (const opening of wall.openings) {
      const isDoor = opening.type.startsWith('door');
      const selectedOpeningLayer: ExportLayerId = isDoor ? 'doors' : 'windows';
      if (!selected.has(selectedOpeningLayer)) continue;
      const layer = isDoor ? 'DOORS' : 'WINDOWS';
      const geometry = openingGeometry(start, end, opening);
      entities.push(dxfSegment(version, layer, geometry.jambA, geometry.jambB));
      if (isDoor) entities.push(dxfSegment(version, layer, geometry.hinge, geometry.leafEnd));
    }
  }
  for (const component of project.components) {
    const componentLayer: ExportLayerId = component.category === 'mep' ? 'mep' : 'furniture';
    if (component.layerId !== 'clearance' && selected.has(componentLayer)) {
      const dimensions = componentDimensions(component);
      const layer = component.category === 'mep' ? 'MEP' : 'FURNITURE';
      if (dimensions.circular) entities.push(dxfCircle(layer, component.position, Math.max(dimensions.width, dimensions.depth) / 2));
      else entities.push(dxfPolygon(version, layer, rectangleCorners(component.position, dimensions.width, dimensions.depth, component.rotation)));
    }
    if (selected.has('clearance')) {
      const clearance = clearanceSize(component);
      if (component.clearance.shape === 'circle') entities.push(dxfCircle('CLEARANCE', component.position, Math.max(clearance.width, clearance.depth) / 2));
      else entities.push(dxfPolygon(version, 'CLEARANCE', rectangleCorners(component.position, clearance.width, clearance.depth, component.rotation)));
    }
  }
  if (selected.has('dimensions')) for (const dimension of project.dimensions) {
    entities.push(dxfSegment(version, 'DIMENSIONS', dimension.start, dimension.end));
    const midpoint = { x: (dimension.start.x + dimension.end.x) / 2, y: (dimension.start.y + dimension.end.y) / 2 };
    entities.push(dxfText('DIMENSIONS', midpoint, dimensionLabel(dimension)));
  }
  const acadVersion = version === 'r12' ? 'AC1009' : 'AC1015';
  return [dxfPair(0, 'SECTION'), dxfPair(2, 'HEADER'), dxfPair(9, '$ACADVER'), dxfPair(1, acadVersion), dxfPair(0, 'ENDSEC'), dxfPair(0, 'SECTION'), dxfPair(2, 'ENTITIES'), entities.join(''), dxfPair(0, 'ENDSEC'), dxfPair(0, 'EOF')].join('');
};

export const serializeProject = (project: FloorplanProject) => JSON.stringify(project, null, 2);

const PDF_SHEETS: Record<PdfSheet, readonly [number, number]> = {
  'arch-d': [36 * 72, 24 * 72],
  'arch-c': [24 * 72, 18 * 72],
  letter: [11 * 72, 8.5 * 72],
  a4: [841.89, 595.28],
};
const PDF_MARGIN = 54;
const PDF_TITLE_HEIGHT = 88;
const POINTS_PER_MM = 72 / 25.4;

export interface PdfPlacementDescription {
  readonly sheet: PdfSheet;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly pointsPerMm: number;
  readonly placementLabel: string;
  readonly projectScaleMetadata: string;
  readonly fitsSheet: boolean;
}

export const pdfScaleFromNotation = (notation: string): PdfScale => {
  const metric = /^\s*1\s*:\s*(20|50|100)\s*$/.exec(notation);
  if (metric) return Number(metric[1]) as 20 | 50 | 100;
  if (/^\s*1\/4["”]?\s*=\s*1['’]-?0["”]?\s*$/.test(notation)) return 48;
  return 'fit';
};

export const describePdfPlacement = (project: FloorplanProject, sheet: PdfSheet = 'arch-d', options: PdfExportOptions = {}): PdfPlacementDescription => {
  const [pageWidth, pageHeight] = PDF_SHEETS[sheet];
  const bounds = projectBounds(project);
  const availableWidth = pageWidth - PDF_MARGIN * 2;
  const availableHeight = pageHeight - PDF_MARGIN * 2 - PDF_TITLE_HEIGHT;
  const pdfScale = options.pdfScale ?? 'fit';
  const pointsPerMm = pdfScale === 'fit'
    ? Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
    : POINTS_PER_MM / pdfScale;
  return {
    sheet,
    pageWidth,
    pageHeight,
    pointsPerMm,
    placementLabel: pdfScale === 'fit' ? 'Fit to page — not printed at physical scale' : `Physical scale 1:${pdfScale}`,
    projectScaleMetadata: project.scaleNotation,
    fitsSheet: bounds.width * pointsPerMm <= availableWidth + 1e-6 && bounds.height * pointsPerMm <= availableHeight + 1e-6,
  };
};

const pdfSafeText = (value: string) => value.replace(/[^\x20-\x7E]/g, '?');

export const exportPdf = async (project: FloorplanProject, sheet: PdfSheet = 'arch-d', options: PdfExportOptions = {}) => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const effectiveOptions: PdfExportOptions = options.pdfScale === undefined
    ? { ...options, pdfScale: pdfScaleFromNotation(project.scaleNotation) }
    : options;
  const placement = describePdfPlacement(project, sheet, effectiveOptions);
  if (!placement.fitsSheet) throw new Error(`${placement.placementLabel} does not fit the selected ${sheet.toUpperCase()} sheet. Choose a smaller drawing scale or a larger sheet.`);
  const selected = layerSet(project, options);
  const page = document.addPage([placement.pageWidth, placement.pageHeight]);
  const bounds = projectBounds(project);
  const availableHeight = placement.pageHeight - PDF_MARGIN * 2 - PDF_TITLE_HEIGHT;
  const toPage = (point: Point2D) => ({
    x: PDF_MARGIN + (point.x - bounds.minX) * placement.pointsPerMm,
    y: PDF_MARGIN + PDF_TITLE_HEIGHT + availableHeight - (point.y - bounds.minY) * placement.pointsPerMm,
  });
  const vertices = vertexMap(project);

  if (selected.has('walls')) for (const room of project.rooms) {
    const points = room.boundaryVertexIds.map((id) => vertices.get(id)).filter((point): point is Point2D => Boolean(point));
    if (points.length >= 3) for (let index = 0; index < points.length; index += 1) page.drawLine({ start: toPage(points[index]!), end: toPage(points[(index + 1) % points.length]!), thickness: 0.5, color: rgb(0.7, 0.75, 0.8) });
    const center = toPage(room.centroid);
    page.drawText(pdfSafeText(room.name), { x: center.x, y: center.y, size: 8, font, color: rgb(0.35, 0.4, 0.45) });
  }

  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) continue;
    const a = toPage(start);
    const b = toPage(end);
    if (selected.has('walls')) page.drawLine({ start: a, end: b, thickness: Math.max(1, wall.thickness * placement.pointsPerMm), color: rgb(0.2, 0.25, 0.32) });
    for (const opening of wall.openings) {
      const isDoor = opening.type.startsWith('door');
      const selectedOpeningLayer: ExportLayerId = isDoor ? 'doors' : 'windows';
      if (!selected.has(selectedOpeningLayer)) continue;
      const geometry = openingGeometry(start, end, opening);
      const jambA = toPage(geometry.jambA);
      const jambB = toPage(geometry.jambB);
      if (selected.has('walls')) page.drawLine({ start: jambA, end: jambB, thickness: Math.max(2, (wall.thickness + 8) * placement.pointsPerMm), color: rgb(1, 1, 1) });
      if (isDoor) page.drawLine({ start: toPage(geometry.hinge), end: toPage(geometry.leafEnd), thickness: 1, color: rgb(0.1, 0.15, 0.2) });
      else {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length * 2;
        const ny = dx / length * 2;
        page.drawLine({ start: { x: jambA.x + nx, y: jambA.y + ny }, end: { x: jambB.x + nx, y: jambB.y + ny }, thickness: 1, color: rgb(0.1, 0.15, 0.2) });
        page.drawLine({ start: { x: jambA.x - nx, y: jambA.y - ny }, end: { x: jambB.x - nx, y: jambB.y - ny }, thickness: 1, color: rgb(0.1, 0.15, 0.2) });
      }
    }
  }

  for (const component of project.components) {
    const componentLayer: ExportLayerId = component.category === 'mep' ? 'mep' : 'furniture';
    if (component.layerId !== 'clearance' && selected.has(componentLayer)) {
      const dimensions = componentDimensions(component);
      const corners = rectangleCorners(component.position, dimensions.width, dimensions.depth, component.rotation).map(toPage);
      if (dimensions.circular) {
        const center = toPage(component.position);
        page.drawCircle({ x: center.x, y: center.y, size: Math.max(dimensions.width, dimensions.depth) / 2 * placement.pointsPerMm, borderWidth: 1, borderColor: rgb(0.35, 0.4, 0.45), color: rgb(0.88, 0.9, 0.92) });
      } else for (let index = 0; index < corners.length; index += 1) page.drawLine({ start: corners[index]!, end: corners[(index + 1) % corners.length]!, thickness: 1, color: component.category === 'mep' ? rgb(0.75, 0.5, 0.05) : rgb(0.35, 0.4, 0.45) });
    }
    if (selected.has('clearance')) {
      const clearance = clearanceSize(component);
      const center = toPage(component.position);
      if (component.clearance.shape === 'circle') page.drawCircle({ x: center.x, y: center.y, size: Math.max(clearance.width, clearance.depth) / 2 * placement.pointsPerMm, borderWidth: 0.7, borderColor: rgb(0.75, 0.2, 0.3), borderDashArray: [4, 3] });
      else {
        const corners = rectangleCorners(component.position, clearance.width, clearance.depth, component.rotation).map(toPage);
        for (let index = 0; index < corners.length; index += 1) page.drawLine({ start: corners[index]!, end: corners[(index + 1) % corners.length]!, thickness: 0.7, color: rgb(0.75, 0.2, 0.3), dashArray: [4, 3] });
      }
    }
  }

  if (selected.has('dimensions')) for (const dimension of project.dimensions) {
    const start = toPage(dimension.start);
    const end = toPage(dimension.end);
    page.drawLine({ start, end, thickness: 0.7, color: rgb(0.35, 0.4, 0.45) });
    const label = pdfSafeText(dimensionLabel(dimension));
    const textWidth = font.widthOfTextAtSize(label, 8);
    const desiredX = (start.x + end.x) / 2 - textWidth / 2;
    const desiredY = (start.y + end.y) / 2 + 4;
    page.drawText(label, {
      x: Math.max(PDF_MARGIN, Math.min(placement.pageWidth - PDF_MARGIN - textWidth, desiredX)),
      y: Math.max(PDF_MARGIN + PDF_TITLE_HEIGHT, Math.min(placement.pageHeight - PDF_MARGIN - 8, desiredY)),
      size: 8,
      font,
      color: rgb(0.25, 0.3, 0.35),
    });
  }

  page.drawText(pdfSafeText(project.name), { x: PDF_MARGIN, y: 48, size: 14, font, color: rgb(0.08, 0.12, 0.18) });
  page.drawText(placement.placementLabel, { x: PDF_MARGIN, y: 30, size: 9, font, color: rgb(0.25, 0.3, 0.35) });
  page.drawText(`Project scale metadata: ${pdfSafeText(placement.projectScaleMetadata)}`, { x: PDF_MARGIN, y: 16, size: 8, font, color: rgb(0.35, 0.4, 0.45) });
  page.drawText(new Date().toLocaleDateString('en-US'), { x: placement.pageWidth - PDF_MARGIN - 90, y: 16, size: 8, font, color: rgb(0.35, 0.4, 0.45) });
  page.drawLine({ start: { x: placement.pageWidth - PDF_MARGIN - 20, y: 44 }, end: { x: placement.pageWidth - PDF_MARGIN - 20, y: 66 }, thickness: 1.5, color: rgb(0.1, 0.15, 0.2) });
  page.drawText('N', { x: placement.pageWidth - PDF_MARGIN - 24, y: 69, size: 8, font, color: rgb(0.1, 0.15, 0.2) });
  return document.save();
};
