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

export interface PhotoExportSizePlan {
  requested: PhotoDimensions;
  safe: PhotoDimensions;
  requiresSafetyScaling: boolean;
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

export function fitPhotoDimensionsWithinLimits(
  width: number,
  height: number,
  maxEdge: number,
  maxArea: number,
): PhotoDimensions & { scaled: boolean } {
  const safeWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const edgeLimit = Math.max(1, Number.isFinite(maxEdge) ? maxEdge : 4096);
  const areaLimit = Math.max(1, Number.isFinite(maxArea) ? maxArea : 4096 * 4096);
  const edgeScale = Math.min(1, edgeLimit / Math.max(safeWidth, safeHeight));
  const areaScale = Math.min(1, Math.sqrt(areaLimit / (safeWidth * safeHeight)));
  const scale = Math.min(edgeScale, areaScale);
  if (scale >= 1) return { width: safeWidth, height: safeHeight, scaled: false };

  let nextWidth = Math.max(1, Math.floor(safeWidth * scale));
  let nextHeight = Math.max(1, Math.floor(safeHeight * scale));
  while (nextWidth * nextHeight > areaLimit) {
    if (nextWidth >= nextHeight) nextWidth -= 1;
    else nextHeight -= 1;
  }
  return { width: nextWidth, height: nextHeight, scaled: true };
}

export function planPhotoExportSize(
  sourceWidth: number,
  sourceHeight: number,
  recipe: PhotoRecipe,
  mode: PhotoResizeMode,
  value: number,
  maxEdge: number,
  maxArea: number,
): PhotoExportSizePlan {
  const natural = photoNaturalDimensions(sourceWidth, sourceHeight, recipe);
  const requested = requestedPhotoDimensions(sourceWidth, sourceHeight, recipe, mode, value);
  const resolvedRequested = {
    width: requested.requestedWidth ?? natural.width,
    height: requested.requestedHeight ?? natural.height,
  };
  const fitted = fitPhotoDimensionsWithinLimits(resolvedRequested.width, resolvedRequested.height, maxEdge, maxArea);
  return {
    requested: resolvedRequested,
    safe: { width: fitted.width, height: fitted.height },
    requiresSafetyScaling: fitted.scaled,
  };
}
