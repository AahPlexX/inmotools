import { worldToScreen } from './geometry-engine';
import { getSymbolDefinition } from './symbol-library';
import type { FloorplanProject, FloorplanViewport, HostedOpening, PlanComponent, Point2D, WallSegment } from './floorplan-types';
import type { ClearanceViolation } from './floorplan-analysis';

export interface WallVisualStyle {
  readonly stroke: string;
  readonly fill: string;
  readonly dash: readonly number[];
}

export interface HostedOpeningGeometry {
  readonly center: Point2D;
  readonly jambA: Point2D;
  readonly jambB: Point2D;
  readonly hinge: Point2D;
  readonly leafEnd: Point2D;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export const wallVisualStyle = (wall: WallSegment): WallVisualStyle => wall.state === 'demolition'
  ? { stroke: '#f43f5e', fill: '#3f1725', dash: [280, 150] }
  : wall.state === 'new_construction'
    ? { stroke: '#38bdf8', fill: '#123d55', dash: [] }
    : { stroke: '#334155', fill: '#1e293b', dash: [] };

export const hostedOpeningGeometry = (start: Point2D, end: Point2D, opening: HostedOpening): HostedOpeningGeometry => {
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
  const swingDirection = opening.flipSide ? -1 : 1;
  const leafAngle = baseAngle + swingDirection * Math.PI / 2;
  const leafEnd = { x: hinge.x + Math.cos(leafAngle) * opening.width, y: hinge.y + Math.sin(leafAngle) * opening.width };
  return { center, jambA, jambB, hinge, leafEnd, radius: opening.width, startAngle: baseAngle, endAngle: leafAngle };
};

const setupCanvas = (canvas: HTMLCanvasElement) => {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  return { context, width: rect.width, height: rect.height };
};

const transformed = (point: Point2D, viewport: FloorplanViewport) => worldToScreen(point, viewport);
const layerVisible = (project: FloorplanProject, id: string) => project.layers.find((layer) => layer.id === id)?.visible !== false;

const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number, viewport: FloorplanViewport) => {
  const spacing = viewport.gridMm * viewport.scale;
  if (spacing < 8) return;
  const startX = ((viewport.panX % spacing) + spacing) % spacing;
  const startY = ((viewport.panY % spacing) + spacing) % spacing;
  context.save();
  context.strokeStyle = 'rgba(148,163,184,.12)';
  context.lineWidth = 1;
  for (let x = startX; x < width; x += spacing) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  for (let y = startY; y < height; y += spacing) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  context.restore();
};

const drawComponent = (context: CanvasRenderingContext2D, component: PlanComponent, viewport: FloorplanViewport) => {
  const symbol = getSymbolDefinition(component.symbolKey);
  if (!symbol) return;
  const center = transformed(component.position, viewport);
  const width = symbol.width * component.scale.x * viewport.scale;
  const depth = symbol.depth * component.scale.y * viewport.scale;
  context.save();
  context.translate(center.x, center.y);
  context.rotate(component.rotation * Math.PI / 180);
  context.fillStyle = component.category === 'mep' ? '#fbbf24' : '#cbd5e1';
  context.strokeStyle = component.category === 'mep' ? '#f59e0b' : '#64748b';
  context.lineWidth = 1.5;
  if (symbol.glyph === 'circle' || symbol.glyph === 'chair') {
    context.beginPath(); context.arc(0, 0, Math.max(width, depth) / 2, 0, Math.PI * 2); context.fill(); context.stroke();
  } else {
    context.fillRect(-width / 2, -depth / 2, width, depth); context.strokeRect(-width / 2, -depth / 2, width, depth);
  }
  context.restore();
};

export const drawBaseScene = (canvas: HTMLCanvasElement, project: FloorplanProject) => {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { context, width, height } = setup;
  context.fillStyle = '#0b1120';
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height, project.viewport);
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));

  for (const room of project.rooms) {
    const points = room.boundaryVertexIds.map((id) => vertices.get(id)).filter((point): point is Point2D => Boolean(point));
    if (points.length < 3) continue;
    context.beginPath();
    points.forEach((point, index) => { const p = transformed(point, project.viewport); index === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y); });
    context.closePath(); context.fillStyle = 'rgba(56,189,248,.045)'; context.fill();
    const c = transformed(room.centroid, project.viewport); context.fillStyle = '#94a3b8'; context.font = '12px ui-monospace, monospace'; context.textAlign = 'center';
    context.fillText(`${room.name} · ${room.areaSqMeters.toFixed(1)} m²`, c.x, c.y);
  }

  if (layerVisible(project, 'walls')) for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId); const end = vertices.get(wall.endVertexId); if (!start || !end) continue;
    const a = transformed(start, project.viewport); const b = transformed(end, project.viewport); const style = wallVisualStyle(wall);
    context.save(); context.strokeStyle = style.stroke; context.lineWidth = Math.max(2, wall.thickness * project.viewport.scale); context.setLineDash(style.dash.map((value) => value * project.viewport.scale));
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.restore();
    if (wall.isLoadBearing) {
      context.save(); context.strokeStyle = 'rgba(226,232,240,.75)'; context.lineWidth = 1;
      const length = Math.hypot(b.x - a.x, b.y - a.y); const steps = Math.max(1, Math.floor(length / 14));
      for (let i = 0; i <= steps; i += 1) { const t = i / steps; const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t; context.beginPath(); context.moveTo(x - 4, y - 4); context.lineTo(x + 4, y + 4); context.stroke(); }
      context.restore();
    }
    if (layerVisible(project, 'doors') || layerVisible(project, 'windows')) for (const opening of wall.openings) {
      const geometry = hostedOpeningGeometry(start, end, opening);
      const j1 = transformed(geometry.jambA, project.viewport); const j2 = transformed(geometry.jambB, project.viewport);
      context.save(); context.strokeStyle = '#0b1120'; context.lineWidth = Math.max(4, wall.thickness * project.viewport.scale + 3); context.beginPath(); context.moveTo(j1.x, j1.y); context.lineTo(j2.x, j2.y); context.stroke();
      context.strokeStyle = '#e2e8f0'; context.lineWidth = 1.5;
      if (opening.type.startsWith('door')) {
        const hinge = transformed(geometry.hinge, project.viewport); const leaf = transformed(geometry.leafEnd, project.viewport); context.beginPath(); context.moveTo(hinge.x, hinge.y); context.lineTo(leaf.x, leaf.y); context.stroke();
        context.beginPath(); context.arc(hinge.x, hinge.y, geometry.radius * project.viewport.scale, geometry.startAngle, geometry.endAngle, opening.flipSide); context.stroke();
      } else {
        const nx = -(end.y - start.y) / (Math.hypot(end.x - start.x, end.y - start.y) || 1) * 3;
        const ny = (end.x - start.x) / (Math.hypot(end.x - start.x, end.y - start.y) || 1) * 3;
        context.beginPath(); context.moveTo(j1.x + nx, j1.y + ny); context.lineTo(j2.x + nx, j2.y + ny); context.moveTo(j1.x - nx, j1.y - ny); context.lineTo(j2.x - nx, j2.y - ny); context.stroke();
      }
      context.restore();
    }
  }

  for (const component of project.components) { const layer = component.category === 'mep' ? 'mep' : component.layerId; if (layerVisible(project, layer)) drawComponent(context, component, project.viewport); }
  if (layerVisible(project, 'dimensions')) for (const dimension of project.dimensions) {
    const a = transformed(dimension.start, project.viewport); const b = transformed(dimension.end, project.viewport);
    context.save(); context.strokeStyle = '#94a3b8'; context.lineWidth = 1; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    const length = Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y); context.fillStyle = '#cbd5e1'; context.font = '11px ui-monospace, monospace'; context.textAlign = 'center'; context.fillText(dimension.label ?? `${Math.round(length)} mm`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 5); context.restore();
  }
};

export interface OverlayScene {
  readonly pointer?: Point2D;
  readonly snap?: Point2D;
  readonly draftStart?: Point2D;
  readonly draftEnd?: Point2D;
  readonly selectedId?: string;
  readonly violations?: readonly ClearanceViolation[];
}

export const drawOverlayScene = (canvas: HTMLCanvasElement, project: FloorplanProject, overlay: OverlayScene) => {
  const setup = setupCanvas(canvas); if (!setup) return; const { context } = setup;
  if (overlay.draftStart && overlay.draftEnd) {
    const a = transformed(overlay.draftStart, project.viewport); const b = transformed(overlay.draftEnd, project.viewport);
    context.save(); context.strokeStyle = '#38bdf8'; context.lineWidth = 2; context.setLineDash([7, 5]); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.restore();
  }
  if (overlay.snap) {
    const snap = transformed(overlay.snap, project.viewport); context.save(); context.strokeStyle = '#10b981'; context.lineWidth = 2; context.beginPath(); context.arc(snap.x, snap.y, 7, 0, Math.PI * 2); context.stroke(); context.restore();
  }
  if (overlay.pointer) {
    const pointer = transformed(overlay.pointer, project.viewport); context.save(); context.strokeStyle = 'rgba(226,232,240,.5)'; context.lineWidth = 1; context.beginPath(); context.moveTo(pointer.x - 10, pointer.y); context.lineTo(pointer.x + 10, pointer.y); context.moveTo(pointer.x, pointer.y - 10); context.lineTo(pointer.x, pointer.y + 10); context.stroke(); context.restore();
  }
  if (layerVisible(project, 'clearance') && overlay.violations?.length) {
    const violatingIds = new Set(overlay.violations.map((violation) => violation.componentId));
    for (const component of project.components.filter((item) => violatingIds.has(item.id))) {
      const center = transformed(component.position, project.viewport); const width = (component.clearance.dimensions.x + component.clearance.bufferOffset * 2) * project.viewport.scale; const depth = (component.clearance.dimensions.y + component.clearance.bufferOffset * 2) * project.viewport.scale;
      context.save(); context.fillStyle = 'rgba(244,63,94,.25)'; context.strokeStyle = '#f43f5e'; context.setLineDash([6, 4]); context.translate(center.x, center.y); context.rotate(component.rotation * Math.PI / 180);
      if (component.clearance.shape === 'circle') { context.beginPath(); context.arc(0, 0, width / 2, 0, Math.PI * 2); context.fill(); context.stroke(); } else { context.fillRect(-width / 2, -depth / 2, width, depth); context.strokeRect(-width / 2, -depth / 2, width, depth); }
      context.restore();
    }
  }
};
