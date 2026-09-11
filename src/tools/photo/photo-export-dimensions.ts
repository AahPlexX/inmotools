import type { PhotoRecipe } from './photo-types';

export type PhotoResizeMode = 'original' | 'percent' | 'width' | 'height';

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

  if (mode === 'width') {
    const width = Math.max(1, Math.round(Number.isFinite(value) ? value : natural.width));
    return {
      requestedWidth: width,
      requestedHeight: Math.max(1, Math.round(width * natural.height / natural.width)),
    };
  }

  const height = Math.max(1, Math.round(Number.isFinite(value) ? value : natural.height));
  return {
    requestedWidth: Math.max(1, Math.round(height * natural.width / natural.height)),
    requestedHeight: height,
  };
}
