import type { PhotoRecipe } from './photo-types';

export type PhotoResizeMode = 'original' | 'percent' | 'width' | 'height' | 'long-edge' | 'short-edge';

export interface PhotoDimensions {
  width: number;
  height: number;
}

export interface RequestedPhotoDimensions {
  requestedWidth?: number;
  requestedHeight?: number;
}

export function photoNaturalDimensions(
  sourceWidth: number,
  sourceHeight: number,
  recipe: PhotoRecipe,
): PhotoDimensions {
  const width = Math.max(1, Math.round(sourceWidth * recipe.crop.width));
  const height = Math.max(1, Math.round(sourceHeight * recipe.crop.height));
  const turns = ((Math.round(recipe.rotateQuarterTurns) % 4) + 4) % 4;
  return turns % 2 ? { width: height, height: width } : { width, height };
}

function scaledDimensions(natural: PhotoDimensions, target: number, basis: number): RequestedPhotoDimensions {
  const safeTarget = Math.max(1, Math.round(Number.isFinite(target) ? target : basis));
  const scale = safeTarget / Math.max(1, basis);
  return {
    requestedWidth: Math.max(1, Math.round(natural.width * scale)),
    requestedHeight: Math.max(1, Math.round(natural.height * scale)),
  };
}

export function requestedPhotoDimensions(
  sourceWidth: number,
  sourceHeight: number,
  recipe: PhotoRecipe,
  mode: PhotoResizeMode,
  value: number,
): RequestedPhotoDimensions {
  if (mode === 'original') return {};
  const natural = photoNaturalDimensions(sourceWidth, sourceHeight, recipe);

  if (mode === 'percent') {
    const scale = Math.max(0.01, Number.isFinite(value) ? value : 100) / 100;
    return {
      requestedWidth: Math.max(1, Math.round(natural.width * scale)),
      requestedHeight: Math.max(1, Math.round(natural.height * scale)),
    };
  }

  if (mode === 'width') return scaledDimensions(natural, value, natural.width);
  if (mode === 'height') return scaledDimensions(natural, value, natural.height);
  if (mode === 'long-edge') return scaledDimensions(natural, value, Math.max(natural.width, natural.height));
  return scaledDimensions(natural, value, Math.min(natural.width, natural.height));
}
