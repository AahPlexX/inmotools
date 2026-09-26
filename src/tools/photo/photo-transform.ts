/** Frame-level geometry beyond crop/straighten/keystone: free transform of the photo within its
 * frame, four-corner perspective pinning, and canvas expansion. All warps are inverse-mapped
 * (output → source) with bilinear sampling, like the existing lens/perspective path, and share
 * one implementation between preview and export. Uncovered pixels become transparent. */

export interface PhotoFreeTransform {
  /** Offset of the photo's centre as a fraction of the frame (−1…1). */
  x: number;
  y: number;
  /** Independent horizontal/vertical scale (0.1…4). */
  scaleX: number;
  scaleY: number;
  /** Clockwise degrees (−180…180). */
  rotation: number;
}

export interface PhotoPoint { x: number; y: number }

/** Where each frame corner moves, as offsets in frame fractions (−0.5…0.5). */
export interface PhotoCornerOffsets {
  topLeft: PhotoPoint;
  topRight: PhotoPoint;
  bottomRight: PhotoPoint;
  bottomLeft: PhotoPoint;
}

export interface PhotoCanvasExpansion {
  /** Border sizes as fractions of the photo's own width (left/right) or height (top/bottom),
   * −0.45…2. Positive values add canvas around the finished photo; negative values trim that much
   * off the finished photo (used by "Trim transparent edges"). */
  top: number;
  right: number;
  bottom: number;
  left: number;
  fill: 'transparent' | 'color';
  /** #rrggbb, used when `fill` is `color`. */
  color: string;
}

export const NEUTRAL_FREE_TRANSFORM: PhotoFreeTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
export const NEUTRAL_CORNERS: PhotoCornerOffsets = {
  topLeft: { x: 0, y: 0 }, topRight: { x: 0, y: 0 }, bottomRight: { x: 0, y: 0 }, bottomLeft: { x: 0, y: 0 },
};
export const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export const UNIT_CORNERS: Record<(typeof CORNER_KEYS)[number], PhotoPoint> = {
  topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 1, y: 1 }, bottomLeft: { x: 0, y: 1 },
};

const EPSILON = 1e-7;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

// --- Normalization (untrusted recipes) ---

/** Returns null for a missing or neutral transform so neutral recipes stay minimal. */
export function normalizeFreeTransform(value: unknown): PhotoFreeTransform | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const transform: PhotoFreeTransform = {
    x: clamp(input.x, -1, 1, 0),
    y: clamp(input.y, -1, 1, 0),
    scaleX: clamp(input.scaleX, 0.1, 4, 1),
    scaleY: clamp(input.scaleY, 0.1, 4, 1),
    rotation: clamp(input.rotation, -180, 180, 0),
  };
  return isNeutralFreeTransform(transform) ? null : transform;
}

export function isNeutralFreeTransform(transform: PhotoFreeTransform | null | undefined): boolean {
  return !transform || (Math.abs(transform.x) < EPSILON && Math.abs(transform.y) < EPSILON
    && Math.abs(transform.scaleX - 1) < EPSILON && Math.abs(transform.scaleY - 1) < EPSILON && Math.abs(transform.rotation) < EPSILON);
}

export function normalizeCornerOffsets(value: unknown): PhotoCornerOffsets | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const corners = {} as PhotoCornerOffsets;
  for (const key of CORNER_KEYS) {
    const point = input[key] && typeof input[key] === 'object' ? input[key] as Record<string, unknown> : {};
    corners[key] = { x: clamp(point.x, -0.5, 0.5, 0), y: clamp(point.y, -0.5, 0.5, 0) };
  }
  return isNeutralCorners(corners) ? null : corners;
}

export function isNeutralCorners(corners: PhotoCornerOffsets | null | undefined): boolean {
  return !corners || CORNER_KEYS.every((key) => Math.abs(corners[key].x) < EPSILON && Math.abs(corners[key].y) < EPSILON);
}

export function normalizeCanvasExpansion(value: unknown): PhotoCanvasExpansion | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const expansion: PhotoCanvasExpansion = {
    top: clamp(input.top, -0.45, 2, 0),
    right: clamp(input.right, -0.45, 2, 0),
    bottom: clamp(input.bottom, -0.45, 2, 0),
    left: clamp(input.left, -0.45, 2, 0),
    fill: input.fill === 'color' ? 'color' : 'transparent',
    color: typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : '#ffffff',
  };
  return Math.abs(expansion.top) + Math.abs(expansion.right) + Math.abs(expansion.bottom) + Math.abs(expansion.left) < EPSILON ? null : expansion;
}

// --- Homography for corner pinning ---

type Matrix3 = [number, number, number, number, number, number, number, number, number];

/** Projective map taking the unit square's corners (0,0),(1,0),(1,1),(0,1) to the quad
 * q0…q3 in that order (Heckbert, "Fundamentals of Texture Mapping", square-to-quad). */
export function squareToQuad(q: [PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint]): Matrix3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < EPSILON && Math.abs(sy) < EPSILON) {
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1];
  }
  const dx1 = p1.x - p2.x; const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y; const dy2 = p3.y - p2.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-12) throw new Error('The perspective corners overlap; move them apart.');
  const g = (sx * dy2 - dx2 * sy) / denominator;
  const h = (dx1 * sy - sx * dy1) / denominator;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

function invert(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('The perspective corners fold the photo over itself; move them apart.');
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det) as Matrix3;
}

function apply(m: Matrix3, x: number, y: number): PhotoPoint {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

export function cornerQuad(corners: PhotoCornerOffsets): [PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint] {
  return CORNER_KEYS.map((key) => ({ x: UNIT_CORNERS[key].x + corners[key].x, y: UNIT_CORNERS[key].y + corners[key].y })) as [PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint];
}

// --- Forward and inverse point mapping ---

/** Where a source point (frame fractions) lands in the output after corners then free transform. */
export function forwardTransformPoint(point: PhotoPoint, width: number, height: number, transform: PhotoFreeTransform | null, corners: PhotoCornerOffsets | null): PhotoPoint {
  let p = corners && !isNeutralCorners(corners) ? apply(squareToQuad(cornerQuad(corners)), point.x, point.y) : point;
  if (transform && !isNeutralFreeTransform(transform)) {
    const radians = (transform.rotation * Math.PI) / 180;
    const cos = Math.cos(radians); const sin = Math.sin(radians);
    const dx = (p.x - 0.5) * width * transform.scaleX;
    const dy = (p.y - 0.5) * height * transform.scaleY;
    p = { x: 0.5 + transform.x + (dx * cos - dy * sin) / width, y: 0.5 + transform.y + (dx * sin + dy * cos) / height };
  }
  return p;
}

function inverseFreeTransform(point: PhotoPoint, width: number, height: number, transform: PhotoFreeTransform): PhotoPoint {
  const radians = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians); const sin = Math.sin(radians);
  const dx = (point.x - 0.5 - transform.x) * width;
  const dy = (point.y - 0.5 - transform.y) * height;
  return {
    x: 0.5 + (dx * cos - dy * sin) / (width * transform.scaleX),
    y: 0.5 + (dx * sin + dy * cos) / (height * transform.scaleY),
  };
}

/** Warps a frame's pixels by the corner pin and free transform. Neutral settings return a copy. */
export function warpPhotoTransformPixels(pixels: Uint8ClampedArray, width: number, height: number, transform: PhotoFreeTransform | null | undefined, corners: PhotoCornerOffsets | null | undefined): Uint8ClampedArray {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) throw new Error('Photo transform received invalid pixel dimensions.');
  const freeActive = !isNeutralFreeTransform(transform);
  const cornersActive = !isNeutralCorners(corners);
  if (!freeActive && !cornersActive) return new Uint8ClampedArray(pixels);
  const inverseCorners = cornersActive ? invert(squareToQuad(cornerQuad(corners!))) : null;
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Pixel-centre convention: pixel i covers [i, i+1) and its centre is i + 0.5.
      let p: PhotoPoint = { x: (x + 0.5) / width, y: (y + 0.5) / height };
      if (freeActive) p = inverseFreeTransform(p, width, height, transform!);
      if (inverseCorners) p = apply(inverseCorners, p.x, p.y);
      const sx = p.x * width - 0.5;
      const sy = p.y * height - 0.5;
      if (!(sx >= -0.5 && sy >= -0.5 && sx <= width - 0.5 && sy <= height - 0.5)) continue;
      const cx = Math.min(width - 1, Math.max(0, sx)); const cy = Math.min(height - 1, Math.max(0, sy));
      const x0 = Math.floor(cx); const y0 = Math.floor(cy);
      const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1);
      const tx = cx - x0; const ty = cy - y0;
      const o = (y * width + x) * 4;
      const a = (y0 * width + x0) * 4; const b = (y0 * width + x1) * 4; const c = (y1 * width + x0) * 4; const d = (y1 * width + x1) * 4;
      for (let ch = 0; ch < 4; ch += 1) {
        const top = pixels[a + ch] + (pixels[b + ch] - pixels[a + ch]) * tx;
        const bottom = pixels[c + ch] + (pixels[d + ch] - pixels[c + ch]) * tx;
        out[o + ch] = Math.round(top + (bottom - top) * ty);
      }
    }
  }
  return out;
}

// --- Canvas expansion ---

export interface ExpansionLayout {
  /** Photo area inside the expanded canvas. */
  inner: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}

/** Output size of an expanded canvas for a photo of `innerWidth × innerHeight`. */
export function expandedDimensions(innerWidth: number, innerHeight: number, expansion: PhotoCanvasExpansion | null | undefined): { width: number; height: number } {
  if (!expansion) return { width: innerWidth, height: innerHeight };
  return {
    width: Math.max(1, Math.round(innerWidth * (1 + expansion.left + expansion.right))),
    height: Math.max(1, Math.round(innerHeight * (1 + expansion.top + expansion.bottom))),
  };
}

/** Splits a target canvas into border and photo area so the borders keep their proportions and
 * the pieces add up to exactly `width × height`. */
export function expansionLayout(width: number, height: number, expansion: PhotoCanvasExpansion | null | undefined): ExpansionLayout {
  if (!expansion) return { inner: { x: 0, y: 0, width, height }, width, height };
  const innerWidth = Math.max(1, Math.round(width / (1 + expansion.left + expansion.right)));
  const innerHeight = Math.max(1, Math.round(height / (1 + expansion.top + expansion.bottom)));
  // Offsets are the left/top border in photo pixels; negative when that edge is trimmed.
  return {
    inner: { x: Math.round(innerWidth * expansion.left), y: Math.round(innerHeight * expansion.top), width: innerWidth, height: innerHeight },
    width,
    height,
  };
}

/** Places processed photo pixels into the expanded canvas filled with the border colour or transparency. */
export function padPhotoCanvas(pixels: Uint8ClampedArray, layout: ExpansionLayout, expansion: PhotoCanvasExpansion): Uint8ClampedArray<ArrayBuffer> {
  const { inner, width, height } = layout;
  if (pixels.length !== inner.width * inner.height * 4) throw new Error('Canvas expansion received pixels of the wrong size.');
  const out = new Uint8ClampedArray(width * height * 4);
  if (expansion.fill === 'color') {
    const r = parseInt(expansion.color.slice(1, 3), 16); const g = parseInt(expansion.color.slice(3, 5), 16); const b = parseInt(expansion.color.slice(5, 7), 16);
    for (let p = 0; p < width * height; p += 1) { out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b; out[p * 4 + 3] = 255; }
  }
  // Copy only the overlap, so trimmed (negative) sides simply drop the photo pixels beyond the canvas.
  const firstColumn = Math.max(0, -inner.x);
  const lastColumn = Math.min(inner.width, width - inner.x);
  if (lastColumn <= firstColumn) return out;
  for (let row = Math.max(0, -inner.y); row < Math.min(inner.height, height - inner.y); row += 1) {
    const from = (row * inner.width + firstColumn) * 4;
    out.set(pixels.subarray(from, from + (lastColumn - firstColumn) * 4), ((row + inner.y) * width + inner.x + firstColumn) * 4);
  }
  return out;
}

/** Canvas-size setting that trims a finished photo of `width` × `height` down to `bounds`,
 * expressed as negative per-side fractions so it scales with any export size. */
export function trimExpansion(width: number, height: number, bounds: { x: number; y: number; width: number; height: number }): PhotoCanvasExpansion | null {
  return normalizeCanvasExpansion({
    left: -bounds.x / width,
    top: -bounds.y / height,
    right: -(width - bounds.x - bounds.width) / width,
    bottom: -(height - bounds.y - bounds.height) / height,
    fill: 'transparent',
  });
}
