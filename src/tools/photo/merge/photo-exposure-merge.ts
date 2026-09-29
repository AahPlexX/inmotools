import type { PhotoMergeCrop, PhotoMergeRaster, PhotoTonemapSettings } from './photo-merge-types';
import { createCvScope, rasterToMat, type CvMat, type PhotoCv } from './photo-registration';

/** Largest axis-aligned rectangle (found by shrinking inward) where every aligned frame has real
 * coverage, so a merge never blends a frame's transparent alignment padding into the result.
 * Each step moves whichever edge has the most uncovered pixels one pixel inward.
 * ponytail: O((w+h)^2) worst case for huge misalignment; small handheld shifts take a few dozen steps. */
export function commonCoverageRect(frames: PhotoMergeRaster[]): PhotoMergeCrop | null {
  const { width, height } = frames[0];
  const covered = new Uint8Array(width * height).fill(1);
  for (const frame of frames) {
    const bytes = new Uint8Array(frame.buffer);
    for (let i = 0; i < width * height; i += 1) if (bytes[i * 4 + 3] !== 255) covered[i] = 0;
  }
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  const rowGaps = (y: number) => { let n = 0; for (let x = left; x <= right; x += 1) n += 1 - covered[y * width + x]; return n; };
  const colGaps = (x: number) => { let n = 0; for (let y = top; y <= bottom; y += 1) n += 1 - covered[y * width + x]; return n; };
  while (top <= bottom && left <= right) {
    const gaps = [rowGaps(top), rowGaps(bottom), colGaps(left), colGaps(right)];
    const worst = Math.max(...gaps);
    if (worst === 0) return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    const edge = gaps.indexOf(worst);
    if (edge === 0) top += 1;
    else if (edge === 1) bottom -= 1;
    else if (edge === 2) left += 1;
    else right -= 1;
  }
  return null;
}

type Scope = ReturnType<typeof createCvScope>;

function croppedRgbFrames(cv: PhotoCv, scope: Scope, frames: PhotoMergeRaster[], crop: PhotoMergeCrop) {
  const vector = scope.track(new cv.MatVector());
  const rect = new cv.Rect(crop.x, crop.y, crop.width, crop.height);
  for (const frame of frames) {
    const view = scope.track(rasterToMat(cv, scope, frame).roi(rect));
    const rgb = scope.track(new cv.Mat());
    cv.cvtColor(view, rgb, cv.COLOR_RGBA2RGB);
    vector.push_back(rgb);
  }
  return vector;
}

/** Converts a float RGB result in 0..1 to an opaque RGBA8 raster (values outside 0..1 saturate). */
function floatRgbToRaster(cv: PhotoCv, scope: Scope, result: CvMat): PhotoMergeRaster {
  const bytes8 = scope.track(new cv.Mat());
  result.convertTo(bytes8, cv.CV_8UC3, 255);
  const rgba = scope.track(new cv.Mat());
  cv.cvtColor(bytes8, rgba, cv.COLOR_RGB2RGBA);
  const out = new Uint8Array(rgba.cols * rgba.rows * 4);
  out.set(rgba.data.subarray(0, out.length));
  return { width: rgba.cols, height: rgba.rows, buffer: out.buffer };
}

/** Mertens exposure fusion: blends well-exposed, saturated, high-contrast regions of each frame
 * directly in display space. Needs no exposure times and no radiance map. */
export function fuseExposures(cv: PhotoCv, frames: PhotoMergeRaster[], crop: PhotoMergeCrop): PhotoMergeRaster {
  const scope = createCvScope();
  try {
    const sources = croppedRgbFrames(cv, scope, frames, crop);
    const merge = scope.track(new cv.MergeMertens(1, 1, 1));
    const fused = scope.track(new cv.Mat());
    // OpenCV.js binds only the four-argument overload; Mertens ignores times and response.
    merge.process(sources, fused, scope.track(new cv.Mat()), scope.track(new cv.Mat()));
    return floatRgbToRaster(cv, scope, fused);
  } finally {
    scope.release();
  }
}

/** Debevec HDR: recovers the camera response curve from the bracket, merges a linear radiance
 * map using each frame's exposure time, then Reinhard-tone-maps it back to display range. */
export function mergeHdr(
  cv: PhotoCv,
  frames: PhotoMergeRaster[],
  crop: PhotoMergeCrop,
  exposureSeconds: number[],
  tonemap: PhotoTonemapSettings,
): PhotoMergeRaster {
  const scope = createCvScope();
  try {
    const sources = croppedRgbFrames(cv, scope, frames, crop);
    const times = scope.track(cv.matFromArray(1, exposureSeconds.length, cv.CV_32F, exposureSeconds));
    const response = scope.track(new cv.Mat());
    scope.track(new cv.CalibrateDebevec(70, 10, false)).process(sources, response, times);
    const radiance = scope.track(new cv.Mat());
    scope.track(new cv.MergeDebevec()).process(sources, radiance, times, response);
    const display = scope.track(new cv.Mat());
    scope.track(new cv.TonemapReinhard(tonemap.gamma, tonemap.intensity, tonemap.lightAdaptation, tonemap.colorAdaptation)).process(radiance, display);
    return floatRgbToRaster(cv, scope, display);
  } finally {
    scope.release();
  }
}
