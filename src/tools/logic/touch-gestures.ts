import type { ViewportState } from './logic-types';

/**
 * Pure math for the canvas's two-finger gesture and its wheel zoom. Kept free
 * of React and the DOM so the pan/zoom behavior can be tested exactly and the
 * wheel and the pinch share one rule: the point of the drawing under the
 * fingers (or the cursor) stays under them as the view changes.
 */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** Fingers closer together than this (in pixels) are treated as one: the distance ratio is meaningless there. */
export const MIN_PINCH_DISTANCE = 12;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export const clampZoom = (zoom: number): number => (Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1);

export const distanceBetween = (a: ScreenPoint, b: ScreenPoint): number => Math.hypot(b.x - a.x, b.y - a.y);

export const midpointOf = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Zooms by `factor` about a screen point, keeping the drawing under that
 * point where it is. The zoom is clamped, and the pan is derived from the
 * clamped value so the anchor holds even at the zoom limits.
 */
export const zoomViewportAt = (viewport: ViewportState, anchor: ScreenPoint, factor: number): ViewportState => {
  const zoom = clampZoom(viewport.zoom * factor);
  const worldX = (anchor.x - viewport.panX) / viewport.zoom;
  const worldY = (anchor.y - viewport.panY) / viewport.zoom;
  return { zoom, panX: anchor.x - worldX * zoom, panY: anchor.y - worldY * zoom };
};

/** What a two-finger gesture remembers from the moment the second finger landed. */
export interface PinchStart {
  readonly distance: number;
  readonly midpoint: ScreenPoint;
  readonly viewport: ViewportState;
}

/** Starts a gesture, or returns `undefined` when the two fingers are too close together to define a scale. */
export const beginPinch = (a: ScreenPoint, b: ScreenPoint, viewport: ViewportState): PinchStart | undefined => {
  const distance = distanceBetween(a, b);
  if (!(distance >= MIN_PINCH_DISTANCE)) return undefined;
  return { distance, midpoint: midpointOf(a, b), viewport };
};

/**
 * The viewport for the fingers' current positions. Zoom follows the ratio of
 * the finger distance to the starting distance, and the pan is chosen so the
 * drawing point that was under the starting midpoint is under the current
 * midpoint: moving both fingers together pans, spreading them zooms, and
 * doing both at once does both.
 *
 * Computed from the start state each time (not incrementally), so error
 * cannot accumulate over a long gesture and the zoom limits never drift it.
 */
export const updatePinch = (start: PinchStart, a: ScreenPoint, b: ScreenPoint): ViewportState => {
  const distance = Math.max(distanceBetween(a, b), MIN_PINCH_DISTANCE);
  const zoom = clampZoom(start.viewport.zoom * (distance / start.distance));
  const midpoint = midpointOf(a, b);
  const worldX = (start.midpoint.x - start.viewport.panX) / start.viewport.zoom;
  const worldY = (start.midpoint.y - start.viewport.panY) / start.viewport.zoom;
  return { zoom, panX: midpoint.x - worldX * zoom, panY: midpoint.y - worldY * zoom };
};
