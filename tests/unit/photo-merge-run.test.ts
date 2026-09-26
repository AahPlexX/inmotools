import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { resolvePhotoCvRuntime } from '../../src/tools/photo/merge/photo-cv-runtime';
import { formatExposureTime, parseExposureTime, validateExposureTimes } from '../../src/tools/photo/merge/photo-merge-exposure';
import { handlePhotoMergeRequest, normalizeMergeOptions } from '../../src/tools/photo/merge/photo-merge-handler';
import { compositePanorama, frameIntrinsics, rotationHomography } from '../../src/tools/photo/merge/photo-merge-ops';
import { DEFAULT_PHOTO_MERGE_OPTIONS, runPhotoMerge } from '../../src/tools/photo/merge/photo-merge-run';
import type { PhotoMergeOptions, PhotoMergeRaster } from '../../src/tools/photo/merge/photo-merge-types';
import type { PhotoCv } from '../../src/tools/photo/merge/photo-registration';

// Same loading path as photo-merge.test.ts: Vitest's CJS interop breaks the package's promise
// export, so the real engine comes through Node's own require and the production resolver.
const nodeRequire = createRequire(import.meta.url);
let realEngine: Promise<PhotoCv> | null = null;
const engine = () => (realEngine ??= resolvePhotoCvRuntime(nodeRequire('@techstark/opencv-js')));

/** Smoothly varying, feature-rich scene radiance in [0.02, 1]: soft gradients plus scattered
 * rectangles give both ORB corners and the tonal range an exposure bracket needs. */
function sceneRadiance(width: number, height: number, seed = 7): Float32Array {
  const radiance = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 3;
      radiance[o] = 0.05 + 0.4 * (x / width);
      radiance[o + 1] = 0.05 + 0.4 * (y / height);
      radiance[o + 2] = 0.2;
    }
  }
  let state = seed;
  const next = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  for (let r = 0; r < Math.round((width * height) / 700); r += 1) {
    const w = 5 + Math.floor(next() * width * 0.1);
    const h = 5 + Math.floor(next() * height * 0.1);
    const x0 = Math.floor(next() * (width - w));
    const y0 = Math.floor(next() * (height - h));
    const level = [0.02 + next() * 0.98, 0.02 + next() * 0.98, 0.02 + next() * 0.98];
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) for (let c = 0; c < 3; c += 1) radiance[(y * width + x) * 3 + c] = level[c];
  }
  // Fine deterministic surface texture (2 px cells), as real photographed surfaces have, so feature
  // descriptors are locally distinctive rather than a field of identical rectangle corners.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hash = (Math.floor(x / 2) * 73856093) ^ (Math.floor(y / 2) * 19349663) ^ seed;
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const texture = 0.8 + 0.2 * (((hash ^ (hash >>> 16)) >>> 0) / 4294967295);
      for (let c = 0; c < 3; c += 1) radiance[(y * width + x) * 3 + c] *= texture;
    }
  }
  return radiance;
}

/** A camera exposure of the scene: linear radiance × relative exposure, display gamma, 8-bit clip. */
function expose(radiance: Float32Array, width: number, height: number, exposure: number): PhotoMergeRaster {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    for (let c = 0; c < 3; c += 1) bytes[p * 4 + c] = Math.round(255 * Math.min(1, radiance[p * 3 + c] * exposure) ** (1 / 2.2));
    bytes[p * 4 + 3] = 255;
  }
  return { width, height, buffer: bytes.buffer };
}

function crop(source: PhotoMergeRaster, x0: number, width: number): PhotoMergeRaster {
  const from = new Uint8ClampedArray(source.buffer);
  const bytes = new Uint8ClampedArray(width * source.height * 4);
  for (let y = 0; y < source.height; y += 1) bytes.set(from.subarray((y * source.width + x0) * 4, (y * source.width + x0 + width) * 4), y * width * 4);
  return { width, height: source.height, buffer: bytes.buffer };
}

function stats(raster: PhotoMergeRaster) {
  const bytes = new Uint8ClampedArray(raster.buffer);
  let clipped = 0; let crushed = 0; let sum = 0; let n = 0;
  for (let p = 0; p < raster.width * raster.height; p += 1) {
    if (bytes[p * 4 + 3] === 0) continue;
    const luma = (bytes[p * 4] + bytes[p * 4 + 1] + bytes[p * 4 + 2]) / 3;
    if (luma >= 254) clipped += 1;
    if (luma <= 8) crushed += 1;
    sum += luma; n += 1;
  }
  return { clipped: clipped / n, crushed: crushed / n, mean: sum / n };
}

function options(patch: Partial<PhotoMergeOptions>): PhotoMergeOptions {
  return { ...DEFAULT_PHOTO_MERGE_OPTIONS, ...patch };
}

describe('exposure-time parsing and validation', () => {
  test.each([
    ['1/250', 0.004],
    ['0.5', 0.5],
    ['2s', 2],
    ['1/8 sec', 0.125],
    ['fast', Number.NaN],
    ['1/0', Number.NaN],
  ])('parses %s', (text, expected) => {
    const parsed = parseExposureTime(text);
    if (Number.isNaN(expected)) expect(parsed).toBeNaN();
    else expect(parsed).toBeCloseTo(expected, 9);
  });

  test('formats shutter speeds the way cameras print them', () => {
    expect(formatExposureTime(0.004)).toBe('1/250 s');
    expect(formatExposureTime(2)).toBe('2 s');
    expect(formatExposureTime(0)).toBe('');
  });

  test('HDR requires one positive time per photo and at least two different times', () => {
    expect(validateExposureTimes([0.01, 0.04], 2)).toBeNull();
    expect(validateExposureTimes([0.01], 2)).toMatch(/each of the 2 photos/);
    expect(validateExposureTimes([0.01, Number.NaN], 2)).toMatch(/Photo 2/);
    expect(validateExposureTimes([0.01, 0.01], 2)).toMatch(/different exposure times/);
  });
});

describe('bracketed merges on the real engine', () => {
  const width = 160; const height = 120;
  const radiance = sceneRadiance(width, height);
  const bracket = () => [0.35, 1, 2.8].map((exposure) => expose(radiance, width, height, exposure));

  test('exposure fusion recovers both highlights and shadows the single frames lose', async () => {
    const cv = await engine();
    const frames = bracket();
    const dark = stats(frames[0]); const bright = stats(frames[2]);
    const outcome = runPhotoMerge(cv, 'exposure-fusion', frames, 1, options({ alignment: 'none' }));
    const fused = stats(outcome.result);
    expect(outcome.result.width).toBe(width);
    expect(fused.clipped).toBeLessThan(bright.clipped);
    expect(fused.crushed).toBeLessThanOrEqual(dark.crushed);
    expect(fused.mean).toBeGreaterThan(dark.mean);
    expect(fused.mean).toBeLessThan(bright.mean);
  });

  test('HDR merge with true exposure times produces a finite, tone-mapped, ordered result for every operator', { timeout: 60_000 }, async () => {
    const cv = await engine();
    for (const operator of ['reinhard', 'drago', 'mantiuk'] as const) {
      const outcome = runPhotoMerge(cv, 'hdr', bracket(), 1, options({
        alignment: 'none',
        hdr: { ...DEFAULT_PHOTO_MERGE_OPTIONS.hdr, operator, exposureTimes: [0.35 / 100, 1 / 100, 2.8 / 100] },
      }));
      const bytes = new Uint8ClampedArray(outcome.result.buffer);
      // The darkest and brightest scene regions must keep their order after tone mapping.
      const at = (x: number, y: number) => bytes[(y * width + x) * 4 + 1];
      expect(at(width / 2, height - 1), operator).toBeGreaterThan(at(width / 2, 0));
      expect(stats(outcome.result).clipped, operator).toBeLessThan(stats(bracket()[2]).clipped);
    }
  });

  test('HDR without distinct exposure times fails with a named reason', async () => {
    const cv = await engine();
    expect(() => runPhotoMerge(cv, 'hdr', bracket(), 1, options({ alignment: 'none', hdr: { ...DEFAULT_PHOTO_MERGE_OPTIONS.hdr, exposureTimes: [0.01, 0.01, 0.01] } })))
      .toThrow(/different exposure times/);
  });
});

describe('stacks on the real engine', () => {
  const width = 160; const height = 120;
  const radiance = sceneRadiance(width, height, 23);

  function noisy(seed: number, shift = 0): PhotoMergeRaster {
    const base = expose(radiance, width + 16, height, 1);
    const shifted = crop(base, 8 - shift, width);
    const bytes = new Uint8ClampedArray(shifted.buffer);
    let state = seed;
    const next = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
    for (let p = 0; p < width * height; p += 1) for (let c = 0; c < 3; c += 1) bytes[p * 4 + c] = bytes[p * 4 + c] + Math.round((next() - 0.5) * 40);
    return shifted;
  }

  function errorAgainst(result: PhotoMergeRaster, reference: PhotoMergeRaster, xOffset = 0): number {
    const a = new Uint8ClampedArray(result.buffer); const b = new Uint8ClampedArray(reference.buffer);
    let sum = 0; let n = 0;
    for (let y = 10; y < result.height - 10; y += 1) {
      for (let x = 10; x < result.width - 10; x += 1) {
        const o = (y * result.width + x) * 4; const r = (y * reference.width + x + xOffset) * 4;
        sum += Math.abs(a[o + 1] - b[r + 1]); n += 1;
      }
    }
    return sum / n;
  }

  test('average and median stacks of aligned noisy frames are closer to the clean scene than one frame', async () => {
    const cv = await engine();
    const clean = crop(expose(radiance, width + 16, height, 1), 8, width);
    const frames = [noisy(11), noisy(12, 3), noisy(13, -2), noisy(14, 1), noisy(15)];
    const single = errorAgainst(frames[0], clean);
    for (const operation of ['average-stack', 'median-stack'] as const) {
      const outcome = runPhotoMerge(cv, operation, frames.map((f) => ({ ...f, buffer: f.buffer.slice(0) })), 0, options({ alignment: 'translation', cropToCoverage: false }));
      expect(outcome.registrations).toHaveLength(5);
      expect(errorAgainst(outcome.result, clean), operation).toBeLessThan(single * 0.75);
    }
  });

  test('cropping to coverage removes the edges some frames do not reach', async () => {
    const cv = await engine();
    const frames = [noisy(21), noisy(22, 4), noisy(23, -4)];
    const outcome = runPhotoMerge(cv, 'average-stack', frames, 0, options({ alignment: 'translation', cropToCoverage: true }));
    expect(outcome.result.width).toBeLessThanOrEqual(width - 7);
    expect(outcome.result.width).toBeGreaterThanOrEqual(width - 10);
    expect(outcome.notes.join(' ')).toMatch(/Cropped to/);
  });
});

/** Renders what a camera with focal `focal` sees when yawed by `degrees` from the reference view,
 * given the reference view's image `world` (a wide planar image at the same focal length). This is
 * the exact pinhole geometry of a panning photographer, so stitching can be checked against truth. */
function yawedFrame(world: PhotoMergeRaster, focal: number, degrees: number, width: number, height: number): PhotoMergeRaster {
  const data = new Uint8ClampedArray(world.buffer);
  const out = new Uint8ClampedArray(width * height * 4);
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const wcx = (world.width - 1) / 2; const wcy = (world.height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rx = (x - (width - 1) / 2) / focal; const ry = (y - (height - 1) / 2) / focal;
      // Rotate the viewing ray about the vertical axis into the reference camera, then project.
      const zx = cos * rx + sin; const zz = -sin * rx + cos;
      if (zz <= 0) continue;
      const u = focal * (zx / zz) + wcx; const v = focal * (ry / zz) + wcy;
      const u0 = Math.floor(u); const v0 = Math.floor(v);
      if (u0 < 0 || v0 < 0 || u0 + 1 >= world.width || v0 + 1 >= world.height) continue;
      const fu = u - u0; const fv = v - v0;
      for (let c = 0; c < 3; c += 1) {
        const at = (xx: number, yy: number) => data[(yy * world.width + xx) * 4 + c];
        const top = at(u0, v0) + (at(u0 + 1, v0) - at(u0, v0)) * fu;
        const bottom = at(u0, v0 + 1) + (at(u0 + 1, v0 + 1) - at(u0, v0 + 1)) * fu;
        out[(y * width + x) * 4 + c] = Math.round(top + (bottom - top) * fv);
      }
      out[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { width, height, buffer: out.buffer };
}

describe('panorama on the real engine', () => {
  const frameWidth = 300; const frameHeight = 200; const fieldOfView = 50;
  const focal = (frameWidth / 2) / Math.tan(((fieldOfView / 2) * Math.PI) / 180);
  const world = expose(sceneRadiance(1100, 360, 41), 1100, 360, 1);
  const frames = () => [-20, 0, 20].map((yaw) => yawedFrame(world, focal, yaw, frameWidth, frameHeight));

  test('planar stitching recovers each camera rotation and rebuilds the ground-truth composite', async () => {
    const cv = await engine();
    const outcome = runPhotoMerge(cv, 'panorama', frames(), 0, options({
      cropToCoverage: false,
      panorama: { projection: 'planar', fieldOfView, gainCompensation: false },
    }));
    // Truth for frame 1 → frame 2: K · R_y(20°) · K⁻¹ maps the frame centre to x = c − f·tan(20°).
    const centre = (frameWidth - 1) / 2;
    const m = outcome.registrations[2].matrix;
    const w = m[6] * centre + m[7] * ((frameHeight - 1) / 2) + m[8];
    expect((m[0] * centre + m[1] * ((frameHeight - 1) / 2) + m[2]) / w).toBeCloseTo(centre - focal * Math.tan((20 * Math.PI) / 180), 0);
    // The composite spans the reference plane from −(20° + 25°) to +(20° + 25°): 2·f·tan 45° + 1 px wide.
    expect(Math.abs(outcome.result.width - (2 * focal + 1))).toBeLessThanOrEqual(3);
    // Against the composite built from the analytically true rotations through the same compositor,
    // so only registration error (not the shared resampling) is measured.
    const intrinsics = frameIntrinsics(frameWidth, frameHeight, fieldOfView);
    const truthToFrame = [-20, 0, 20].map((yaw) => {
      const angle = (yaw * Math.PI) / 180;
      // yawedFrame maps frame rays to reference rays by R_y(yaw); reference → frame is its transpose.
      return rotationHomography([Math.cos(angle), 0, -Math.sin(angle), 0, 1, 0, Math.sin(angle), 0, Math.cos(angle)], intrinsics, intrinsics);
    });
    const truth = compositePanorama(frames().map((raster, index) => ({ raster, toFrame: truthToFrame[index] })), { maxEdge: 8192, maxPixels: 16 * 1024 * 1024, gainCompensation: false });
    expect(Math.abs(truth.raster.width - outcome.result.width)).toBeLessThanOrEqual(1);
    const a = new Uint8ClampedArray(outcome.result.buffer); const b = new Uint8ClampedArray(truth.raster.buffer);
    let error = 0; let n = 0;
    const width = Math.min(truth.raster.width, outcome.result.width); const height = Math.min(truth.raster.height, outcome.result.height);
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const o = (y * outcome.result.width + x) * 4; const t = (y * truth.raster.width + x) * 4;
        if (a[o + 3] === 0 || b[t + 3] === 0) continue;
        error += Math.abs(a[o + 1] - b[t + 1]); n += 1;
      }
    }
    expect(n).toBeGreaterThan(10_000);
    expect(error / n).toBeLessThan(2.5);
  });

  test('cylindrical stitching widens the view, keeps horizontal steps equal, and crops to full coverage', async () => {
    const cv = await engine();
    const outcome = runPhotoMerge(cv, 'panorama', frames(), 0, options({
      cropToCoverage: true,
      panorama: { projection: 'cylindrical', fieldOfView, gainCompensation: true },
    }));
    // On the cylinder a 20° yaw is a translation of f·(20° in radians) pixels.
    const step = focal * ((20 * Math.PI) / 180);
    expect(-outcome.registrations[1].matrix[2]).toBeCloseTo(step, 0);
    expect(-outcome.registrations[2].matrix[2]).toBeCloseTo(step, 0);
    expect(outcome.result.width).toBeGreaterThan(frameWidth * 1.6);
    const bytes = new Uint8ClampedArray(outcome.result.buffer);
    let transparent = 0;
    for (let p = 0; p < outcome.result.width * outcome.result.height; p += 1) if (bytes[p * 4 + 3] !== 255) transparent += 1;
    expect(transparent).toBe(0);
  });

  test('frames that do not overlap fail with a diagnostic naming the pair', async () => {
    const cv = await engine();
    const a = expose(sceneRadiance(200, 120, 51), 200, 120, 1);
    const b = expose(sceneRadiance(200, 120, 99), 200, 120, 1);
    const response = await handlePhotoMergeRequest({
      id: 4, type: 'merge', operation: 'panorama', referenceIndex: 0, sources: [a, b], options: DEFAULT_PHOTO_MERGE_OPTIONS,
    }, () => Promise.resolve(cv));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.diagnostic.code).toBe('registration-failed');
      expect(response.diagnostic.message).toMatch(/Photos 1 and 2/);
    }
  });
});

describe('merge request validation', () => {
  test('unknown operations are refused before loading the engine', async () => {
    let loaded = false;
    const response = await handlePhotoMergeRequest({ id: 1, type: 'merge', operation: 'mystery', referenceIndex: 0, sources: [] }, () => { loaded = true; return Promise.reject(new Error('unused')); });
    expect(response.ok).toBe(false);
    expect(loaded).toBe(false);
  });

  test('stack operations require identical dimensions; panorama does not', async () => {
    const a = expose(sceneRadiance(40, 30), 40, 30, 1);
    const b = expose(sceneRadiance(50, 30), 50, 30, 1);
    const stack = await handlePhotoMergeRequest({ id: 2, type: 'merge', operation: 'median-stack', referenceIndex: 0, sources: [a, b], options: {} }, engine);
    expect(stack.ok).toBe(false);
    if (!stack.ok) expect(stack.diagnostic.code).toBe('dimension-mismatch');
  });

  test('malformed options fall back to documented defaults', () => {
    const normalized = normalizeMergeOptions({ alignment: 'warp-drive', panorama: { fieldOfView: 900, projection: 'fisheye' }, hdr: { exposureTimes: ['x', 0.5] } });
    expect(normalized.alignment).toBe(DEFAULT_PHOTO_MERGE_OPTIONS.alignment);
    expect(normalized.panorama.projection).toBe('cylindrical');
    expect(normalized.panorama.fieldOfView).toBe(170);
    expect(normalized.hdr.exposureTimes[0]).toBeNaN();
    expect(normalized.hdr.exposureTimes[1]).toBe(0.5);
  });
});
