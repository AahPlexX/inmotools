import { commonCoverageRect } from './photo-exposure-merge';
import {
  PHOTO_MERGE_LIMITS,
  type PhotoFrameRegistration,
  type PhotoMergeCrop,
  type PhotoMergeDiagnostic,
  type PhotoMergeRaster,
  type PhotoPanoramaCrop,
} from './photo-merge-types';
import {
  applyToPoint,
  createCvScope,
  estimatePairHomography,
  multiply,
  rasterToMat,
  type Matrix3,
  type PhotoCv,
} from './photo-registration';

export class PhotoPanoramaError extends Error {
  constructor(readonly diagnostic: PhotoMergeDiagnostic) {
    super(diagnostic.message);
    this.name = 'PhotoPanoramaError';
  }
}

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function invert(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}

export interface PanoramaLayout {
  /** Per frame: canvas coordinates -> that frame's pixel coordinates. */
  canvasToFrame: Matrix3[];
  registrations: PhotoFrameRegistration[];
  width: number;
  height: number;
}

/** Joins each photo to its neighbour nearer the reference, chaining the homographies so every
 * photo is expressed in the reference photo's plane, then sizes the canvas to the union of all
 * warped photo outlines. Photos are expected in left-to-right shooting order. */
export function layoutPanorama(cv: PhotoCv, frames: PhotoMergeRaster[], referenceIndex: number): PanoramaLayout {
  const toFrame: Matrix3[] = new Array(frames.length);
  const registrations: PhotoFrameRegistration[] = new Array(frames.length);
  toFrame[referenceIndex] = IDENTITY;
  registrations[referenceIndex] = { sourceIndex: referenceIndex, model: 'homography', matrix: [...IDENTITY], coarse: 'identity', featureMatches: 0, inliers: 0, correlation: 1, lowConfidence: false };
  const walk = (index: number, neighbour: number) => {
    const { matrix, inliers } = estimatePairHomography(cv, frames[neighbour], frames[index], index);
    toFrame[index] = multiply(matrix, toFrame[neighbour]);
    registrations[index] = { sourceIndex: index, model: 'homography', matrix: [...toFrame[index]], coarse: 'features', featureMatches: inliers, inliers, correlation: 1, lowConfidence: inliers < 30 };
  };
  for (let index = referenceIndex - 1; index >= 0; index -= 1) walk(index, index + 1);
  for (let index = referenceIndex + 1; index < frames.length; index += 1) walk(index, index - 1);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  frames.forEach((frame, index) => {
    const back = invert(toFrame[index]);
    if (!back) throw new PhotoPanoramaError({ code: 'registration-failed', message: `Photo ${index + 1} produced an unusable alignment.`, sourceIndex: index });
    for (const [x, y] of [[0, 0], [frame.width, 0], [frame.width, frame.height], [0, frame.height]]) {
      const point = applyToPoint(back, x, y);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new PhotoPanoramaError({ code: 'registration-failed', message: `Photo ${index + 1} was stretched to an unusable shape; check the photos overlap the same scene.`, sourceIndex: index });
      }
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }
  });
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  if (!(width >= 1 && height >= 1) || width * height > PHOTO_MERGE_LIMITS.maxPanoramaPixels) {
    throw new PhotoPanoramaError({
      code: 'memory-budget',
      message: `The stitched panorama would be ${Number.isFinite(width) ? width : '?'} × ${Number.isFinite(height) ? height : '?'}; the limit is about ${Math.round(PHOTO_MERGE_LIMITS.maxPanoramaPixels / 1_000_000)} megapixels. Use fewer or smaller photos.`,
    });
  }
  // canvas -> reference plane is a pure translation by the canvas origin.
  const origin: Matrix3 = [1, 0, minX, 0, 1, minY, 0, 0, 1];
  return { canvasToFrame: toFrame.map((matrix) => multiply(matrix, origin)), registrations, width, height };
}

/** Feathered blend: every photo is warped onto the canvas with a weight that falls to zero at its
 * own edges, and each canvas pixel is the weighted mean of the photos covering it. This hides
 * seams from small exposure differences; it does not remove parallax or ghosting. Pixels no photo
 * reaches stay fully transparent. */
export function renderPanorama(cv: PhotoCv, frames: PhotoMergeRaster[], layout: PanoramaLayout): PhotoMergeRaster {
  const { width, height } = layout;
  const pixels = width * height;
  const accumulator = new Float32Array(pixels * 4);
  const canvasSize = new cv.Size(width, height);
  frames.forEach((frame, index) => {
    const scope = createCvScope();
    try {
      const source = rasterToMat(cv, scope, frame);
      const weights = scope.track(new cv.Mat(frame.height, frame.width, cv.CV_32F));
      const edge = new Float32Array(frame.width * frame.height);
      for (let y = 0; y < frame.height; y += 1) {
        const rowDistance = Math.min(y + 1, frame.height - y);
        for (let x = 0; x < frame.width; x += 1) edge[y * frame.width + x] = Math.min(rowDistance, x + 1, frame.width - x);
      }
      weights.data32F.set(edge);
      const transform = scope.track(cv.matFromArray(3, 3, cv.CV_64F, layout.canvasToFrame[index]));
      const warpedColor = scope.track(new cv.Mat());
      const warpedWeight = scope.track(new cv.Mat());
      const flags = cv.INTER_LINEAR | cv.WARP_INVERSE_MAP;
      cv.warpPerspective(source, warpedColor, transform, canvasSize, flags, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
      cv.warpPerspective(weights, warpedWeight, transform, canvasSize, flags, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
      const color = warpedColor.data;
      const weight = warpedWeight.data32F;
      for (let p = 0; p < pixels; p += 1) {
        const w = weight[p];
        if (w < 0.99) continue; // Partial-edge samples blend in the transparent border; skip them.
        const o = p * 4;
        accumulator[o] += color[o] * w;
        accumulator[o + 1] += color[o + 1] * w;
        accumulator[o + 2] += color[o + 2] * w;
        accumulator[o + 3] += w;
      }
    } finally {
      scope.release();
    }
  });
  const out = new Uint8Array(pixels * 4);
  for (let p = 0; p < pixels; p += 1) {
    const o = p * 4;
    const total = accumulator[o + 3];
    if (total <= 0) continue;
    out[o] = Math.round(accumulator[o] / total);
    out[o + 1] = Math.round(accumulator[o + 1] / total);
    out[o + 2] = Math.round(accumulator[o + 2] / total);
    out[o + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

export function cropPanorama(canvas: PhotoMergeRaster, mode: PhotoPanoramaCrop): { result: PhotoMergeRaster; crop: PhotoMergeCrop } {
  const whole = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (mode === 'full') return { result: canvas, crop: whole };
  const crop = commonCoverageRect([canvas]);
  if (!crop) throw new PhotoPanoramaError({ code: 'no-common-coverage', message: 'The stitched photos leave no fully covered rectangle to crop to; use the full canvas instead.' });
  if (crop.width === canvas.width && crop.height === canvas.height) return { result: canvas, crop };
  const from = new Uint8Array(canvas.buffer);
  const bytes = new Uint8Array(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y += 1) {
    const start = ((y + crop.y) * canvas.width + crop.x) * 4;
    bytes.set(from.subarray(start, start + crop.width * 4), y * crop.width * 4);
  }
  return { result: { width: crop.width, height: crop.height, buffer: bytes.buffer }, crop };
}
