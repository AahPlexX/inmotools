import { describe, expect, it } from 'vitest';
import type { ViewportState } from '../../src/tools/logic/logic-types';
import {
  beginPinch,
  clampZoom,
  distanceBetween,
  MAX_ZOOM,
  midpointOf,
  MIN_PINCH_DISTANCE,
  MIN_ZOOM,
  updatePinch,
  zoomViewportAt,
} from '../../src/tools/logic/touch-gestures';

const worldUnder = (viewport: ViewportState, screen: { x: number; y: number }) => ({
  x: (screen.x - viewport.panX) / viewport.zoom,
  y: (screen.y - viewport.panY) / viewport.zoom,
});

const VIEWPORTS: readonly ViewportState[] = [
  { panX: 0, panY: 0, zoom: 1 },
  { panX: -120, panY: 75, zoom: 0.5 },
  { panX: 300, panY: -40, zoom: 2.2 },
  { panX: 13.5, panY: 9.25, zoom: 1.37 },
];

describe('touch-gestures basics', () => {
  it('measures distance and midpoint', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpointOf({ x: 10, y: 20 }, { x: 30, y: 60 })).toEqual({ x: 20, y: 40 });
  });

  it('clamps zoom into range and falls back to 1 for a non-finite value', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe('zoomViewportAt (wheel and pinch share this rule)', () => {
  it('keeps the drawing under the anchor fixed for every viewport and factor', () => {
    const anchor = { x: 210, y: 155 };
    for (const viewport of VIEWPORTS) {
      for (const factor of [0.5, 0.89, 1, 1.12, 1.6]) {
        const zoomed = zoomViewportAt(viewport, anchor, factor);
        const before = worldUnder(viewport, anchor);
        const after = worldUnder(zoomed, anchor);
        expect(after.x).toBeCloseTo(before.x, 9);
        expect(after.y).toBeCloseTo(before.y, 9);
      }
    }
  });

  it('holds the anchor even when the zoom is clamped at either limit', () => {
    const anchor = { x: 100, y: 100 };
    const viewport: ViewportState = { panX: 20, panY: -30, zoom: 2.9 };
    const capped = zoomViewportAt(viewport, anchor, 10);
    expect(capped.zoom).toBe(MAX_ZOOM);
    expect(worldUnder(capped, anchor).x).toBeCloseTo(worldUnder(viewport, anchor).x, 9);
    const floored = zoomViewportAt({ panX: 0, panY: 0, zoom: 0.3 }, anchor, 0.01);
    expect(floored.zoom).toBe(MIN_ZOOM);
  });

  it('is the identity for a factor of 1', () => {
    for (const viewport of VIEWPORTS) {
      const same = zoomViewportAt(viewport, { x: 50, y: 60 }, 1);
      expect(same.zoom).toBeCloseTo(viewport.zoom, 12);
      expect(same.panX).toBeCloseTo(viewport.panX, 9);
      expect(same.panY).toBeCloseTo(viewport.panY, 9);
    }
  });
});

describe('two-finger pinch', () => {
  const a = { x: 200, y: 200 };
  const b = { x: 300, y: 200 };

  it('refuses to start when the fingers are on top of each other', () => {
    const viewport = VIEWPORTS[0]!;
    expect(beginPinch(a, { x: a.x + MIN_PINCH_DISTANCE - 1, y: a.y }, viewport)).toBeUndefined();
    expect(beginPinch(a, a, viewport)).toBeUndefined();
    expect(beginPinch(a, { x: Number.NaN, y: 0 }, viewport)).toBeUndefined();
    expect(beginPinch(a, b, viewport)).toBeDefined();
  });

  it('leaves the view untouched while the fingers have not moved', () => {
    for (const viewport of VIEWPORTS) {
      const start = beginPinch(a, b, viewport)!;
      const same = updatePinch(start, a, b);
      expect(same.zoom).toBeCloseTo(viewport.zoom, 12);
      expect(same.panX).toBeCloseTo(viewport.panX, 9);
      expect(same.panY).toBeCloseTo(viewport.panY, 9);
    }
  });

  it('pans by exactly the midpoint movement when both fingers slide together', () => {
    for (const viewport of VIEWPORTS) {
      const start = beginPinch(a, b, viewport)!;
      const moved = updatePinch(start, { x: a.x + 40, y: a.y - 25 }, { x: b.x + 40, y: b.y - 25 });
      expect(moved.zoom).toBeCloseTo(viewport.zoom, 12);
      expect(moved.panX).toBeCloseTo(viewport.panX + 40, 9);
      expect(moved.panY).toBeCloseTo(viewport.panY - 25, 9);
    }
  });

  it('zooms by the ratio of finger distances about the midpoint', () => {
    const viewport: ViewportState = { panX: 0, panY: 0, zoom: 1 };
    const start = beginPinch(a, b, viewport)!;
    const spread = updatePinch(start, { x: 150, y: 200 }, { x: 350, y: 200 });
    expect(spread.zoom).toBeCloseTo(2, 12);
    // The drawing point under the starting midpoint (250, 200) stays under the (unmoved) midpoint.
    expect(worldUnder(spread, { x: 250, y: 200 }).x).toBeCloseTo(250, 9);
    expect(worldUnder(spread, { x: 250, y: 200 }).y).toBeCloseTo(200, 9);
    const squeezed = updatePinch(start, { x: 225, y: 200 }, { x: 275, y: 200 });
    expect(squeezed.zoom).toBeCloseTo(0.5, 12);
  });

  it('keeps the drawing under the moving midpoint for a combined pan and zoom', () => {
    for (const viewport of VIEWPORTS) {
      const start = beginPinch(a, b, viewport)!;
      const nextA = { x: 170, y: 230 };
      const nextB = { x: 390, y: 270 };
      const result = updatePinch(start, nextA, nextB);
      const anchorWorld = worldUnder(viewport, midpointOf(a, b));
      const after = worldUnder(result, midpointOf(nextA, nextB));
      expect(after.x).toBeCloseTo(anchorWorld.x, 9);
      expect(after.y).toBeCloseTo(anchorWorld.y, 9);
    }
  });

  it('clamps the zoom but still anchors the drawing under the fingers', () => {
    const viewport: ViewportState = { panX: 10, panY: 10, zoom: 2 };
    const start = beginPinch(a, b, viewport)!;
    const nextA = { x: 0, y: 200 };
    const nextB = { x: 600, y: 200 };
    const capped = updatePinch(start, nextA, nextB);
    expect(capped.zoom).toBe(MAX_ZOOM);
    const anchorWorld = worldUnder(viewport, midpointOf(a, b));
    const after = worldUnder(capped, midpointOf(nextA, nextB));
    expect(after.x).toBeCloseTo(anchorWorld.x, 9);
    const pinchedShut = updatePinch(start, { x: 249, y: 200 }, { x: 251, y: 200 });
    expect(pinchedShut.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(Number.isFinite(pinchedShut.panX)).toBe(true);
  });

  it('returns the original view when the fingers come back to where they started', () => {
    const viewport = VIEWPORTS[2]!;
    const start = beginPinch(a, b, viewport)!;
    updatePinch(start, { x: 100, y: 100 }, { x: 500, y: 300 });
    const back = updatePinch(start, a, b);
    expect(back.zoom).toBeCloseTo(viewport.zoom, 12);
    expect(back.panX).toBeCloseTo(viewport.panX, 9);
    expect(back.panY).toBeCloseTo(viewport.panY, 9);
  });

  it('never yields a non-finite view even for extreme inputs', () => {
    const start = beginPinch(a, b, VIEWPORTS[0]!)!;
    for (const [p, q] of [[{ x: 0, y: 0 }, { x: 1e9, y: 1e9 }], [{ x: 5, y: 5 }, { x: 5, y: 5 }]] as const) {
      const view = updatePinch(start, p, q);
      expect(Number.isFinite(view.zoom) && Number.isFinite(view.panX) && Number.isFinite(view.panY)).toBe(true);
    }
  });
});
