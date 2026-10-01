import type { NormalizedCrop } from './photo-types';

export type PhotoCropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_CROP_SIZE = 0.02;
const ROUNDING_SCALE = 100_000_000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function tidy(value: number): number {
  return Math.round(value * ROUNDING_SCALE) / ROUNDING_SCALE;
}

export function adjustPhotoCrop(
  crop: NormalizedCrop,
  handle: PhotoCropHandle,
  dx: number,
  dy: number,
): NormalizedCrop {
  const left = clamp(crop.x, 0, 1);
  const top = clamp(crop.y, 0, 1);
  const right = clamp(crop.x + crop.width, left + MIN_CROP_SIZE, 1);
  const bottom = clamp(crop.y + crop.height, top + MIN_CROP_SIZE, 1);

  if (handle === 'move') {
    const width = right - left;
    const height = bottom - top;
    return {
      x: tidy(clamp(left + dx, 0, 1 - width)),
      y: tidy(clamp(top + dy, 0, 1 - height)),
      width: tidy(width),
      height: tidy(height),
    };
  }

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) nextLeft = clamp(left + dx, 0, right - MIN_CROP_SIZE);
  if (handle.includes('e')) nextRight = clamp(right + dx, left + MIN_CROP_SIZE, 1);
  if (handle.includes('n')) nextTop = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
  if (handle.includes('s')) nextBottom = clamp(bottom + dy, top + MIN_CROP_SIZE, 1);

  return {
    x: tidy(nextLeft),
    y: tidy(nextTop),
    width: tidy(nextRight - nextLeft),
    height: tidy(nextBottom - nextTop),
  };
}

export function photoStraightenFromGuide(
  start: { x: number; y: number },
  end: { x: number; y: number },
): number | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) return null;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const axes = [-180, -90, 0, 90, 180];
  let nearestAxis = axes[0];
  for (const axis of axes.slice(1)) {
    if (Math.abs(axis - angle) < Math.abs(nearestAxis - angle)) nearestAxis = axis;
  }
  return tidy(clamp(nearestAxis - angle, -45, 45));
}
