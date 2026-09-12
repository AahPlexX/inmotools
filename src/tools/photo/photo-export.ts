import { normalizeRecipe } from './photo-engine';
import { embedPhotoXmp } from './photo-metadata-embed';
import {
  safeRequestedPhotoFilename,
  serializePhotoXmp,
  stripLocationMetadata,
} from './photo-metadata';
import { renderPhoto, type PhotoRenderRequest, type PhotoRenderResult } from './photo-renderer';
import type { PhotoExportMetadata, PhotoOutputMime, PhotoRecipe } from './photo-types';

export type PhotoMetadataPolicy = 'strip' | 'rights' | 'custom';
export type PhotoOutputSharpening = 'none' | 'light' | 'standard' | 'strong';

export interface PhotoExportServices {
  render: (request: PhotoRenderRequest) => Promise<PhotoRenderResult>;
  embed: (
    source: Blob,
    mime: PhotoOutputMime,
    xmp: string,
    options: { width: number; height: number },
  ) => Promise<Blob>;
}

export interface CreatePhotoExportOptions {
  file: Blob;
  sourceName: string;
  requestedName: string;
  recipe: PhotoRecipe;
  outputMime: PhotoOutputMime;
  quality: number;
  metadataPolicy: PhotoMetadataPolicy;
  metadata: PhotoExportMetadata;
  outputSharpening?: PhotoOutputSharpening;
  revision: number;
  jpegBackground?: string;
  requestedWidth?: number;
  requestedHeight?: number;
}

export interface CreatedPhotoExport {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scaledForSafety: boolean;
  metadataEmbedded: boolean;
  metadataError?: string;
}

const DEFAULT_SERVICES: PhotoExportServices = {
  render: renderPhoto,
  embed: embedPhotoXmp,
};

export function recipeWithOutputSharpening(recipe: PhotoRecipe, level: PhotoOutputSharpening): PhotoRecipe {
  const increment = level === 'light' ? 0.12 : level === 'standard' ? 0.25 : level === 'strong' ? 0.45 : 0;
  if (increment === 0) return normalizeRecipe(recipe);
  return normalizeRecipe({ ...recipe, sharpenAmount: recipe.sharpenAmount + increment });
}

export function photoMetadataForPolicy(metadata: PhotoExportMetadata, policy: PhotoMetadataPolicy): PhotoExportMetadata {
  if (policy === 'strip') return {};
  if (policy === 'rights') {
    return stripLocationMetadata({
      title: metadata.title,
      headline: metadata.headline,
      description: metadata.description,
      creator: metadata.creator,
      credit: metadata.credit,
      copyright: metadata.copyright,
      usageTerms: metadata.usageTerms,
      source: metadata.source,
      jobIdentifier: metadata.jobIdentifier,
      rating: metadata.rating,
      label: metadata.label,
      keywords: metadata.keywords,
      hierarchicalKeywords: metadata.hierarchicalKeywords,
      altText: metadata.altText,
      extendedDescription: metadata.extendedDescription,
      ppi: metadata.ppi,
    });
  }
  return { ...metadata, keywords: metadata.keywords ? [...metadata.keywords] : undefined, hierarchicalKeywords: metadata.hierarchicalKeywords ? [...metadata.hierarchicalKeywords] : undefined };
}

export async function createPhotoExport(
  options: CreatePhotoExportOptions,
  services: PhotoExportServices = DEFAULT_SERVICES,
): Promise<CreatedPhotoExport> {
  const exportRecipe = recipeWithOutputSharpening(options.recipe, options.outputSharpening ?? 'none');
  const rendered = await services.render({
    file: options.file,
    recipe: exportRecipe,
    revision: options.revision,
    mode: 'export',
    outputMime: options.outputMime,
    quality: options.quality,
    jpegBackground: options.jpegBackground,
    requestedWidth: options.requestedWidth,
    requestedHeight: options.requestedHeight,
  });

  let blob = rendered.blob;
  let metadataEmbedded = false;
  let metadataError: string | undefined;

  if (options.metadataPolicy !== 'strip') {
    try {
      const xmp = serializePhotoXmp(photoMetadataForPolicy(options.metadata, options.metadataPolicy));
      blob = await services.embed(blob, options.outputMime, xmp, { width: rendered.width, height: rendered.height });
      metadataEmbedded = true;
    } catch (error) {
      metadataError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    blob,
    filename: safeRequestedPhotoFilename(options.requestedName, options.sourceName, options.outputMime),
    width: rendered.width,
    height: rendered.height,
    sourceWidth: rendered.sourceWidth,
    sourceHeight: rendered.sourceHeight,
    scaledForSafety: rendered.scaledForSafety,
    metadataEmbedded,
    metadataError,
  };
}
