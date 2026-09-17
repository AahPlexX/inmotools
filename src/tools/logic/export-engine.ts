import { getComponentPorts } from './component-library';
import { GATE_ABBREVIATION } from './gate-shapes';
import { componentOriginPixels, documentBoundingBox, portAbsolutePosition, GRID_SIZE } from './geometry';
import type { ComponentInstance, LogicDocument } from './logic-types';

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderComponentSvg = (component: ComponentInstance, offsetX: number, offsetY: number): string => {
  const ports = getComponentPorts(component.type, component.params);
  const origin = componentOriginPixels(component);
  const cx = origin.x + offsetX;
  const cy = origin.y + offsetY;
  const height = Math.max(2, ports.filter((port) => port.direction === 'input').length) * GRID_SIZE;
  const width = GRID_SIZE * 2;
  const parts: string[] = [];
  const transform = `translate(${cx},${cy}) rotate(${component.rotation}) scale(${component.mirrored ? -1 : 1},1)`;
  parts.push(`<g transform="${transform}">`);
  parts.push(`<rect x="-4" y="${-GRID_SIZE / 2}" width="${width + 8}" height="${height}" rx="4" fill="#f8fafc" stroke="#1f2933" stroke-width="1.5" />`);
  parts.push(`<text x="${width / 2}" y="${height / 2 - GRID_SIZE / 2 + 4}" font-size="11" text-anchor="middle" fill="#1f2933">${escapeXml(GATE_ABBREVIATION[component.type] ?? component.type)}</text>`);
  parts.push('</g>');
  for (const port of ports) {
    const position = portAbsolutePosition(component, port);
    const px = position.x + offsetX;
    const py = position.y + offsetY;
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
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, Menlo, Consolas, monospace">`);
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`);

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
    const pointsAttribute = allPoints.map((point) => `${point.x + offsetX},${point.y + offsetY}`).join(' ');
    parts.push(`<polyline points="${pointsAttribute}" fill="none" stroke="#1f2933" stroke-width="1.5" />`);
    for (const point of wire.waypoints) parts.push(`<circle cx="${point.x + offsetX}" cy="${point.y + offsetY}" r="2" fill="#1f2933" />`);
  }

  for (const component of document.components) parts.push(renderComponentSvg(component, offsetX, offsetY));

  const meta = document.metadata;
  const titleY = height - titleBlockHeight;
  parts.push(`<g fill="#1f2933">`);
  parts.push(`<rect x="0" y="${titleY}" width="${width}" height="${titleBlockHeight}" fill="none" stroke="#1f2933" stroke-width="1" />`);
  parts.push(`<text x="12" y="${titleY + 20}" font-size="15" font-weight="700">${escapeXml(meta.title)}</text>`);
  if (meta.description) parts.push(`<text x="12" y="${titleY + 38}" font-size="11">${escapeXml(meta.description)}</text>`);
  parts.push(`<text x="12" y="${titleY + 58}" font-size="10" fill="#52606d">Author: ${escapeXml(meta.author || '—')}   Version: ${escapeXml(meta.version)}   License: ${escapeXml(meta.license)}</text>`);
  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
};

export interface ProjectBundleValidation {
  readonly ok: boolean;
  readonly error?: string;
}

export const serializeProject = (document: LogicDocument): string => JSON.stringify(document, null, 2);

export const parseProject = (json: string): LogicDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error('This file is not a recognized Digital Logic Workstation project bundle.');
  }
  return parsed as LogicDocument;
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
