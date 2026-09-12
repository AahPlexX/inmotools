import type { CrystalDocument, Vec3 } from './crystal-types';
import {
  buildCrystalRenderModel,
  defaultRenderOptions,
  type CrystalRepresentation,
} from './viewport-model';

export interface CrystalSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly showCell: boolean;
  readonly showLabels?: boolean;
  readonly background: string;
  readonly representation?: CrystalRepresentation;
}

export interface CrystalPngOptions {
  readonly width: number;
  readonly height: number;
  readonly background: string;
}

export interface CrystalPngDimensions {
  readonly width: number;
  readonly height: number;
  readonly reduced: boolean;
}

export const MAX_CRYSTAL_PNG_DIMENSION = 4_096;
export const MAX_CRYSTAL_PNG_PIXELS = 16_777_216;

const SVG_MIN_DIMENSION = 64;
const SVG_MAX_DIMENSION = 8_192;
const SQRT_THREE_OVER_TWO = Math.sqrt(3) / 2;

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
  return value;
}

function integerDimension(value: number, label: string): number {
  finitePositive(value, label);
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return rounded;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validatedBackground(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'transparent') return trimmed;
  if (/^#[0-9a-f]{3,8}$/iu.test(trimmed)) return trimmed;
  if (/^[a-z]+$/iu.test(trimmed)) return trimmed;
  throw new RangeError(`Unsupported publication background: ${value}`);
}

interface Point2 {
  readonly x: number;
  readonly y: number;
}

function projectIsometric([x, y, z]: Vec3): Point2 {
  return {
    x: (x - z) * SQRT_THREE_OVER_TWO,
    y: y - (x + z) * 0.5,
  };
}

function svgNumber(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  return Number(value.toFixed(3)).toString();
}

export function buildCrystalSvg(document: CrystalDocument, options: CrystalSvgOptions): string {
  const width = integerDimension(options.width, 'SVG width');
  const height = integerDimension(options.height, 'SVG height');
  if (width < SVG_MIN_DIMENSION || height < SVG_MIN_DIMENSION) {
    throw new RangeError(`SVG dimensions must be at least ${SVG_MIN_DIMENSION} px.`);
  }
  if (width > SVG_MAX_DIMENSION || height > SVG_MAX_DIMENSION) {
    throw new RangeError(`SVG dimensions cannot exceed ${SVG_MAX_DIMENSION} px.`);
  }

  const background = validatedBackground(options.background);
  const representation = options.representation ?? 'ball-stick';
  const model = buildCrystalRenderModel(document, {
    ...defaultRenderOptions,
    representation,
    selectedSiteIds: new Set<string>(),
  });

  const projectedAtoms = model.atoms.map((atom) => ({ atom, point: projectIsometric(atom.position) }));
  const projectedBonds = model.bonds.map((bond) => ({
    bond,
    start: projectIsometric(bond.start),
    end: projectIsometric(bond.end),
  }));
  const projectedCell = model.cellEdges.map(([start, end]) => ({
    start: projectIsometric(start),
    end: projectIsometric(end),
  }));

  const allPoints: Point2[] = [];
  projectedAtoms.forEach(({ point }) => allPoints.push(point));
  projectedBonds.forEach(({ start, end }) => allPoints.push(start, end));
  if (options.showCell) projectedCell.forEach(({ start, end }) => allPoints.push(start, end));
  if (!allPoints.length) allPoints.push({ x: -1, y: -1 }, { x: 1, y: 1 });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of allPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const margin = Math.max(24, Math.min(width, height) * 0.07);
  const drawableWidth = Math.max(1, width - margin * 2);
  const drawableHeight = Math.max(1, height - margin * 2);
  const scale = Math.min(drawableWidth / spanX, drawableHeight / spanY);
  const contentWidth = spanX * scale;
  const contentHeight = spanY * scale;
  const offsetX = (width - contentWidth) / 2 - minX * scale;
  const offsetY = (height - contentHeight) / 2 + maxY * scale;

  const map = (point: Point2): Point2 => ({
    x: offsetX + point.x * scale,
    y: offsetY - point.y * scale,
  });

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(document.metadata.title ?? document.name)}</title>`,
    `<desc id="desc">Vector crystal structure showing ${document.sites.length} atomic sites.</desc>`,
  ];

  if (background !== 'transparent') {
    lines.push(`<rect width="${width}" height="${height}" fill="${escapeXml(background)}"/>`);
  }

  lines.push('<g id="crystal-structure" stroke-linecap="round" stroke-linejoin="round">');

  if (options.showCell) {
    lines.push('<g id="unit-cell" fill="none" stroke="#64748b" stroke-width="1.25" opacity="0.8">');
    for (const edge of projectedCell) {
      const start = map(edge.start);
      const end = map(edge.end);
      lines.push(`<line x1="${svgNumber(start.x)}" y1="${svgNumber(start.y)}" x2="${svgNumber(end.x)}" y2="${svgNumber(end.y)}"/>`);
    }
    lines.push('</g>');
  }

  if (projectedBonds.length) {
    lines.push('<g id="bonds" fill="none" stroke="#7f8794" opacity="0.82">');
    for (const item of projectedBonds) {
      const start = map(item.start);
      const end = map(item.end);
      const strokeWidth = Math.max(1.25, Math.min(8, item.bond.radius * scale * 0.45));
      lines.push(`<line x1="${svgNumber(start.x)}" y1="${svgNumber(start.y)}" x2="${svgNumber(end.x)}" y2="${svgNumber(end.y)}" stroke-width="${svgNumber(strokeWidth)}"/>`);
    }
    lines.push('</g>');
  }

  lines.push('<g id="atoms">');
  for (const { atom, point } of projectedAtoms) {
    const mapped = map(point);
    const radius = Math.max(3, Math.min(30, atom.radius * scale * 0.5));
    lines.push(`<circle cx="${svgNumber(mapped.x)}" cy="${svgNumber(mapped.y)}" r="${svgNumber(radius)}" fill="${escapeXml(atom.color)}" stroke="#111827" stroke-width="0.8"/>`);
  }
  lines.push('</g>');

  if (options.showLabels !== false) {
    lines.push('<g id="labels" fill="#111827" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" font-weight="600">');
    for (const { atom, point } of projectedAtoms) {
      const mapped = map(point);
      const radius = Math.max(3, Math.min(30, atom.radius * scale * 0.5));
      lines.push(`<text x="${svgNumber(mapped.x + radius + 4)}" y="${svgNumber(mapped.y - radius - 3)}">${escapeXml(atom.label)}</text>`);
    }
    lines.push('</g>');
  }

  lines.push('</g>', '</svg>');
  return `${lines.join('\n')}\n`;
}

export function fitCrystalPngDimensions(width: number, height: number): CrystalPngDimensions {
  const requestedWidth = integerDimension(width, 'PNG width');
  const requestedHeight = integerDimension(height, 'PNG height');
  const dimensionScale = Math.min(
    1,
    MAX_CRYSTAL_PNG_DIMENSION / requestedWidth,
    MAX_CRYSTAL_PNG_DIMENSION / requestedHeight,
  );
  const pixelScale = Math.min(1, Math.sqrt(MAX_CRYSTAL_PNG_PIXELS / (requestedWidth * requestedHeight)));
  const scale = Math.min(dimensionScale, pixelScale);
  const fittedWidth = Math.max(1, Math.floor(requestedWidth * scale));
  const fittedHeight = Math.max(1, Math.floor(requestedHeight * scale));
  return {
    width: fittedWidth,
    height: fittedHeight,
    reduced: fittedWidth !== requestedWidth || fittedHeight !== requestedHeight,
  };
}

export async function exportCrystalPng(viewport: HTMLCanvasElement, options: CrystalPngOptions): Promise<Blob> {
  if (!(viewport instanceof HTMLCanvasElement)) throw new TypeError('PNG export requires a canvas viewport.');
  if (viewport.width <= 0 || viewport.height <= 0) throw new RangeError('PNG export source canvas has no rendered pixels.');
  const background = validatedBackground(options.background);
  const fitted = fitCrystalPngDimensions(options.width, options.height);
  const output = document.createElement('canvas');
  output.width = fitted.width;
  output.height = fitted.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for PNG export.');

  context.clearRect(0, 0, fitted.width, fitted.height);
  if (background !== 'transparent') {
    context.fillStyle = background;
    context.fillRect(0, 0, fitted.width, fitted.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(viewport, 0, 0, fitted.width, fitted.height);

  return new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Browser could not encode the crystal view as PNG.'));
    }, 'image/png');
  });
}
