import { fitRotation, pixelRay, rotationHomography, type CameraIntrinsics } from './photo-merge-ops';
import { PHOTO_MERGE_LIMITS, type PhotoFrameRegistration, type PhotoMergeRaster, type PhotoRegistrationModel } from './photo-merge-types';

/** The narrow slice of the OpenCV.js API this adapter uses. Typing against it (rather than the
 * package's full generated surface) keeps the adapter honest about its dependency and lets unit
 * tests substitute a failing engine to prove error isolation. */
export interface CvReleasable { delete(): void }
export interface CvMat extends CvReleasable {
  rows: number;
  cols: number;
  data: Uint8Array;
  empty(): boolean;
  doubleAt(row: number, col: number): number;
  floatAt(row: number, col: number): number;
  convertTo(destination: CvMat, type: number): void;
}
interface CvPoint { x: number; y: number }
interface CvKeyPointVector extends CvReleasable { size(): number; get(index: number): { pt: CvPoint } }
interface CvDMatchVector extends CvReleasable { size(): number; get(index: number): { queryIdx: number; trainIdx: number; distance: number; delete?: () => void } }
interface CvOrb extends CvReleasable { detectAndCompute(image: CvMat, mask: CvMat, keypoints: CvKeyPointVector, descriptors: CvMat): void }
interface CvMatcher extends CvReleasable { match(query: CvMat, train: CvMat, matches: CvDMatchVector): void }

export interface PhotoCv {
  Mat: (new (rows?: number, cols?: number, type?: number) => CvMat) & { eye(rows: number, cols: number, type: number): CvMat };
  Size: new (width: number, height: number) => unknown;
  Scalar: new (a: number, b: number, c: number, d: number) => unknown;
  TermCriteria: new (type: number, maxCount: number, epsilon: number) => unknown;
  ORB: new (features: number) => CvOrb;
  BFMatcher: new (norm: number, crossCheck: boolean) => CvMatcher;
  KeyPointVector: new () => CvKeyPointVector;
  DMatchVector: new () => CvDMatchVector;
  matFromArray(rows: number, cols: number, type: number, values: number[]): CvMat;
  cvtColor(source: CvMat, destination: CvMat, code: number): void;
  resize(source: CvMat, destination: CvMat, size: unknown, fx: number, fy: number, interpolation: number): void;
  findHomography(from: CvMat, to: CvMat, method: number, threshold: number, mask: CvMat): CvMat;
  findTransformECC(template: CvMat, input: CvMat, warp: CvMat, motion: number, criteria: unknown, mask: CvMat, gaussianSize: number): number;
  warpPerspective(source: CvMat, destination: CvMat, matrix: CvMat, size: unknown, flags: number, borderMode: number, borderValue: unknown): void;
  countNonZero(mat: CvMat): number;
  exceptionFromPtr?: (pointer: number) => { msg?: string };
  CV_8UC4: number;
  CV_8U: number;
  CV_32F: number;
  CV_64F: number;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  WARP_INVERSE_MAP: number;
  BORDER_CONSTANT: number;
  NORM_HAMMING: number;
  RANSAC: number;
  MOTION_TRANSLATION: number;
  MOTION_EUCLIDEAN: number;
  MOTION_HOMOGRAPHY: number;
  TermCriteria_COUNT: number;
  TermCriteria_EPS: number;
}

export class PhotoRegistrationError extends Error {
  constructor(message: string, readonly sourceIndex: number) {
    super(message);
    this.name = 'PhotoRegistrationError';
  }
}

const ORB_FEATURES = 1000;
const MAX_MATCH_DISTANCE = 64;
const MIN_FEATURE_MATCHES = 8;
const RANSAC_THRESHOLD = 3;
const ECC_ITERATIONS = 100;
const ECC_EPSILON = 1e-6;
const ECC_GAUSSIAN_SIZE = 5;
const LOW_CONFIDENCE_CORRELATION = 0.6;

type Matrix3 = [number, number, number, number, number, number, number, number, number];

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9).fill(0) as Matrix3;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

function normalizeHomogeneous(matrix: Matrix3): Matrix3 {
  const w = matrix[8];
  if (Math.abs(w) < 1e-12) return matrix;
  return matrix.map((value) => value / w) as Matrix3;
}

function applyToPoint(matrix: Matrix3, x: number, y: number): { x: number; y: number } {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  return { x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w, y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w };
}

/** Maps full-resolution pixel coordinates onto the downscaled working copy using OpenCV's
 * pixel-center convention for INTER_AREA resizing: x_small = s * x_full + (s - 1) / 2. */
function workingScaleMatrix(scale: number): Matrix3 {
  const offset = (scale - 1) / 2;
  return [scale, 0, offset, 0, scale, offset, 0, 0, 1];
}

function inverseWorkingScaleMatrix(scale: number): Matrix3 {
  const offset = (scale - 1) / 2;
  return [1 / scale, 0, -offset / scale, 0, 1 / scale, -offset / scale, 0, 0, 1];
}

function describeCvError(cv: PhotoCv, error: unknown): string {
  if (typeof error === 'number' && cv.exceptionFromPtr) {
    try { return cv.exceptionFromPtr(error).msg ?? `OpenCV error ${error}`; } catch { return `OpenCV error ${error}`; }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Tracks every OpenCV allocation made while handling one request so all of them are released
 * even when registration throws partway through — WASM heap memory is not garbage collected. */
export function createCvScope() {
  const owned: CvReleasable[] = [];
  return {
    track<T extends CvReleasable>(value: T): T {
      owned.push(value);
      return value;
    },
    release() {
      while (owned.length) {
        const value = owned.pop();
        try { value?.delete(); } catch { /* Releasing one handle must not prevent releasing the rest. */ }
      }
    },
  };
}

type CvScope = ReturnType<typeof createCvScope>;

export function rasterToMat(cv: PhotoCv, scope: CvScope, raster: PhotoMergeRaster): CvMat {
  const mat = scope.track(new cv.Mat(raster.height, raster.width, cv.CV_8UC4));
  mat.data.set(new Uint8Array(raster.buffer, 0, raster.width * raster.height * 4));
  return mat;
}

function workingGray(cv: PhotoCv, scope: CvScope, rgba: CvMat, scale: number): CvMat {
  const gray = scope.track(new cv.Mat());
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  if (scale >= 1) return gray;
  const small = scope.track(new cv.Mat());
  const width = Math.max(1, Math.round(rgba.cols * scale));
  const height = Math.max(1, Math.round(rgba.rows * scale));
  cv.resize(gray, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
  return small;
}

interface CoarseEstimate {
  homography: Matrix3;
  matches: number;
  inliers: number;
  /** Inlier correspondences in working-image coordinates: [fromX, fromY, toX, toY] per match. */
  inlierPairs: number[][];
}

/** ORB features + cross-checked Hamming matching + RANSAC homography. OpenCV's RANSAC seeds its
 * own RNG per call, so the estimate is deterministic for identical inputs. */
function coarseFeatureEstimate(
  cv: PhotoCv,
  scope: CvScope,
  reference: CvMat,
  target: CvMat,
  masks?: { reference: CvMat; target: CvMat },
): CoarseEstimate | null {
  const detector = scope.track(new cv.ORB(ORB_FEATURES));
  const emptyMask = scope.track(new cv.Mat());
  const referenceKeys = scope.track(new cv.KeyPointVector());
  const targetKeys = scope.track(new cv.KeyPointVector());
  const referenceDescriptors = scope.track(new cv.Mat());
  const targetDescriptors = scope.track(new cv.Mat());
  detector.detectAndCompute(reference, masks?.reference ?? emptyMask, referenceKeys, referenceDescriptors);
  detector.detectAndCompute(target, masks?.target ?? emptyMask, targetKeys, targetDescriptors);
  if (referenceDescriptors.empty() || targetDescriptors.empty()) return null;

  const matcher = scope.track(new cv.BFMatcher(cv.NORM_HAMMING, true));
  const matches = scope.track(new cv.DMatchVector());
  matcher.match(referenceDescriptors, targetDescriptors, matches);
  const fromPoints: number[] = [];
  const toPoints: number[] = [];
  for (let index = 0; index < matches.size(); index += 1) {
    const match = matches.get(index);
    if (match.distance <= MAX_MATCH_DISTANCE) {
      const from = referenceKeys.get(match.queryIdx).pt;
      const to = targetKeys.get(match.trainIdx).pt;
      fromPoints.push(from.x, from.y);
      toPoints.push(to.x, to.y);
    }
    // Value-typed in OpenCV.js 5 (no handle to free); older builds returned an owned handle.
    if (typeof match.delete === 'function') match.delete();
  }
  const count = fromPoints.length / 2;
  if (count < MIN_FEATURE_MATCHES) return null;

  const from = scope.track(cv.matFromArray(count, 1, cv.CV_32FC2, fromPoints));
  const to = scope.track(cv.matFromArray(count, 1, cv.CV_32FC2, toPoints));
  const inlierMask = scope.track(new cv.Mat());
  const homography = scope.track(cv.findHomography(from, to, cv.RANSAC, RANSAC_THRESHOLD, inlierMask));
  if (homography.empty()) return null;
  const values: number[] = [];
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) values.push(homography.doubleAt(row, col));
  const inliers = cv.countNonZero(inlierMask);
  if (inliers < MIN_FEATURE_MATCHES || values.some((value) => !Number.isFinite(value))) return null;
  const inlierPairs: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    if (inlierMask.data[index]) inlierPairs.push([fromPoints[index * 2], fromPoints[index * 2 + 1], toPoints[index * 2], toPoints[index * 2 + 1]]);
  }
  return { homography: normalizeHomogeneous(values as Matrix3), matches: count, inliers, inlierPairs };
}

function motionFor(cv: PhotoCv, model: PhotoRegistrationModel): number {
  if (model === 'translation') return cv.MOTION_TRANSLATION;
  if (model === 'euclidean') return cv.MOTION_EUCLIDEAN;
  return cv.MOTION_HOMOGRAPHY;
}

/** Seeds ECC from the coarse estimate expressed in the requested model: a translation or
 * euclidean model starts from the displacement of the working-image center (rotation 0); a
 * homography model starts from the full coarse homography. */
function eccInitialWarp(cv: PhotoCv, scope: CvScope, model: PhotoRegistrationModel, coarse: Matrix3, width: number, height: number): CvMat {
  if (model === 'homography') return scope.track(cv.matFromArray(3, 3, cv.CV_32F, coarse));
  const center = applyToPoint(coarse, (width - 1) / 2, (height - 1) / 2);
  const dx = center.x - (width - 1) / 2;
  const dy = center.y - (height - 1) / 2;
  return scope.track(cv.matFromArray(2, 3, cv.CV_32F, [1, 0, dx, 0, 1, dy]));
}

function readWarp(warp: CvMat, model: PhotoRegistrationModel): Matrix3 {
  const at = (row: number, col: number) => warp.floatAt(row, col);
  if (model === 'homography') {
    return normalizeHomogeneous([at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2), at(2, 0), at(2, 1), at(2, 2)]);
  }
  return [at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2), 0, 0, 1];
}

/** Estimates the transform mapping reference pixel coordinates to target pixel coordinates: a
 * coarse ORB/RANSAC estimate (when features are found) refined to sub-pixel accuracy by ECC, both
 * on a bounded downscaled copy, then scaled back to full resolution. */
export function registerFramePair(
  cv: PhotoCv,
  reference: PhotoMergeRaster,
  target: PhotoMergeRaster,
  model: PhotoRegistrationModel,
  sourceIndex: number,
): PhotoFrameRegistration {
  const scope = createCvScope();
  try {
    const longEdge = Math.max(reference.width, reference.height, target.width, target.height);
    const scale = Math.min(1, PHOTO_MERGE_LIMITS.registrationMaxEdge / longEdge);
    const referenceGray = workingGray(cv, scope, rasterToMat(cv, scope, reference), scale);
    const targetGray = workingGray(cv, scope, rasterToMat(cv, scope, target), scale);

    let coarse: CoarseEstimate | null = null;
    try {
      coarse = coarseFeatureEstimate(cv, scope, referenceGray, targetGray);
    } catch {
      coarse = null; // A feature-poor frame falls back to identity-initialised refinement.
    }

    const initial = eccInitialWarp(cv, scope, model, coarse?.homography ?? IDENTITY, referenceGray.cols, referenceGray.rows);
    const referenceFloat = scope.track(new cv.Mat());
    const targetFloat = scope.track(new cv.Mat());
    referenceGray.convertTo(referenceFloat, cv.CV_32F);
    targetGray.convertTo(targetFloat, cv.CV_32F);
    const criteria = new cv.TermCriteria(cv.TermCriteria_COUNT + cv.TermCriteria_EPS, ECC_ITERATIONS, ECC_EPSILON);
    const eccMask = scope.track(new cv.Mat());

    let working: Matrix3;
    let correlation = 0;
    try {
      correlation = cv.findTransformECC(referenceFloat, targetFloat, initial, motionFor(cv, model), criteria, eccMask, ECC_GAUSSIAN_SIZE);
      working = readWarp(initial, model);
      if (working.some((value) => !Number.isFinite(value))) throw new Error('ECC produced a non-finite transform.');
    } catch (error) {
      if (!coarse) {
        throw new PhotoRegistrationError(
          `Photo ${sourceIndex + 1} could not be aligned: no reliable feature matches and refinement did not converge (${describeCvError(cv, error)}).`,
          sourceIndex,
        );
      }
      working = coarse.homography;
      correlation = 0;
    }

    const full = normalizeHomogeneous(multiply(inverseWorkingScaleMatrix(scale), multiply(working, workingScaleMatrix(scale))));
    return {
      sourceIndex,
      model,
      matrix: [...full],
      coarse: coarse ? 'features' : 'identity',
      featureMatches: coarse?.matches ?? 0,
      inliers: coarse?.inliers ?? 0,
      correlation: Number.isFinite(correlation) ? correlation : 0,
      lowConfidence: !(correlation >= LOW_CONFIDENCE_CORRELATION),
    };
  } finally {
    scope.release();
  }
}

/** Resamples `target` into the reference frame's pixel grid using a registration matrix. Pixels
 * that fall outside the target come back fully transparent, so later merges can tell real
 * coverage apart from padding. */
export function warpFrameToReference(cv: PhotoCv, target: PhotoMergeRaster, matrix: number[], width: number, height: number): PhotoMergeRaster {
  const scope = createCvScope();
  try {
    const source = rasterToMat(cv, scope, target);
    const transform = scope.track(cv.matFromArray(3, 3, cv.CV_64F, matrix));
    const destination = scope.track(new cv.Mat());
    cv.warpPerspective(
      source,
      destination,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR | cv.WARP_INVERSE_MAP,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0),
    );
    const bytes = new Uint8Array(width * height * 4);
    bytes.set(destination.data.subarray(0, bytes.length));
    return { width, height, buffer: bytes.buffer };
  } finally {
    scope.release();
  }
}

/** Feature-detection mask for a frame with transparent padding (for example a cylindrically
 * projected frame): coverage shrunk by a margin so ORB never fires on the artificial border. */
function coverageMask(cv: PhotoCv, scope: CvScope, raster: PhotoMergeRaster, scale: number): CvMat {
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const data = new Uint8Array(raster.buffer, 0, raster.width * raster.height * 4);
  const margin = 12;
  const covered = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(raster.width - 1, Math.round(x / scale));
      const sy = Math.min(raster.height - 1, Math.round(y / scale));
      covered[y * width + x] = data[(sy * raster.width + sx) * 4 + 3] === 255 ? 1 : 0;
    }
  }
  // Separable minimum filter: a pixel is usable only if its whole margin neighbourhood is covered.
  const rows = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let ok = 1;
      for (let k = -margin; k <= margin && ok; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= width || !covered[y * width + xx]) ok = 0;
      }
      rows[y * width + x] = ok;
    }
  }
  const mask = scope.track(new cv.Mat(height, width, cv.CV_8U));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let ok = 1;
      for (let k = -margin; k <= margin && ok; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= height || !rows[yy * width + x]) ok = 0;
      }
      mask.data[y * width + x] = ok ? 255 : 0;
    }
  }
  return mask;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type PhotoPanoramaPairModel =
  | { kind: 'translation' }
  | { kind: 'rotation'; reference: CameraIntrinsics; target: CameraIntrinsics };

/** Registers two neighbouring panorama frames from features alone. ECC refinement is not used
 * here: it assumes near-complete overlap, while panorama neighbours often share only a third of
 * the frame. RANSAC selects the consistent matches; the final model is then fitted to those
 * inliers with few parameters so it stays well-conditioned beyond the overlap band:
 * `translation` (cylindrically projected frames) takes the median inlier displacement, and
 * `rotation` (planar projection) fits the 3-parameter camera rotation between viewing rays. */
export function registerPanoramaPair(
  cv: PhotoCv,
  reference: PhotoMergeRaster,
  target: PhotoMergeRaster,
  model: PhotoPanoramaPairModel,
  sourceIndex: number,
): PhotoFrameRegistration {
  const scope = createCvScope();
  try {
    const longEdge = Math.max(reference.width, reference.height, target.width, target.height);
    const scale = Math.min(1, PHOTO_MERGE_LIMITS.registrationMaxEdge / longEdge);
    const referenceGray = workingGray(cv, scope, rasterToMat(cv, scope, reference), scale);
    const targetGray = workingGray(cv, scope, rasterToMat(cv, scope, target), scale);
    const masks = {
      reference: coverageMask(cv, scope, reference, referenceGray.cols / reference.width),
      target: coverageMask(cv, scope, target, targetGray.cols / target.width),
    };
    let coarse: CoarseEstimate | null = null;
    try {
      coarse = coarseFeatureEstimate(cv, scope, referenceGray, targetGray, masks);
    } catch (error) {
      throw new PhotoRegistrationError(`Photos ${sourceIndex} and ${sourceIndex + 1} could not be matched (${describeCvError(cv, error)}).`, sourceIndex);
    }
    if (!coarse) {
      throw new PhotoRegistrationError(
        `Photos ${sourceIndex} and ${sourceIndex + 1} do not share enough matching detail. Panorama frames should overlap by roughly a third and be selected in shooting order.`,
        sourceIndex,
      );
    }
    const referenceScale = referenceGray.cols / reference.width;
    const targetScale = targetGray.cols / target.width;
    // Inlier correspondences in full-resolution pixel coordinates (inverse of the INTER_AREA
    // pixel-centre mapping x_small = s·x + (s − 1)/2).
    const pairs = coarse.inlierPairs.map(([fx, fy, tx, ty]) => [
      (fx - (referenceScale - 1) / 2) / referenceScale,
      (fy - (referenceScale - 1) / 2) / referenceScale,
      (tx - (targetScale - 1) / 2) / targetScale,
      (ty - (targetScale - 1) / 2) / targetScale,
    ]);
    let full: Matrix3;
    if (model.kind === 'translation') {
      const dx = median(pairs.map(([fx, , tx]) => tx - fx));
      const dy = median(pairs.map(([, fy, , ty]) => ty - fy));
      full = [1, 0, dx, 0, 1, dy, 0, 0, 1];
    } else {
      const { reference: from, target: to } = model;
      const rotation = fitRotation(
        pairs.map(([fx, fy]) => pixelRay(fx, fy, from.focal, from.cx, from.cy)),
        pairs.map(([, , tx, ty]) => pixelRay(tx, ty, to.focal, to.cx, to.cy)),
      );
      full = rotationHomography(rotation, from, to) as Matrix3;
    }
    const inlierRatio = coarse.inliers / Math.max(1, coarse.matches);
    return {
      sourceIndex,
      model: model.kind === 'translation' ? 'translation' : 'homography',
      matrix: [...full],
      coarse: 'features',
      featureMatches: coarse.matches,
      inliers: coarse.inliers,
      // No ECC here, so confidence is the RANSAC inlier ratio (same 0..1 "higher is better" sense).
      correlation: inlierRatio,
      lowConfidence: coarse.inliers < 2 * MIN_FEATURE_MATCHES || inlierRatio < 0.25,
    };
  } finally {
    scope.release();
  }
}
