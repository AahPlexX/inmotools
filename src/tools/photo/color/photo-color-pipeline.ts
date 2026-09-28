import { applyPixelAdjustments, type PhotoLayerPixels } from '../photo-engine';
import type { PhotoRecipe } from '../photo-types';
import {
  applyAssignedPhotoProfile,
  applyPhotoOutputProfile,
  applyPhotoSoftProof,
} from './photo-color-management';

export interface PhotoColorPipelineResult {
  pixels: Uint8ClampedArray;
  proofBasePixels?: Uint8ClampedArray;
  gamutWarningPixels: number;
}

export async function processPhotoColorPipeline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  recipe: PhotoRecipe,
  mode: 'preview' | 'export',
  jpegBackground?: readonly [number, number, number],
  layerPixels: PhotoLayerPixels[] = [],
): Promise<PhotoColorPipelineResult> {
  const color = recipe.colorManagement;
  if (color?.assignedProfile) {
    await applyAssignedPhotoProfile(
      pixels,
      color.assignedProfile,
      color.renderingIntent,
      color.blackPointCompensation,
    );
  }

  applyPixelAdjustments(pixels, width, height, recipe, layerPixels);

  if (mode === 'export' && jpegBackground) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3] / 255;
      const inverse = 1 - alpha;
      pixels[offset] = Math.round(pixels[offset] * alpha + jpegBackground[0] * inverse);
      pixels[offset + 1] = Math.round(pixels[offset + 1] * alpha + jpegBackground[1] * inverse);
      pixels[offset + 2] = Math.round(pixels[offset + 2] * alpha + jpegBackground[2] * inverse);
      pixels[offset + 3] = 255;
    }
  }

  if (mode === 'export' && color?.outputProfile) {
    await applyPhotoOutputProfile(
      pixels,
      color.outputProfile,
      color.renderingIntent,
      color.blackPointCompensation,
    );
    return { pixels, gamutWarningPixels: 0 };
  }

  if (mode === 'preview' && color?.softProof && color.proofProfile) {
    const proofBasePixels = new Uint8ClampedArray(pixels);
    const gamutWarningPixels = await applyPhotoSoftProof(
      pixels,
      color.proofProfile,
      color.renderingIntent,
      color.proofIntent,
      color.blackPointCompensation,
      color.gamutWarning,
    );
    return { pixels, proofBasePixels, gamutWarningPixels };
  }

  return { pixels, gamutWarningPixels: 0 };
}
