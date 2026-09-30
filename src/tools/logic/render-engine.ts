import { aggregateLevel, busLevels, portWidth } from './bus-engine';
import { COMPONENT_LIBRARY, getComponentPorts, type ComponentCategory } from './component-library';
import { isDisplayType, restoreSegmentLit, segmentIdsOf, type DisplayType } from './display-engine';
import { COLOR_HEX, isMatrixType, matrixSizeOf, pixelRects, restoreMatrixPixels } from './matrix-engine';
import { digitGeometries } from './segment-shapes';
import { levelLocation } from './subcircuit-ports';
import { BUBBLE_RADIUS, type BodyRect, blockCaption, componentBodyRect, componentLabelAnchor, GATE_ABBREVIATION, gateFamilyOf, hasOutputBubble, usesBlockBody } from './gate-shapes';
import { componentOriginPixels, GRID_SIZE, portAbsolutePosition, rotatePoint, type Point } from './geometry';
import { readLevel } from './sim-engine';
import type {
  ComponentInstance,
  ComponentType,
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
  /**
   * How much heavier a theme draws lines, pins, and text than the default (1). A
   * large-format theme raises it so small parts stay legible at a glance.
   */
  readonly emphasis?: number;
  /** A body color per component family, so a learner can tell gates from memory from displays by color alone. */
  readonly familyFill?: Readonly<Partial<Record<ComponentCategory, string>>>;
  /** Whether high signals are drawn with moving dashes, showing the direction the signal travels. */
  readonly flow?: boolean;
}

export const THEME_PALETTES: Readonly<Record<ThemeName, ThemePalette>> = {
  light: { background: '#f8fafc', grid: '#e2e8f0', componentFill: '#ffffff', componentStroke: '#1f2933', label: '#334155', selection: '#2563eb', levelHigh: '#15803d', levelLow: '#1d4ed8', levelFloating: '#94a3b8', levelContention: '#dc2626' },
  dark: { background: '#0f172a', grid: '#1e293b', componentFill: '#111827', componentStroke: '#e2e8f0', label: '#cbd5f5', selection: '#60a5fa', levelHigh: '#4ade80', levelLow: '#60a5fa', levelFloating: '#64748b', levelContention: '#f87171' },
  'high-contrast': { background: '#000000', grid: '#333333', componentFill: '#000000', componentStroke: '#ffffff', label: '#ffffff', selection: '#ffff00', levelHigh: '#00ff66', levelLow: '#00aaff', levelFloating: '#aaaaaa', levelContention: '#ff2222' },
  'junior-explorer': {
    background: '#fff8e1', grid: '#ffe0b2', componentFill: '#ffffff', componentStroke: '#1e293b', label: '#1e293b', selection: '#7c3aed',
    levelHigh: '#16a34a', levelLow: '#2563eb', levelFloating: '#9ca3af', levelContention: '#dc2626',
    emphasis: 1.5,
    flow: true,
    familyFill: { gate: '#bfdbfe', combinational: '#e9d5ff', sequential: '#fecdd3', register: '#fed7aa', io: '#bbf7d0', display: '#fef08a', bus: '#c7d2fe', arithmetic: '#fbcfe8', memory: '#a5f3fc', matrix: '#d9f99d', subcircuit: '#d6d3d1' },
  },
  'color-vision-safe': { background: '#fefefe', grid: '#dddddd', componentFill: '#ffffff', componentStroke: '#111111', label: '#111111', selection: '#0072b2', levelHigh: '#0072b2', levelLow: '#b35a00', levelFloating: '#999999', levelContention: '#d55e00' },
};

const levelColor = (palette: ThemePalette, level: LogicLevel): string => {
  if (level === 1) return palette.levelHigh;
  if (level === 0) return palette.levelLow;
  if (level === 'X') return palette.levelContention;
  return palette.levelFloating;
};

const emphasisOf = (palette: ThemePalette): number => palette.emphasis ?? 1;

/** Text grows more gently than lines do: a body only has so much room for its pin names. */
const fontScaleOf = (palette: ThemePalette): number => 1 + (emphasisOf(palette) - 1) * 0.5;

const bodyFillFor = (palette: ThemePalette, type: ComponentType): string =>
  palette.familyFill?.[COMPONENT_LIBRARY[type].category] ?? palette.componentFill;

/** The fill, outline color, and outline weight every component body is drawn with in this theme. */
const applyBodyStyle = (ctx: CanvasRenderingContext2D, palette: ThemePalette, type: ComponentType): void => {
  ctx.fillStyle = bodyFillFor(palette, type);
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1.6 * emphasisOf(palette);
};

const setLevelLineStyle = (ctx: CanvasRenderingContext2D, palette: ThemePalette, level: LogicLevel): void => {
  const emphasis = emphasisOf(palette);
  ctx.strokeStyle = levelColor(palette, level);
  if (level === 1) { ctx.setLineDash([]); ctx.lineWidth = 2.4 * emphasis; }
  else if (level === 0) { ctx.setLineDash([]); ctx.lineWidth = 1.4 * emphasis; }
  else if (level === 'X') { ctx.setLineDash([6, 3]); ctx.lineWidth = 2 * emphasis; }
  else { ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2 * emphasis; }
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
  /** Milliseconds on a free-running clock, used only to animate signal flow in themes that ask for it. */
  readonly animationTime?: number;
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
  applyBodyStyle(ctx, palette, component.type);
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
    ctx.fillStyle = bodyFillFor(palette, component.type);
    ctx.fill();
    ctx.stroke();
  }
};

const drawIoComponent = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, frame: SimulationFrame): void => {
  applyBodyStyle(ctx, palette, component.type);
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
    ctx.fillStyle = pressed ? palette.levelHigh : bodyFillFor(palette, component.type);
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
    ctx.lineWidth = 2 * emphasisOf(palette);
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
    ctx.fillStyle = level === 1 ? '#fbbf24' : bodyFillFor(palette, component.type);
    // A lit LED glows in the large-format theme, so "on" is unmistakable from across the room.
    if (level === 1 && palette.flow) {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = levelColor(palette, level);
    ctx.lineWidth = 2 * emphasisOf(palette);
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

const drawSequentialBody = (ctx: CanvasRenderingContext2D, palette: ThemePalette, type: ComponentType, width: number, height: number): void => {
  applyBodyStyle(ctx, palette, type);
  ctx.beginPath();
  ctx.rect(0, -GRID_SIZE * 0.5, width, height + GRID_SIZE);
  ctx.fill();
  ctx.stroke();
};

/**
 * Draws a caption in the component's local space while keeping it upright and
 * unmirrored on screen (a mirror or 180-degree turn would otherwise render it
 * backwards or upside down).
 */
const drawUprightText = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, text: string, x: number, y: number, font: string): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(component.rotation === 180 ? Math.PI : 0);
  ctx.scale(component.mirrored ? -1 : 1, 1);
  ctx.fillStyle = palette.label;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

/**
 * Prints each pin's name just inside the body edge it sits on. Text is drawn
 * in the component's local space, so a mirror or a 180-degree turn (which
 * reverses the local x-axis on screen) is undone for the text and its
 * alignment swaps, keeping every label readable and extending into the body.
 */
const drawPinLabels = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, ports: readonly PortDefinition[]): void => {
  const unmirror = component.mirrored ? -1 : 1;
  const textTurn = component.rotation === 180 ? Math.PI : 0;
  const reversed = component.mirrored !== (component.rotation === 180);
  ctx.fillStyle = palette.label;
  ctx.textBaseline = 'middle';
  ctx.font = `${9 * fontScaleOf(palette)}px ui-monospace, monospace`;
  for (const port of ports) {
    // The side a pin sits on, not its direction: a display's digit selects are inputs on the right edge.
    const rightSide = port.x > 0;
    ctx.save();
    ctx.translate(port.x * GRID_SIZE + (rightSide ? -4 : 4), port.y * GRID_SIZE);
    ctx.rotate(textTurn);
    ctx.scale(unmirror, 1);
    ctx.textAlign = rightSide !== reversed ? 'right' : 'left';
    ctx.fillText(port.label, 0, 0);
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
};

/**
 * A multi-pin block: a box sized from the pin layout, its type caption above
 * the top edge (inside, it would collide with the pin names), and the pin
 * names just inside the edges.
 */
const drawBlockBody = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, ports: readonly PortDefinition[], frame: SimulationFrame): void => {
  const body = componentBodyRect(component, ports);
  applyBodyStyle(ctx, palette, component.type);
  ctx.beginPath();
  ctx.rect(body.x, body.y, body.width, body.height);
  ctx.fill();
  ctx.stroke();
  drawPinLabels(ctx, palette, component, ports);
  if (isDisplayType(component.type)) drawDisplayGlyphs(ctx, palette, component.type, body, restoreSegmentLit(frame.componentState[component.id]?.segmentLit, component.type));

  if (isMatrixType(component.type)) drawMatrixPixels(ctx, palette, component, body, frame);
  if (component.type === 'SUBCIRCUIT') drawUprightText(ctx, palette, component, component.params.subcircuit?.icon ?? '', body.width / 2, body.y + body.height / 2 + 8, `${24 * fontScaleOf(palette)}px ui-monospace, monospace`);

  drawUprightText(ctx, palette, component, blockCaption(component), body.width / 2, body.y - 6, `bold ${10 * fontScaleOf(palette)}px ui-monospace, monospace`);
};

/**
 * The pixels of an RGB matrix: a lit pixel is a solid colored square with a light rim, an unlit one a faint
 * hollow square, so lit and unlit differ by fill and outline as well as by hue.
 */
const drawMatrixPixels = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, body: BodyRect, frame: SimulationFrame): void => {
  const size = matrixSizeOf(component.params);
  const pixels = restoreMatrixPixels(frame.componentState[component.id]?.matrixPixels, size);
  for (const rect of pixelRects(size, body)) {
    const color = pixels[rect.row * size + rect.column] ?? 0;
    const inset = Math.max(1, rect.size * 0.1);
    ctx.beginPath();
    ctx.rect(rect.x + inset, rect.y + inset, rect.size - inset * 2, rect.size - inset * 2);
    if (color === 0) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = palette.levelFloating;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = COLOR_HEX[color] ?? '#ffffff';
      ctx.fill();
      ctx.strokeStyle = palette.componentStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
};

/**
 * The digit glyphs inside a display body: lit segments in the theme's
 * high-level color, unlit ones as a faint ghost so the digit's shape stays
 * readable when everything is off (also for color-blind users, who can still
 * tell lit from unlit by fill strength instead of hue alone).
 */
const drawDisplayGlyphs = (ctx: CanvasRenderingContext2D, palette: ThemePalette, type: DisplayType, body: BodyRect, lit: readonly (0 | 1)[]): void => {
  const segmentCount = segmentIdsOf(type).length;
  for (const digit of digitGeometries(type, body)) {
    const isLit = (id: string): boolean => lit[digit.index * segmentCount + segmentIdsOf(type).indexOf(id)] === 1;
    for (const segment of digit.segments) {
      ctx.beginPath();
      segment.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.closePath();
      ctx.globalAlpha = isLit(segment.id) ? 1 : 0.16;
      ctx.fillStyle = isLit(segment.id) ? palette.levelHigh : palette.levelFloating;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(digit.dot.cx, digit.dot.cy, digit.dot.r, 0, Math.PI * 2);
    ctx.globalAlpha = isLit(digit.dot.id) ? 1 : 0.16;
    ctx.fillStyle = isLit(digit.dot.id) ? palette.levelHigh : palette.levelFloating;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
};

/**
 * The level a pin is drawn with. A bus port has no level of its own: it stands for a group of pins, so it is
 * drawn with one level summarizing them (unknown beats floating beats a good value).
 */
const portLevel = (frame: SimulationFrame, component: ComponentInstance, port: PortDefinition): LogicLevel =>
  port.bus
    ? aggregateLevel(busLevels(port, (pin) => readPin(frame, component, port.id, pin)))
    : readPin(frame, component, port.id, port.id);

/** A pin's level from the frame; a subcircuit part has no pins there, so its ports are read from their internal junctions. */
const readPin = (frame: SimulationFrame, component: ComponentInstance, portId: string, pinId: string): LogicLevel => {
  const location = levelLocation(component, portId, pinId);
  return readLevel(frame, location.componentId, location.pinId);
};

/** A bus carries many values at once, so a good one is drawn in the outline color rather than as a single high or low. */
const busColor = (palette: ThemePalette, level: LogicLevel): string => (level === 1 ? palette.componentStroke : levelColor(palette, level));

const drawPorts = (ctx: CanvasRenderingContext2D, palette: ThemePalette, component: ComponentInstance, ports: readonly PortDefinition[], frame: SimulationFrame, hoverPort: PortRef | undefined): void => {
  for (const port of ports) {
    const position = portAbsolutePosition(component, port);
    const level = portLevel(frame, component, port);
    const isHovered = hoverPort?.componentId === component.id && hoverPort.portId === port.id;
    ctx.beginPath();
    if (port.bus) {
      // A bus pin is a square, so it reads as "many wires" and can be told from a single pin at a glance.
      const half = (isHovered ? 6.5 : 5) * emphasisOf(palette);
      ctx.fillStyle = busColor(palette, level);
      ctx.rect(position.x - half, position.y - half, half * 2, half * 2);
    } else {
      ctx.fillStyle = levelColor(palette, level);
      ctx.arc(position.x, position.y, (isHovered ? 6 : 3.5) * emphasisOf(palette), 0, Math.PI * 2);
    }
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

/**
 * The conventional bus mark: a short slash across the wire with the bit count beside it, placed at the middle of
 * the wire's longest run so it stays readable on a wire with several bends.
 */
const drawBusMark = (ctx: CanvasRenderingContext2D, palette: ThemePalette, points: readonly Point[], width: number): void => {
  let best = { length: -1, from: points[0]!, to: points[points.length - 1]! };
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > best.length) best = { length, from, to };
  }
  if (best.length < 24) return;
  const cx = (best.from.x + best.to.x) / 2;
  const cy = (best.from.y + best.to.y) / 2;
  const scale = emphasisOf(palette);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = palette.componentStroke;
  ctx.lineWidth = 1.6 * scale;
  ctx.beginPath();
  ctx.moveTo(cx - 5 * scale, cy + 7 * scale);
  ctx.lineTo(cx + 5 * scale, cy - 7 * scale);
  ctx.stroke();
  ctx.fillStyle = palette.label;
  ctx.font = `bold ${10 * fontScaleOf(palette)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(String(width), cx + 8 * scale, cy - 6 * scale);
  ctx.restore();
};

const drawWire = (ctx: CanvasRenderingContext2D, palette: ThemePalette, document: LogicDocument, frame: SimulationFrame, wire: Wire, animationTime: number | undefined): void => {
  const fromComponent = document.components.find((component) => component.id === wire.from.componentId);
  const toComponent = document.components.find((component) => component.id === wire.to.componentId);
  if (!fromComponent || !toComponent) return;
  const fromPort = getComponentPorts(fromComponent.type, fromComponent.params).find((port) => port.id === wire.from.portId);
  const toPort = getComponentPorts(toComponent.type, toComponent.params).find((port) => port.id === wire.to.portId);
  if (!fromPort || !toPort) return;
  const start = portAbsolutePosition(fromComponent, fromPort);
  const end = portAbsolutePosition(toComponent, toPort);
  const isBus = fromPort.bus !== undefined || toPort.bus !== undefined;
  const level = portLevel(frame, fromComponent, fromPort);
  if (isBus) {
    // A bus wire is heavier than a single wire; its color reports the bus as a whole (see `busColor`).
    setLevelLineStyle(ctx, palette, level);
    ctx.strokeStyle = busColor(palette, level);
    ctx.lineWidth = 3.6 * emphasisOf(palette);
  } else {
    setLevelLineStyle(ctx, palette, level);
  }
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const point of wire.waypoints) ctx.lineTo(point.x, point.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  if (isBus) drawBusMark(ctx, palette, [start, ...wire.waypoints, end], portWidth(fromPort));
  // Themes that ask for it show a high signal as light dashes travelling from the driver to the load.
  if (!isBus && palette.flow && level === 1 && animationTime !== undefined) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth *= 0.4;
    ctx.setLineDash([6, 14]);
    ctx.lineDashOffset = -((animationTime / 40) % 20);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (const point of wire.waypoints) ctx.lineTo(point.x, point.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);
  for (const point of wire.waypoints) {
    ctx.beginPath();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.arc(point.x, point.y, 2.5 * emphasisOf(palette), 0, Math.PI * 2);
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

  for (const wire of input.document.wires) drawWire(ctx, palette, input.document, input.frame, wire, input.animationTime);

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
    } else if (usesBlockBody(component.type)) {
      drawBlockBody(ctx, palette, component, ports, input.frame);
    } else if (component.type === 'D_FLIP_FLOP' || component.type === 'JK_FLIP_FLOP' || component.type === 'T_FLIP_FLOP' || component.type === 'SR_LATCH') {
      drawSequentialBody(ctx, palette, component.type, GRID_SIZE * 2, height);
      drawPinLabels(ctx, palette, component, ports);
      drawUprightText(ctx, palette, component, GATE_ABBREVIATION[component.type], GRID_SIZE, -GRID_SIZE * 0.5 - 6, `bold ${10 * fontScaleOf(palette)}px ui-monospace, monospace`);
    } else {
      drawGateBody(ctx, palette, component, GRID_SIZE * 2, height);
    }

    if (input.document.selectedIds.includes(component.id)) {
      // Drawn inside the component's own transform so the outline hugs the
      // body for every family and follows rotation and mirroring.
      const body = componentBodyRect(component, ports);
      const pad = 6;
      ctx.strokeStyle = palette.selection;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(body.x - pad, body.y - pad, body.width + pad * 2, body.height + pad * 2);
      ctx.setLineDash([]);
    }
    ctx.restore();

    drawPorts(ctx, palette, component, ports, input.frame, input.hoverPort);

    // The instance label sits under the drawn body for every family; placing
    // it by center-line arithmetic put it on top of gate and register edges.
    const labelAnchor = componentLabelAnchor(component, ports);
    ctx.fillStyle = palette.label;
    ctx.font = `${10 * fontScaleOf(palette)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(component.label, labelAnchor.x, labelAnchor.y);
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
