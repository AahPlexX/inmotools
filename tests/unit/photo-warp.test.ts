import { describe, expect, test } from 'vitest';
import {
  applyMeshWarpGesture,
  createNeutralMeshWarp,
  isMeshWarpNeutral,
  mapPhotoWarpPoint,
  normalizeLiquifyStrokes,
  normalizeMeshWarp,
  PHOTO_MESH_WARP_GRID,
  sampleLiquifyDisplacement,
  warpPhotoMeshLiquifyPixels,
} from '../../src/tools/photo/photo-warp';
import type { PhotoLiquifyStroke } from '../../src/tools/photo/photo-types';

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

describe('mesh warp neutrality and normalization', () => {
  test('a fresh neutral mesh has the expected grid size and is reported neutral', () => {
    const mesh = createNeutralMeshWarp();
    expect(mesh).toHaveLength(PHOTO_MESH_WARP_GRID * PHOTO_MESH_WARP_GRID);
    expect(isMeshWarpNeutral(mesh)).toBe(true);
    expect(isMeshWarpNeutral(null)).toBe(true);
  });

  test('a wrong-size mesh (corrupted/hand-edited recipe) normalizes to null rather than throwing', () => {
    expect(normalizeMeshWarp([{ dx: 0.1, dy: 0 }])).toBeNull();
  });

  test('an all-neutral mesh normalizes to null so a saved recipe stays byte-minimal', () => {
    expect(normalizeMeshWarp(createNeutralMeshWarp())).toBeNull();
  });

  test('displacement clamps to the bounded maximum', () => {
    const mesh = createNeutralMeshWarp();
    mesh[0] = { dx: 5, dy: -5 };
    const normalized = normalizeMeshWarp(mesh);
    expect(normalized).not.toBeNull();
    expect(normalized![0].dx).toBeLessThanOrEqual(0.12);
    expect(normalized![0].dy).toBeGreaterThanOrEqual(-0.12);
  });
});

describe('mesh warp gesture', () => {
  test('a drag near a grid point nudges it toward the drag delta', () => {
    const mesh = applyMeshWarpGesture(null, { x: 0, y: 0 }, { x: 0.1, y: 0.05 });
    expect(mesh[0].dx).toBeGreaterThan(0);
    expect(mesh[0].dy).toBeGreaterThan(0);
  });

  test('a drag far from a grid point leaves it unaffected', () => {
    const mesh = applyMeshWarpGesture(null, { x: 0, y: 0 }, { x: 0.1, y: 0 });
    const farCorner = mesh[mesh.length - 1]; // bottom-right control point
    expect(farCorner.dx).toBe(0);
    expect(farCorner.dy).toBe(0);
  });

  test('gestures accumulate onto an existing mesh rather than replacing it', () => {
    const first = applyMeshWarpGesture(null, { x: 0, y: 0 }, { x: 0.05, y: 0 });
    const second = applyMeshWarpGesture(first, { x: 0, y: 0 }, { x: 0.05, y: 0 });
    expect(second[0].dx).toBeGreaterThan(first[0].dx);
  });
});

describe('liquify stroke normalization', () => {
  test('an unrecognized mode falls back to push', () => {
    const strokes = normalizeLiquifyStrokes([{ id: 'a', mode: 'spin' as never, radius: 0.1, strength: 0.5, path: [{ x: 0.5, y: 0.5 }] }]);
    expect(strokes[0].mode).toBe('push');
  });

  test('a stroke with zero strength or an empty path is dropped', () => {
    const strokes = normalizeLiquifyStrokes([
      { id: 'a', mode: 'push', radius: 0.1, strength: 0, path: [{ x: 0.5, y: 0.5 }] },
      { id: 'b', mode: 'push', radius: 0.1, strength: 0.5, path: [] },
    ]);
    expect(strokes).toHaveLength(0);
  });

  test('more than the cap is truncated', () => {
    const many: PhotoLiquifyStroke[] = Array.from({ length: 250 }, (_, index) => ({
      id: `s${index}`, mode: 'push', radius: 0.05, strength: 0.5, path: [{ x: 0.5, y: 0.5 }],
    }));
    expect(normalizeLiquifyStrokes(many).length).toBeLessThanOrEqual(200);
  });
});

describe('liquify displacement', () => {
  test('a push stroke displaces points within its radius in the stroke direction', () => {
    const stroke: PhotoLiquifyStroke = {
      id: 'a', mode: 'push', radius: 0.2, strength: 1,
      path: [{ x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }],
    };
    const { dx, dy } = sampleLiquifyDisplacement([stroke], 0.45, 0.5);
    expect(dx).toBeGreaterThan(0); // stroke moved rightward
    expect(Math.abs(dy)).toBeLessThan(0.01);
  });

  test('a pull stroke displaces points toward the brush center', () => {
    const stroke: PhotoLiquifyStroke = { id: 'a', mode: 'pull', radius: 0.3, strength: 1, path: [{ x: 0.5, y: 0.5 }] };
    const { dx, dy } = sampleLiquifyDisplacement([stroke], 0.4, 0.5);
    expect(dx).toBeGreaterThan(0); // point at x=0.4 pulled toward center x=0.5
    expect(Math.abs(dy)).toBeLessThan(0.01);
  });

  test('a point outside every stroke radius is unaffected', () => {
    const stroke: PhotoLiquifyStroke = { id: 'a', mode: 'pull', radius: 0.05, strength: 1, path: [{ x: 0.5, y: 0.5 }] };
    const { dx, dy } = sampleLiquifyDisplacement([stroke], 0.9, 0.9);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  test('a restore stroke shrinks displacement already accumulated by an earlier push stroke', () => {
    const push: PhotoLiquifyStroke = { id: 'a', mode: 'push', radius: 0.3, strength: 1, path: [{ x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }] };
    const withoutRestore = sampleLiquifyDisplacement([push], 0.45, 0.5);
    const restore: PhotoLiquifyStroke = { id: 'b', mode: 'restore', radius: 0.3, strength: 1, path: [{ x: 0.45, y: 0.5 }] };
    const withRestore = sampleLiquifyDisplacement([push, restore], 0.45, 0.5);
    expect(Math.abs(withRestore.dx)).toBeLessThan(Math.abs(withoutRestore.dx));
  });
});

describe('mapPhotoWarpPoint and pixel warping', () => {
  test('with no mesh warp and no liquify strokes, the point maps to itself', () => {
    expect(mapPhotoWarpPoint(0.4, 0.6, null, [])).toEqual({ x: 0.4, y: 0.6 });
  });

  test('warpPhotoMeshLiquifyPixels is a byte-identical no-op when both are inactive', () => {
    const data = solid(4, 4, 10, 20, 30);
    const output = warpPhotoMeshLiquifyPixels(data, 4, 4, null, []);
    expect(Array.from(output)).toEqual(Array.from(data));
  });

  test('an active mesh warp changes the rendered output on a non-uniform image', () => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        const on = x < 4;
        data[offset] = on ? 255 : 0;
        data[offset + 1] = on ? 255 : 0;
        data[offset + 2] = on ? 255 : 0;
        data[offset + 3] = 255;
      }
    }
    const mesh = applyMeshWarpGesture(null, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 });
    const output = warpPhotoMeshLiquifyPixels(data, 8, 8, mesh, []);
    expect(Array.from(output)).not.toEqual(Array.from(data));
  });

  test('rejects mismatched pixel-buffer dimensions', () => {
    const data = solid(4, 4, 1, 2, 3);
    expect(() => warpPhotoMeshLiquifyPixels(data, 5, 5, null, [])).toThrow();
  });
});
