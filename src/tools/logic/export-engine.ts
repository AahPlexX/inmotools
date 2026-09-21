import { getComponentPorts, isSequential } from './component-library';
import { BUBBLE_RADIUS, GATE_ABBREVIATION, GATE_WIDTH, gateFamilyOf, hasOutputBubble } from './gate-shapes';
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
    parts.push(`<circle cx="${px}" cy="${py}" r="2.5" fill="${port.direction === 'output' ? '#0f766e' : '#1f2933'}" />`);
    parts.push(`<text x="${px + (port.direction === 'output' ? 6 : -6)}" y="${py - 6}" font-size="9" text-anchor="${port.direction === 'output' ? 'start' : 'end'}" fill="#52606d">${escapeXml(port.label)}</text>`);
  }
  parts.push(`<text x="${cx}" y="${cy + height / 2 + 14}" font-size="10" text-anchor="middle" fill="#334155">${escapeXml(component.label)}</text>`);
  return parts.join('');
};

export const renderSchematicSvg = (document: LogicDocument): string => {
  const box = documentBoundingBox(document.components);
  const margin = GRID_SIZE * 2;
  const titleBlockHeight = 72;
  const width = Math.max(1, box.maxX - box.minX) + margin * 2;
  const height = Math.max(1, box.maxY - box.minY) + margin * 2 + titleBlockHeight;
  const offsetX = margin - box.minX;
  const offsetY = margin - box.minY;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgNum(width)}" height="${svgNum(height)}" viewBox="0 0 ${svgNum(width)} ${svgNum(height)}" font-family="ui-monospace, Menlo, Consolas, monospace">`);
  parts.push(`<rect x="0" y="0" width="${svgNum(width)}" height="${svgNum(height)}" fill="#ffffff" />`);

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
    parts.push(`<polyline points="${pointsAttribute}" fill="none" stroke="#1f2933" stroke-width="1.5" />`);
    for (const point of wire.waypoints) parts.push(`<circle cx="${svgNum(point.x + offsetX)}" cy="${svgNum(point.y + offsetY)}" r="2" fill="#1f2933" />`);
  }

  for (const component of document.components) parts.push(renderComponentSvg(component, offsetX, offsetY));

  const meta = document.metadata;
  const titleY = height - titleBlockHeight;
  parts.push(`<g fill="#1f2933">`);
  parts.push(`<rect x="0" y="${svgNum(titleY)}" width="${svgNum(width)}" height="${svgNum(titleBlockHeight)}" fill="none" stroke="#1f2933" stroke-width="1" />`);
  parts.push(`<text x="12" y="${svgNum(titleY + 20)}" font-size="15" font-weight="700">${escapeXml(meta.title)}</text>`);
  if (meta.description) parts.push(`<text x="12" y="${svgNum(titleY + 38)}" font-size="11">${escapeXml(meta.description)}</text>`);
  parts.push(`<text x="12" y="${svgNum(titleY + 58)}" font-size="10" fill="#52606d">Author: ${escapeXml(meta.author || '—')}   Version: ${escapeXml(meta.version)}   License: ${escapeXml(meta.license)}</text>`);
  parts.push('</g>');
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
]);
const ROTATIONS = new Set([0, 90, 180, 270]);
const LICENSES = new Set(['MIT', 'CERN-OHL-P-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Unlicensed']);
const THEMES = new Set<ThemeName>(['light', 'dark', 'high-contrast', 'color-vision-safe']);
const DELAY_MODES = new Set(['ideal', 'realistic']);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isValidPortRef = (value: unknown): value is PortRef =>
  isNonEmptyRecord(value) && typeof value.componentId === 'string' && typeof value.portId === 'string';

const isValidWirePoint = (value: unknown): value is WirePoint =>
  isNonEmptyRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);

const isValidComponent = (value: unknown): value is ComponentInstance => {
  if (!isNonEmptyRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' && COMPONENT_TYPES.has(value.type as ComponentType) &&
    isFiniteNumber(value.x) && isFiniteNumber(value.y) &&
    typeof value.rotation === 'number' && ROTATIONS.has(value.rotation) &&
    typeof value.mirrored === 'boolean' &&
    typeof value.label === 'string' &&
    isNonEmptyRecord(value.params)
  );
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

  if (!Array.isArray(value.components) || !value.components.every(isValidComponent)) return false;
  if (!Array.isArray(value.wires) || !value.wires.every(isValidWire)) return false;

  const viewport = value.viewport;
  if (!isNonEmptyRecord(viewport) || !isFiniteNumber(viewport.panX) || !isFiniteNumber(viewport.panY) || !isFiniteNumber(viewport.zoom)) return false;

  const simulation = value.simulation;
  if (!isNonEmptyRecord(simulation) || typeof simulation.delayMode !== 'string' || !DELAY_MODES.has(simulation.delayMode)) return false;
  if (typeof simulation.running !== 'boolean' || !isFiniteNumber(simulation.clockDividerHz)) return false;

  if (typeof value.theme !== 'string' || !THEMES.has(value.theme as ThemeName)) return false;
  if (!Array.isArray(value.selectedIds) || !value.selectedIds.every((id) => typeof id === 'string')) return false;
  if (typeof value.updatedAt !== 'string') return false;

  const components = value.components as ComponentInstance[];
  const wires = value.wires as Wire[];
  const componentById = new Map(components.map((component) => [component.id, component]));
  for (const wire of wires) {
    const fromComponent = componentById.get(wire.from.componentId);
    const toComponent = componentById.get(wire.to.componentId);
    if (!fromComponent || !toComponent) return false;
    const fromPorts = getComponentPorts(fromComponent.type, fromComponent.params);
    const toPorts = getComponentPorts(toComponent.type, toComponent.params);
    if (!fromPorts.some((port) => port.id === wire.from.portId)) return false;
    if (!toPorts.some((port) => port.id === wire.to.portId)) return false;
  }

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
