import { describe, expect, test } from 'vitest';
import {
  cornerQuad,
  expandedDimensions,
  expansionLayout,
  forwardTransformPoint,
  normalizeCanvasExpansion,
  normalizeCornerOffsets,
  normalizeFreeTransform,
  padPhotoCanvas,
  squareToQuad,
  trimExpansion,
  warpPhotoTransformPixels,
} from '../../src/tools/photo/photo-transform';

function gradient(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set([x * 20, y * 20, 100, 255], (y * width + x) * 4);
  return data;
}

function px(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const o = (y * width + x) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

describe('normalization', () => {
  test('neutral or missing settings normalize to null; values are clamped', () => {
    expect(normalizeFreeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })).toBeNull();
    expect(normalizeFreeTransform(undefined)).toBeNull();
    expect(normalizeFreeTransform({ x: 5, scaleX: 99, rotation: -720 })).toEqual({ x: 1, y: 0, scaleX: 4, scaleY: 1, rotation: -180 });
    expect(normalizeCornerOffsets({ topLeft: { x: 0, y: 0 } })).toBeNull();
    expect(normalizeCornerOffsets({ topRight: { x: 2, y: -0.1 } })?.topRight).toEqual({ x: 0.5, y: -0.1 });
    expect(normalizeCanvasExpansion({ top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
    expect(normalizeCanvasExpansion({ top: 0.1, color: 'red', fill: 'color' })).toEqual({ top: 0.1, right: 0, bottom: 0, left: 0, fill: 'color', color: '#ffffff' });
  });
});

describe('corner perspective', () => {
  test('the square-to-quad map sends each unit corner exactly to its pinned corner', () => {
    const quad = cornerQuad({ topLeft: { x: 0.1, y: 0.05 }, topRight: { x: -0.05, y: 0 }, bottomRight: { x: 0, y: -0.1 }, bottomLeft: { x: 0.02, y: 0 } });
    const m = squareToQuad(quad);
    const map = (x: number, y: number) => { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([x, y], index) => {
      const [mx, my] = map(x, y);
      expect(mx).toBeCloseTo(quad[index].x, 12);
      expect(my).toBeCloseTo(quad[index].y, 12);
    });
  });

  test('pulling in the right edge keeps the left edge fixed, compresses the photo, and uncovers transparency on the right', () => {
    const width = 10; const height = 10;
    const source = gradient(width, height);
    const out = warpPhotoTransformPixels(source, width, height, null, { topLeft: { x: 0, y: 0 }, topRight: { x: -0.5, y: 0 }, bottomRight: { x: -0.5, y: 0 }, bottomLeft: { x: 0, y: 0 } });
    // Output pixel-centre x = 0.05 maps to source x = 0.10 (0.5 px): halfway between columns 0 and 1,
    // so red is (0 + 20) / 2 = 10 while green/blue/alpha are unchanged along that row.
    expect(px(out, width, 0, 5)).toEqual([10, 100, 100, 255]);
    expect(px(out, width, 9, 5)[3]).toBe(0);
  });
});

describe('free transform', () => {
  test('neutral settings return an identical copy', () => {
    const source = gradient(6, 4);
    const out = warpPhotoTransformPixels(source, 6, 4, null, null);
    expect(out).not.toBe(source);
    expect(Array.from(out)).toEqual(Array.from(source));
  });

  test('a one-pixel offset shifts every pixel by exactly one column', () => {
    const width = 10; const height = 4;
    const source = gradient(width, height);
    const out = warpPhotoTransformPixels(source, width, height, { x: 1 / width, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, null);
    for (let x = 1; x < width; x += 1) expect(px(out, width, x, 2)).toEqual(px(source, width, x - 1, 2));
    expect(px(out, width, 0, 2)[3]).toBe(0);
  });

  test('independent horizontal scale keeps the centre and halves the width', () => {
    const width = 20; const height = 4;
    const out = warpPhotoTransformPixels(gradient(width, height), width, height, { x: 0, y: 0, scaleX: 0.5, scaleY: 1, rotation: 0 }, null);
    expect(px(out, width, 2, 1)[3]).toBe(0);
    expect(px(out, width, 10, 1)[3]).toBe(255);
    expect(px(out, width, 17, 1)[3]).toBe(0);
  });

  test('forward mapping agrees with the pixel warp for rotation in a non-square frame', () => {
    const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 };
    // A point right of centre in a 200 × 100 frame ends up below centre, same pixel distance.
    const moved = forwardTransformPoint({ x: 0.75, y: 0.5 }, 200, 100, transform, null);
    expect(moved.x).toBeCloseTo(0.5, 12);
    expect(moved.y).toBeCloseTo(0.5 + 50 / 100, 12);
  });
});

describe('canvas expansion', () => {
  const expansion = { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2, fill: 'color' as const, color: '#102030' };

  test('expanded size and layout add up exactly', () => {
    expect(expandedDimensions(100, 50, expansion)).toEqual({ width: 140, height: 60 });
    const layout = expansionLayout(140, 60, expansion);
    expect(layout.inner).toEqual({ x: 20, y: 5, width: 100, height: 50 });
    expect(expansionLayout(141, 61, expansion).inner.width + expansionLayout(141, 61, expansion).inner.x).toBeLessThanOrEqual(141);
    expect(expandedDimensions(100, 50, null)).toEqual({ width: 100, height: 50 });
  });

  test('padding fills the border with the chosen colour or leaves it transparent', () => {
    const photo = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    const layout = { inner: { x: 1, y: 1, width: 2, height: 1 }, width: 4, height: 3 };
    const coloured = padPhotoCanvas(photo, layout, expansion);
    expect(px(coloured, 4, 0, 0)).toEqual([16, 32, 48, 255]);
    expect(px(coloured, 4, 1, 1)).toEqual([200, 200, 200, 200]);
    const clear = padPhotoCanvas(photo, layout, { ...expansion, fill: 'transparent' });
    expect(px(clear, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(() => padPhotoCanvas(photo, { ...layout, inner: { ...layout.inner, width: 3 } }, expansion)).toThrow(/wrong size/);
  });
});

describe('trimming', () => {
  test('negative sides trim the finished photo and the setting scales with export size', () => {
    const width = 10; const height = 4;
    const source = gradient(width, height);
    // Opaque content occupies columns 2–7 and rows 1–2.
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (x < 2 || x > 7 || y < 1 || y > 2) source[(y * width + x) * 4 + 3] = 0;
    const trim = trimExpansion(width, height, { x: 2, y: 1, width: 6, height: 2 })!;
    expect(trim).toMatchObject({ left: -0.2, right: -0.2, top: -0.25, bottom: -0.25 });
    expect(expandedDimensions(width, height, trim)).toEqual({ width: 6, height: 2 });
    const layout = expansionLayout(6, 2, trim);
    expect(layout.inner).toEqual({ x: -2, y: -1, width: 10, height: 4 });
    const trimmed = padPhotoCanvas(source, layout, trim);
    expect(px(trimmed, 6, 0, 0)).toEqual(px(source, width, 2, 1));
    expect(px(trimmed, 6, 5, 1)).toEqual(px(source, width, 7, 2));
    // At double the export size the same setting keeps the same content.
    expect(expandedDimensions(20, 8, trim)).toEqual({ width: 12, height: 4 });
  });
});
