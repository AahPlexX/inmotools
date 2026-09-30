import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { resolvePhotoCvRuntime } from '../../src/tools/photo/merge/photo-cv-runtime';
import { createPhotoMergeClient, PhotoMergeFailure, type PhotoMergeWorkerLike } from '../../src/tools/photo/merge/photo-merge-client';
import { handlePhotoMergeRequest, validatePhotoMergeRequest } from '../../src/tools/photo/merge/photo-merge-handler';
import { checkMergeSources, planPhotoMerge } from '../../src/tools/photo/merge/photo-merge-plan';
import { DEFAULT_TONEMAP, type PhotoMergeRaster, type PhotoMergeResponse } from '../../src/tools/photo/merge/photo-merge-types';
import { commonCoverageRect } from '../../src/tools/photo/merge/photo-exposure-merge';
import { exposureSecondsFromTags } from '../../src/tools/photo/merge/photo-merge-sources';
import { createCvScope, registerFramePair, warpFrameToReference, type PhotoCv } from '../../src/tools/photo/merge/photo-registration';

/** Deterministic textured fixture: overlapping soft-edged rectangles of varied size and color,
 * so both ORB corners and ECC intensity gradients exist (unlike a flat or strictly periodic grid). */
function texturedRaster(width: number, height: number, seed = 91): PhotoMergeRaster {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    bytes[i * 4] = 90; bytes[i * 4 + 1] = 100; bytes[i * 4 + 2] = 110; bytes[i * 4 + 3] = 255;
  }
  let state = seed;
  const next = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const rectangles = Math.round((width * height) / 900);
  for (let r = 0; r < rectangles; r += 1) {
    const w = 6 + Math.floor(next() * width * 0.12);
    const h = 6 + Math.floor(next() * height * 0.12);
    const x0 = Math.floor(next() * (width - w));
    const y0 = Math.floor(next() * (height - h));
    const color = [Math.floor(next() * 255), Math.floor(next() * 255), Math.floor(next() * 255)];
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const offset = (y * width + x) * 4;
        for (let c = 0; c < 3; c += 1) bytes[offset + c] = Math.round(bytes[offset + c] * 0.35 + color[c] * 0.65);
      }
    }
  }
  return { width, height, buffer: bytes.buffer };
}

function cropRaster(source: PhotoMergeRaster, x0: number, y0: number, width: number, height: number): PhotoMergeRaster {
  const from = new Uint8ClampedArray(source.buffer);
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const start = ((y + y0) * source.width + x0) * 4;
    bytes.set(from.subarray(start, start + width * 4), y * width * 4);
  }
  return { width, height, buffer: bytes.buffer };
}

/** Two frames of one continuous scene as a moved camera sees them: target(x, y) =
 * reference(x - dx, y - dy) everywhere, with real scene content (not padding) revealed at the
 * edges — so the fixture has no artificial border that the real use case never produces. */
function cameraPair(width: number, height: number, dx: number, dy: number, seed = 91) {
  const margin = 32;
  const scene = texturedRaster(width + margin * 2, height + margin * 2, seed);
  return {
    reference: cropRaster(scene, margin, margin, width, height),
    target: cropRaster(scene, margin - dx, margin - dy, width, height),
  };
}

function copyRaster(raster: PhotoMergeRaster): PhotoMergeRaster {
  return { width: raster.width, height: raster.height, buffer: raster.buffer.slice(0) };
}

function flatRaster(width: number, height: number, value: number): PhotoMergeRaster {
  const bytes = new Uint8ClampedArray(width * height * 4).fill(value);
  for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
  return { width, height, buffer: bytes.buffer };
}

// The production engine module statically imports the package for the browser worker bundle;
// Vitest's CJS interop proxies that package's promise export in a way that breaks module loading,
// so tests take the real engine through Node's own require and the same runtime resolver.
const nodeRequire = createRequire(import.meta.url);
let realEngine: Promise<PhotoCv> | null = null;
const loadPhotoMergeEngine = () => (realEngine ??= resolvePhotoCvRuntime(nodeRequire('@techstark/opencv-js')));

function project(matrix: number[], x: number, y: number) {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  return { x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w, y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w };
}

describe('merge planning (bounded source queue)', () => {
  const size = (width: number, height: number) => ({ width, height });

  test('rejects too few and too many sources with the configured limits', () => {
    expect(checkMergeSources([size(10, 10)], true)?.code).toBe('too-few-sources');
    expect(checkMergeSources(Array.from({ length: 10 }, () => size(10, 10)), true)?.code).toBe('too-many-sources');
  });

  test('names the offending photo for invalid, oversized, and mismatched frames', () => {
    expect(checkMergeSources([size(10, 10), size(0, 10)], true)).toMatchObject({ code: 'invalid-dimensions', sourceIndex: 1 });
    expect(checkMergeSources([size(10, 10), size(5000, 10)], true)).toMatchObject({ code: 'source-too-large', sourceIndex: 1 });
    expect(checkMergeSources([size(10, 10), size(10, 10), size(12, 10)], true)).toMatchObject({ code: 'dimension-mismatch', sourceIndex: 2 });
  });

  test('stacks and HDR require identical dimensions but a panorama does not', () => {
    const mixed = [size(400, 300), size(420, 300)];
    expect(planPhotoMerge('median-stack', mixed)).toMatchObject({ ok: false, diagnostic: { code: 'dimension-mismatch' } });
    expect(planPhotoMerge('panorama', mixed)).toMatchObject({ ok: true, sourceCount: 2 });
  });

  test('refuses a job whose estimated working memory exceeds the budget before any pixel work', () => {
    const large = Array.from({ length: 9 }, () => size(4096, 4096));
    expect(planPhotoMerge('exposure-fusion', large)).toMatchObject({ ok: false, diagnostic: { code: 'memory-budget' } });
  });

  test('an accepted plan reports its registration working scale', () => {
    const plan = planPhotoMerge('exposure-fusion', [size(2048, 1536), size(2048, 1536), size(2048, 1536)]);
    expect(plan).toMatchObject({ ok: true, sourceCount: 3, width: 2048, height: 1536 });
    if (plan.ok) expect(plan.registrationScale).toBeCloseTo(0.5, 6);
  });
});

describe('registration adapter against the real OpenCV engine', () => {
  let cv: PhotoCv;
  beforeAll(async () => { cv = await loadPhotoMergeEngine(); }, 30_000);

  test('recovers a known integer translation to sub-pixel accuracy', () => {
    const { reference, target } = cameraPair(320, 240, 6, -4);
    const result = registerFramePair(cv, reference, target, 'translation', 1);
    expect(result.coarse).toBe('features');
    expect(result.matrix[2]).toBeCloseTo(6, 1);
    expect(result.matrix[5]).toBeCloseTo(-4, 1);
    expect(result.correlation).toBeGreaterThan(0.9);
    expect(result.lowConfidence).toBe(false);
  }, 30_000);

  test('scales a transform found on the downscaled working copy back to full resolution exactly', () => {
    const { reference, target } = cameraPair(2048, 1536, 12, -8, 17);
    const result = registerFramePair(cv, reference, target, 'translation', 1);
    expect(Math.abs(result.matrix[2] - 12)).toBeLessThan(0.35);
    expect(Math.abs(result.matrix[5] + 8)).toBeLessThan(0.35);
  }, 30_000);

  test('recovers a small rotation plus translation with the euclidean model', () => {
    const reference = texturedRaster(400, 300, 5);
    const angle = (1.5 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Generating matrix A: target(y) = reference(A y). Registration must return A's inverse.
    const a = [cos, -sin, 5, sin, cos, 3, 0, 0, 1];
    const target = warpFrameToReference(cv, copyRaster(reference), a, 400, 300);
    const expected = [cos, sin, -(cos * 5 + sin * 3), -sin, cos, -(-sin * 5 + cos * 3), 0, 0, 1];
    const result = registerFramePair(cv, reference, target, 'euclidean', 1);
    for (const [x, y] of [[40, 30], [360, 30], [40, 270], [360, 270], [200, 150]]) {
      const got = project(result.matrix, x, y);
      const want = project(expected, x, y);
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(0.3);
    }
  }, 30_000);

  test('is deterministic: identical inputs give identical matrices', () => {
    const { reference, target } = cameraPair(320, 240, -5, 7, 33);
    const first = registerFramePair(cv, reference, target, 'homography', 1);
    const second = registerFramePair(cv, reference, target, 'homography', 1);
    expect(second.matrix).toEqual(first.matrix);
    expect(second.inliers).toBe(first.inliers);
  }, 30_000);

  test('warping the target through its registration reproduces the reference and marks uncovered pixels transparent', () => {
    const { reference, target } = cameraPair(320, 240, 9, 5, 8);
    const result = registerFramePair(cv, reference, target, 'translation', 1);
    const aligned = new Uint8ClampedArray(warpFrameToReference(cv, target, result.matrix, 320, 240).buffer);
    const original = new Uint8ClampedArray(reference.buffer);
    let difference = 0;
    let compared = 0;
    for (let y = 20; y < 200; y += 1) {
      for (let x = 20; x < 290; x += 1) {
        const offset = (y * 320 + x) * 4;
        for (let c = 0; c < 3; c += 1) difference += Math.abs(aligned[offset + c] - original[offset + c]);
        compared += 3;
      }
    }
    expect(difference / compared).toBeLessThan(3);
    // The far right/bottom edge has no target coverage after undoing the (+9, +5) shift.
    expect(aligned[(239 * 320 + 319) * 4 + 3]).toBe(0);
  }, 30_000);

  test('a featureless frame that cannot be refined fails with a per-photo registration error', async () => {
    const response = await handlePhotoMergeRequest(
      { id: 4, type: 'register', model: 'translation', referenceIndex: 0, sources: [flatRaster(64, 48, 120), flatRaster(64, 48, 120)] },
      loadPhotoMergeEngine,
    );
    expect(response).toMatchObject({ id: 4, ok: false, diagnostic: { code: 'registration-failed', sourceIndex: 1 } });
  }, 30_000);

  test('an align request returns one aligned raster per source on the reference grid', async () => {
    const { reference, target } = cameraPair(240, 180, 4, 3, 21);
    const response = await handlePhotoMergeRequest(
      { id: 9, type: 'align', model: 'translation', referenceIndex: 0, sources: [copyRaster(reference), target] },
      loadPhotoMergeEngine,
    );
    expect(response.ok).toBe(true);
    if (response.ok && response.type === 'align') {
      expect(response.aligned).toHaveLength(2);
      expect(response.aligned.every((raster) => raster.width === 240 && raster.height === 180)).toBe(true);
      expect(response.registrations[0].matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect(response.registrations[1].matrix[2]).toBeCloseTo(4, 1);
    }
  }, 30_000);
});

/** Same scene through a linear sensor at a different exposure: RGB scaled by `gain`, clipped. */
function exposed(raster: PhotoMergeRaster, gain: number): PhotoMergeRaster {
  const bytes = new Uint8ClampedArray(raster.buffer.slice(0));
  for (let i = 0; i < bytes.length; i += 4) for (let c = 0; c < 3; c += 1) bytes[i + c] = bytes[i + c] * gain;
  return { width: raster.width, height: raster.height, buffer: bytes.buffer };
}

function clippedFraction(raster: PhotoMergeRaster): number {
  const bytes = new Uint8Array(raster.buffer);
  let clipped = 0;
  for (let i = 0; i < bytes.length; i += 4) if (bytes[i] >= 254 || bytes[i + 1] >= 254 || bytes[i + 2] >= 254) clipped += 1;
  return clipped / (bytes.length / 4);
}

function meanLevel(raster: PhotoMergeRaster): number {
  const bytes = new Uint8Array(raster.buffer);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) sum += (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3;
  return sum / (bytes.length / 4);
}

describe('EXIF exposure time', () => {
  test('reads a rational or plain ExposureTime and rejects missing or non-positive values', () => {
    expect(exposureSecondsFromTags({ ExposureTime: { value: [1, 60] } })).toBeCloseTo(1 / 60, 9);
    expect(exposureSecondsFromTags({ ExposureTime: { value: 0.5 } })).toBe(0.5);
    expect(exposureSecondsFromTags({})).toBeNull();
    expect(exposureSecondsFromTags({ ExposureTime: { value: [0, 1] } })).toBeNull();
    expect(exposureSecondsFromTags({ ExposureTime: { value: 'fast' } })).toBeNull();
  });
});

describe('common coverage crop', () => {
  const frame = (width: number, height: number, transparent: (x: number, y: number) => boolean) => {
    const bytes = new Uint8Array(width * height * 4).fill(128);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) bytes[(y * width + x) * 4 + 3] = transparent(x, y) ? 0 : 255;
    return { width, height, buffer: bytes.buffer };
  };

  test('fully covered frames keep the whole frame', () => {
    expect(commonCoverageRect([frame(20, 10, () => false), frame(20, 10, () => false)])).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  test('padding from alignment in any frame is cropped away', () => {
    const shifted = frame(20, 10, (x, y) => x < 3 || y >= 8);
    expect(commonCoverageRect([frame(20, 10, () => false), shifted])).toEqual({ x: 3, y: 0, width: 17, height: 8 });
  });

  test('frames with no shared coverage return null', () => {
    expect(commonCoverageRect([frame(8, 8, (x) => x < 4), frame(8, 8, (x) => x >= 4)])).toBeNull();
  });
});

describe('exposure fusion and HDR against the real OpenCV engine', () => {
  const bracket = () => {
    const near = cameraPair(240, 180, 0, 0, 44);
    const shifted = cameraPair(240, 180, 4, -3, 44);
    return [exposed(near.reference, 0.4), exposed(shifted.target, 1), exposed(near.reference, 2.6)];
  };

  test('fusion aligns the bracket, crops to shared coverage, and holds highlights the bright frame clipped', async () => {
    const frames = bracket();
    const bright = copyRaster(frames[2]);
    const dark = copyRaster(frames[0]);
    const response = await handlePhotoMergeRequest({ id: 1, type: 'fuse', model: 'translation', align: true, referenceIndex: 0, sources: frames }, loadPhotoMergeEngine);
    expect(response.ok).toBe(true);
    if (!response.ok || response.type !== 'fuse') return;
    expect(response.registrations[1].matrix[2]).toBeCloseTo(4, 0);
    expect(response.crop.width).toBeLessThan(240);
    expect(response.result.width).toBe(response.crop.width);
    expect(response.result.height).toBe(response.crop.height);
    expect(clippedFraction(response.result)).toBeLessThan(clippedFraction(bright) * 0.5);
    const level = meanLevel(response.result);
    expect(level).toBeGreaterThan(meanLevel(dark));
    expect(level).toBeLessThan(meanLevel(bright));
  }, 30_000);

  test('HDR recovers a radiance map from exposure times and tone-maps it to a usable image', async () => {
    const response = await handlePhotoMergeRequest(
      { id: 2, type: 'hdr', model: 'translation', align: true, referenceIndex: 0, sources: bracket(), exposureSeconds: [0.4 / 60, 1 / 60, 2.6 / 60], tonemap: DEFAULT_TONEMAP },
      loadPhotoMergeEngine,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || response.type !== 'hdr') return;
    expect(response.result.width).toBe(response.crop.width);
    const level = meanLevel(response.result);
    expect(level).toBeGreaterThan(20);
    expect(level).toBeLessThan(235);
  }, 30_000);

  test('with alignment off, frames are merged as-is on the full grid', async () => {
    const scene = cameraPair(120, 90, 0, 0, 12).reference;
    const response = await handlePhotoMergeRequest(
      { id: 3, type: 'fuse', model: 'translation', align: false, referenceIndex: 0, sources: [exposed(scene, 0.5), exposed(scene, 1.5)] },
      loadPhotoMergeEngine,
    );
    expect(response).toMatchObject({ ok: true, crop: { x: 0, y: 0, width: 120, height: 90 } });
    if (response.ok && response.type === 'fuse') expect(response.registrations.every((item) => item.coarse === 'identity')).toBe(true);
  }, 30_000);

  test('HDR without a valid exposure time and fusion of mismatched sizes are refused before merging', async () => {
    const frames = bracket();
    const noTime = await handlePhotoMergeRequest(
      { id: 4, type: 'hdr', model: 'translation', align: true, referenceIndex: 0, sources: frames, exposureSeconds: [1 / 60, 0, 1 / 15], tonemap: DEFAULT_TONEMAP },
      vi.fn(),
    );
    expect(noTime).toMatchObject({ ok: false, diagnostic: { code: 'invalid-request', sourceIndex: 1 } });
    const mixed = await handlePhotoMergeRequest(
      { id: 5, type: 'fuse', model: 'translation', align: true, referenceIndex: 0, sources: [flatRaster(20, 10, 5), flatRaster(22, 10, 5)] },
      vi.fn(),
    );
    expect(mixed).toMatchObject({ ok: false, diagnostic: { code: 'dimension-mismatch', sourceIndex: 1 } });
  });
});

describe('panorama stitching against the real OpenCV engine', () => {
  /** One wide scene photographed as overlapping frames at the given left edges. */
  const strip = (lefts: number[], width = 240, height = 180, seed = 61) => {
    const scene = texturedRaster(Math.max(...lefts) + width, height, seed);
    return { scene, frames: lefts.map((left) => cropRaster(scene, left, 0, width, height)) };
  };

  function meanAbsDifference(a: PhotoMergeRaster, b: PhotoMergeRaster): number {
    const pa = new Uint8Array(a.buffer);
    const pb = new Uint8Array(b.buffer);
    let sum = 0;
    for (let i = 0; i < pa.length; i += 4) for (let c = 0; c < 3; c += 1) sum += Math.abs(pa[i + c] - pb[i + c]);
    return sum / ((pa.length / 4) * 3);
  }

  test('three overlapping frames stitch back into the original wide scene', async () => {
    const { scene, frames } = strip([0, 100, 200]);
    const response = await handlePhotoMergeRequest({ id: 1, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 1, sources: frames }, loadPhotoMergeEngine);
    expect(response.ok).toBe(true);
    if (!response.ok || response.type !== 'panorama') return;
    expect(Math.abs(response.result.width - 440)).toBeLessThanOrEqual(3);
    expect(Math.abs(response.result.height - 180)).toBeLessThanOrEqual(3);
    // Compare the stitched interior with the true scene at the offset the reference photo implies.
    const inner = cropRaster(response.result, 20, 20, 400, 140);
    const truth = cropRaster(scene, 20, 20, 400, 140);
    expect(meanAbsDifference(inner, truth)).toBeLessThan(6);
    expect(response.registrations.map((item) => item.sourceIndex)).toEqual([0, 1, 2]);
    expect(response.registrations[1].matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }, 60_000);

  test('the reference choice changes the origin but not the stitched content size', async () => {
    const { frames } = strip([0, 100, 200], 240, 180, 62);
    const left = await handlePhotoMergeRequest({ id: 2, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 0, sources: frames.map(copyRaster) }, loadPhotoMergeEngine);
    const middle = await handlePhotoMergeRequest({ id: 3, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 1, sources: frames.map(copyRaster) }, loadPhotoMergeEngine);
    expect(left.ok && middle.ok).toBe(true);
    if (left.ok && middle.ok && left.type === 'panorama' && middle.type === 'panorama') {
      expect(Math.abs(left.result.width - middle.result.width)).toBeLessThanOrEqual(3);
    }
  }, 60_000);

  test('a vertical offset leaves transparent edges that inscribed cropping removes but full cropping keeps', async () => {
    const scene = texturedRaster(380, 200, 63);
    const frames = [cropRaster(scene, 0, 10, 240, 180), cropRaster(scene, 70, 0, 240, 180), cropRaster(scene, 140, 20, 240, 180)];
    const transparentPixels = (raster: PhotoMergeRaster) => {
      const bytes = new Uint8Array(raster.buffer);
      let count = 0;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i] !== 255) count += 1;
      return count;
    };
    const full = await handlePhotoMergeRequest({ id: 4, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 1, sources: frames.map(copyRaster) }, loadPhotoMergeEngine);
    const inscribed = await handlePhotoMergeRequest({ id: 5, type: 'panorama', model: 'homography', cropMode: 'inscribed', referenceIndex: 1, sources: frames.map(copyRaster) }, loadPhotoMergeEngine);
    expect([full, inscribed].map((item) => (item.ok ? 'ok' : item.diagnostic.message))).toEqual(['ok', 'ok']);
    if (!full.ok || !inscribed.ok || full.type !== 'panorama' || inscribed.type !== 'panorama') return;
    expect(transparentPixels(full.result)).toBeGreaterThan(0);
    expect(transparentPixels(inscribed.result)).toBe(0);
    expect(inscribed.result.height).toBeLessThan(full.result.height);
    expect(inscribed.crop).toMatchObject({ width: inscribed.result.width, height: inscribed.result.height });
  }, 60_000);

  test('a neighbour that genuinely rotates keeps its rotation instead of being flattened to a shift', async () => {
    const cv = await loadPhotoMergeEngine();
    const scene = texturedRaster(380, 180, 62);
    const angle = (4 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotate the second frame 4 degrees about its centre (frame coordinates <- rotated coordinates).
    const centre = { x: 120, y: 90 };
    const rotation = [cos, -sin, centre.x - cos * centre.x + sin * centre.y, sin, cos, centre.y - sin * centre.x - cos * centre.y, 0, 0, 1];
    const rotated = warpFrameToReference(cv, cropRaster(scene, 90, 0, 240, 180), rotation, 240, 180);
    const response = await handlePhotoMergeRequest(
      { id: 9, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 0, sources: [cropRaster(scene, 0, 0, 240, 180), rotated] },
      loadPhotoMergeEngine,
    );
    expect(response.ok).toBe(true);
    if (!response.ok || response.type !== 'panorama') return;
    const matrix = response.registrations[1].matrix;
    expect(Math.abs(matrix[1])).toBeGreaterThan(0.03); // sin(4°) is about 0.07; a pure shift would be 0.
    expect(Math.abs(matrix[3])).toBeGreaterThan(0.03);
  }, 60_000);

  test('unrelated photos are refused as a registration failure naming the unmatched photo', async () => {
    const one = strip([0], 240, 180, 71).frames[0];
    const other = strip([0], 240, 180, 72).frames[0];
    const response = await handlePhotoMergeRequest({ id: 6, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 0, sources: [one, other] }, loadPhotoMergeEngine);
    expect(response).toMatchObject({ id: 6, ok: false, diagnostic: { code: 'registration-failed', sourceIndex: 1 } });
    expect(response.ok === false && response.diagnostic.message).toContain('overlap');
  }, 60_000);

  test('photos of different sizes are accepted for a panorama, and a bad crop mode is refused', () => {
    expect(validatePhotoMergeRequest({ id: 7, type: 'panorama', model: 'homography', cropMode: 'full', referenceIndex: 0, sources: [flatRaster(20, 10, 5), flatRaster(22, 12, 5)] })).toMatchObject({ ok: true });
    expect(validatePhotoMergeRequest({ id: 8, type: 'panorama', model: 'homography', cropMode: 'round', referenceIndex: 0, sources: [flatRaster(20, 10, 5), flatRaster(22, 12, 5)] })).toMatchObject({ ok: false, diagnostic: { code: 'invalid-request' } });
  });
});

describe('engine runtime resolution', () => {
  const ready = { Mat: function Mat() {} };

  test('accepts an already-initialised engine or a promise of one', async () => {
    await expect(resolvePhotoCvRuntime(ready)).resolves.toBe(ready);
    await expect(resolvePhotoCvRuntime(Promise.resolve(ready))).resolves.toBe(ready);
  });

  test('waits for an Emscripten runtime that is still starting', async () => {
    const pending: { Mat?: unknown; onRuntimeInitialized?: () => void } = {};
    const resolved = resolvePhotoCvRuntime(pending);
    await Promise.resolve();
    pending.Mat = function Mat() {};
    pending.onRuntimeInitialized?.();
    await expect(resolved).resolves.toBe(pending);
  });

  test('rejects a missing export instead of hanging', async () => {
    await expect(resolvePhotoCvRuntime(undefined)).rejects.toThrow('missing');
  });
});

describe('worker request handling and error isolation', () => {
  const good = () => ({ id: 1, type: 'register', model: 'translation', referenceIndex: 0, sources: [flatRaster(8, 8, 10), flatRaster(8, 8, 10)] });

  test('rejects malformed messages with a diagnostic instead of throwing, preserving the id', async () => {
    expect(validatePhotoMergeRequest(null)).toMatchObject({ ok: false, diagnostic: { code: 'invalid-request' } });
    expect(await handlePhotoMergeRequest({ ...good(), id: 7, type: 'explode' }, vi.fn())).toMatchObject({ id: 7, ok: false, diagnostic: { code: 'invalid-request' } });
    expect(await handlePhotoMergeRequest({ ...good(), model: 'spline' }, vi.fn())).toMatchObject({ ok: false, diagnostic: { code: 'invalid-request' } });
    expect(await handlePhotoMergeRequest({ ...good(), referenceIndex: 5 }, vi.fn())).toMatchObject({ ok: false, diagnostic: { code: 'invalid-request' } });
    const truncated = { ...good(), sources: [flatRaster(8, 8, 10), { width: 8, height: 8, buffer: new ArrayBuffer(10) }] };
    expect(await handlePhotoMergeRequest(truncated, vi.fn())).toMatchObject({ ok: false, diagnostic: { code: 'invalid-dimensions', sourceIndex: 1 } });
  });

  test('an engine that cannot load becomes an engine-unavailable diagnostic', async () => {
    const response = await handlePhotoMergeRequest(good(), () => Promise.reject(new Error('offline')));
    expect(response).toMatchObject({ id: 1, ok: false, diagnostic: { code: 'engine-unavailable' } });
    expect(response.ok === false && response.diagnostic.message).toContain('offline');
  });

  test('an unexpected engine fault fails only that request; the next request still succeeds', async () => {
    const brokenEngine = { Mat: class { constructor() { throw new Error('heap exhausted'); } } } as unknown as PhotoCv;
    const failed = await handlePhotoMergeRequest(good(), async () => brokenEngine);
    expect(failed).toMatchObject({ ok: false, diagnostic: { code: 'worker-failed' } });
    expect(failed.ok === false && failed.diagnostic.message).toContain('heap exhausted');

    const { reference, target } = cameraPair(160, 120, 3, 2, 3);
    const recovered = await handlePhotoMergeRequest(
      { id: 2, type: 'register', model: 'translation', referenceIndex: 0, sources: [copyRaster(reference), target] },
      loadPhotoMergeEngine,
    );
    expect(recovered).toMatchObject({ id: 2, ok: true, type: 'register' });
  }, 30_000);

  test('the allocation scope releases every tracked handle even when one release throws', () => {
    const scope = createCvScope();
    const released: string[] = [];
    scope.track({ delete: () => released.push('a') });
    scope.track({ delete: () => { throw new Error('double free'); } });
    scope.track({ delete: () => released.push('c') });
    scope.release();
    expect(released.sort()).toEqual(['a', 'c']);
  });
});

class FakeWorker implements PhotoMergeWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  posted: Array<{ message: { id: number }; transfer: Transferable[] }> = [];
  terminated = false;
  postMessage(message: unknown, transfer: Transferable[]) { this.posted.push({ message: message as { id: number }, transfer }); }
  terminate() { this.terminated = true; }
  reply(response: PhotoMergeResponse) { this.onmessage?.({ data: response } as MessageEvent<unknown>); }
}

describe('merge client', () => {
  afterEach(() => { vi.useRealTimers(); });
  const sources = () => [flatRaster(4, 4, 1), flatRaster(4, 4, 2)];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('creates its worker lazily, transfers source buffers, and resolves the matching reply', async () => {
    const workers: FakeWorker[] = [];
    const client = createPhotoMergeClient({ createWorker: () => { const w = new FakeWorker(); workers.push(w); return w; } });
    expect(workers).toHaveLength(0);
    const input = sources();
    const pending = client.register('translation', 0, input);
    await settle();
    expect(workers).toHaveLength(1);
    const sent = workers[0].posted[0];
    expect(sent.transfer).toEqual(input.map((source) => source.buffer));
    workers[0].reply({ id: sent.message.id + 99, ok: true, type: 'register', registrations: [] }); // stale id: ignored
    workers[0].reply({ id: sent.message.id, ok: true, type: 'register', registrations: [] });
    await expect(pending).resolves.toEqual([]);
  });

  test('runs one job at a time', async () => {
    const worker = new FakeWorker();
    const client = createPhotoMergeClient({ createWorker: () => worker });
    const first = client.register('translation', 0, sources());
    const second = client.register('translation', 0, sources());
    await settle();
    expect(worker.posted).toHaveLength(1);
    worker.reply({ id: worker.posted[0].message.id, ok: true, type: 'register', registrations: [] });
    await first;
    await settle();
    expect(worker.posted).toHaveLength(2);
    worker.reply({ id: worker.posted[1].message.id, ok: true, type: 'register', registrations: [] });
    await expect(second).resolves.toEqual([]);
  });

  test('a worker diagnostic rejects with that exact diagnostic', async () => {
    const worker = new FakeWorker();
    const client = createPhotoMergeClient({ createWorker: () => worker });
    const pending = client.register('translation', 0, sources());
    await settle();
    worker.reply({ id: worker.posted[0].message.id, ok: false, diagnostic: { code: 'registration-failed', message: 'Photo 2 could not be aligned.', sourceIndex: 1 } });
    await expect(pending).rejects.toMatchObject({ diagnostic: { code: 'registration-failed', sourceIndex: 1 } });
  });

  test('a job past its deadline terminates the worker; the next job starts a fresh one', async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const client = createPhotoMergeClient({ timeoutSeconds: 5, createWorker: () => { const w = new FakeWorker(); workers.push(w); return w; } });
    const stalled = client.register('translation', 0, sources());
    const assertion = expect(stalled).rejects.toBeInstanceOf(PhotoMergeFailure);
    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;
    await expect(stalled).rejects.toMatchObject({ diagnostic: { code: 'timeout' } });
    expect(workers[0].terminated).toBe(true);

    const next = client.register('translation', 0, sources());
    await vi.advanceTimersByTimeAsync(0);
    expect(workers).toHaveLength(2);
    workers[1].reply({ id: workers[1].posted[0].message.id, ok: true, type: 'register', registrations: [] });
    await expect(next).resolves.toEqual([]);
  });

  test('a crashed worker rejects the job and is replaced on the next job', async () => {
    const workers: FakeWorker[] = [];
    const client = createPhotoMergeClient({ createWorker: () => { const w = new FakeWorker(); workers.push(w); return w; } });
    const crashed = client.register('translation', 0, sources());
    await settle();
    workers[0].onerror?.({} as ErrorEvent);
    await expect(crashed).rejects.toMatchObject({ diagnostic: { code: 'worker-failed' } });
    expect(workers[0].terminated).toBe(true);
    const next = client.register('translation', 0, sources());
    await settle();
    expect(workers).toHaveLength(2);
    workers[1].reply({ id: workers[1].posted[0].message.id, ok: true, type: 'register', registrations: [] });
    await expect(next).resolves.toEqual([]);
  });

  test('an environment without workers reports engine-unavailable instead of throwing', async () => {
    const client = createPhotoMergeClient({ createWorker: () => { throw new Error('Worker is not defined'); } });
    await expect(client.register('translation', 0, sources())).rejects.toMatchObject({ diagnostic: { code: 'engine-unavailable' } });
  });

  test('dispose terminates the worker and refuses further jobs', async () => {
    const worker = new FakeWorker();
    const client = createPhotoMergeClient({ createWorker: () => worker });
    const pending = client.register('translation', 0, sources());
    await settle();
    worker.reply({ id: worker.posted[0].message.id, ok: true, type: 'register', registrations: [] });
    await pending;
    client.dispose();
    expect(worker.terminated).toBe(true);
    await expect(client.register('translation', 0, sources())).rejects.toBeInstanceOf(PhotoMergeFailure);
  });
});
