import { describe, expect, test } from 'vitest';
import { applyPixelAdjustments, DEFAULT_RECIPE, normalizeRecipe } from '../../src/tools/photo/photo-engine';
import { placeRetouchPoint } from '../../src/tools/photo/photo-interaction';
import type { RetouchOperation } from '../../src/tools/photo/photo-types';

describe('retouch multi-stroke clone/heal', () => {
  test('a single click target placement leaves the path empty, matching a plain single-stamp operation', () => {
    const source = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 0.2, sourceY: 0.2, targetX: 0.8, targetY: 0.8,
        radius: 0.05, feather: 0.5, opacity: 1, enabled: true, path: [], anchored: false,
      }],
    });
    const placed = placeRetouchPoint(source, 'clone', { x: 0.7, y: 0.6 }, 'target');
    const operation = placed.retouch[0];
    if (operation.type !== 'clone') throw new Error('expected clone operation');
    expect(operation.targetX).toBeCloseTo(0.7);
    expect(operation.targetY).toBeCloseTo(0.6);
    expect(operation.path).toHaveLength(0);
  });

  test('the first dragged target placement anchors the offset and stores the rest of the drag as stroke points', () => {
    const source = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 0.2, sourceY: 0.2, targetX: 0.8, targetY: 0.8,
        radius: 0.05, feather: 0.5, opacity: 1, enabled: true, path: [], anchored: false,
      }],
    });
    const placed = placeRetouchPoint(source, 'clone', { x: 0.6, y: 0.6 }, 'target', [
      { x: 0.5, y: 0.5 },
      { x: 0.55, y: 0.55 },
      { x: 0.6, y: 0.6 },
    ]);
    const operation = placed.retouch[0];
    if (operation.type !== 'clone') throw new Error('expected clone operation');
    expect(operation.targetX).toBeCloseTo(0.5);
    expect(operation.targetY).toBeCloseTo(0.5);
    expect(operation.path).toEqual([{ x: 0.55, y: 0.55 }, { x: 0.6, y: 0.6 }]);
  });

  test('a second stroke keeps the locked anchor and appends its own points instead of replacing it', () => {
    const source = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 0.2, sourceY: 0.2, targetX: 0.8, targetY: 0.8,
        radius: 0.05, feather: 0.5, opacity: 1, enabled: true, path: [], anchored: false,
      }],
    });
    const firstStroke = placeRetouchPoint(source, 'clone', { x: 0.5, y: 0.5 }, 'target', [{ x: 0.5, y: 0.5 }]);
    const secondStroke = placeRetouchPoint(firstStroke, 'clone', { x: 0.9, y: 0.9 }, 'target', [
      { x: 0.85, y: 0.85 },
      { x: 0.9, y: 0.9 },
    ]);
    const operation = secondStroke.retouch[0];
    if (operation.type !== 'clone') throw new Error('expected clone operation');
    // The anchor stays wherever the very first stroke started, so the source offset never moves.
    expect(operation.targetX).toBeCloseTo(0.5);
    expect(operation.targetY).toBeCloseTo(0.5);
    expect(operation.path).toEqual([{ x: 0.85, y: 0.85 }, { x: 0.9, y: 0.9 }]);
  });

  test('re-anchoring the source clears any stroke painted under the previous offset', () => {
    const source = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 0.2, sourceY: 0.2, targetX: 0.8, targetY: 0.8,
        radius: 0.05, feather: 0.5, opacity: 1, enabled: true, path: [], anchored: false,
      }],
    });
    const stroked = placeRetouchPoint(source, 'clone', { x: 0.5, y: 0.5 }, 'target', [
      { x: 0.5, y: 0.5 },
      { x: 0.55, y: 0.55 },
    ]);
    expect((stroked.retouch[0] as Extract<RetouchOperation, { type: 'clone' }>).path).toHaveLength(1);
    const reSourced = placeRetouchPoint(stroked, 'clone', { x: 0.1, y: 0.1 }, 'source');
    const operation = reSourced.retouch[0];
    if (operation.type !== 'clone') throw new Error('expected clone operation');
    expect(operation.sourceX).toBeCloseTo(0.1);
    expect(operation.sourceY).toBeCloseTo(0.1);
    expect(operation.path).toHaveLength(0);
  });

  test('legacy operations without a path field normalize to an empty path and render as the single anchored stamp they always were', () => {
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 0.2, sourceY: 0.5, targetX: 0.8, targetY: 0.5,
        radius: 0.05, feather: 0.5, opacity: 1,
      } as unknown as RetouchOperation],
    });
    const operation = recipe.retouch[0];
    if (operation.type !== 'clone') throw new Error('expected clone operation');
    expect(operation.enabled).toBe(true);
    expect(operation.path).toEqual([]);
  });

  test('a stroke point away from the anchor samples the source shifted by the same locked delta', () => {
    // Column 0 ("A", red) is what the anchor stamp (column 2) samples: delta = source(0) -
    // anchor(2) = -2. Column 2 also independently holds "B" (green) *before* rendering, in the
    // pristine snapshot every stamp reads from — the anchor overwrites column 2's *output*, but
    // never its own read, so column 2 remains available as source data for other stamps. A path
    // stamp at column 4 has no correct reason to turn green unless it reuses that same delta of
    // -2 (4 - 2 = 2, i.e. column 2 = "B"); a per-stamp-derived offset has no way to land there.
    const width = 6;
    const pixels = new Uint8ClampedArray(width * 1 * 4);
    const paint = (column: number, r: number, g: number, b: number) => {
      const offset = column * 4;
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = 255;
    };
    paint(0, 200, 10, 10); // "A"
    paint(1, 10, 10, 10);
    paint(2, 10, 200, 10); // "B"
    paint(3, 10, 10, 10);
    paint(4, 10, 10, 10); // path stamp's write target
    paint(5, 10, 10, 10);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone',
        sourceX: 0.5 / width, sourceY: 0.5,
        targetX: 2.5 / width, targetY: 0.5,
        radius: 0.1, feather: 0, opacity: 1, enabled: true,
        path: [{ x: 4.5 / width, y: 0.5 }],
      }],
    });
    applyPixelAdjustments(pixels, width, 1, recipe);
    const column4 = 4 * 4;
    expect(pixels[column4 + 1]).toBeGreaterThan(pixels[column4]); // green channel now dominant, from "B"
  });
});

describe('retouch bypass', () => {
  test('a disabled operation is skipped entirely', () => {
    const pixels = new Uint8ClampedArray([240, 20, 20, 255, 20, 240, 20, 255, 20, 20, 240, 255]);
    const untouched = Uint8ClampedArray.from(pixels);
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      retouch: [{
        id: 'clone', type: 'clone', sourceX: 1 / 6, sourceY: 0.5, targetX: 5 / 6, targetY: 0.5,
        radius: 0.3, feather: 0.1, opacity: 1, enabled: false, path: [],
      }],
    });
    applyPixelAdjustments(pixels, 3, 1, recipe);
    expect(Array.from(pixels)).toEqual(Array.from(untouched));
  });
});
