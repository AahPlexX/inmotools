import type {
  PhotoMask,
  PhotoSelection,
  PhotoSelectionCombineMode,
  PhotoSelectionOperation,
  PhotoSelectionSource,
} from './photo-types';

const MAX_OPERATIONS = 64;
const MAX_POLYGON_POINTS = 5000;
const EPSILON = 1e-7;
const normalizedSelectionCache = new WeakMap<PhotoSelection, PhotoSelection | null>();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function normalizeSource(source: PhotoSelectionSource): PhotoSelectionSource | null {
  if (source.type === 'rectangle') {
    const x1 = clamp(Math.min(source.x, source.x + source.width), 0, 1);
    const y1 = clamp(Math.min(source.y, source.y + source.height), 0, 1);
    const x2 = clamp(Math.max(source.x, source.x + source.width), 0, 1);
    const y2 = clamp(Math.max(source.y, source.y + source.height), 0, 1);
    return { type: 'rectangle', x: x1, y: y1, width: Math.max(0.001, x2 - x1), height: Math.max(0.001, y2 - y1) };
  }
  if (source.type === 'ellipse') {
    return {
      type: 'ellipse',
      cx: clamp(source.cx, 0, 1),
      cy: clamp(source.cy, 0, 1),
      rx: clamp(Math.abs(source.rx), 0.001, 1),
      ry: clamp(Math.abs(source.ry), 0.001, 1),
    };
  }
  if (source.type === 'polygon') {
    const points = source.points.slice(0, MAX_POLYGON_POINTS).map((point) => ({
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    }));
    return points.length >= 3 ? { type: 'polygon', points } : null;
  }
  if (source.type === 'color') {
    return {
      type: 'color',
      red: clampByte(source.red),
      green: clampByte(source.green),
      blue: clampByte(source.blue),
      tolerance: clamp(source.tolerance, 0, 1),
    };
  }
  const min = clamp(Math.min(source.min, source.max), 0, 1);
  const max = clamp(Math.max(source.min, source.max), min, 1);
  return { type: 'luminance', min, max };
}

export function normalizePhotoSelection(selection: PhotoSelection | null | undefined): PhotoSelection | null {
  if (!selection || !Array.isArray(selection.operations)) return null;
  const operations: PhotoSelectionOperation[] = [];
  for (const candidate of selection.operations.slice(0, MAX_OPERATIONS)) {
    if (!candidate?.source) continue;
    const source = normalizeSource(candidate.source);
    if (!source) continue;
    const mode: PhotoSelectionCombineMode = operations.length === 0
      ? 'replace'
      : candidate.mode === 'add' || candidate.mode === 'subtract' || candidate.mode === 'intersect'
        ? candidate.mode
        : 'replace';
    operations.push({ mode, source });
  }
  if (!operations.length) return null;
  return {
    operations,
    feather: clamp(selection.feather, 0, 0.25),
    expansion: clamp(selection.expansion, -0.25, 0.25),
    inverted: Boolean(selection.inverted),
  };
}

export function clonePhotoSelection(selection: PhotoSelection | null | undefined): PhotoSelection | null {
  const normalized = normalizePhotoSelection(selection);
  if (!normalized) return null;
  return {
    ...normalized,
    operations: normalized.operations.map((operation) => ({
      mode: operation.mode,
      source: operation.source.type === 'polygon'
        ? { ...operation.source, points: operation.source.points.map((point) => ({ ...point })) }
        : { ...operation.source },
    })),
  };
}

export function appendPhotoSelection(
  selection: PhotoSelection | null | undefined,
  source: PhotoSelectionSource,
  mode: PhotoSelectionCombineMode,
): PhotoSelection {
  const current = clonePhotoSelection(selection);
  const operations = !current || mode === 'replace'
    ? [{ mode: 'replace' as const, source }]
    : [...current.operations, { mode, source }];
  return normalizePhotoSelection({
    operations,
    feather: current?.feather ?? 0,
    expansion: current?.expansion ?? 0,
    inverted: current?.inverted ?? false,
  })!;
}

function smoothBoundary(signedDistance: number, feather: number): number {
  if (feather <= EPSILON) return signedDistance <= 0 ? 1 : 0;
  return clamp((feather - signedDistance) / (feather * 2), 0, 1);
}

function rectangleDistance(source: Extract<PhotoSelectionSource, { type: 'rectangle' }>, x: number, y: number): number {
  const cx = source.x + source.width / 2;
  const cy = source.y + source.height / 2;
  const dx = Math.abs(x - cx) - source.width / 2;
  const dy = Math.abs(y - cy) - source.height / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function ellipseDistance(source: Extract<PhotoSelectionSource, { type: 'ellipse' }>, x: number, y: number): number {
  const normalized = Math.hypot((x - source.cx) / source.rx, (y - source.cy) / source.ry) - 1;
  return normalized * Math.min(source.rx, source.ry);
}

function pointSegmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared <= EPSILON ? 0 : clamp(((x - ax) * vx + (y - ay) * vy) / lengthSquared, 0, 1);
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}

function polygonDistance(source: Extract<PhotoSelectionSource, { type: 'polygon' }>, x: number, y: number): number {
  let inside = false;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0, previous = source.points.length - 1; index < source.points.length; previous = index, index += 1) {
    const a = source.points[previous];
    const b = source.points[index];
    distance = Math.min(distance, pointSegmentDistance(x, y, a.x, a.y, b.x, b.y));
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || EPSILON) + a.x) inside = !inside;
  }
  return inside ? -distance : distance;
}

function sourceWeight(
  source: PhotoSelectionSource,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  feather: number,
  expansion: number,
): number {
  if (source.type === 'rectangle') return smoothBoundary(rectangleDistance(source, x, y) - expansion, feather);
  if (source.type === 'ellipse') return smoothBoundary(ellipseDistance(source, x, y) - expansion, feather);
  if (source.type === 'polygon') return smoothBoundary(polygonDistance(source, x, y) - expansion, feather);
  if (source.type === 'color') {
    const distance = Math.hypot(red - source.red, green - source.green, blue - source.blue) / (255 * Math.sqrt(3));
    const limit = clamp(source.tolerance + expansion, 0, 1);
    return smoothBoundary(distance - limit, feather);
  }
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  const min = clamp(source.min - expansion, 0, 1);
  const max = clamp(source.max + expansion, 0, 1);
  return Math.min(smoothBoundary(min - luminance, feather), smoothBoundary(luminance - max, feather));
}

export function photoSelectionWeight(
  selection: PhotoSelection | null | undefined,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  featherOverride?: number,
): number {
  if (!selection) return 0;
  let normalized = normalizedSelectionCache.get(selection);
  if (normalized === undefined) {
    normalized = normalizePhotoSelection(selection);
    normalizedSelectionCache.set(selection, normalized);
  }
  if (!normalized) return 0;
  const feather = featherOverride === undefined ? normalized.feather : clamp(featherOverride, 0, 0.25);
  let weight = 0;
  for (const operation of normalized.operations) {
    const incoming = sourceWeight(operation.source, x, y, red, green, blue, feather, normalized.expansion);
    if (operation.mode === 'replace') weight = incoming;
    else if (operation.mode === 'add') weight = Math.max(weight, incoming);
    else if (operation.mode === 'subtract') weight *= 1 - incoming;
    else weight = Math.min(weight, incoming);
  }
  return normalized.inverted ? 1 - weight : weight;
}

export function photoSelectionMask(selection: PhotoSelection): Extract<PhotoMask, { type: 'selection' }> {
  const normalized = normalizePhotoSelection(selection);
  if (!normalized) throw new Error('A non-empty selection is required.');
  return { type: 'selection', selection: normalized, feather: normalized.feather, opacity: 1, invert: false };
}
