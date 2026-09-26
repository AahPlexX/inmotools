import type { PhotoMergeRaster } from './photo-merge-types';
import { createCvScope, type CvMat, type PhotoCv } from './photo-registration';

/** The OpenCV photo-module calls used for bracketed merges, verified against the pinned
 * `@techstark/opencv-js` build (OpenCV 5.0.0). MergeMertens' two-argument overload is exposed
 * as `process1` by that build's bindings. */
interface CvMatWithFloat extends CvMat { data32F: Float32Array }
interface CvMatVector { push_back(mat: CvMat): void; delete(): void }
interface CvProcessor { delete(): void }
interface CvMertens extends CvProcessor { process1(src: CvMatVector, dst: CvMat): void }
interface CvCalibrate extends CvProcessor { process(src: CvMatVector, dst: CvMat, times: CvMat): void }
interface CvMergeDebevec extends CvProcessor { process(src: CvMatVector, dst: CvMat, times: CvMat, response: CvMat): void }
interface CvTonemap extends CvProcessor { process(src: CvMat, dst: CvMat): void }

export interface PhotoCvExposure extends PhotoCv {
  MatVector: new () => CvMatVector;
  MergeMertens: new (contrast: number, saturation: number, exposure: number) => CvMertens;
  CalibrateDebevec: new (samples: number, lambda: number, random: boolean) => CvCalibrate;
  MergeDebevec: new () => CvMergeDebevec;
  TonemapReinhard: new (gamma: number, intensity: number, lightAdapt: number, colorAdapt: number) => CvTonemap;
  TonemapDrago: new (gamma: number, saturation: number, bias: number) => CvTonemap;
  TonemapMantiuk: new (gamma: number, scale: number, saturation: number) => CvTonemap;
  CV_8UC3: number;
  CV_32FC3: number;
  COLOR_RGBA2RGB: number;
}

export interface ExposureFusionOptions {
  /** Mertens quality-measure weights (0–2 each). */
  contrast: number;
  saturation: number;
  exposure: number;
}

export const DEFAULT_EXPOSURE_FUSION: ExposureFusionOptions = { contrast: 1, saturation: 1, exposure: 1 };

export type PhotoTonemapOperator = 'reinhard' | 'drago' | 'mantiuk';

export interface HdrMergeOptions {
  /** Exposure time of each source in seconds, in source order. */
  exposureTimes: number[];
  operator: PhotoTonemapOperator;
  gamma: number;
  /** Reinhard intensity (−8…8). */
  intensity: number;
  /** Reinhard light adaptation (0…1). */
  lightAdaptation: number;
  /** Reinhard colour adaptation (0…1). */
  colorAdaptation: number;
  /** Drago bias (0…1). */
  bias: number;
  /** Mantiuk contrast scale (0.1…1). */
  scale: number;
  /** Drago/Mantiuk saturation (0…3). */
  saturation: number;
}

export const DEFAULT_HDR_OPTIONS: Omit<HdrMergeOptions, 'exposureTimes'> = {
  operator: 'reinhard',
  gamma: 2.2,
  intensity: 0,
  lightAdaptation: 0,
  colorAdaptation: 0,
  bias: 0.85,
  scale: 0.7,
  saturation: 1,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Normalises user-editable HDR parameters into the ranges documented for each OpenCV operator. */
export function normalizeHdrOptions(options: HdrMergeOptions): HdrMergeOptions {
  const d = DEFAULT_HDR_OPTIONS;
  return {
    exposureTimes: options.exposureTimes.map((time) => (Number.isFinite(time) && time > 0 ? time : Number.NaN)),
    operator: options.operator === 'drago' || options.operator === 'mantiuk' ? options.operator : 'reinhard',
    gamma: clamp(options.gamma, 0.5, 4, d.gamma),
    intensity: clamp(options.intensity, -8, 8, d.intensity),
    lightAdaptation: clamp(options.lightAdaptation, 0, 1, d.lightAdaptation),
    colorAdaptation: clamp(options.colorAdaptation, 0, 1, d.colorAdaptation),
    bias: clamp(options.bias, 0, 1, d.bias),
    scale: clamp(options.scale, 0.1, 1, d.scale),
    saturation: clamp(options.saturation, 0, 3, d.saturation),
  };
}

/** HDR calibration needs genuinely different exposures; this names the first photo that breaks
 * that so the UI can ask for the missing or duplicate shutter time instead of producing noise. */
export function validateExposureTimes(times: number[], count: number): string | null {
  if (times.length !== count) return `Enter an exposure time for each of the ${count} photos.`;
  const missing = times.findIndex((time) => !(Number.isFinite(time) && time > 0));
  if (missing >= 0) return `Photo ${missing + 1} needs a positive exposure time in seconds.`;
  const distinct = new Set(times.map((time) => time.toPrecision(6)));
  if (distinct.size < 2) return 'HDR merge needs at least two different exposure times. For same-exposure frames, use an average or median stack.';
  return null;
}

/** Parses a shutter time typed as seconds ("0.004"), a fraction ("1/250"), or with a trailing
 * "s" ("2s"). Returns NaN for anything else. */
export function parseExposureTime(text: string): number {
  const value = text.trim().replace(/\s*s(ec(onds?)?)?$/i, '');
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(value);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator > 0 ? Number(fraction[1]) / denominator : Number.NaN;
  }
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
}

/** Human form of a shutter time: "1/250 s" below one second, otherwise decimal seconds. */
export function formatExposureTime(seconds: number): string {
  if (!(seconds > 0)) return '';
  if (seconds < 1) {
    const denominator = Math.round(1 / seconds);
    if (Math.abs(1 / denominator - seconds) / seconds < 0.01) return `1/${denominator} s`;
  }
  return `${Number(seconds.toPrecision(4))} s`;
}

type Scope = ReturnType<typeof createCvScope>;

function rgbMat(cv: PhotoCvExposure, scope: Scope, raster: PhotoMergeRaster): CvMat {
  const rgba = scope.track(new cv.Mat(raster.height, raster.width, cv.CV_8UC4));
  rgba.data.set(new Uint8Array(raster.buffer, 0, raster.width * raster.height * 4));
  const rgb = scope.track(new cv.Mat());
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  return rgb;
}

/** Aligned bracket frames leave transparent borders where a frame did not cover the reference.
 * Only pixels every frame covers are real data for an exposure merge; the rest stay transparent. */
function sharedCoverage(frames: PhotoMergeRaster[]): Uint8Array {
  const { width, height } = frames[0];
  const covered = new Uint8Array(width * height).fill(1);
  for (const frame of frames) {
    const data = new Uint8Array(frame.buffer, 0, width * height * 4);
    for (let p = 0; p < width * height; p += 1) if (data[p * 4 + 3] < 255) covered[p] = 0;
  }
  return covered;
}

function floatRgbToRaster(result: CvMatWithFloat, width: number, height: number, coverage: Uint8Array): PhotoMergeRaster {
  const values = result.data32F;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    if (!coverage[p]) continue;
    const r = values[p * 3]; const g = values[p * 3 + 1]; const b = values[p * 3 + 2];
    // Non-finite values (possible in radiance maps from saturated frames) become black, not NaN bytes.
    out[p * 4] = Number.isFinite(r) ? Math.round(r * 255) : 0;
    out[p * 4 + 1] = Number.isFinite(g) ? Math.round(g * 255) : 0;
    out[p * 4 + 2] = Number.isFinite(b) ? Math.round(b * 255) : 0;
    out[p * 4 + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

function assertBracket(frames: PhotoMergeRaster[]): void {
  if (frames.length < 2) throw new Error('A bracketed merge needs at least two photos.');
  const { width, height } = frames[0];
  if (frames.some((frame) => frame.width !== width || frame.height !== height)) throw new Error('Bracketed photos must share one pixel grid.');
}

/** Mertens exposure fusion: blends the best-exposed, most contrasty, most saturated parts of each
 * frame through Laplacian pyramids. It needs no exposure times and no tone mapping, and its output
 * converts to 8-bit by multiplying by 255 (per the OpenCV MergeMertens documentation). */
export function exposureFusion(cv: PhotoCvExposure, frames: PhotoMergeRaster[], options: ExposureFusionOptions = DEFAULT_EXPOSURE_FUSION): PhotoMergeRaster {
  assertBracket(frames);
  const scope = createCvScope();
  try {
    const vector = scope.track(new cv.MatVector());
    for (const frame of frames) vector.push_back(rgbMat(cv, scope, frame));
    const merge = scope.track(new cv.MergeMertens(
      clamp(options.contrast, 0, 2, 1),
      clamp(options.saturation, 0, 2, 1),
      clamp(options.exposure, 0, 2, 1),
    ));
    const fused = scope.track(new cv.Mat()) as CvMatWithFloat;
    merge.process1(vector, fused);
    return floatRgbToRaster(fused, frames[0].width, frames[0].height, sharedCoverage(frames));
  } finally {
    scope.release();
  }
}

/** Debevec HDR: recovers the camera response curve from the bracket, merges a floating-point
 * radiance map using the true exposure times, then tone maps it to displayable [0, 1] values with
 * the selected operator. Output is an 8-bit raster for the standard editing pipeline. */
export function hdrMerge(cv: PhotoCvExposure, frames: PhotoMergeRaster[], rawOptions: HdrMergeOptions): PhotoMergeRaster {
  assertBracket(frames);
  const options = normalizeHdrOptions(rawOptions);
  const problem = validateExposureTimes(options.exposureTimes, frames.length);
  if (problem) throw new Error(problem);
  const scope = createCvScope();
  try {
    const vector = scope.track(new cv.MatVector());
    for (const frame of frames) vector.push_back(rgbMat(cv, scope, frame));
    const times = scope.track(cv.matFromArray(frames.length, 1, cv.CV_32F, options.exposureTimes));
    const response = scope.track(new cv.Mat());
    scope.track(new cv.CalibrateDebevec(70, 10, false)).process(vector, response, times);
    const radiance = scope.track(new cv.Mat());
    scope.track(new cv.MergeDebevec()).process(vector, radiance, times, response);
    const tonemap = options.operator === 'drago'
      ? scope.track(new cv.TonemapDrago(options.gamma, options.saturation, options.bias))
      : options.operator === 'mantiuk'
        ? scope.track(new cv.TonemapMantiuk(options.gamma, options.scale, options.saturation))
        : scope.track(new cv.TonemapReinhard(options.gamma, options.intensity, options.lightAdaptation, options.colorAdaptation));
    const mapped = scope.track(new cv.Mat()) as CvMatWithFloat;
    tonemap.process(radiance, mapped);
    return floatRgbToRaster(mapped, frames[0].width, frames[0].height, sharedCoverage(frames));
  } finally {
    scope.release();
  }
}
