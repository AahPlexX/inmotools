import { PDFDocument, rgb } from 'pdf-lib';
import type { FloorplanProject, Point2D, WallSegment } from './floorplan-types';

export type DxfVersion = 'r12' | 'r2000';
export type PdfSheet = 'arch-d' | 'arch-c' | 'letter' | 'a4';

const vertexMap = (project: FloorplanProject) => new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));

const projectBounds = (project: FloorplanProject) => {
  const points: Point2D[] = [
    ...project.vertices.map((vertex) => vertex.position),
    ...project.components.map((component) => component.position),
    ...project.dimensions.flatMap((dimension) => [dimension.start, dimension.end]),
  ];
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 10_000, maxY: 7_000, width: 10_000, height: 7_000 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

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

const openingSvg = (project: FloorplanProject, wall: WallSegment) => {
  const vertices = vertexMap(project);
  const start = vertices.get(wall.startVertexId);
  const end = vertices.get(wall.endVertexId);
  if (!start || !end) return '';
  return wall.openings.map((opening) => {
    const x = start.x + (end.x - start.x) * opening.offsetRatio;
    const y = start.y + (end.y - start.y) * opening.offsetRatio;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const half = opening.width / 2;
    const a = { x: x - ux * half, y: y - uy * half };
    const b = { x: x + ux * half, y: y + uy * half };
    return `<line data-opening-id="${xml(opening.id)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffffff" stroke-width="${wall.thickness + 8}"/>`;
  }).join('');
};

export const exportSvg = (project: FloorplanProject) => {
  const bounds = projectBounds(project);
  const padding = Math.max(500, Math.max(bounds.width, bounds.height) * 0.05);
  const viewBox = [bounds.minX - padding, bounds.minY - padding, bounds.width + padding * 2, bounds.height + padding * 2].join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${xml(project.name)} floor plan">
  <g id="layer-walls">${project.walls.map((wall) => wallSvg(project, wall)).join('')}</g>
  <g id="layer-doors">${project.walls.map((wall) => openingSvg(project, wall)).join('')}</g>
  <g id="layer-windows"></g>
  <g id="layer-furniture"></g>
  <g id="layer-mep"></g>
  <g id="layer-clearance"></g>
  <g id="layer-dimensions"></g>
</svg>`;
};

const dxfPair = (code: number | string, value: number | string) => `${code}\n${value}\n`;
const dxfLine = (layer: string, start: Point2D, end: Point2D) => [
  dxfPair(0, 'LINE'), dxfPair(8, layer), dxfPair(10, start.x), dxfPair(20, start.y), dxfPair(30, 0),
  dxfPair(11, end.x), dxfPair(21, end.y), dxfPair(31, 0),
].join('');
const dxfPolyline2000 = (layer: string, start: Point2D, end: Point2D) => [
  dxfPair(0, 'LWPOLYLINE'), dxfPair(8, layer), dxfPair(90, 2), dxfPair(70, 0),
  dxfPair(10, start.x), dxfPair(20, start.y), dxfPair(10, end.x), dxfPair(20, end.y),
].join('');

export const exportDxf = (project: FloorplanProject, version: DxfVersion) => {
  const vertices = vertexMap(project);
  const entities = project.walls.map((wall) => {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) return '';
    return version === 'r12' ? dxfLine('WALLS', start, end) : dxfPolyline2000('WALLS', start, end);
  }).join('');
  const acadVersion = version === 'r12' ? 'AC1009' : 'AC1015';
  return [
    dxfPair(0, 'SECTION'), dxfPair(2, 'HEADER'), dxfPair(9, '$ACADVER'), dxfPair(1, acadVersion), dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'), dxfPair(2, 'ENTITIES'), entities, dxfPair(0, 'ENDSEC'), dxfPair(0, 'EOF'),
  ].join('');
};

export const serializeProject = (project: FloorplanProject) => JSON.stringify(project, null, 2);

const PDF_SHEETS: Record<PdfSheet, readonly [number, number]> = {
  'arch-d': [36 * 72, 24 * 72],
  'arch-c': [24 * 72, 18 * 72],
  letter: [11 * 72, 8.5 * 72],
  a4: [841.89, 595.28],
};

export const exportPdf = async (project: FloorplanProject, sheet: PdfSheet = 'arch-d') => {
  const document = await PDFDocument.create();
  const page = document.addPage([...PDF_SHEETS[sheet]]);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const bounds = projectBounds(project);
  const margin = 54;
  const titleHeight = 72;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - titleHeight;
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
  const vertices = vertexMap(project);
  const toPage = (point: Point2D) => ({
    x: margin + (point.x - bounds.minX) * scale,
    y: margin + titleHeight + availableHeight - (point.y - bounds.minY) * scale,
  });

  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) continue;
    const a = toPage(start);
    const b = toPage(end);
    page.drawLine({ start: a, end: b, thickness: Math.max(1, wall.thickness * scale), color: rgb(0.2, 0.25, 0.32) });
  }

  page.drawText(project.name, { x: margin, y: 36, size: 14, color: rgb(0.08, 0.12, 0.18) });
  page.drawText(`Scale ${project.scaleNotation}`, { x: margin, y: 18, size: 9, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(new Date().toLocaleDateString('en-US'), { x: pageWidth - margin - 90, y: 18, size: 9, color: rgb(0.3, 0.35, 0.4) });
  page.drawLine({ start: { x: pageWidth - margin - 20, y: 42 }, end: { x: pageWidth - margin - 20, y: 64 }, thickness: 1.5, color: rgb(0.1, 0.15, 0.2) });
  page.drawText('N', { x: pageWidth - margin - 24, y: 67, size: 8 });
  const barMm = Math.min(5000, Math.max(1000, Math.round(bounds.width / 4 / 1000) * 1000));
  page.drawLine({ start: { x: margin, y: 57 }, end: { x: margin + barMm * scale, y: 57 }, thickness: 2, color: rgb(0.1, 0.15, 0.2) });
  page.drawText(`${barMm / 1000} m`, { x: margin, y: 61, size: 8 });
  return document.save();
};
