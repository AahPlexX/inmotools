import { clonePhotoSelection } from './photo-selection';
import type { PhotoMask, PhotoMaskOverlay, PhotoSelectionCombineMode } from './photo-types';

export const DEFAULT_PHOTO_MASK_OVERLAY: PhotoMaskOverlay = {
  visible: false,
  color: '#22D3EE',
  opacity: 0.35,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizePhotoMaskOverlay(overlay: PhotoMaskOverlay | null | undefined): PhotoMaskOverlay {
  return {
    visible: Boolean(overlay?.visible),
    color: typeof overlay?.color === 'string' && /^#[0-9a-f]{6}$/i.test(overlay.color)
      ? overlay.color.toUpperCase()
      : DEFAULT_PHOTO_MASK_OVERLAY.color,
    opacity: clamp(overlay?.opacity ?? DEFAULT_PHOTO_MASK_OVERLAY.opacity, 0, 1),
  };
}

export function clonePhotoMask(mask: PhotoMask, depth = 0): PhotoMask {
  if (depth >= 8) return { type: 'brush', points: [], radius: 0.01, feather: 0, opacity: 0, invert: false };
  if (mask.type === 'brush') {
    return { ...mask, points: mask.points.map((point) => ({ ...point })) };
  }
  if (mask.type === 'selection') {
    return { ...mask, selection: clonePhotoSelection(mask.selection)! };
  }
  if (mask.type === 'composite') {
    return {
      ...mask,
      operations: mask.operations.slice(0, 64).map((operation) => ({ mode: operation.mode, mask: clonePhotoMask(operation.mask, depth + 1) })),
    };
  }
  return { ...mask };
}

export function combinePhotoMasks(
  current: PhotoMask,
  incoming: PhotoMask,
  mode: Exclude<PhotoSelectionCombineMode, 'replace'>,
): PhotoMask {
  return {
    type: 'composite',
    operations: [
      { mode: 'replace', mask: clonePhotoMask(current) },
      { mode, mask: clonePhotoMask(incoming) },
    ],
    feather: 0,
    opacity: 1,
    invert: false,
  };
}
