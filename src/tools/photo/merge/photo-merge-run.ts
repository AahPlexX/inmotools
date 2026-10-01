import { exposureFusion, hdrMerge, type PhotoCvExposure } from './photo-merge-exposure';
import {
  averageStack,
  compositePanorama,
  cropRaster,
  focalLengthPixels,
  focusStack,
  frameIntrinsics,
  invertMatrix3,
  largestOpaqueRectangle,
  medianStack,
  multiplyMatrix3,
  projectCylindrical,
  type Matrix3,
} from './photo-merge-ops';
import {
  PHOTO_MERGE_OUTPUT_LIMITS,
  type PhotoFrameRegistration,
  type PhotoMergeOperation,
  type PhotoMergeOptions,
  type PhotoMergeOutcome,
  type PhotoMergeRaster,
} from './photo-merge-types';
import { registerFramePair, registerPanoramaPair, warpFrameToReference, type PhotoCv } from './photo-registration';

export const DEFAULT_PHOTO_MERGE_OPTIONS: PhotoMergeOptions = {
  alignment: 'homography',
  cropToCoverage: true,
  fusion: { contrast: 1, saturation: 1, exposure: 1 },
  hdr: {
    exposureTimes: [],
    operator: 'reinhard',
    gamma: 2.2,
    intensity: 0,
    lightAdaptation: 0,
    colorAdaptation: 0,
    bias: 0.85,
    scale: 0.7,
    saturation: 1,
  },
  focus: { radius: 4, selectivity: 4 },
  panorama: { projection: 'cylindrical', fieldOfView: 60, gainCompensation: true },
};

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function identityRegistration(sourceIndex: number): PhotoFrameRegistration {
  return { sourceIndex, model: 'translation', matrix: [...IDENTITY], coarse: 'identity', featureMatches: 0, inliers: 0, correlation: 1, lowConfidence: false };
}

/** Alpha-intersection of aligned frames: 255 only where every frame has real coverage. */
function intersectionCoverage(frames: PhotoMergeRaster[]): PhotoMergeRaster {
  const { width, height } = frames[0];
  const out = new Uint8ClampedArray(width * height * 4);
  const data = frames.map((frame) => new Uint8ClampedArray(frame.buffer, 0, width * height * 4));
  for (let p = 0; p < width * height; p += 1) {
    let all = true;
    for (const frame of data) if (frame[p * 4 + 3] < 255) { all = false; break; }
    if (all) out[p * 4 + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

function cropToCoverage(result: PhotoMergeRaster, coverage: PhotoMergeRaster, notes: string[]): PhotoMergeRaster {
  const rect = largestOpaqueRectangle(coverage);
  if (!rect) throw new Error('The aligned photos do not share any common area to keep.');
  if (rect.width === result.width && rect.height === result.height) return result;
  notes.push(`Cropped to ${rect.width} × ${rect.height}, the largest area every photo covers.`);
  return cropRaster(result, rect);
}

function describeOperation(operation: PhotoMergeOperation): string {
  switch (operation) {
    case 'exposure-fusion': return 'Exposure fusion';
    case 'hdr': return 'HDR merge';
    case 'panorama': return 'Panorama';
    case 'focus-stack': return 'Focus stack';
    case 'average-stack': return 'Average stack';
    default: return 'Median stack';
  }
}

/** Registers every frame to the reference with the chosen model and resamples it onto the
 * reference grid; uncovered pixels come back transparent. `none` passes frames through unchanged. */
function alignFrames(cv: PhotoCv, sources: PhotoMergeRaster[], referenceIndex: number, options: PhotoMergeOptions) {
  if (options.alignment === 'none') {
    return { frames: sources, registrations: sources.map((_, index) => identityRegistration(index)) };
  }
  const reference = sources[referenceIndex];
  const model = options.alignment;
  const registrations = sources.map((source, index) => (
    index === referenceIndex ? { ...identityRegistration(index), model } : registerFramePair(cv, reference, source, model, index)
  ));
  const frames = sources.map((source, index) => (
    index === referenceIndex ? source : warpFrameToReference(cv, source, registrations[index].matrix, reference.width, reference.height)
  ));
  return { frames, registrations };
}

function runPanorama(cv: PhotoCv, sources: PhotoMergeRaster[], options: PhotoMergeOptions, notes: string[]): PhotoMergeOutcome {
  const { projection, fieldOfView, gainCompensation } = options.panorama;
  const frames = projection === 'cylindrical'
    ? sources.map((source) => projectCylindrical(source, focalLengthPixels(source.width, fieldOfView)))
    : sources;
  // Neighbour-to-neighbour registration in shooting order: frame i−1 coordinates → frame i.
  const pairwise: PhotoFrameRegistration[] = [identityRegistration(0)];
  for (let index = 1; index < frames.length; index += 1) {
    const model = projection === 'cylindrical'
      ? { kind: 'translation' as const }
      : {
        kind: 'rotation' as const,
        reference: frameIntrinsics(frames[index - 1].width, frames[index - 1].height, fieldOfView),
        target: frameIntrinsics(frames[index].width, frames[index].height, fieldOfView),
      };
    pairwise.push(registerPanoramaPair(cv, frames[index - 1], frames[index], model, index));
  }
  // Chain every frame to the middle one, which keeps planar distortion symmetric on both sides.
  const reference = Math.floor(frames.length / 2);
  const toFrame: Matrix3[] = frames.map(() => [...IDENTITY]);
  for (let index = reference + 1; index < frames.length; index += 1) toFrame[index] = multiplyMatrix3(pairwise[index].matrix, toFrame[index - 1]);
  for (let index = reference - 1; index >= 0; index -= 1) toFrame[index] = multiplyMatrix3(invertMatrix3(pairwise[index + 1].matrix), toFrame[index + 1]);

  const composite = compositePanorama(
    frames.map((raster, index) => ({ raster, toFrame: toFrame[index] })),
    { maxEdge: PHOTO_MERGE_OUTPUT_LIMITS.maxEdge, maxPixels: PHOTO_MERGE_OUTPUT_LIMITS.maxPixels, gainCompensation },
  );
  if (composite.scale < 1) notes.push(`Scaled to ${Math.round(composite.scale * 100)}% to stay within the ${PHOTO_MERGE_OUTPUT_LIMITS.maxEdge}-pixel, 16-megapixel output limit.`);
  if (gainCompensation) {
    const spread = Math.max(...composite.gains) / Math.min(...composite.gains);
    if (spread > 1.02) notes.push(`Brightness evened out between frames (up to ${spread.toFixed(2)}× difference).`);
  }
  let result = composite.raster;
  if (options.cropToCoverage) result = cropToCoverage(result, result, notes);
  return { result, registrations: pairwise, notes };
}

/** Runs one complete merge. Throws `PhotoRegistrationError` for a frame that cannot be aligned and
 * plain errors for invalid parameters; the worker handler turns both into diagnostics. */
export function runPhotoMerge(
  cv: PhotoCv,
  operation: PhotoMergeOperation,
  sources: PhotoMergeRaster[],
  referenceIndex: number,
  options: PhotoMergeOptions,
): PhotoMergeOutcome {
  const notes: string[] = [];
  if (operation === 'panorama') return runPanorama(cv, sources, options, notes);

  const reference = sources[referenceIndex];
  if (sources.some((source) => source.width !== reference.width || source.height !== reference.height)) {
    throw new Error(`${describeOperation(operation)} needs photos with identical dimensions.`);
  }
  const { frames, registrations } = alignFrames(cv, sources, referenceIndex, options);
  let result: PhotoMergeRaster;
  if (operation === 'exposure-fusion') result = exposureFusion(cv as PhotoCvExposure, frames, options.fusion);
  else if (operation === 'hdr') result = hdrMerge(cv as PhotoCvExposure, frames, options.hdr);
  else if (operation === 'focus-stack') result = focusStack(frames, options.focus);
  else if (operation === 'average-stack') result = averageStack(frames);
  else result = medianStack(frames);

  const lowConfidence = registrations.filter((registration) => registration.lowConfidence).map((registration) => registration.sourceIndex + 1);
  if (lowConfidence.length) notes.push(`Alignment confidence is low for photo ${lowConfidence.join(', ')}; check edges for ghosting.`);
  if (options.cropToCoverage && options.alignment !== 'none') result = cropToCoverage(result, intersectionCoverage(frames), notes);
  return { result, registrations, notes };
}
