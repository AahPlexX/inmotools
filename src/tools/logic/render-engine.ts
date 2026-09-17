import { getComponentPorts } from './component-library';
import { BUBBLE_RADIUS, GATE_ABBREVIATION, gateFamilyOf, hasOutputBubble } from './gate-shapes';
import { componentOriginPixels, GRID_SIZE, portAbsolutePosition, rotatePoint, type Point } from './geometry';
import { readLevel } from './sim-engine';
import type {
  ComponentInstance,
  LogicDocument,
  LogicLevel,
  PortDefinition,
  PortRef,
  SimulationFrame,
  ThemeName,
  Wire,
} from './logic-types';

export interface ThemePalette {
  readonly background: string;
  readonly grid: string;
  readonly componentFill: string;
  readonly componentStroke: string;
  readonly label: string;
  readonly selection: string;
  readonly levelHigh: string;
  readonly levelLow: string;
  readonly levelFloating: string;
  readonly levelContention: string;
}

export const THEME_PALETTES: Readonly<Record<ThemeName, ThemePalette>> = {
  light: { background: '#f8fafc', grid: '#e2e8f0', componentFill: '#ffffff', componentStroke: '#1f2933', label: '#334155', selection: '#2563eb', levelHigh: '#15803d', levelLow: '#1d4ed8', levelFloating: '#94a3b8', levelContention: '#dc2626' },
  dark: { background: '#0f172a', grid: '#1e293b', componentFill: '#111827', componentStroke: '#e2e8f0', label: '#cbd5f5', selection: '#60a5fa', levelHigh: '#4ade80', levelLow: '#60a5fa', levelFloating: '#64748b', levelContention: '#f87171' },
  'high-contrast': { background: '#000000', grid: '#333333', componentFill: '#000000', componentStroke: '#ffffff', label: '#ffffff', selection: '#ffff00', levelHigh: '#00ff66', levelLow: '#00aaff', levelFloating: '#aaaaaa', levelContention: '#ff2222' },
  'color-vision-safe': { background: '#fefefe', grid: '#dddddd', componentFill: '#ffffff', componentStroke: '#111111', label: '#111111', selection: '#0072b2', levelHigh: '#0072b2', levelLow: '#e69f00', levelFloating: '#999999', levelContention: '#d55e00' },
};

const levelColor = (palette: ThemePalette, level: LogicLevel): string => {
  if (level === 1) return palette.levelHigh;
  if (level === 0) return palette.levelLow;
  if (level === 'X') return palette.levelContention;
  return palette.levelFloating;
};

const setLevelLineStyle = (ctx: CanvasRenderingContext2D, palette: ThemePalette, level: LogicLevel): void => {
  ctx.strokeStyle = levelColor(palette, level);
  if (level === 1) { ctx.setLineDash([]); ctx.lineWidth = 2.4; }
  else if (level === 0) { ctx.setLineDash([]); ctx.lineWidth = 1.4; }
  else if (level === 'X') { ctx.setLineDash([6, 3]); ctx.lineWidth = 2; }
  else { ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; }
};

export interface DraftWire {
  readonly from: PortRef;
  readonly fromPosition: Point;
  readonly waypoints: readonly Point[];
  readonly cursor: Point;
}

export interface RenderInput {
  readonly document: LogicDocument;
  readonly frame: SimulationFrame;
  readonly hoverPort?: PortRef;
  readonly draftWire?: DraftWire;
  readonly marqueeRect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

const drawGrid = (ctx: CanvasRenderingContext2D, palette: ThemePalette, viewX0: number, viewY0: number, viewX1: number, viewY1: number): void => {
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const startX = Math.floor(viewX0 / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(viewY0 / GRID_SIZE) * GRID_SIZE;
  ctx.beginPath();
  for (let x = startX; x <= viewX1; x += GRID_SIZE) { ctx.moveTo(x, viewY0); ctx.lineTo(x, viewY1); }
  for (let y = startY; y <= viewY1; y += GRID_SIZE) { ctx.moveTo(viewX0, y); ctx.lineTo(viewX1, y); }
  ctx.stroke();
};

const drawGateBody = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, width: number, height: number): void => {
  const family = gateFamilyOf(component.type);
  ctx.fillStyle = palette.componentFill;
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (family === 'and') {
    const straightWidth = width * 0.55;
    ctx.moveTo(0, 0);
    ctx.lineTo(straightWidth, 0);
    ctx.arc(straightWidth, height / 2, height / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, height);
    ctx.closePath();
  } else if (family === 'or' || family === 'xor') {
    const backInset = family === 'xor' ? 8 : 0;
    ctx.moveTo(backInset, 0);
    ctx.quadraticCurveTo(width * 0.32, height / 2, backInset, height);
    ctx.quadraticCurveTo(width * 0.72, height, width, height / 2);
    ctx.quadraticCurveTo(width * 0.72, 0, backInset, 0);
    ctx.closePath();
  } else if (family === 'tri-state') {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.lineTo(width * 0.85, height / 2);
    ctx.closePath();
  } else {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.lineTo(width * 0.85, height / 2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (family === 'xor') {
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(width * 0.32 - 6, height / 2, -6, height);
    ctx.stroke();
  }
  if (hasOutputBubble(component.type)) {
    const tipX = family === 'and' ? width * 0.55 + height / 2 : width;
    ctx.beginPath();
    ctx.arc(tipX + BUBBLE_RADIUS, height / 2, BUBBLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = palette.componentFill;
    ctx.fill();
    ctx.stroke();
  }
};

const drawIoComponent = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, frame: SimulationFrame): void => {
  ctx.fillStyle = palette.componentFill;
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1.6;
  if (component.type === 'SWITCH') {
    const level = readLevel(frame, component.id, 'Y');
    ctx.beginPath();
    ctx.roundRect(0, -GRID_SIZE * 0.6, GRID_SIZE * 1.6, GRID_SIZE * 1.2, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = levelColor(palette, level);
    ctx.arc(level === 1 ? GRID_SIZE * 1.15 : GRID_SIZE * 0.45, 0, GRID_SIZE * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (component.type === 'PUSH_BUTTON') {
    const pressed = frame.componentState[component.id]?.buttonPressed ?? false;
    ctx.beginPath();
    ctx.arc(GRID_SIZE * 0.5, 0, GRID_SIZE * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? palette.levelHigh : palette.componentFill;
    ctx.fill();
    ctx.stroke();
  } else if (component.type === 'CLOCK') {
    ctx.beginPath();
    ctx.roundRect(0, -GRID_SIZE * 0.6, GRID_SIZE * 1.6, GRID_SIZE * 1.2, 6);
    ctx.fill();
    ctx.stroke();
    const level = readLevel(frame, component.id, 'Y');
    ctx.beginPath();
    ctx.strokeStyle = levelColor(palette, level);
    ctx.lineWidth = 2;
    ctx.moveTo(GRID_SIZE * 0.15, 0);
    ctx.lineTo(GRID_SIZE * 0.5, 0);
    ctx.lineTo(GRID_SIZE * 0.5, -GRID_SIZE * 0.35);
    ctx.lineTo(GRID_SIZE * 0.9, -GRID_SIZE * 0.35);
    ctx.lineTo(GRID_SIZE * 0.9, 0);
    ctx.lineTo(GRID_SIZE * 1.3, 0);
    ctx.stroke();
  } else if (component.type === 'LED') {
    const level = readLevel(frame, component.id, 'A');
    ctx.beginPath();
    ctx.arc(GRID_SIZE * 0.5, 0, GRID_SIZE * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = level === 1 ? '#fbbf24' : palette.componentFill;
    ctx.fill();
    ctx.strokeStyle = levelColor(palette, level);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (component.type === 'PROBE') {
    const level = readLevel(frame, component.id, 'A');
    ctx.beginPath();
    ctx.moveTo(GRID_SIZE * 0.5, -GRID_SIZE * 0.5);
    ctx.lineTo(GRID_SIZE, 0);
    ctx.lineTo(GRID_SIZE * 0.5, GRID_SIZE * 0.5);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = levelColor(palette, level);
    ctx.fill();
    ctx.stroke();
  }
};

const drawSequentialBody = (ctx: CanvasRenderingContext2D, palette: ThemePalette, width: number, height: number): void => {
  ctx.fillStyle = palette.componentFill;
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(0, -GRID_SIZE * 0.5, width, height + GRID_SIZE);
  ctx.fill();
  ctx.stroke();
};

const drawPorts = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, ports: readonly PortDefinition[], frame: SimulationFrame, hoverPort: PortRef | undefined): void => {
  for (const port of ports) {
    const position = portAbsolutePosition(component, port);
    const level = readLevel(frame, component.id, port.id);
    const isHovered = hoverPort?.componentId === component.id && hoverPort.portId === port.id;
    ctx.beginPath();
    ctx.fillStyle = levelColor(palette, level);
    ctx.arc(position.x, position.y, isHovered ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (isHovered) {
      ctx.beginPath();
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 2;
      ctx.arc(position.x, position.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

const drawWire = (ctx: CanvasRenderingContext2D, palette: ThemePalette, document: LogicDocument, frame: SimulationFrame, wire: Wire): void => {
  const fromComponent = document.components.find((component) => component.id === wire.from.componentId);
  const toComponent = document.components.find((component) => component.id === wire.to.componentId);
  if (!fromComponent || !toComponent) return;
  const fromPort = getComponentPorts(fromComponent.type, fromComponent.params).find((port) => port.id === wire.from.portId);
  const toPort = getComponentPorts(toComponent.type, toComponent.params).find((port) => port.id === wire.to.portId);
  if (!fromPort || !toPort) return;
  const start = portAbsolutePosition(fromComponent, fromPort);
  const end = portAbsolutePosition(toComponent, toPort);
  const level = readLevel(frame, wire.from.componentId, wire.from.portId);
  setLevelLineStyle(ctx, palette, level);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const point of wire.waypoints) ctx.lineTo(point.x, point.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const point of wire.waypoints) {
    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const renderScene = (
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  viewport: LogicDocument['viewport'],
  input: RenderInput,
  theme: ThemeName,
): void => {
  const palette = THEME_PALETTES[theme];
  ctx.save();
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, widthPx, heightPx);

  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  const viewX0 = -viewport.panX / viewport.zoom;
  const viewY0 = -viewport.panY / viewport.zoom;
  const viewX1 = viewX0 + widthPx / viewport.zoom;
  const viewY1 = viewY0 + heightPx / viewport.zoom;
  drawGrid(ctx, palette, viewX0, viewY0, viewX1, viewY1);

  for (const wire of input.document.wires) drawWire(ctx, palette, input.document, input.frame, wire);

  if (input.draftWire) {
    ctx.save();
    ctx.strokeStyle = palette.selection;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(input.draftWire.fromPosition.x, input.draftWire.fromPosition.y);
    for (const point of input.draftWire.waypoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(input.draftWire.cursor.x, input.draftWire.cursor.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const component of input.document.components) {
    const ports = getComponentPorts(component.type, component.params);
    const inputCount = ports.filter((port) => port.direction === 'input').length;
    const height = Math.max(2, inputCount) * GRID_SIZE;
    const origin = componentOriginPixels(component);
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate((component.rotation * Math.PI) / 180);
    ctx.scale(component.mirrored ? -1 : 1, 1);

    if (component.type === 'SWITCH' || component.type === 'PUSH_BUTTON' || component.type === 'CLOCK' || component.type === 'LED' || component.type === 'PROBE') {
      drawIoComponent(ctx, palette, component, input.frame);
    } else if (component.type === 'D_FLIP_FLOP' || component.type === 'JK_FLIP_FLOP' || component.type === 'T_FLIP_FLOP' || component.type === 'SR_LATCH') {
      drawSequentialBody(ctx, palette, GRID_SIZE * 2, height);
      ctx.fillStyle = palette.label;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(GATE_ABBREVIATION[component.type], GRID_SIZE, height / 2);
    } else {
      drawGateBody(ctx, palette, component, GRID_SIZE * 2, height);
    }
    ctx.restore();

    if (input.document.selectedIds.includes(component.id)) {
      ctx.save();
      ctx.strokeStyle = palette.selection;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(origin.x - GRID_SIZE * 1.2, origin.y - height / 2 - GRID_SIZE * 0.4, GRID_SIZE * 2.4 + 8, height + GRID_SIZE * 0.8);
      ctx.restore();
    }

    drawPorts(ctx, palette, component, ports, input.frame, input.hoverPort);

    ctx.fillStyle = palette.label;
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(component.label, origin.x + GRID_SIZE, origin.y + height / 2 + GRID_SIZE * 0.9);
  }

  if (input.marqueeRect) {
    ctx.save();
    ctx.strokeStyle = palette.selection;
    ctx.fillStyle = `${palette.selection}22`;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(input.marqueeRect.x, input.marqueeRect.y, input.marqueeRect.width, input.marqueeRect.height);
    ctx.strokeRect(input.marqueeRect.x, input.marqueeRect.y, input.marqueeRect.width, input.marqueeRect.height);
    ctx.restore();
  }

  ctx.restore();
};

export const screenToWorld = (screenX: number, screenY: number, viewport: LogicDocument['viewport']): Point => ({
  x: (screenX - viewport.panX) / viewport.zoom,
  y: (screenY - viewport.panY) / viewport.zoom,
});

export const worldToScreen = (worldX: number, worldY: number, viewport: LogicDocument['viewport']): Point => ({
  x: worldX * viewport.zoom + viewport.panX,
  y: worldY * viewport.zoom + viewport.panY,
});

export const snapToGrid = (value: number): number => Math.round(value / GRID_SIZE) * GRID_SIZE;

export { rotatePoint };
