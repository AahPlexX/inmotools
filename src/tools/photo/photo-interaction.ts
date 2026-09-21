import { normalizeRecipe } from './photo-engine';
import type { PhotoRecipe } from './photo-types';

export interface PhotoGesturePoint {
  x: number;
  y: number;
  pressure?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizedPoint(point: PhotoGesturePoint) {
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

interface WeightedPoint {
  x: number;
  y: number;
  pressure: number;
}

// Softens the interior of a captured path while keeping its first and last points
// exact, so smoothing steadies a shaky hand without moving where the stroke starts
// or where the pointer actually lifted.
function smoothBrushPath(path: WeightedPoint[], smoothing: number): WeightedPoint[] {
  if (path.length < 3 || smoothing <= 0) return path;
  const result: WeightedPoint[] = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = result[index - 1];
    const raw = path[index];
    result.push({
      x: smoothing * previous.x + (1 - smoothing) * raw.x,
      y: smoothing * previous.y + (1 - smoothing) * raw.y,
      pressure: raw.pressure,
    });
  }
  result.push(path[path.length - 1]);
  return result;
}

// Drops interior dabs closer than minDistance to the last kept dab, always keeping
// the first and last points so the stroke still covers its real endpoints.
function decimateBrushPath(path: WeightedPoint[], minDistance: number): WeightedPoint[] {
  if (path.length <= 2 || minDistance <= 0) return path;
  const result: WeightedPoint[] = [path[0]];
  let last = path[0];
  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index];
    if (Math.hypot(point.x - last.x, point.y - last.y) < minDistance) continue;
    result.push(point);
    last = point;
  }
  result.push(path[path.length - 1]);
  return result;
}

export function applyLocalGesture(
  recipe: PhotoRecipe,
  adjustmentId: string,
  start: PhotoGesturePoint,
  end: PhotoGesturePoint,
  path: PhotoGesturePoint[] = [],
  strokeId = 0,
  erase = false,
): PhotoRecipe {
  const normalizedStart = normalizedPoint(start);
  const normalizedEnd = normalizedPoint(end);
  const next = {
    ...recipe,
    localAdjustments: recipe.localAdjustments.map((adjustment) => {
      if (adjustment.id !== adjustmentId) return adjustment;
      const mask = adjustment.mask;
      if (mask.type === 'radial') {
        const rx = Math.max(0.01, Math.abs(normalizedEnd.x - normalizedStart.x));
        const ry = Math.max(0.01, Math.abs(normalizedEnd.y - normalizedStart.y));
        return {
          ...adjustment,
          mask: { ...mask, cx: normalizedStart.x, cy: normalizedStart.y, rx, ry },
        };
      }
      if (mask.type === 'linear') {
        return {
          ...adjustment,
          mask: {
            ...mask,
            x1: normalizedStart.x,
            y1: normalizedStart.y,
            x2: normalizedEnd.x,
            y2: normalizedEnd.y,
          },
        };
      }
      if (mask.type === 'brush') {
        const rawPath = (path.length ? path : [end]).map((point) => ({
          x: clamp01(point.x),
          y: clamp01(point.y),
          pressure: clamp01(point.pressure ?? 1),
        }));
        const smoothed = smoothBrushPath(rawPath, mask.smoothing);
        const spaced = decimateBrushPath(smoothed, mask.spacing * mask.radius);
        const points = spaced.map((point) => ({ ...point, strokeId, erase }));
        return {
          ...adjustment,
          mask: { ...mask, points: [...mask.points, ...points].slice(-5000) },
        };
      }
      return adjustment;
    }),
  };
  return normalizeRecipe(next);
}

export function placeRetouchPoint(
  recipe: PhotoRecipe,
  operationId: string,
  point: PhotoGesturePoint,
  placement: 'source' | 'target' = 'target',
  path: PhotoGesturePoint[] = [],
): PhotoRecipe {
  const normalized = normalizedPoint(point);
  const next = {
    ...recipe,
    retouch: recipe.retouch.map((operation) => {
      if (operation.id !== operationId) return operation;
      if (operation.type === 'red-eye') {
        return { ...operation, x: normalized.x, y: normalized.y };
      }
      if (placement === 'source') {
        // Re-anchoring the source point clears any stroke painted under the old locked offset,
        // so the next target placement is treated as setting a fresh anchor again.
        return { ...operation, sourceX: normalized.x, sourceY: normalized.y, path: [], anchored: false };
      }
      const strokePoints = (path.length ? path : [point]).map((gesturePoint) => normalizedPoint(gesturePoint));
      if (!operation.anchored) {
        // First target placement establishes the anchor (and the locked source offset with it);
        // any further points already dragged in this same gesture become the start of the path.
        const [anchor, ...rest] = strokePoints;
        return { ...operation, targetX: anchor.x, targetY: anchor.y, path: rest, anchored: true };
      }
      // The anchor and its offset are already locked: every later stroke only appends dabs.
      return { ...operation, path: [...operation.path, ...strokePoints].slice(-2000) };
    }),
  };
  return normalizeRecipe(next);
}
