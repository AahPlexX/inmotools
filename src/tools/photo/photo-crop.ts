import type { NormalizedCrop } from './photo-types';

export type PhotoCropHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** Source-normalized deltas; resizing anchors the opposite edge without inversion. */
export function adjustPhotoCrop(crop: NormalizedCrop, handle: PhotoCropHandle, dx: number, dy: number): NormalizedCrop {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  if (!Number.isFinite(dx)) dx = 0;
  if (!Number.isFinite(dy)) dy = 0;
  if (handle === 'move') return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width), y: clamp(crop.y + dy, 0, 1 - crop.height) };
  let left = crop.x, top = crop.y, right = left + crop.width, bottom = top + crop.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - 0.001);
  if (handle.includes('e')) right = clamp(right + dx, left + 0.001, 1);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 0.001);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + 0.001, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
