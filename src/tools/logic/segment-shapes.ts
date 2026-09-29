import { digitCountOf, displayPorts, segmentIdsOf, type DisplayType } from './display-engine';
import type { Point } from './geometry';

/**
 * Pure geometry for the segment displays, shared by the Canvas2D renderer and
 * the SVG exporter so a digit is drawn from exactly the same polygons in both.
 *
 * Every digit is laid out inside the display body's pixel rectangle, clear of
 * the pin-name columns on the edges that carry pins. Each segment is a small
 * polygon keyed by the same id as its input pin, so a renderer can look up
 * "is this segment lit" by id and never needs to know the segment order.
 */

export interface SegmentPolygon {
  readonly id: string;
  readonly points: readonly Point[];
}

export interface DigitGeometry {
  readonly index: number;
  readonly segments: readonly SegmentPolygon[];
  /** The decimal point, drawn as a dot rather than a polygon. */
  readonly dot: { readonly id: string; readonly cx: number; readonly cy: number; readonly r: number };
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Room kept clear on the left edge for pin names such as `A1` or `DP`. */
const LEFT_MARGIN = 20;
const VERTICAL_MARGIN = 8;
const DIGIT_GAP = 6;

const hasRightPins = (type: DisplayType): boolean => displayPorts(type).some((port) => port.x > 0);

/** The multiplexed module labels its digit selects `DIG1`..`DIG4`, which need more room than a segment name. */
const rightMargin = (type: DisplayType): number => {
  if (!hasRightPins(type)) return 6;
  return type === 'SEVEN_SEGMENT_4' ? 30 : 20;
};

const heightToWidth = (type: DisplayType): number => (type === 'SIXTEEN_SEGMENT' ? 1.75 : 1.9);

// --- SECTION: segment polygons ---

const horizontal = (xa: number, xb: number, y: number, t: number): Point[] => [
  { x: xa, y },
  { x: xa + t / 2, y: y - t / 2 },
  { x: xb - t / 2, y: y - t / 2 },
  { x: xb, y },
  { x: xb - t / 2, y: y + t / 2 },
  { x: xa + t / 2, y: y + t / 2 },
];

const vertical = (x: number, ya: number, yb: number, t: number): Point[] => [
  { x, y: ya },
  { x: x + t / 2, y: ya + t / 2 },
  { x: x + t / 2, y: yb - t / 2 },
  { x, y: yb },
  { x: x - t / 2, y: yb - t / 2 },
  { x: x - t / 2, y: ya + t / 2 },
];

/** A diagonal bar of the given thickness between two centre-line points. */
const diagonal = (from: Point, to: Point, t: number): Point[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (t / 2);
  const ny = (dx / length) * (t / 2);
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ];
};

const sevenSegments = (x: number, y: number, width: number, height: number, t: number): SegmentPolygon[] => {
  const e = t * 0.6;
  const xl = x + t / 2;
  const xr = x + width - t / 2;
  const yt = y + t / 2;
  const yb = y + height - t / 2;
  const ym = y + height / 2;
  return [
    { id: 'A', points: horizontal(xl + e, xr - e, yt, t) },
    { id: 'B', points: vertical(xr, yt + e, ym - e * 0.4, t) },
    { id: 'C', points: vertical(xr, ym + e * 0.4, yb - e, t) },
    { id: 'D', points: horizontal(xl + e, xr - e, yb, t) },
    { id: 'E', points: vertical(xl, ym + e * 0.4, yb - e, t) },
    { id: 'F', points: vertical(xl, yt + e, ym - e * 0.4, t) },
    { id: 'G', points: horizontal(xl + e, xr - e, ym, t) },
  ];
};

const sixteenSegments = (x: number, y: number, width: number, height: number, t: number): SegmentPolygon[] => {
  const e = t * 0.6;
  const g = t * 0.3;
  const xl = x + t / 2;
  const xr = x + width - t / 2;
  const xm = x + width / 2;
  const yt = y + t / 2;
  const yb = y + height - t / 2;
  const ym = y + height / 2;
  const topLeft: Point = { x: xl + e * 0.9, y: yt + e * 1.1 };
  const topRight: Point = { x: xr - e * 0.9, y: yt + e * 1.1 };
  const bottomLeft: Point = { x: xl + e * 0.9, y: yb - e * 1.1 };
  const bottomRight: Point = { x: xr - e * 0.9, y: yb - e * 1.1 };
  const upperCentre: Point = { x: xm - e * 0.6, y: ym - e * 0.9 };
  const upperCentreRight: Point = { x: xm + e * 0.6, y: ym - e * 0.9 };
  const lowerCentre: Point = { x: xm - e * 0.6, y: ym + e * 0.9 };
  const lowerCentreRight: Point = { x: xm + e * 0.6, y: ym + e * 0.9 };
  return [
    { id: 'A1', points: horizontal(xl + e, xm - g, yt, t) },
    { id: 'A2', points: horizontal(xm + g, xr - e, yt, t) },
    { id: 'B', points: vertical(xr, yt + e, ym - e * 0.4, t) },
    { id: 'C', points: vertical(xr, ym + e * 0.4, yb - e, t) },
    { id: 'D1', points: horizontal(xl + e, xm - g, yb, t) },
    { id: 'D2', points: horizontal(xm + g, xr - e, yb, t) },
    { id: 'E', points: vertical(xl, ym + e * 0.4, yb - e, t) },
    { id: 'F', points: vertical(xl, yt + e, ym - e * 0.4, t) },
    { id: 'G1', points: horizontal(xl + e, xm - g, ym, t) },
    { id: 'G2', points: horizontal(xm + g, xr - e, ym, t) },
    { id: 'H', points: diagonal(topLeft, upperCentre, t * 0.8) },
    { id: 'I', points: vertical(xm, yt + e, ym - e * 0.4, t) },
    { id: 'J', points: diagonal(topRight, upperCentreRight, t * 0.8) },
    { id: 'K', points: diagonal(bottomLeft, lowerCentre, t * 0.8) },
    { id: 'L', points: vertical(xm, ym + e * 0.4, yb - e, t) },
    { id: 'M', points: diagonal(bottomRight, lowerCentreRight, t * 0.8) },
  ];
};

// --- SECTION: digit layout ---

/**
 * Lays out every digit of a display inside `body` (in the component's local
 * pixels). Digits share the space left of the pin-name margins, keep a fixed
 * aspect ratio, and are centred vertically, so a taller body (more pins) does
 * not stretch the glyphs.
 */
export const digitGeometries = (type: DisplayType, body: PixelRect): DigitGeometry[] => {
  const digits = digitCountOf(type);
  const regionX = body.x + LEFT_MARGIN;
  const regionWidth = Math.max(1, body.width - LEFT_MARGIN - rightMargin(type));
  const regionY = body.y + VERTICAL_MARGIN;
  const regionHeight = Math.max(1, body.height - VERTICAL_MARGIN * 2);
  const digitWidth = (regionWidth - DIGIT_GAP * (digits - 1)) / digits;
  const digitHeight = Math.min(regionHeight, digitWidth * heightToWidth(type));
  const digitY = regionY + (regionHeight - digitHeight) / 2;

  return Array.from({ length: digits }, (_, index) => {
    const digitX = regionX + index * (digitWidth + DIGIT_GAP);
    const thickness = digitWidth * 0.15;
    const dotRadius = thickness * 0.55;
    // The decimal point sits in a strip at the digit's lower right, so the segments use the width left of it.
    const segmentWidth = digitWidth - dotRadius * 2 - 1;
    const segments = type === 'SIXTEEN_SEGMENT'
      ? sixteenSegments(digitX, digitY, segmentWidth, digitHeight, thickness)
      : sevenSegments(digitX, digitY, segmentWidth, digitHeight, thickness);
    return {
      index,
      segments,
      dot: { id: 'DP', cx: digitX + digitWidth - dotRadius, cy: digitY + digitHeight - dotRadius, r: dotRadius },
    };
  });
};

/** The segment ids a geometry must provide for a display type: every pin id except the decimal point. */
export const drawableSegmentIds = (type: DisplayType): readonly string[] => segmentIdsOf(type).filter((id) => id !== 'DP');
