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

export function applyLocalGesture(
  recipe: PhotoRecipe,
  adjustmentId: string,
  start: PhotoGesturePoint,
  end: PhotoGesturePoint,
  path: PhotoGesturePoint[] = [],
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
        const points = (path.length ? path : [end]).map((point) => ({
          x: clamp01(point.x),
          y: clamp01(point.y),
          pressure: clamp01(point.pressure ?? 1),
        }));
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
        return { ...operation, sourceX: normalized.x, sourceY: normalized.y };
      }
      return { ...operation, targetX: normalized.x, targetY: normalized.y };
    }),
  };
  return normalizeRecipe(next);
}
