import { isBusPort, portBits, portWidth } from './bus-engine';
import { buildNetlist } from './netlist-engine';
import { expandedSize, MAX_EXPANDED_COMPONENTS, MAX_SUBCIRCUIT_DEPTH } from './subcircuit-engine';
import { isMatrixType, matrixSizeOf, pixelRects } from './matrix-engine';
import { isMemoryType, isValidMemoryParams } from './memory-engine';
import { getComponentPorts, isSequential } from './component-library';
import { isDisplayType } from './display-engine';
import { digitGeometries } from './segment-shapes';
import { BUBBLE_RADIUS, blockCaption, componentBodyRect, componentLabelAnchor, componentWorldBounds, GATE_ABBREVIATION, GATE_WIDTH, gateFamilyOf, hasOutputBubble, usesBlockBody } from './gate-shapes';
import { componentOriginPixels, documentBoundingBox, portAbsolutePosition, GRID_SIZE } from './geometry';
import type { ComponentInstance, ComponentType, LogicDocument, PortRef, ThemeName, Wire, WirePoint } from './logic-types';

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Coerces a value that must already be a finite number to one, defending exported SVG attributes against a corrupted or crafted document reaching this renderer. */
const svgNum = (value: number): number => (Number.isFinite(value) ? value : 0);

const GATE_FILL = '#f8fafc';
const GATE_STROKE = '#1f2933';

const renderGateBodySvg = (type: ComponentType, height: number): string => {
  const family = gateFamilyOf(type);
  const width = GATE_WIDTH;
  const bubble = hasOutputBubble(type);
  const parts: string[] = [];
  if (family === 'and') {
    const straightWidth = width * 0.55;
    const radius = height / 2;
    parts.push(`<path d="M0,0 H${straightWidth} A${radius},${radius} 0 0 1 ${straightWidth},${height} H0 Z" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    if (bubble) parts.push(`<circle cx="${straightWidth + radius + BUBBLE_RADIUS}" cy="${height / 2}" r="${BUBBLE_RADIUS}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
  } else if (family === 'or' || family === 'xor') {
    const backInset = family === 'xor' ? 8 : 0;
    parts.push(`<path d="M${backInset},0 Q${width * 0.32},${height / 2} ${backInset},${height} Q${width * 0.72},${height} ${width},${height / 2} Q${width * 0.72},0 ${backInset},0 Z" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    if (family === 'xor') parts.push(`<path d="M-6,0 Q${width * 0.32 - 6},${height / 2} -6,${height}" fill="none" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    if (bubble) parts.push(`<circle cx="${width + BUBBLE_RADIUS}" cy="${height / 2}" r="${BUBBLE_RADIUS}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
  } else if (family === 'tri-state') {
    parts.push(`<path d="M0,0 L0,${height} L${width * 0.85},${height / 2} Z" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    parts.push(`<line x1="${width * 0.3}" y1="${height * 0.85}" x2="${width * 0.3}" y2="${height + 6}" stroke="${GATE_STROKE}" stroke-width="1.2" />`);
  } else {
    parts.push(`<path d="M0,0 L0,${height} L${width * 0.85},${height / 2} Z" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    if (bubble) parts.push(`<circle cx="${width * 0.85 + BUBBLE_RADIUS}" cy="${height / 2}" r="${BUBBLE_RADIUS}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
  }
  return parts.join('');
};

const renderIoBodySvg = (component: ComponentInstance): string => {
  if (component.type === 'SWITCH') {
    const knobX = (component.params.initialLevel ?? 0) === 1 ? GRID_SIZE * 1.15 : GRID_SIZE * 0.45;
    return `<rect x="0" y="${-GRID_SIZE * 0.6}" width="${GRID_SIZE * 1.6}" height="${GRID_SIZE * 1.2}" rx="8" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" /><circle cx="${knobX}" cy="0" r="${GRID_SIZE * 0.4}" fill="#94a3b8" />`;
  }
  if (component.type === 'PUSH_BUTTON') {
    return `<circle cx="${GRID_SIZE * 0.5}" cy="0" r="${GRID_SIZE * 0.7}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`;
  }
  if (component.type === 'CLOCK') {
    return `<rect x="0" y="${-GRID_SIZE * 0.6}" width="${GRID_SIZE * 1.6}" height="${GRID_SIZE * 1.2}" rx="6" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" /><path d="M${GRID_SIZE * 0.15},0 H${GRID_SIZE * 0.5} V${-GRID_SIZE * 0.35} H${GRID_SIZE * 0.9} V0 H${GRID_SIZE * 1.3}" fill="none" stroke="${GATE_STROKE}" stroke-width="2" />`;
  }
  if (component.type === 'LED') {
    return `<circle cx="${GRID_SIZE * 0.5}" cy="0" r="${GRID_SIZE * 0.6}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="2" />`;
  }
  return `<path d="M${GRID_SIZE * 0.5},${-GRID_SIZE * 0.5} L${GRID_SIZE},0 L${GRID_SIZE * 0.5},${GRID_SIZE * 0.5} L0,0 Z" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`;
};

const renderComponentSvg = (component: ComponentInstance, offsetX: number, offsetY: number): string => {
  const ports = getComponentPorts(component.type, component.params);
  const origin = componentOriginPixels(component);
  const cx = svgNum(origin.x + offsetX);
  const cy = svgNum(origin.y + offsetY);
  const height = Math.max(2, ports.filter((port) => port.direction === 'input').length) * GRID_SIZE;
  const width = GATE_WIDTH;
  const parts: string[] = [];
  const rotation = svgNum(component.rotation);
  const scaleX = component.mirrored ? -1 : 1;
  parts.push(`<g transform="translate(${cx},${cy}) rotate(${rotation}) scale(${scaleX},1)">`);
  if (component.type === 'SWITCH' || component.type === 'PUSH_BUTTON' || component.type === 'CLOCK' || component.type === 'LED' || component.type === 'PROBE') {
    parts.push(renderIoBodySvg(component));
  } else if (usesBlockBody(component.type)) {
    const body = componentBodyRect(component, ports);
    parts.push(`<rect x="${body.x}" y="${body.y}" width="${body.width}" height="${body.height}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    // A schematic has no live signal, so the digits are drawn with every segment unlit.
    if (isDisplayType(component.type)) {
      for (const digit of digitGeometries(component.type, body)) {
        for (const segment of digit.segments) {
          parts.push(`<polygon points="${segment.points.map((point) => `${svgNum(point.x)},${svgNum(point.y)}`).join(' ')}" fill="#cbd5e1" />`);
        }
        parts.push(`<circle cx="${svgNum(digit.dot.cx)}" cy="${svgNum(digit.dot.cy)}" r="${svgNum(digit.dot.r)}" fill="#cbd5e1" />`);
      }
    }
    if (component.type === 'SUBCIRCUIT') {
      // The icon, upright like the caption, centered in the body.
      const iconTurn = component.rotation === 180 ? 180 : 0;
      parts.push(`<text transform="translate(${svgNum(body.x + body.width / 2)},${svgNum(body.y + body.height / 2 + 8)}) rotate(${iconTurn}) scale(${scaleX},1)" font-size="24" text-anchor="middle" fill="${GATE_STROKE}">${escapeXml(component.params.subcircuit?.icon ?? '')}</text>`);
    }
    if (isMatrixType(component.type)) {
      for (const rect of pixelRects(matrixSizeOf(component.params), body)) {
        parts.push(`<rect x="${svgNum(rect.x + 1)}" y="${svgNum(rect.y + 1)}" width="${svgNum(Math.max(1, rect.size - 2))}" height="${svgNum(Math.max(1, rect.size - 2))}" rx="1.5" fill="#cbd5e1" />`);
      }
    }
    // Undo the group's mirror and 180-degree turn for the text alone, as the canvas does, so the caption never reads backwards or upside down.
    const captionTurn = component.rotation === 180 ? 180 : 0;
    parts.push(`<text transform="translate(${svgNum(body.width / 2)},${svgNum(body.y - 6)}) rotate(${captionTurn}) scale(${scaleX},1)" font-size="11" font-weight="700" text-anchor="middle" fill="${GATE_STROKE}">${escapeXml(blockCaption(component))}</text>`);
  } else if (isSequential(component.type)) {
    parts.push(`<rect x="0" y="${-GRID_SIZE * 0.5}" width="${width}" height="${height + GRID_SIZE}" fill="${GATE_FILL}" stroke="${GATE_STROKE}" stroke-width="1.5" />`);
    parts.push(`<text x="${width / 2}" y="${height / 2}" font-size="11" text-anchor="middle" fill="${GATE_STROKE}">${escapeXml(GATE_ABBREVIATION[component.type] ?? component.type)}</text>`);
  } else {
    parts.push(renderGateBodySvg(component.type, height));
  }
  parts.push('</g>');
  for (const port of ports) {
    const position = portAbsolutePosition(component, port);
    const px = svgNum(position.x + offsetX);
    const py = svgNum(position.y + offsetY);
    const pinFill = port.direction === 'output' ? '#0f766e' : '#1f2933';
    // A bus pin is a square, as on the canvas, so a multi-bit connection is recognisable in print without color.
    parts.push(isBusPort(port)
      ? `<rect x="${svgNum(position.x + offsetX - 3.5)}" y="${svgNum(position.y + offsetY - 3.5)}" width="7" height="7" fill="${pinFill}" />`
      : `<circle cx="${px}" cy="${py}" r="2.5" fill="${pinFill}" />`);
    parts.push(`<text x="${px + (port.x > 0 ? 6 : -6)}" y="${py - 6}" font-size="9" text-anchor="${port.x > 0 ? 'start' : 'end'}" fill="#52606d">${escapeXml(port.label)}</text>`);
  }
  const labelAnchor = componentLabelAnchor(component, ports);
  parts.push(`<text x="${svgNum(labelAnchor.x + offsetX)}" y="${svgNum(labelAnchor.y + offsetY)}" font-size="10" text-anchor="middle" fill="#334155">${escapeXml(component.label)}</text>`);
  return parts.join('');
};

export interface SchematicSvgOptions {
  /** Writes each part's reference designator (`U1`, `SW2`) above it. */
  readonly designators?: boolean;
  /** Writes the name of each named net on one of its wires. */
  readonly netLabels?: boolean;
  /** Draws a drawing-sheet border with lettered columns and numbered rows around the schematic. */
  readonly sheet?: boolean;
}

/** Room for the sheet border and its zone labels around the schematic. */
const SHEET_PADDING = 40;

const zoneLabel = (index: number): string => String.fromCharCode(65 + (index % 26));

/** The lettered column and numbered row zones of a drawing sheet, between an outer and an inner frame. */
const sheetFrame = (totalWidth: number, totalHeight: number): string[] => {
  const outer = 6;
  const inner = SHEET_PADDING - 10;
  const columns = Math.max(2, Math.round((totalWidth - inner * 2) / 160));
  const rows = Math.max(2, Math.round((totalHeight - inner * 2) / 120));
  const lines: string[] = [];
  lines.push(`<rect x="${outer}" y="${outer}" width="${svgNum(totalWidth - outer * 2)}" height="${svgNum(totalHeight - outer * 2)}" fill="none" stroke="#1f2933" stroke-width="1.5" />`);
  lines.push(`<rect x="${inner}" y="${inner}" width="${svgNum(totalWidth - inner * 2)}" height="${svgNum(totalHeight - inner * 2)}" fill="none" stroke="#1f2933" stroke-width="1" />`);
  const columnWidth = (totalWidth - inner * 2) / columns;
  const rowHeight = (totalHeight - inner * 2) / rows;
  for (let index = 0; index < columns; index += 1) {
    const x = inner + columnWidth * index;
    if (index > 0) {
      lines.push(`<line x1="${svgNum(x)}" y1="${outer}" x2="${svgNum(x)}" y2="${inner}" stroke="#1f2933" stroke-width="1" />`);
      lines.push(`<line x1="${svgNum(x)}" y1="${svgNum(totalHeight - inner)}" x2="${svgNum(x)}" y2="${svgNum(totalHeight - outer)}" stroke="#1f2933" stroke-width="1" />`);
    }
    const center = x + columnWidth / 2;
    lines.push(`<text x="${svgNum(center)}" y="${svgNum(inner - 7)}" font-size="10" text-anchor="middle" fill="#52606d">${zoneLabel(index)}</text>`);
    lines.push(`<text x="${svgNum(center)}" y="${svgNum(totalHeight - outer - 6)}" font-size="10" text-anchor="middle" fill="#52606d">${zoneLabel(index)}</text>`);
  }
  for (let index = 0; index < rows; index += 1) {
    const y = inner + rowHeight * index;
    if (index > 0) {
      lines.push(`<line x1="${outer}" y1="${svgNum(y)}" x2="${inner}" y2="${svgNum(y)}" stroke="#1f2933" stroke-width="1" />`);
      lines.push(`<line x1="${svgNum(totalWidth - inner)}" y1="${svgNum(y)}" x2="${svgNum(totalWidth - outer)}" y2="${svgNum(y)}" stroke="#1f2933" stroke-width="1" />`);
    }
    const center = y + rowHeight / 2 + 3;
    lines.push(`<text x="${svgNum((outer + inner) / 2)}" y="${svgNum(center)}" font-size="10" text-anchor="middle" fill="#52606d">${index + 1}</text>`);
    lines.push(`<text x="${svgNum(totalWidth - (outer + inner) / 2)}" y="${svgNum(center)}" font-size="10" text-anchor="middle" fill="#52606d">${index + 1}</text>`);
  }
  return lines;
};

export const renderSchematicSvg = (document: LogicDocument, options: SchematicSvgOptions = {}): string => {
  const box = documentBoundingBox(document.components);
  const margin = GRID_SIZE * 2;
  const titleBlockHeight = 72;
  const pad = options.sheet ? SHEET_PADDING : 0;
  const width = Math.max(1, box.maxX - box.minX) + margin * 2;
  const height = Math.max(1, box.maxY - box.minY) + margin * 2 + titleBlockHeight;
  const totalWidth = width + pad * 2;
  const totalHeight = height + pad * 2;
  const offsetX = margin - box.minX;
  const offsetY = margin - box.minY;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgNum(totalWidth)}" height="${svgNum(totalHeight)}" viewBox="0 0 ${svgNum(totalWidth)} ${svgNum(totalHeight)}" font-family="ui-monospace, Menlo, Consolas, monospace">`);
  parts.push(`<rect x="0" y="0" width="${svgNum(totalWidth)}" height="${svgNum(totalHeight)}" fill="#ffffff" />`);
  if (options.sheet) parts.push(...sheetFrame(totalWidth, totalHeight));
  if (pad > 0) parts.push(`<g transform="translate(${pad},${pad})">`);

  // The reference designators and net names come from the same netlist the text exporters use.
  const netlist = options.designators || options.netLabels ? buildNetlist(document) : undefined;
  const partById = new Map((netlist?.parts ?? []).map((part) => [part.id, part] as const));
  const labeledNets = new Set<number>();
  const netLabels: string[] = [];

  for (const wire of document.wires) {
    const fromComponent = document.components.find((component) => component.id === wire.from.componentId);
    const toComponent = document.components.find((component) => component.id === wire.to.componentId);
    if (!fromComponent || !toComponent) continue;
    const fromPort = getComponentPorts(fromComponent.type, fromComponent.params).find((port) => port.id === wire.from.portId);
    const toPort = getComponentPorts(toComponent.type, toComponent.params).find((port) => port.id === wire.to.portId);
    if (!fromPort || !toPort) continue;
    const start = portAbsolutePosition(fromComponent, fromPort);
    const end = portAbsolutePosition(toComponent, toPort);
    const allPoints = [start, ...wire.waypoints, end];
    const pointsAttribute = allPoints.map((point) => `${svgNum(point.x + offsetX)},${svgNum(point.y + offsetY)}`).join(' ');
    const busWidth = portWidth(fromPort);
    parts.push(`<polyline points="${pointsAttribute}" fill="none" stroke="#1f2933" stroke-width="${busWidth > 1 ? 4 : 1.5}" />`);
    if (busWidth > 1) {
      // The slash-and-count mark that engineers draw on a bus, placed on the wire's middle segment.
      const middle = Math.floor((allPoints.length - 1) / 2);
      const a = allPoints[middle]!;
      const b = allPoints[middle + 1]!;
      const mx = (a.x + b.x) / 2 + offsetX;
      const my = (a.y + b.y) / 2 + offsetY;
      parts.push(`<line x1="${svgNum(mx - 4)}" y1="${svgNum(my + 6)}" x2="${svgNum(mx + 4)}" y2="${svgNum(my - 6)}" stroke="#ffffff" stroke-width="1.5" />`);
      parts.push(`<text x="${svgNum(mx)}" y="${svgNum(my - 8)}" font-size="9" text-anchor="middle" fill="#1f2933">${busWidth}</text>`);
    }
    for (const point of wire.waypoints) parts.push(`<circle cx="${svgNum(point.x + offsetX)}" cy="${svgNum(point.y + offsetY)}" r="2" fill="#1f2933" />`);

    // A named net is labelled once, on the longest run of the first wire found for it.
    const netPart = partById.get(fromComponent.id);
    if (options.netLabels && netlist && netPart) {
      const pinId = fromPort.bus ? portBits(fromPort)[0]! : fromPort.id;
      const pin = netPart.pins.find((candidate) => candidate.id === pinId);
      const net = pin ? netlist.nets[pin.net] : undefined;
      if (net && pin && !labeledNets.has(net.index) && net.members.length >= 2 && !/^n\d+$/.test(net.name)) {
        labeledNets.add(net.index);
        let best = { length: -1, from: allPoints[0]!, to: allPoints[1]! };
        for (let index = 0; index < allPoints.length - 1; index += 1) {
          const length = Math.hypot(allPoints[index + 1]!.x - allPoints[index]!.x, allPoints[index + 1]!.y - allPoints[index]!.y);
          if (length > best.length) best = { length, from: allPoints[index]!, to: allPoints[index + 1]! };
        }
        const text = net.bit === undefined ? net.name : `${net.name}[${net.bit}]`;
        netLabels.push(`<text x="${svgNum((best.from.x + best.to.x) / 2 + offsetX)}" y="${svgNum((best.from.y + best.to.y) / 2 + offsetY - 4)}" font-size="8" text-anchor="middle" fill="#1d4ed8">${escapeXml(text)}</text>`);
      }
    }
  }

  for (const component of document.components) parts.push(renderComponentSvg(component, offsetX, offsetY));
  parts.push(...netLabels);

  if (options.designators) {
    for (const component of document.components) {
      const part = partById.get(component.id);
      if (!part) continue;
      const bounds = componentWorldBounds(component, getComponentPorts(component.type, component.params));
      parts.push(`<text x="${svgNum(bounds.minX + offsetX)}" y="${svgNum(bounds.minY + offsetY - 5)}" font-size="9" font-weight="700" fill="#9a3412">${escapeXml(part.ref)}</text>`);
    }
  }

  const meta = document.metadata;
  const titleY = height - titleBlockHeight;
  parts.push(`<g fill="#1f2933">`);
  parts.push(`<rect x="0" y="${svgNum(titleY)}" width="${svgNum(width)}" height="${svgNum(titleBlockHeight)}" fill="none" stroke="#1f2933" stroke-width="1" />`);
  parts.push(`<text x="12" y="${svgNum(titleY + 20)}" font-size="15" font-weight="700">${escapeXml(meta.title)}</text>`);
  if (meta.description) parts.push(`<text x="12" y="${svgNum(titleY + 38)}" font-size="11">${escapeXml(meta.description)}</text>`);
  parts.push(`<text x="12" y="${svgNum(titleY + 58)}" font-size="10" fill="#52606d">Author: ${escapeXml(meta.author || '—')}   Version: ${escapeXml(meta.version)}   License: ${escapeXml(meta.license)}</text>`);
  parts.push('</g>');
  if (pad > 0) parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
};

export interface ProjectBundleValidation {
  readonly ok: boolean;
  readonly error?: string;
}

export const serializeProject = (document: LogicDocument): string => JSON.stringify(document, null, 2);

const COMPONENT_TYPES = new Set<ComponentType>([
  'AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUFFER', 'TRI_BUFFER',
  'SWITCH', 'PUSH_BUTTON', 'CLOCK', 'LED', 'PROBE',
  'D_FLIP_FLOP', 'JK_FLIP_FLOP', 'T_FLIP_FLOP', 'SR_LATCH',
  'MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER', 'BCD_7SEG',
  'COUNTER', 'REGISTER', 'SEVEN_SEGMENT', 'SEVEN_SEGMENT_4', 'SIXTEEN_SEGMENT', 'BUS_SPLITTER', 'ALU', 'RAM', 'ROM', 'RGB_MATRIX', 'SUBCIRCUIT', 'PORT_IN', 'PORT_OUT',
]);
const ROTATIONS = new Set([0, 90, 180, 270]);
const LICENSES = new Set(['MIT', 'CERN-OHL-P-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Unlicensed']);
const THEMES = new Set<ThemeName>(['light', 'dark', 'high-contrast', 'color-vision-safe', 'junior-explorer']);
const DELAY_MODES = new Set(['ideal', 'realistic']);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isValidPortRef = (value: unknown): value is PortRef =>
  isNonEmptyRecord(value) && typeof value.componentId === 'string' && typeof value.portId === 'string';

const isValidWirePoint = (value: unknown): value is WirePoint =>
  isNonEmptyRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);

const isValidComponent = (value: unknown, depth = 0): value is ComponentInstance => {
  if (!isNonEmptyRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' && COMPONENT_TYPES.has(value.type as ComponentType) &&
    isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
    typeof value.rotation === 'number' && ROTATIONS.has(value.rotation) &&
    typeof value.mirrored === 'boolean' &&
    typeof value.label === 'string' &&
    isNonEmptyRecord(value.params) &&
    (!isMemoryType(value.type as ComponentType) || isValidMemoryParams(value.params)) &&
    (value.type !== 'SUBCIRCUIT' || isValidSubcircuit(value.params.subcircuit, depth + 1))
  );
};

/** Whether every wire ends on a part and pin that exist and joins a bus only to a bus of the same width. */
const wiresResolve = (components: readonly ComponentInstance[], wires: readonly Wire[]): boolean => {
  const componentById = new Map(components.map((component) => [component.id, component] as const));
  for (const wire of wires) {
    const fromComponent = componentById.get(wire.from.componentId);
    const toComponent = componentById.get(wire.to.componentId);
    if (!fromComponent || !toComponent) return false;
    const fromPort = getComponentPorts(fromComponent.type, fromComponent.params).find((port) => port.id === wire.from.portId);
    const toPort = getComponentPorts(toComponent.type, toComponent.params).find((port) => port.id === wire.to.portId);
    if (!fromPort || !toPort) return false;
    // A hand-edited file must not join a bus to a single pin or to a bus of another width.
    if (isBusPort(fromPort) !== isBusPort(toPort) || portWidth(fromPort) !== portWidth(toPort)) return false;
  }
  return true;
};

/**
 * A subcircuit's stored circuit must be as sound as the project around it: real parts, wires that resolve, a
 * bounded depth, and a bounded size once every nested subcircuit is expanded, so a crafted file cannot make the
 * simulator build an enormous circuit.
 */
const isValidSubcircuit = (value: unknown, depth: number): boolean => {
  if (depth > MAX_SUBCIRCUIT_DEPTH || !isNonEmptyRecord(value)) return false;
  if (typeof value.name !== 'string' || value.name.length > 200 || typeof value.icon !== 'string' || value.icon.length > 16) return false;
  if (!Array.isArray(value.components) || !value.components.every((component) => isValidComponent(component, depth))) return false;
  if (!Array.isArray(value.wires) || !value.wires.every(isValidWire)) return false;
  if (value.viewport !== undefined && !(isNonEmptyRecord(value.viewport) && isFiniteNumber(value.viewport.panX) && isFiniteNumber(value.viewport.panY) && isFiniteNumber(value.viewport.zoom))) return false;
  if (value.selectedIds !== undefined && !(Array.isArray(value.selectedIds) && value.selectedIds.every((id) => typeof id === 'string'))) return false;
  if (expandedSize(value.components as ComponentInstance[], depth) > MAX_EXPANDED_COMPONENTS) return false;
  return wiresResolve(value.components as ComponentInstance[], value.wires as Wire[]);
};

const isValidWire = (value: unknown): value is Wire =>
  isNonEmptyRecord(value) &&
  typeof value.id === 'string' &&
  isValidPortRef(value.from) &&
  isValidPortRef(value.to) &&
  Array.isArray(value.waypoints) && value.waypoints.every(isValidWirePoint);

/**
 * A structural type guard for an imported project bundle. This is not a
 * full schema validator for every gate parameter (those already degrade
 * safely through clamped defaults), but it guarantees every field that
 * frame initialization, simulation, rendering, and export dereference
 * without a guard actually exists with the right shape, and that every
 * wire references a component and port that really exist — closing the
 * crash and SVG-injection surface a bare `schemaVersion` check left open.
 */
const isValidLogicDocument = (value: unknown): value is LogicDocument => {
  if (!isNonEmptyRecord(value)) return false;
  if (value.schemaVersion !== 1 || typeof value.id !== 'string') return false;

  const metadata = value.metadata;
  if (!isNonEmptyRecord(metadata)) return false;
  if (typeof metadata.title !== 'string' || typeof metadata.author !== 'string' || typeof metadata.description !== 'string' || typeof metadata.version !== 'string') return false;
  if (typeof metadata.license !== 'string' || !LICENSES.has(metadata.license)) return false;
  if (!Array.isArray(metadata.tags) || !metadata.tags.every((tag) => typeof tag === 'string')) return false;

  if (!Array.isArray(value.components) || !value.components.every((component) => isValidComponent(component))) return false;
  if (!Array.isArray(value.wires) || !value.wires.every(isValidWire)) return false;

  const viewport = value.viewport;
  if (!isNonEmptyRecord(viewport) || !isFiniteNumber(viewport.panX) || !isFiniteNumber(viewport.panY) || !isFiniteNumber(viewport.zoom)) return false;

  const simulation = value.simulation;
  if (!isNonEmptyRecord(simulation) || typeof simulation.delayMode !== 'string' || !DELAY_MODES.has(simulation.delayMode)) return false;
  if (typeof simulation.running !== 'boolean' || !isFiniteNumber(simulation.clockDividerHz)) return false;

  if (typeof value.theme !== 'string' || !THEMES.has(value.theme as ThemeName)) return false;
  if (!Array.isArray(value.selectedIds) || !value.selectedIds.every((id) => typeof id === 'string')) return false;
  if (typeof value.updatedAt !== 'string') return false;

  if (expandedSize(value.components as ComponentInstance[]) > MAX_EXPANDED_COMPONENTS) return false;
  if (!wiresResolve(value.components as ComponentInstance[], value.wires as Wire[])) return false;

  return true;
};

export const parseProject = (json: string): LogicDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isValidLogicDocument(parsed)) {
    throw new Error('This file is not a valid Digital Logic Workstation project bundle. It may be corrupted, hand-edited incorrectly, or from an incompatible version.');
  }
  return parsed;
};

export const validateProjectJson = (json: string): ProjectBundleValidation => {
  try {
    parseProject(json);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown validation error.' };
  }
};

export const projectFileName = (document: LogicDocument, extension: string): string => {
  const slug = document.metadata.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'circuit';
  return `${slug}.${extension}`;
};
