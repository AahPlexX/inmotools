import { PHOTO_MERGE_LIMITS, type PhotoMergeDiagnostic, type PhotoMergeOperation } from './photo-merge-types';

export interface PhotoMergeSourceSize {
  width: number;
  height: number;
}

export interface PhotoMergePlan {
  ok: true;
  sourceCount: number;
  width: number;
  height: number;
  estimatedBytes: number;
  /** Scale applied to the registration working copy (1 when no downscale is needed). */
  registrationScale: number;
}

/** Per-pixel working bytes per operation: the RGBA8 source plus the float intermediates each
 * merge keeps alive for every frame (weights, pyramids, radiance). Conservative on purpose so the
 * budget rejects a job before it starts rather than after the browser runs out of memory. */
const BYTES_PER_PIXEL_PER_FRAME: Record<PhotoMergeOperation, number> = {
  'exposure-fusion': 4 + 16 + 8,
  hdr: 4 + 12 + 12,
  panorama: 4 + 8,
  'focus-stack': 4 + 8,
  'average-stack': 4 + 4,
  'median-stack': 4 + 4,
};

/** Frames that must share one pixel grid before merging; a panorama is the one exception. */
function requiresMatchingDimensions(operation: PhotoMergeOperation): boolean {
  return operation !== 'panorama';
}

function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Source-count and per-frame size checks shared by merge planning and the worker's own request
 * validation, so both reject the same inputs with the same wording. */
export function checkMergeSources(sources: PhotoMergeSourceSize[], requireMatchingDimensions: boolean): PhotoMergeDiagnostic | null {
  if (sources.length < PHOTO_MERGE_LIMITS.minSources) {
    return { code: 'too-few-sources', message: `This merge needs at least ${PHOTO_MERGE_LIMITS.minSources} photos; ${sources.length} selected.` };
  }
  if (sources.length > PHOTO_MERGE_LIMITS.maxSources) {
    return { code: 'too-many-sources', message: `This merge accepts at most ${PHOTO_MERGE_LIMITS.maxSources} photos; ${sources.length} selected.` };
  }
  for (let index = 0; index < sources.length; index += 1) {
    const { width, height } = sources[index];
    if (!isValidDimension(width) || !isValidDimension(height)) {
      return { code: 'invalid-dimensions', message: `Photo ${index + 1} has invalid dimensions.`, sourceIndex: index };
    }
    if (width > PHOTO_MERGE_LIMITS.maxEdge || height > PHOTO_MERGE_LIMITS.maxEdge || width * height > PHOTO_MERGE_LIMITS.maxSourcePixels) {
      return {
        code: 'source-too-large',
        message: `Photo ${index + 1} is ${width} × ${height}; merges accept up to ${PHOTO_MERGE_LIMITS.maxEdge} pixels per edge and 16 megapixels.`,
        sourceIndex: index,
      };
    }
  }
  if (requireMatchingDimensions) {
    const reference = sources[0];
    const mismatch = sources.findIndex((source) => source.width !== reference.width || source.height !== reference.height);
    if (mismatch >= 0) {
      const other = sources[mismatch];
      return {
        code: 'dimension-mismatch',
        message: `Photo ${mismatch + 1} is ${other.width} × ${other.height} but photo 1 is ${reference.width} × ${reference.height}; this merge needs identical dimensions.`,
        sourceIndex: mismatch,
      };
    }
  }
  return null;
}

/** Validates a proposed merge before any pixel work, so every refusal is reported with the
 * specific source and constraint rather than surfacing as a mid-job worker failure. */
export function planPhotoMerge(
  operation: PhotoMergeOperation,
  sources: PhotoMergeSourceSize[],
): PhotoMergePlan | { ok: false; diagnostic: PhotoMergeDiagnostic } {
  const sourceProblem = checkMergeSources(sources, requiresMatchingDimensions(operation));
  if (sourceProblem) return { ok: false, diagnostic: sourceProblem };
  const reference = sources[0];
  const totalPixels = sources.reduce((sum, source) => sum + source.width * source.height, 0);
  const estimatedBytes = totalPixels * BYTES_PER_PIXEL_PER_FRAME[operation];
  if (estimatedBytes > PHOTO_MERGE_LIMITS.maxWorkingBytes) {
    const mebibytes = (bytes: number) => Math.ceil(bytes / (1024 * 1024));
    return {
      ok: false,
      diagnostic: {
        code: 'memory-budget',
        message: `This merge would need about ${mebibytes(estimatedBytes)} MiB of working memory; the limit is ${mebibytes(PHOTO_MERGE_LIMITS.maxWorkingBytes)} MiB. Use fewer or smaller photos.`,
      },
    };
  }
  const longEdge = Math.max(...sources.map((source) => Math.max(source.width, source.height)));
  return {
    ok: true,
    sourceCount: sources.length,
    width: reference.width,
    height: reference.height,
    estimatedBytes,
    registrationScale: Math.min(1, PHOTO_MERGE_LIMITS.registrationMaxEdge / longEdge),
  };
}
