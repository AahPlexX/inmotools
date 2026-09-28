import { createPhotoExport, photoMetadataForPolicy } from './photo-export';
import { requestedPhotoDimensions, photoNaturalDimensions } from './photo-export-dimensions';
import { expansionLayout } from './photo-transform';
import { renderFilenamePattern, type PhotoExportSettings } from './photo-export-settings';
import { PHOTO_FORMAT_FACTS } from './photo-export-settings';
import { applyMetadataTemplate, recipeWithWatermark, type PhotoTemplateRecord } from './photo-templates';
import type { PhotoExportMetadata, PhotoRecipe } from './photo-types';

/** One export described completely: which photo, which edits, which settings, and which saved
 * templates the settings refer to. Single, batch, multi-output, and contact-sheet exports all go
 * through `runPhotoExport`, so a preset produces identical output whichever path uses it. */
export interface PhotoExportJob {
  file: Blob;
  sourceName: string;
  /** Decoded source size (after TIFF/RAW development and orientation). */
  sourceWidth: number;
  sourceHeight: number;
  recipe: PhotoRecipe;
  settings: PhotoExportSettings;
  /** Metadata typed in the dialog; a template (if selected) fills in any empty fields. */
  metadata: PhotoExportMetadata;
  templates: { metadata: PhotoTemplateRecord<'metadata'>[]; watermark: PhotoTemplateRecord<'watermark'>[] };
  /** An explicit file name (single export) instead of the settings' file name rule. */
  filename?: string;
  index: number;
  total: number;
  presetName?: string;
  revision: number;
}

export interface PhotoExportJobResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  details: Record<string, string | number | boolean>;
  scaledForSafety: boolean;
  metadataEmbedded: boolean;
  metadataError?: string;
  colorProfileEmbedded: boolean;
  resampling: string;
}

export async function runPhotoExport(job: PhotoExportJob): Promise<PhotoExportJobResult> {
  const { settings } = job;
  const requested = requestedPhotoDimensions(job.sourceWidth, job.sourceHeight, job.recipe, settings.resizeMode, settings.resizeValue, settings.allowEnlarge);
  const natural = photoNaturalDimensions(job.sourceWidth, job.sourceHeight, job.recipe);
  const frameWidth = requested.requestedWidth ?? natural.width;
  const frameHeight = requested.requestedHeight ?? Math.max(1, Math.round(frameWidth * natural.height / natural.width));

  const watermark = settings.watermarkPresetId ? job.templates.watermark.find((record) => record.id === settings.watermarkPresetId) : undefined;
  if (settings.watermarkPresetId && !watermark) throw new Error('The watermark preset this export uses was deleted. Choose another watermark or none.');
  // Layers sit on the photo itself, so the watermark is sized against the photo inside any canvas border.
  const photoFrame = expansionLayout(frameWidth, frameHeight, job.recipe.canvasExpansion).inner;
  const recipe = watermark ? recipeWithWatermark(job.recipe, watermark.data, photoFrame.width, photoFrame.height) : job.recipe;

  const template = settings.metadataTemplateId ? job.templates.metadata.find((record) => record.id === settings.metadataTemplateId) : undefined;
  if (settings.metadataTemplateId && !template) throw new Error('The metadata template this export uses was deleted. Choose another template or none.');
  const metadata = template ? applyMetadataTemplate(job.metadata, template.data) : job.metadata;

  const filename = job.filename ?? renderFilenamePattern(settings.filenamePattern, settings.outputMime, {
    sourceName: job.sourceName,
    index: job.index,
    total: job.total,
    presetName: job.presetName,
    width: frameWidth,
    height: frameHeight,
  });

  const result = await createPhotoExport({
    file: job.file,
    sourceName: job.sourceName,
    requestedName: filename,
    recipe,
    outputMime: settings.outputMime,
    quality: settings.quality,
    metadataPolicy: settings.metadataPolicy,
    metadata,
    outputSharpening: settings.outputSharpening,
    revision: job.revision,
    jpegBackground: settings.jpegBackground,
    resampling: settings.resampling,
    lossless: settings.outputMime === 'image/avif' && settings.lossless,
    ...requested,
  });
  const reviewed = photoMetadataForPolicy(metadata, settings.metadataPolicy);
  return {
    blob: result.blob,
    filename: result.filename,
    width: result.width,
    height: result.height,
    scaledForSafety: result.scaledForSafety,
    metadataEmbedded: result.metadataEmbedded,
    metadataError: result.metadataError,
    colorProfileEmbedded: result.colorProfileEmbedded,
    resampling: result.resampling,
    details: {
      format: PHOTO_FORMAT_FACTS[settings.outputMime].label,
      compression: PHOTO_FORMAT_FACTS[settings.outputMime].compression,
      quality: PHOTO_FORMAT_FACTS[settings.outputMime].usesQuality ? Math.round(settings.quality * 100) : 'n/a',
      resampling: result.resampling,
      metadataPolicy: settings.metadataPolicy,
      metadataEmbedded: result.metadataEmbedded,
      location: settings.metadataPolicy === 'custom' && (reviewed.latitude !== undefined || Boolean(reviewed.city)),
      colorProfile: result.colorProfileEmbedded && job.recipe.colorManagement?.outputProfile ? job.recipe.colorManagement.outputProfile.description : 'sRGB (browser default)',
      scaledForSafety: result.scaledForSafety,
      watermark: watermark?.name ?? 'none',
      preset: job.presetName ?? 'none',
    },
  };
}
