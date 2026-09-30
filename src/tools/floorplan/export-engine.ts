import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { accessZone, type PlanShape } from './floorplan-analysis';
import { getSymbolDefinition } from './symbol-library';
import { formatArea, formatLength, type DisplayUnits } from './units';
import type { FloorplanDimension, FloorplanProject, HostedOpening, PlanComponent, Point2D, RoomFace, WallSegment } from './floorplan-types';

export type DxfVersion = 'r12' | 'r2000';
export type PdfSheet = 'arch-d' | 'arch-c' | 'letter' | 'a4';
export type ExportLayerId = 'walls' | 'doors' | 'windows' | 'furniture' | 'mep' | 'clearance' | 'dimensions';
export type PdfScale = 'fit' | 20 | 48 | 50 | 100;
export interface ExportOptions { readonly layers?: readonly ExportLayerId[]; }
export interface PdfExportOptions extends ExportOptions { readonly pdfScale?: PdfScale; }

export const ALL_EXPORT_LAYERS: readonly ExportLayerId[] = ['walls', 'doors', 'windows', 'furniture', 'mep', 'clearance', 'dimensions'];

const unitsOf = (project: FloorplanProject): DisplayUnits => project.units ?? 'metric';
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

/** Short text drawn on a placed component: the MEP tag when the symbol has one, otherwise its name. */
export const componentLabel = (component: PlanComponent) => {
  const symbol = getSymbolDefinition(component.symbolKey);
  return symbol?.tag ?? symbol?.label ?? component.symbolKey;
};

export const roomLabel = (room: RoomFace, units: DisplayUnits) => `${room.name} · ${formatArea(room.areaSqMeters, units)}`;

const rectangleCorners = (center: Point2D, width: number, depth: number, rotation = 0): Point2D[] => [
  { x: center.x - width / 2, y: center.y - depth / 2 },
  { x: center.x + width / 2, y: center.y - depth / 2 },
  { x: center.x + width / 2, y: center.y + depth / 2 },
  { x: center.x - width / 2, y: center.y + depth / 2 },
].map((point) => rotatePoint(point, center, rotation));

/** Points that bound an access zone, for export bounds. */
const zonePoints = (zone: PlanShape): Point2D[] => (zone.kind === 'polygon'
  ? [...zone.points]
  : [{ x: zone.center.x - zone.radius, y: zone.center.y - zone.radius }, { x: zone.center.x + zone.radius, y: zone.center.y + zone.radius }]);

interface OpeningGeometry {
  readonly jambA: Point2D;
  readonly jambB: Point2D;
  readonly hinge: Point2D;
  /** Free end of the door leaf when fully open (perpendicular to the wall). */
  readonly leafEnd: Point2D;
  /** Where the leaf's free end rests when the door is closed (the jamb opposite the hinge). */
  readonly closedEnd: Point2D;
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
    closedEnd: opening.flipHand ? jambA : jambB,
  };
};

/** Points along the door swing, from the open leaf to the closed position, for outputs without a native arc. */
const swingPolyline = (geometry: OpeningGeometry, radius: number, steps = 12): Point2D[] => {
  const from = Math.atan2(geometry.leafEnd.y - geometry.hinge.y, geometry.leafEnd.x - geometry.hinge.x);
  const to = Math.atan2(geometry.closedEnd.y - geometry.hinge.y, geometry.closedEnd.x - geometry.hinge.x);
  let sweep = to - from;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + sweep * index / steps;
    return { x: geometry.hinge.x + Math.cos(angle) * radius, y: geometry.hinge.y + Math.sin(angle) * radius };
  });
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

const dimensionLength = (dimension: FloorplanDimension) => Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y);
const dimensionLabel = (dimension: FloorplanDimension, units: DisplayUnits) => dimension.label ?? formatLength(dimensionLength(dimension), units);
const DIMENSION_SVG_FONT_SIZE = 120;
const ROOM_SVG_FONT_SIZE = 150;
const COMPONENT_SVG_FONT_SIZE = 100;
const estimatedDimensionTextWidth = (value: string) => Math.max(DIMENSION_SVG_FONT_SIZE * 0.6, [...value].length * DIMENSION_SVG_FONT_SIZE * 0.62);

const dimensionLabelExtentPoints = (dimension: FloorplanDimension, units: DisplayUnits): Point2D[] => {
  const midX = (dimension.start.x + dimension.end.x) / 2;
  const midY = (dimension.start.y + dimension.end.y) / 2 - 25;
  const width = estimatedDimensionTextWidth(dimensionLabel(dimension, units));
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
  const units = unitsOf(project);
  const points: Point2D[] = [
    ...project.vertices.map((vertex) => vertex.position),
    ...project.dimensions.flatMap((dimension) => [dimension.start, dimension.end, ...dimensionLabelExtentPoints(dimension, units)]),
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
      if (opening.type.startsWith('door')) points.push(geometry.hinge, geometry.leafEnd, ...swingPolyline(geometry, opening.width, 4));
    }
  }
  for (const component of project.components) {
    const dimensions = componentDimensions(component);
    points.push(...rectangleCorners(component.position, dimensions.width, dimensions.depth, component.rotation));
    const zone = accessZone(component);
    if (zone) points.push(...zonePoints(zone));
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
  .filter((layer) => layer.visible)
  .map((layer) => layer.id)
  .filter(isExportLayerId);
const layerSet = (project: FloorplanProject, options: ExportOptions = {}) => new Set<ExportLayerId>(options.layers ?? projectVisibleLayers(project));
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
/** Trims float noise from coordinates written into text formats. */
const num = (value: number) => String(Number(value.toFixed(3)));

// --- SVG ------------------------------------------------------------------

const wallSvg = (project: FloorplanProject, wall: WallSegment) => {
  const vertices = vertexMap(project);
  const start = vertices.get(wall.startVertexId);
  const end = vertices.get(wall.endVertexId);
  if (!start || !end) return '';
  const stroke = wall.state === 'demolition' ? '#f43f5e' : wall.state === 'new_construction' ? '#38bdf8' : '#334155';
  const dash = wall.state === 'demolition' ? ' stroke-dasharray="300 180"' : '';
  return `<line data-wall-id="${xml(wall.id)}" x1="${num(start.x)}" y1="${num(start.y)}" x2="${num(end.x)}" y2="${num(end.y)}" stroke="${stroke}" stroke-width="${wall.thickness}"${dash}/>`;
};

const openingSvg = (project: FloorplanProject, wall: WallSegment, opening: HostedOpening) => {
  const vertices = vertexMap(project);
  const start = vertices.get(wall.startVertexId);
  const end = vertices.get(wall.endVertexId);
  if (!start || !end) return '';
  const geometry = openingGeometry(start, end, opening);
  const erase = `<line x1="${num(geometry.jambA.x)}" y1="${num(geometry.jambA.y)}" x2="${num(geometry.jambB.x)}" y2="${num(geometry.jambB.y)}" stroke="#ffffff" stroke-width="${wall.thickness + 8}"/>`;
  if (opening.type.startsWith('door')) {
    const { hinge, leafEnd, closedEnd } = geometry;
    // Sweep flag 1 draws toward increasing angle, which is clockwise on a y-down SVG canvas.
    const cross = (leafEnd.x - hinge.x) * (closedEnd.y - hinge.y) - (leafEnd.y - hinge.y) * (closedEnd.x - hinge.x);
    const radius = num(opening.width);
    const swing = `<path data-door-swing="${xml(opening.id)}" d="M ${num(leafEnd.x)} ${num(leafEnd.y)} A ${radius} ${radius} 0 0 ${cross > 0 ? 1 : 0} ${num(closedEnd.x)} ${num(closedEnd.y)}" fill="none" stroke="#475569" stroke-width="8" stroke-dasharray="40 30"/>`;
    return `<g data-opening-id="${xml(opening.id)}">${erase}<line x1="${num(hinge.x)}" y1="${num(hinge.y)}" x2="${num(leafEnd.x)}" y2="${num(leafEnd.y)}" stroke="#0f172a" stroke-width="18"/>${swing}</g>`;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * 20;
  const ny = dx / length * 20;
  return `<g data-opening-id="${xml(opening.id)}">${erase}<line x1="${num(geometry.jambA.x + nx)}" y1="${num(geometry.jambA.y + ny)}" x2="${num(geometry.jambB.x + nx)}" y2="${num(geometry.jambB.y + ny)}" stroke="#0f172a" stroke-width="10"/><line x1="${num(geometry.jambA.x - nx)}" y1="${num(geometry.jambA.y - ny)}" x2="${num(geometry.jambB.x - nx)}" y2="${num(geometry.jambB.y - ny)}" stroke="#0f172a" stroke-width="10"/></g>`;
};

const svgText = (point: Point2D, value: string, size: number, fill: string) => `<text x="${num(point.x)}" y="${num(point.y + size * 0.35)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${fill}">${xml(value)}</text>`;

const componentSvg = (component: PlanComponent) => {
  const dimensions = componentDimensions(component);
  const { x, y } = component.position;
  const shape = dimensions.circular
    ? `<circle data-component-id="${xml(component.id)}" cx="${num(x)}" cy="${num(y)}" r="${num(Math.max(dimensions.width, dimensions.depth) / 2)}" fill="#e2e8f0" stroke="#64748b" stroke-width="12"/>`
    : `<rect data-component-id="${xml(component.id)}" x="${num(x - dimensions.width / 2)}" y="${num(y - dimensions.depth / 2)}" width="${num(dimensions.width)}" height="${num(dimensions.depth)}" transform="rotate(${component.rotation} ${num(x)} ${num(y)})" fill="#e2e8f0" stroke="#64748b" stroke-width="12"/>`;
  const size = component.category === 'mep' ? COMPONENT_SVG_FONT_SIZE * 0.8 : COMPONENT_SVG_FONT_SIZE;
  return `${shape}${svgText(component.position, componentLabel(component), size, '#1e293b')}`;
};

const clearanceSvg = (component: PlanComponent) => {
  const zone = accessZone(component);
  if (!zone) return '';
  const style = 'fill="none" stroke="#f43f5e" stroke-width="10" stroke-dasharray="80 50"';
  if (zone.kind === 'circle') return `<circle data-clearance-id="${xml(component.id)}" cx="${num(zone.center.x)}" cy="${num(zone.center.y)}" r="${num(zone.radius)}" ${style}/>`;
  return `<polygon data-clearance-id="${xml(component.id)}" points="${zone.points.map((point) => `${num(point.x)},${num(point.y)}`).join(' ')}" ${style}/>`;
};

export const exportSvg = (project: FloorplanProject, options: ExportOptions = {}) => {
  const units = unitsOf(project);
  const selected = layerSet(project, options);
  const bounds = projectBounds(project);
  const padding = Math.max(500, Math.max(bounds.width, bounds.height) * 0.05);
  const box = { x: bounds.minX - padding, y: bounds.minY - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
  const viewBox = [box.x, box.y, box.width, box.height].map(num).join(' ');
  const rooms = selected.has('walls') ? project.rooms.map((room) => svgText(room.centroid, roomLabel(room, units), ROOM_SVG_FONT_SIZE, '#475569')).join('') : '';
  const walls = selected.has('walls') ? project.walls.map((wall) => wallSvg(project, wall)).join('') : '';
  const doors = selected.has('doors') ? project.walls.flatMap((wall) => wall.openings.filter((opening) => opening.type.startsWith('door')).map((opening) => openingSvg(project, wall, opening))).join('') : '';
  const windows = selected.has('windows') ? project.walls.flatMap((wall) => wall.openings.filter((opening) => !opening.type.startsWith('door')).map((opening) => openingSvg(project, wall, opening))).join('') : '';
  const furniture = selected.has('furniture') ? project.components.filter((component) => component.category !== 'mep' && component.layerId !== 'clearance').map(componentSvg).join('') : '';
  const mep = selected.has('mep') ? project.components.filter((component) => component.category === 'mep').map(componentSvg).join('') : '';
  const clearances = selected.has('clearance') ? project.components.map(clearanceSvg).join('') : '';
  const dimensions = selected.has('dimensions') ? project.dimensions.map((dimension) => {
    const midX = (dimension.start.x + dimension.end.x) / 2;
    const midY = (dimension.start.y + dimension.end.y) / 2;
    return `<g data-dimension-id="${xml(dimension.id)}"><line x1="${num(dimension.start.x)}" y1="${num(dimension.start.y)}" x2="${num(dimension.end.x)}" y2="${num(dimension.end.y)}" stroke="#64748b" stroke-width="8"/><text x="${num(midX)}" y="${num(midY - 25)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${DIMENSION_SVG_FONT_SIZE}" fill="#334155">${xml(dimensionLabel(dimension, units))}</text></g>`;
  }).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${xml(project.name)} floor plan">
  <rect data-sheet="background" x="${num(box.x)}" y="${num(box.y)}" width="${num(box.width)}" height="${num(box.height)}" fill="#ffffff"/>
  <g id="layer-rooms">${rooms}</g>
  <g id="layer-walls">${walls}</g>
  <g id="layer-doors">${doors}</g>
  <g id="layer-windows">${windows}</g>
  <g id="layer-furniture">${furniture}</g>
  <g id="layer-mep">${mep}</g>
  <g id="layer-clearance">${clearances}</g>
  <g id="layer-dimensions">${dimensions}</g>
</svg>`;
};

// --- DXF ------------------------------------------------------------------
//
// Entities are collected in plan coordinates (millimeters, Y down, as drawn on
// the canvas) and written in the DXF world coordinate system, where Y points up.
// Flipping Y on write keeps the plan the same way up in CAD as on screen.

type DxfEntity =
  | { readonly kind: 'line'; readonly layer: string; readonly a: Point2D; readonly b: Point2D }
  | { readonly kind: 'polyline'; readonly layer: string; readonly points: readonly Point2D[]; readonly closed: boolean }
  | { readonly kind: 'circle'; readonly layer: string; readonly center: Point2D; readonly radius: number }
  | { readonly kind: 'arc'; readonly layer: string; readonly center: Point2D; readonly radius: number; readonly from: Point2D; readonly to: Point2D }
  | { readonly kind: 'text'; readonly layer: string; readonly point: Point2D; readonly height: number; readonly value: string };

/** Plot colors (AutoCAD Color Index) for the layers PlanCraft writes. */
const DXF_LAYERS: readonly (readonly [string, number])[] = [
  ['ROOMS', 8], ['WALLS', 7], ['DOORS', 3], ['WINDOWS', 4], ['FURNITURE', 8], ['MEP', 30], ['CLEARANCE', 1], ['DIMENSIONS', 5],
];

/**
 * DXF before R2007 is not UTF-8. Area symbols become words, the middle dot a
 * hyphen, and anything else outside printable ASCII becomes a \U+XXXX escape
 * (R2000) or "?" (R12, which predates Unicode text).
 */
const dxfText = (value: string, version: DxfVersion) => value
  .replace(/[\r\n]+/g, ' ')
  .replaceAll(' · ', ' - ')
  .replaceAll('ft²', 'sq ft')
  .replaceAll('m²', 'sq m')
  .replace(/[^\x20-\x7E]/gu, (character) => (version === 'r2000'
    ? `\\U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
    : '?'));

const collectDxfEntities = (project: FloorplanProject, options: ExportOptions): DxfEntity[] => {
  const units = unitsOf(project);
  const selected = layerSet(project, options);
  const vertices = vertexMap(project);
  const entities: DxfEntity[] = [];
  if (selected.has('walls')) for (const room of project.rooms) entities.push({ kind: 'text', layer: 'ROOMS', point: room.centroid, height: 150, value: roomLabel(room, units) });
  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId);
    const end = vertices.get(wall.endVertexId);
    if (!start || !end) continue;
    if (selected.has('walls')) for (const [a, b] of wallVisibleSegments(start, end, wall.openings)) entities.push({ kind: 'line', layer: 'WALLS', a, b });
    for (const opening of wall.openings) {
      const isDoor = opening.type.startsWith('door');
      if (!selected.has(isDoor ? 'doors' : 'windows')) continue;
      const layer = isDoor ? 'DOORS' : 'WINDOWS';
      const geometry = openingGeometry(start, end, opening);
      entities.push({ kind: 'line', layer, a: geometry.jambA, b: geometry.jambB });
      if (isDoor) {
        entities.push({ kind: 'line', layer, a: geometry.hinge, b: geometry.leafEnd });
        entities.push({ kind: 'arc', layer, center: geometry.hinge, radius: opening.width, from: geometry.leafEnd, to: geometry.closedEnd });
      }
    }
  }
  for (const component of project.components) {
    const componentLayer: ExportLayerId = component.category === 'mep' ? 'mep' : 'furniture';
    if (component.layerId !== 'clearance' && selected.has(componentLayer)) {
      const dimensions = componentDimensions(component);
      const layer = component.category === 'mep' ? 'MEP' : 'FURNITURE';
      if (dimensions.circular) entities.push({ kind: 'circle', layer, center: component.position, radius: Math.max(dimensions.width, dimensions.depth) / 2 });
      else entities.push({ kind: 'polyline', layer, points: rectangleCorners(component.position, dimensions.width, dimensions.depth, component.rotation), closed: true });
      entities.push({ kind: 'text', layer, point: component.position, height: component.category === 'mep' ? 80 : 100, value: componentLabel(component) });
    }
    if (selected.has('clearance')) {
      const zone = accessZone(component);
      if (zone?.kind === 'circle') entities.push({ kind: 'circle', layer: 'CLEARANCE', center: zone.center, radius: zone.radius });
      else if (zone) entities.push({ kind: 'polyline', layer: 'CLEARANCE', points: zone.points, closed: true });
    }
  }
  if (selected.has('dimensions')) for (const dimension of project.dimensions) {
    entities.push({ kind: 'polyline', layer: 'DIMENSIONS', points: [dimension.start, dimension.end], closed: false });
    const midpoint = { x: (dimension.start.x + dimension.end.x) / 2, y: (dimension.start.y + dimension.end.y) / 2 - 150 };
    entities.push({ kind: 'text', layer: 'DIMENSIONS', point: midpoint, height: 120, value: dimensionLabel(dimension, units) });
  }
  return entities;
};

type Pair = readonly [number, string | number];
const pairsText = (pairs: readonly Pair[]) => pairs.map(([code, value]) => `${code}\n${value}\n`).join('');
/** Plan Y points down; DXF WCS Y points up. */
const cadY = (y: number) => num(-y);
const cadAngle = (center: Point2D, point: Point2D) => {
  const degrees = Math.atan2(-(point.y - center.y), point.x - center.x) * 180 / Math.PI;
  return (degrees + 360) % 360;
};
/** DXF arcs run counterclockwise from start to end angle, so order the two angles to cover the swing. */
const arcAngles = (center: Point2D, from: Point2D, to: Point2D) => {
  const a = cadAngle(center, from);
  const b = cadAngle(center, to);
  const ccwSweep = (b - a + 360) % 360;
  return ccwSweep <= 180 ? [a, b] as const : [b, a] as const;
};

/** Geometry group codes for an entity, after its common header (type, handle, owner, layer, subclass). */
const entityBody = (entity: DxfEntity, version: DxfVersion): { readonly type: string; readonly subclass: string; readonly pairs: readonly Pair[]; readonly trailing?: readonly Pair[] } => {
  switch (entity.kind) {
    case 'line':
      return { type: 'LINE', subclass: 'AcDbLine', pairs: [[10, num(entity.a.x)], [20, cadY(entity.a.y)], [30, 0], [11, num(entity.b.x)], [21, cadY(entity.b.y)], [31, 0]] };
    case 'polyline':
      return {
        type: 'LWPOLYLINE', subclass: 'AcDbPolyline',
        pairs: [[90, entity.points.length], [70, entity.closed ? 1 : 0], ...entity.points.flatMap((point): Pair[] => [[10, num(point.x)], [20, cadY(point.y)]])],
      };
    case 'circle':
      return { type: 'CIRCLE', subclass: 'AcDbCircle', pairs: [[10, num(entity.center.x)], [20, cadY(entity.center.y)], [30, 0], [40, num(entity.radius)]] };
    case 'arc': {
      const [start, end] = arcAngles(entity.center, entity.from, entity.to);
      return {
        type: 'ARC', subclass: 'AcDbCircle',
        pairs: [[10, num(entity.center.x)], [20, cadY(entity.center.y)], [30, 0], [40, num(entity.radius)]],
        trailing: [[100, 'AcDbArc'], [50, num(start)], [51, num(end)]],
      };
    }
    case 'text': {
      const x = num(entity.point.x);
      const y = cadY(entity.point.y);
      // 72 = 1 centers the text horizontally on the alignment point (11/21/31).
      return {
        type: 'TEXT', subclass: 'AcDbText',
        pairs: [[10, x], [20, y], [30, 0], [40, entity.height], [1, dxfText(entity.value, version)], [72, 1], [11, x], [21, y], [31, 0]],
        trailing: [[100, 'AcDbText']],
      };
    }
  }
};

const r12Entity = (entity: DxfEntity): string => {
  if (entity.kind === 'polyline') {
    // R12 has no LWPOLYLINE; write each edge as a LINE.
    const edges = entity.closed ? entity.points.length : entity.points.length - 1;
    return Array.from({ length: Math.max(0, edges) }, (_, index) => r12Entity({ kind: 'line', layer: entity.layer, a: entity.points[index]!, b: entity.points[(index + 1) % entity.points.length]! })).join('');
  }
  const body = entityBody(entity, 'r12');
  const trailing = (body.trailing ?? []).filter(([code]) => code !== 100);
  return pairsText([[0, body.type], [8, entity.layer], ...body.pairs, ...trailing]);
};

const r12Document = (entities: readonly DxfEntity[]) => pairsText([
  [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1009'], [0, 'ENDSEC'],
  [0, 'SECTION'], [2, 'ENTITIES'],
]) + entities.map(r12Entity).join('') + pairsText([[0, 'ENDSEC'], [0, 'EOF']]);

/**
 * Minimal complete DXF R2000 (AC1015) document: HEADER with $HANDSEED,
 * CLASSES, the nine symbol tables with their required default records,
 * model/paper space block records and blocks, ENTITIES, and an OBJECTS root
 * dictionary with ACAD_GROUP. Every object carries a unique handle and the
 * AcDb subclass markers R2000 readers rely on.
 */
const r2000Document = (entities: readonly DxfEntity[]) => {
  let handleCounter = 0;
  const nextHandle = () => (handleCounter += 1).toString(16).toUpperCase();
  const out: string[] = [];
  const write = (pairs: readonly Pair[]) => out.push(pairsText(pairs));

  const blockRecordHandles = { model: '', paper: '' };
  const tableRecord = (type: string, subclass: string, tableHandle: string, fields: readonly Pair[]) => {
    const handleCode = type === 'DIMSTYLE' ? 105 : 5;
    const handle = nextHandle();
    write([[0, type], [handleCode, handle], [330, tableHandle], [100, 'AcDbSymbolTableRecord'], [100, subclass], ...fields]);
    return handle;
  };
  const table = (name: string, count: number, records: (tableHandle: string) => void) => {
    const handle = nextHandle();
    write([[0, 'TABLE'], [2, name], [5, handle], [330, 0], [100, 'AcDbSymbolTable'], [70, count], ...(name === 'DIMSTYLE' ? [[100, 'AcDbDimStyleTable'] as Pair, [71, 0] as Pair] : [])]);
    records(handle);
    write([[0, 'ENDTAB']]);
  };

  write([[0, 'SECTION'], [2, 'CLASSES'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'TABLES']]);
  table('VPORT', 0, () => undefined);
  table('LTYPE', 3, (owner) => {
    for (const [name, description] of [['ByBlock', ''], ['ByLayer', ''], ['Continuous', 'Solid line']] as const) {
      tableRecord('LTYPE', 'AcDbLinetypeTableRecord', owner, [[2, name], [70, 0], [3, description], [72, 65], [73, 0], [40, 0]]);
    }
  });
  table('LAYER', DXF_LAYERS.length + 1, (owner) => {
    for (const [name, color] of [['0', 7] as const, ...DXF_LAYERS]) tableRecord('LAYER', 'AcDbLayerTableRecord', owner, [[2, name], [70, 0], [62, color], [6, 'Continuous']]);
  });
  table('STYLE', 1, (owner) => tableRecord('STYLE', 'AcDbTextStyleTableRecord', owner, [[2, 'Standard'], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, 'txt'], [4, '']]));
  table('VIEW', 0, () => undefined);
  table('UCS', 0, () => undefined);
  table('APPID', 1, (owner) => tableRecord('APPID', 'AcDbRegAppTableRecord', owner, [[2, 'ACAD'], [70, 0]]));
  table('DIMSTYLE', 1, (owner) => tableRecord('DIMSTYLE', 'AcDbDimStyleTableRecord', owner, [[2, 'Standard'], [70, 0]]));
  table('BLOCK_RECORD', 2, (owner) => {
    blockRecordHandles.model = tableRecord('BLOCK_RECORD', 'AcDbBlockTableRecord', owner, [[2, '*Model_Space']]);
    blockRecordHandles.paper = tableRecord('BLOCK_RECORD', 'AcDbBlockTableRecord', owner, [[2, '*Paper_Space']]);
  });
  write([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'BLOCKS']]);
  for (const [name, owner, paper] of [['*Model_Space', blockRecordHandles.model, false], ['*Paper_Space', blockRecordHandles.paper, true]] as const) {
    write([[0, 'BLOCK'], [5, nextHandle()], [330, owner], [100, 'AcDbEntity'], ...(paper ? [[67, 1] as Pair] : []), [8, '0'], [100, 'AcDbBlockBegin'], [2, name], [70, 0], [10, 0], [20, 0], [30, 0], [3, name], [1, '']]);
    write([[0, 'ENDBLK'], [5, nextHandle()], [330, owner], [100, 'AcDbEntity'], ...(paper ? [[67, 1] as Pair] : []), [8, '0'], [100, 'AcDbBlockEnd']]);
  }
  write([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']]);
  for (const entity of entities) {
    const body = entityBody(entity, 'r2000');
    write([[0, body.type], [5, nextHandle()], [330, blockRecordHandles.model], [100, 'AcDbEntity'], [8, entity.layer], [100, body.subclass], ...body.pairs, ...(body.trailing ?? [])]);
  }
  const rootDictionary = nextHandle();
  const groupDictionary = nextHandle();
  write([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'OBJECTS']]);
  write([[0, 'DICTIONARY'], [5, rootDictionary], [330, 0], [100, 'AcDbDictionary'], [281, 1], [3, 'ACAD_GROUP'], [350, groupDictionary]]);
  write([[0, 'DICTIONARY'], [5, groupDictionary], [330, rootDictionary], [100, 'AcDbDictionary'], [281, 1]]);
  write([[0, 'ENDSEC'], [0, 'EOF']]);

  const header = pairsText([
    [0, 'SECTION'], [2, 'HEADER'],
    [9, '$ACADVER'], [1, 'AC1015'],
    [9, '$HANDSEED'], [5, nextHandle()],
    // Drawing units are millimeters; $MEASUREMENT 1 selects metric hatch/linetype defaults.
    [9, '$INSUNITS'], [70, 4],
    [9, '$MEASUREMENT'], [70, 1],
    [0, 'ENDSEC'],
  ]);
  return header + out.join('');
};

export const exportDxf = (project: FloorplanProject, version: DxfVersion, options: ExportOptions = {}) => {
  const entities = collectDxfEntities(project, options);
  return version === 'r12' ? r12Document(entities) : r2000Document(entities);
};

export const serializeProject = (project: FloorplanProject) => JSON.stringify(project, null, 2);

// --- PDF ------------------------------------------------------------------

const PDF_SHEETS: Record<PdfSheet, readonly [number, number]> = {
  'arch-d': [36 * 72, 24 * 72],
  'arch-c': [24 * 72, 18 * 72],
  letter: [11 * 72, 8.5 * 72],
  a4: [841.89, 595.28],
};
export const PDF_SHEET_LABELS: Record<PdfSheet, string> = {
  letter: 'Letter (11 × 8.5 in)',
  a4: 'A4 (297 × 210 mm)',
  'arch-c': 'Arch C (24 × 18 in)',
  'arch-d': 'Arch D (36 × 24 in)',
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

/** Keeps every character the standard PDF font can encode (accents, ², ·) and replaces the rest with "?". */
const pdfText = (font: PDFFont, value: string) => [...value.replace(/[\r\n]+/g, ' ')].map((character) => {
  try { font.widthOfTextAtSize(character, 8); return character; } catch { return '?'; }
}).join('');

export const exportPdf = async (project: FloorplanProject, sheet: PdfSheet = 'arch-d', options: PdfExportOptions = {}) => {
  const units = unitsOf(project);
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const effectiveOptions: PdfExportOptions = options.pdfScale === undefined
    ? { ...options, pdfScale: pdfScaleFromNotation(project.scaleNotation) }
    : options;
  const placement = describePdfPlacement(project, sheet, effectiveOptions);
  if (!placement.fitsSheet) throw new Error(`At ${placement.placementLabel.replace('Physical scale ', '')} this plan is larger than a ${PDF_SHEET_LABELS[sheet]} sheet. Pick a bigger sheet, a smaller scale, or "Fit to page".`);
  const selected = layerSet(project, options);
  const page = document.addPage([placement.pageWidth, placement.pageHeight]);
  const bounds = projectBounds(project);
  const availableHeight = placement.pageHeight - PDF_MARGIN * 2 - PDF_TITLE_HEIGHT;
  const toPage = (point: Point2D) => ({
    x: PDF_MARGIN + (point.x - bounds.minX) * placement.pointsPerMm,
    y: PDF_MARGIN + PDF_TITLE_HEIGHT + availableHeight - (point.y - bounds.minY) * placement.pointsPerMm,
  });
  const centeredText = (value: string, point: Point2D, size: number, color = rgb(0.35, 0.4, 0.45)) => {
    const text = pdfText(font, value);
    const at = toPage(point);
    page.drawText(text, { x: at.x - font.widthOfTextAtSize(text, size) / 2, y: at.y - size * 0.35, size, font, color });
  };
  const polyline = (points: readonly Point2D[], thickness: number, color = rgb(0.35, 0.4, 0.45)) => {
    for (let index = 0; index < points.length - 1; index += 1) page.drawLine({ start: toPage(points[index]!), end: toPage(points[index + 1]!), thickness, color });
  };
  const vertices = vertexMap(project);

  if (selected.has('walls')) for (const room of project.rooms) {
    const points = room.boundaryVertexIds.map((id) => vertices.get(id)).filter((point): point is Point2D => Boolean(point));
    if (points.length >= 3) for (let index = 0; index < points.length; index += 1) page.drawLine({ start: toPage(points[index]!), end: toPage(points[(index + 1) % points.length]!), thickness: 0.5, color: rgb(0.7, 0.75, 0.8) });
    centeredText(roomLabel(room, units), room.centroid, 8);
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
      if (isDoor) {
        page.drawLine({ start: toPage(geometry.hinge), end: toPage(geometry.leafEnd), thickness: 1, color: rgb(0.1, 0.15, 0.2) });
        polyline(swingPolyline(geometry, opening.width), 0.5, rgb(0.3, 0.35, 0.4));
      } else {
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
      centeredText(componentLabel(component), component.position, component.category === 'mep' ? 5 : 6, rgb(0.2, 0.25, 0.3));
    }
    const zone = selected.has('clearance') ? accessZone(component) : undefined;
    if (zone) {
      if (zone.kind === 'circle') {
        const center = toPage(zone.center);
        page.drawCircle({ x: center.x, y: center.y, size: zone.radius * placement.pointsPerMm, borderWidth: 0.7, borderColor: rgb(0.75, 0.2, 0.3), borderDashArray: [4, 3] });
      } else {
        const corners = zone.points.map(toPage);
        for (let index = 0; index < corners.length; index += 1) page.drawLine({ start: corners[index]!, end: corners[(index + 1) % corners.length]!, thickness: 0.7, color: rgb(0.75, 0.2, 0.3), dashArray: [4, 3] });
      }
    }
  }

  if (selected.has('dimensions')) for (const dimension of project.dimensions) {
    const start = toPage(dimension.start);
    const end = toPage(dimension.end);
    page.drawLine({ start, end, thickness: 0.7, color: rgb(0.35, 0.4, 0.45) });
    const label = pdfText(font, dimensionLabel(dimension, units));
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

  page.drawText(pdfText(font, project.name), { x: PDF_MARGIN, y: 48, size: 14, font, color: rgb(0.08, 0.12, 0.18) });
  page.drawText(placement.placementLabel, { x: PDF_MARGIN, y: 30, size: 9, font, color: rgb(0.25, 0.3, 0.35) });
  const byline = project.author.trim() ? ` · Drawn by ${project.author.trim()}` : '';
  page.drawText(pdfText(font, `Drawing scale: ${placement.projectScaleMetadata}${byline}`), { x: PDF_MARGIN, y: 16, size: 8, font, color: rgb(0.35, 0.4, 0.45) });
  page.drawText(new Date().toLocaleDateString('en-US'), { x: placement.pageWidth - PDF_MARGIN - 90, y: 16, size: 8, font, color: rgb(0.35, 0.4, 0.45) });
  page.drawLine({ start: { x: placement.pageWidth - PDF_MARGIN - 20, y: 44 }, end: { x: placement.pageWidth - PDF_MARGIN - 20, y: 66 }, thickness: 1.5, color: rgb(0.1, 0.15, 0.2) });
  page.drawText('N', { x: placement.pageWidth - PDF_MARGIN - 24, y: 69, size: 8, font, color: rgb(0.1, 0.15, 0.2) });
  return document.save();
};
