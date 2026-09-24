import { describe, expect, test } from 'vitest';
import {
  averageStack,
  compositePanorama,
  cropRaster,
  fieldOfViewFrom35mm,
  focalLengthPixels,
  fitRotation,
  focusStack,
  frameIntrinsics,
  invertMatrix3,
  largestOpaqueRectangle,
  medianStack,
  multiplyMatrix3,
  opaqueBounds,
  pixelRay,
  projectCylindrical,
  rotationHomography,
} from '../../src/tools/photo/merge/photo-merge-ops';
import type { PhotoMergeRaster } from '../../src/tools/photo/merge/photo-merge-types';

function raster(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): PhotoMergeRaster {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) bytes.set(fill(x, y), (y * width + x) * 4);
  }
  return { width, height, buffer: bytes.buffer };
}

function px(r: PhotoMergeRaster, x: number, y: number): number[] {
  const bytes = new Uint8ClampedArray(r.buffer);
  const o = (y * r.width + x) * 4;
  return [bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]];
}

describe('average and median stacks', () => {
  test('average is the per-channel mean of covering frames only', () => {
    const a = raster(2, 1, () => [10, 20, 30, 255]);
    const b = raster(2, 1, () => [30, 40, 50, 255]);
    const c = raster(2, 1, (x) => (x === 0 ? [200, 200, 200, 0] : [50, 60, 70, 255]));
    const out = averageStack([a, b, c]);
    expect(px(out, 0, 0)).toEqual([20, 30, 40, 255]); // Transparent pixel from c is ignored.
    expect(px(out, 1, 0)).toEqual([30, 40, 50, 255]);
  });

  test('median rejects a transient value present in a minority of frames', () => {
    const base = () => raster(1, 1, () => [100, 100, 100, 255]);
    const transient = raster(1, 1, () => [255, 0, 0, 255]);
    expect(px(medianStack([base(), transient, base()]), 0, 0)).toEqual([100, 100, 100, 255]);
    expect(px(medianStack([base(), transient]), 0, 0)).toEqual([178, 50, 50, 255]); // Even count: mean of middle two (177.5 → 178).
  });

  test('pixels no frame covers stay transparent', () => {
    const empty = raster(1, 1, () => [9, 9, 9, 0]);
    expect(px(averageStack([empty, empty]), 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(medianStack([empty, empty]), 0, 0)).toEqual([0, 0, 0, 0]);
  });

  test('frames on different grids are refused', () => {
    expect(() => averageStack([raster(2, 2, () => [0, 0, 0, 255]), raster(3, 2, () => [0, 0, 0, 255])])).toThrow(/one pixel grid/);
  });
});

describe('focus stack', () => {
  test('each half of the result comes from the frame that is sharp there', () => {
    // Frame A has a fine checkerboard on the left and flat grey on the right; frame B the reverse.
    const size = 32;
    const checker = (x: number, y: number) => ((x + y) % 2 ? 40 : 216);
    const a = raster(size, size, (x, y) => (x < size / 2 ? [checker(x, y), checker(x, y), checker(x, y), 255] : [128, 128, 128, 255]));
    const b = raster(size, size, (x, y) => (x >= size / 2 ? [checker(x, y), checker(x, y), checker(x, y), 255] : [128, 128, 128, 255]));
    const out = focusStack([a, b], { radius: 2, selectivity: 6 });
    // Deep inside each half the detailed frame dominates, so the checkerboard survives at full contrast.
    expect(Math.abs(px(out, 4, 8)[0] - px(out, 5, 8)[0])).toBeGreaterThan(150);
    expect(Math.abs(px(out, 26, 8)[0] - px(out, 27, 8)[0])).toBeGreaterThan(150);
  });

  test('flat regions with equal (zero) energy fall back to an even average', () => {
    const a = raster(4, 4, () => [100, 100, 100, 255]);
    const b = raster(4, 4, () => [200, 200, 200, 255]);
    expect(px(focusStack([a, b]), 2, 2)).toEqual([150, 150, 150, 255]);
  });
});

describe('coverage cropping', () => {
  test('opaque bounds and the largest fully opaque rectangle', () => {
    // 6×4 raster: an opaque 4×3 block at (1,0) plus one stray opaque pixel at (0,3).
    const r = raster(6, 4, (x, y) => ((x >= 1 && x <= 4 && y <= 2) || (x === 0 && y === 3) ? [1, 2, 3, 255] : [0, 0, 0, 0]));
    expect(opaqueBounds(r)).toEqual({ x: 0, y: 0, width: 5, height: 4 });
    expect(largestOpaqueRectangle(r)).toEqual({ x: 1, y: 0, width: 4, height: 3 });
    const cropped = cropRaster(r, { x: 1, y: 0, width: 4, height: 3 });
    expect(cropped.width).toBe(4);
    expect(px(cropped, 0, 0)).toEqual([1, 2, 3, 255]);
  });

  test('empty rasters have no bounds', () => {
    const r = raster(3, 3, () => [0, 0, 0, 0]);
    expect(opaqueBounds(r)).toBeNull();
    expect(largestOpaqueRectangle(r)).toBeNull();
  });
});

describe('cylindrical projection', () => {
  test('field of view and focal length conversions', () => {
    // 36 mm film at a 18 mm focal length sees 2·atan(1) = 90°.
    expect(fieldOfViewFrom35mm(18)).toBeCloseTo(90, 6);
    expect(fieldOfViewFrom35mm(0)).toBeNull();
    // A 90° frame 200 px wide has f = 100 / tan(45°) = 100.
    expect(focalLengthPixels(200, 90)).toBeCloseTo(100, 6);
  });

  test('the centre column is unchanged and the width shrinks by the arc length', () => {
    const r = raster(201, 11, (x) => [x, x, x, 255]);
    const f = 100;
    const out = projectCylindrical(r, f);
    // Output width = 2·floor(f·atan(100/f)) + 1 = 2·floor(100·π/4) + 1 = 2·78 + 1 = 157.
    expect(out.width).toBe(157);
    expect(px(out, (out.width - 1) / 2, 5)[0]).toBe(100);
    // Rows away from the horizon are pulled in at the edges, leaving transparent corners.
    expect(px(out, 0, 0)[3]).toBe(0);
    expect(px(out, 0, 5)[3]).toBe(255);
  });
});

describe('panorama compositing', () => {
  test('matrix helpers invert and compose', () => {
    const m = [1, 0, 5, 0, 1, -3, 0, 0, 1];
    expect(multiplyMatrix3(m, invertMatrix3(m)).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  test('two overlapping frames produce one continuous canvas with feathered overlap', () => {
    const scene = (x: number) => [x * 2, 100, 50, 255] as [number, number, number, number];
    const left = raster(40, 10, (x) => scene(x));
    const right = raster(40, 10, (x) => scene(x + 30)); // Starts 30 px into the scene.
    const composite = compositePanorama([
      { raster: left, toFrame: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      { raster: right, toFrame: [1, 0, -30, 0, 1, 0, 0, 0, 1] },
    ], { maxEdge: 4096, maxPixels: 1e7, gainCompensation: false });
    expect(composite.scale).toBe(1);
    expect(composite.raster.width).toBe(70);
    for (const x of [0, 20, 35, 50, 69]) expect(px(composite.raster, x, 5)).toEqual([...scene(x)]);
  });

  test('gain compensation equalises a darker neighbour', () => {
    const left = raster(40, 10, () => [120, 120, 120, 255]);
    const right = raster(40, 10, () => [60, 60, 60, 255]);
    const composite = compositePanorama([
      { raster: left, toFrame: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      { raster: right, toFrame: [1, 0, -30, 0, 1, 0, 0, 0, 1] },
    ], { maxEdge: 4096, maxPixels: 1e7, gainCompensation: true });
    expect(composite.gains[1] / composite.gains[0]).toBeCloseTo(2, 5);
    // Both ends now sit at the same (mean-normalised) level: 120·(2/3) = 80 and 60·(4/3) = 80.
    expect(px(composite.raster, 0, 5)[0]).toBe(80);
    expect(px(composite.raster, 69, 5)[0]).toBe(80);
  });

  test('an oversized canvas is uniformly scaled to fit the limits', () => {
    const frame = raster(100, 50, () => [10, 10, 10, 255]);
    const composite = compositePanorama([{ raster: frame, toFrame: [1, 0, 0, 0, 1, 0, 0, 0, 1] }], { maxEdge: 50, maxPixels: 1e7, gainCompensation: false });
    expect(composite.scale).toBeCloseTo(0.5, 6);
    expect(composite.raster.width).toBe(50);
    expect(composite.raster.height).toBe(25);
  });
});

describe('rotation-only camera model', () => {
  test('fits a known rotation exactly from paired rays', () => {
    // 12° yaw composed with 5° pitch.
    const yaw = (12 * Math.PI) / 180; const pitch = (5 * Math.PI) / 180;
    const ry = [Math.cos(yaw), 0, Math.sin(yaw), 0, 1, 0, -Math.sin(yaw), 0, Math.cos(yaw)];
    const rx = [1, 0, 0, 0, Math.cos(pitch), -Math.sin(pitch), 0, Math.sin(pitch), Math.cos(pitch)];
    const truth = multiplyMatrix3(rx, ry);
    const source = [[-0.3, -0.2], [0.25, -0.1], [0.1, 0.3], [-0.2, 0.15], [0, 0]].map(([x, y]) => pixelRay(x * 100 + 50, y * 100 + 40, 100, 50, 40));
    const target = source.map(([x, y, z]) => [truth[0] * x + truth[1] * y + truth[2] * z, truth[3] * x + truth[4] * y + truth[5] * z, truth[6] * x + truth[7] * y + truth[8] * z]);
    const fitted = fitRotation(source, target);
    fitted.forEach((value, index) => expect(value).toBeCloseTo(truth[index], 9));
  });

  test('the identity rotation gives an identity pixel homography', () => {
    const k = frameIntrinsics(400, 300, 60);
    expect(k.focal).toBeCloseTo(200 / Math.tan(Math.PI / 6), 9);
    rotationHomography([1, 0, 0, 0, 1, 0, 0, 0, 1], k, k).forEach((value, index) => expect(value).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][index], 12));
  });

  test('too few rays is refused', () => {
    expect(() => fitRotation([[0, 0, 1]], [[0, 0, 1]])).toThrow(/at least two/);
  });
});
