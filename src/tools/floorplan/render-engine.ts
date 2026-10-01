import { worldToScreen } from './geometry-engine';
import { accessZone, componentFootprint, type ClearanceViolation, type PlanShape } from './floorplan-analysis';
import { componentLabel, roomLabel } from './export-engine';
import { getSymbolDefinition } from './symbol-library';
import { formatLength } from './units';
import type { FloorplanProject, FloorplanViewport, HostedOpening, PlanComponent, Point2D, WallSegment } from './floorplan-types';

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

// Canvas colors are chosen against the #0b1120 drafting background. Existing walls use
// slate-400 (about 7:1) because WCAG 2.2 SC 1.4.11 asks for 3:1 on meaningful graphics.
export const wallVisualStyle = (wall: WallSegment): WallVisualStyle => wall.state === 'demolition'
  ? { stroke: '#f43f5e', fill: '#3f1725', dash: [280, 150] }
  : wall.state === 'new_construction'
    ? { stroke: '#38bdf8', fill: '#123d55', dash: [] }
    : { stroke: '#94a3b8', fill: '#1e293b', dash: [] };

const SELECTION = '#fbbf24';
const CONFLICT_FILL = 'rgba(244,63,94,.28)';
const CONFLICT_STROKE = '#fb7185';

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
const componentLayer = (component: PlanComponent) => (component.category === 'mep' ? 'mep' : component.layerId);

const tracePlanShape = (context: CanvasRenderingContext2D, shape: PlanShape, viewport: FloorplanViewport) => {
  context.beginPath();
  if (shape.kind === 'circle') {
    const center = transformed(shape.center, viewport);
    context.arc(center.x, center.y, shape.radius * viewport.scale, 0, Math.PI * 2);
    return;
  }
  shape.points.forEach((point, index) => {
    const p = transformed(point, viewport);
    if (index === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
  });
  context.closePath();
};

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

const drawLabel = (context: CanvasRenderingContext2D, text: string, at: Point2D, color: string, size = 11, halo = 'rgba(11,17,32,.85)') => {
  context.save();
  context.font = `600 ${size}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 3;
  context.strokeStyle = halo;
  context.strokeText(text, at.x, at.y);
  context.fillStyle = color;
  context.fillText(text, at.x, at.y);
  context.restore();
};

const drawComponent = (context: CanvasRenderingContext2D, component: PlanComponent, viewport: FloorplanViewport) => {
  const symbol = getSymbolDefinition(component.symbolKey);
  const footprint = componentFootprint(component);
  const guide = symbol?.clearance.adaRuleKey === 'ada_turning_circle';
  context.save();
  tracePlanShape(context, footprint, viewport);
  if (guide) {
    context.setLineDash([6, 4]);
    context.strokeStyle = '#34d399';
    context.lineWidth = 1.5;
    context.fillStyle = 'rgba(52,211,153,.08)';
  } else {
    context.fillStyle = component.category === 'mep' ? '#fbbf24' : '#cbd5e1';
    context.strokeStyle = component.category === 'mep' ? '#f59e0b' : '#64748b';
    context.lineWidth = 1.5;
  }
  context.fill();
  context.stroke();
  context.restore();
  const center = transformed(component.position, viewport);
  const label = componentLabel(component);
  const width = (symbol?.width ?? 600) * component.scale.x * viewport.scale;
  // Labels appear once the item is big enough on screen to carry them. Dark text on a light
  // halo stays readable on the light item fill and on the red conflict tint.
  if (width >= 36 || (component.category === 'mep' && viewport.scale >= 0.15)) {
    if (guide) drawLabel(context, label, center, '#6ee7b7', 10);
    else drawLabel(context, label, center, '#0f172a', component.category === 'mep' ? 9 : 10, 'rgba(241,245,249,.9)');
  }
};

export const drawBaseScene = (canvas: HTMLCanvasElement, project: FloorplanProject) => {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { context, width, height } = setup;
  const units = project.units ?? 'metric';
  const { viewport } = project;
  context.fillStyle = '#0b1120';
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height, viewport);
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));

  for (const room of project.rooms) {
    const points = room.boundaryVertexIds.map((id) => vertices.get(id)).filter((point): point is Point2D => Boolean(point));
    if (points.length < 3) continue;
    context.beginPath();
    points.forEach((point, index) => { const p = transformed(point, viewport); if (index === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y); });
    context.closePath();
    context.fillStyle = 'rgba(56,189,248,.06)';
    context.fill();
  }

  if (layerVisible(project, 'clearance')) for (const component of project.components) {
    if (!layerVisible(project, componentLayer(component))) continue;
    const zone = accessZone(component);
    if (!zone || getSymbolDefinition(component.symbolKey)?.clearance.adaRuleKey === 'ada_turning_circle') continue;
    context.save();
    tracePlanShape(context, zone, viewport);
    context.setLineDash([5, 5]);
    context.strokeStyle = 'rgba(148,163,184,.45)';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  if (layerVisible(project, 'walls')) for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId); const end = vertices.get(wall.endVertexId); if (!start || !end) continue;
    const a = transformed(start, viewport); const b = transformed(end, viewport); const style = wallVisualStyle(wall);
    context.save(); context.strokeStyle = style.stroke; context.lineCap = 'square'; context.lineWidth = Math.max(2, wall.thickness * viewport.scale); context.setLineDash(style.dash.map((value) => value * viewport.scale));
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.restore();
    if (wall.isLoadBearing) {
      context.save(); context.strokeStyle = 'rgba(15,23,42,.8)'; context.lineWidth = 1;
      const length = Math.hypot(b.x - a.x, b.y - a.y); const steps = Math.max(1, Math.floor(length / 14));
      for (let i = 0; i <= steps; i += 1) { const t = i / steps; const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t; context.beginPath(); context.moveTo(x - 4, y - 4); context.lineTo(x + 4, y + 4); context.stroke(); }
      context.restore();
    }
  }

  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId); const end = vertices.get(wall.endVertexId); if (!start || !end) continue;
    for (const opening of wall.openings) {
      const isDoor = opening.type.startsWith('door');
      if (!layerVisible(project, isDoor ? 'doors' : 'windows')) continue;
      const geometry = hostedOpeningGeometry(start, end, opening);
      const j1 = transformed(geometry.jambA, viewport); const j2 = transformed(geometry.jambB, viewport);
      context.save(); context.strokeStyle = '#0b1120'; context.lineWidth = Math.max(4, wall.thickness * viewport.scale + 3); context.beginPath(); context.moveTo(j1.x, j1.y); context.lineTo(j2.x, j2.y); context.stroke();
      context.strokeStyle = '#e2e8f0'; context.lineWidth = 1.5;
      if (isDoor) {
        const hinge = transformed(geometry.hinge, viewport); const leaf = transformed(geometry.leafEnd, viewport); context.beginPath(); context.moveTo(hinge.x, hinge.y); context.lineTo(leaf.x, leaf.y); context.stroke();
        context.setLineDash([4, 3]);
        context.beginPath(); context.arc(hinge.x, hinge.y, geometry.radius * viewport.scale, geometry.startAngle, geometry.endAngle, opening.flipSide); context.stroke();
      } else {
        const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        const nx = -(end.y - start.y) / length * 3;
        const ny = (end.x - start.x) / length * 3;
        context.beginPath(); context.moveTo(j1.x + nx, j1.y + ny); context.lineTo(j2.x + nx, j2.y + ny); context.moveTo(j1.x - nx, j1.y - ny); context.lineTo(j2.x - nx, j2.y - ny); context.stroke();
      }
      context.restore();
    }
  }

  for (const component of project.components) if (layerVisible(project, componentLayer(component))) drawComponent(context, component, viewport);

  if (layerVisible(project, 'dimensions')) for (const dimension of project.dimensions) {
    const a = transformed(dimension.start, viewport); const b = transformed(dimension.end, viewport);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = -(b.y - a.y) / length * 5; const ty = (b.x - a.x) / length * 5;
    context.save(); context.strokeStyle = '#94a3b8'; context.lineWidth = 1; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
    context.moveTo(a.x - tx, a.y - ty); context.lineTo(a.x + tx, a.y + ty); context.moveTo(b.x - tx, b.y - ty); context.lineTo(b.x + tx, b.y + ty); context.stroke(); context.restore();
    const text = dimension.label ?? formatLength(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y), units);
    drawLabel(context, text, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 9 }, '#e2e8f0');
  }

  if (layerVisible(project, 'walls')) for (const room of project.rooms) drawLabel(context, roomLabel(room, units), transformed(room.centroid, viewport), '#bae6fd', 12);
};

export interface OverlayScene {
  readonly pointer?: Point2D;
  readonly snap?: Point2D;
  readonly draftStart?: Point2D;
  readonly draftEnd?: Point2D;
  readonly selectedId?: string;
  readonly violations?: readonly ClearanceViolation[];
  /** Show draggable corner handles (Select tool). */
  readonly showHandles?: boolean;
}

const strokeSelection = (context: CanvasRenderingContext2D) => {
  context.strokeStyle = SELECTION;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.stroke();
};

export const drawOverlayScene = (canvas: HTMLCanvasElement, project: FloorplanProject, overlay: OverlayScene) => {
  const setup = setupCanvas(canvas); if (!setup) return; const { context } = setup;
  const { viewport } = project;
  const units = project.units ?? 'metric';
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));

  if (overlay.violations?.length && layerVisible(project, 'clearance')) {
    const byId = new Map(project.components.map((component) => [component.id, component]));
    for (const violation of overlay.violations) {
      const component = byId.get(violation.componentId);
      if (!component || !layerVisible(project, componentLayer(component))) continue;
      const shape = violation.rule === 'collision' || violation.rule === 'wall_collision' ? componentFootprint(component) : accessZone(component);
      if (!shape) continue;
      context.save(); tracePlanShape(context, shape, viewport); context.fillStyle = CONFLICT_FILL; context.fill(); context.strokeStyle = CONFLICT_STROKE; context.setLineDash([6, 4]); context.lineWidth = 1.5; context.stroke(); context.restore();
    }
  }

  const selectedId = overlay.selectedId;
  if (selectedId) {
    context.save();
    const wall = project.walls.find((item) => item.id === selectedId);
    const hostWall = project.walls.find((item) => item.openings.some((opening) => opening.id === selectedId));
    const component = project.components.find((item) => item.id === selectedId);
    const dimension = project.dimensions.find((item) => item.id === selectedId);
    if (wall) {
      const a = vertices.get(wall.startVertexId); const b = vertices.get(wall.endVertexId);
      if (a && b) {
        const pa = transformed(a, viewport); const pb = transformed(b, viewport);
        context.beginPath(); context.moveTo(pa.x, pa.y); context.lineTo(pb.x, pb.y);
        context.strokeStyle = SELECTION; context.lineWidth = Math.max(4, wall.thickness * viewport.scale + 6); context.globalAlpha = 0.35; context.stroke();
        context.globalAlpha = 1;
        drawLabel(context, formatLength(Math.hypot(b.x - a.x, b.y - a.y), units), { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 14 }, SELECTION);
      }
    } else if (hostWall) {
      const a = vertices.get(hostWall.startVertexId); const b = vertices.get(hostWall.endVertexId);
      const opening = hostWall.openings.find((item) => item.id === selectedId);
      if (a && b && opening) {
        const geometry = hostedOpeningGeometry(a, b, opening);
        const j1 = transformed(geometry.jambA, viewport); const j2 = transformed(geometry.jambB, viewport);
        context.beginPath(); context.moveTo(j1.x, j1.y); context.lineTo(j2.x, j2.y);
        context.strokeStyle = SELECTION; context.lineWidth = Math.max(6, hostWall.thickness * viewport.scale + 8); context.globalAlpha = 0.5; context.stroke();
      }
    } else if (component) {
      tracePlanShape(context, componentFootprint(component), viewport); strokeSelection(context);
    } else if (dimension) {
      const a = transformed(dimension.start, viewport); const b = transformed(dimension.end, viewport);
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.strokeStyle = SELECTION; context.lineWidth = 3; context.stroke();
    }
    context.restore();
  }

  if (overlay.showHandles && layerVisible(project, 'walls')) {
    context.save(); context.fillStyle = '#0b1120'; context.strokeStyle = '#e2e8f0'; context.lineWidth = 1.5;
    for (const vertex of project.vertices) { const p = transformed(vertex.position, viewport); context.fillRect(p.x - 4, p.y - 4, 8, 8); context.strokeRect(p.x - 4, p.y - 4, 8, 8); }
    context.restore();
  }

  if (overlay.draftStart && overlay.draftEnd) {
    const a = transformed(overlay.draftStart, viewport); const b = transformed(overlay.draftEnd, viewport);
    context.save(); context.strokeStyle = '#38bdf8'; context.lineWidth = 2; context.setLineDash([7, 5]); context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.restore();
    const length = Math.hypot(overlay.draftEnd.x - overlay.draftStart.x, overlay.draftEnd.y - overlay.draftStart.y);
    if (length > 0) drawLabel(context, formatLength(length, units), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 14 }, '#7dd3fc', 12);
  }
  if (overlay.snap) {
    const snap = transformed(overlay.snap, viewport); context.save(); context.strokeStyle = '#10b981'; context.lineWidth = 2; context.beginPath(); context.arc(snap.x, snap.y, 7, 0, Math.PI * 2); context.stroke(); context.restore();
  }
  if (overlay.pointer) {
    const pointer = transformed(overlay.pointer, viewport); context.save(); context.strokeStyle = 'rgba(226,232,240,.5)'; context.lineWidth = 1; context.beginPath(); context.moveTo(pointer.x - 10, pointer.y); context.lineTo(pointer.x + 10, pointer.y); context.moveTo(pointer.x, pointer.y - 10); context.lineTo(pointer.x, pointer.y + 10); context.stroke(); context.restore();
  }
};
