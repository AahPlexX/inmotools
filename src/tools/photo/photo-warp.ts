import type { PhotoLiquifyMode, PhotoLiquifyStroke, PhotoMeshWarpPoint } from './photo-types';

const EPSILON = 1e-7;

/** A 5x5 control-point grid (4x4 cells) — coarse enough to stay a deliberate structural
 * distortion tool distinct from liquify's freeform brush, bounded enough to keep the
 * per-pixel interpolation cheap. */
export const PHOTO_MESH_WARP_GRID = 5;
const MAX_MESH_DISPLACEMENT = 0.12;
const MESH_GESTURE_INFLUENCE_RADIUS = 0.35;
const MAX_LIQUIFY_RADIUS = 0.35;
const MAX_LIQUIFY_STRENGTH = 1;
export const MAX_LIQUIFY_STROKES = 200;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createNeutralMeshWarp(): PhotoMeshWarpPoint[] {
  return Array.from({ length: PHOTO_MESH_WARP_GRID * PHOTO_MESH_WARP_GRID }, () => ({ dx: 0, dy: 0 }));
}

export function isMeshWarpNeutral(mesh: PhotoMeshWarpPoint[] | null | undefined): boolean {
  if (!mesh) return true;
  return mesh.every((point) => Math.abs(point.dx) < EPSILON && Math.abs(point.dy) < EPSILON);
}

/** A corrupted/wrong-size mesh (e.g. a hand-edited recipe) normalizes to null rather than
 * throwing, matching how every other optional recipe field degrades gracefully. */
export function normalizeMeshWarp(mesh: PhotoMeshWarpPoint[] | null | undefined): PhotoMeshWarpPoint[] | null {
  if (!mesh || mesh.length !== PHOTO_MESH_WARP_GRID * PHOTO_MESH_WARP_GRID) return null;
  const normalized = mesh.map((point) => ({
    dx: clamp(Number(point?.dx), -MAX_MESH_DISPLACEMENT, MAX_MESH_DISPLACEMENT) || 0,
    dy: clamp(Number(point?.dy), -MAX_MESH_DISPLACEMENT, MAX_MESH_DISPLACEMENT) || 0,
  }));
  return isMeshWarpNeutral(normalized) ? null : normalized;
}

export function normalizeLiquifyStrokes(strokes: PhotoLiquifyStroke[] | undefined): PhotoLiquifyStroke[] {
  if (!Array.isArray(strokes)) return [];
  return strokes.slice(0, MAX_LIQUIFY_STROKES).map((stroke) => ({
    id: typeof stroke?.id === 'string' && stroke.id ? stroke.id : 'liquify',
    mode: (stroke?.mode === 'pull' || stroke?.mode === 'restore' ? stroke.mode : 'push') as PhotoLiquifyMode,
    radius: clamp(Number(stroke?.radius), 0.005, MAX_LIQUIFY_RADIUS) || 0.05,
    strength: clamp(Number(stroke?.strength), 0, MAX_LIQUIFY_STRENGTH),
    path: Array.isArray(stroke?.path)
      ? stroke.path.slice(0, 500).map((point) => ({ x: clamp(Number(point?.x), 0, 1), y: clamp(Number(point?.y), 0, 1) }))
      : [],
  })).filter((stroke) => stroke.path.length > 0 && stroke.strength > 0);
}

function sampleMeshDisplacement(mesh: PhotoMeshWarpPoint[], x: number, y: number): { dx: number; dy: number } {
  const cells = PHOTO_MESH_WARP_GRID - 1;
  const gx = clamp(x, 0, 1) * cells;
  const gy = clamp(y, 0, 1) * cells;
  const col = Math.min(cells - 1, Math.floor(gx));
  const row = Math.min(cells - 1, Math.floor(gy));
  const tx = gx - col;
  const ty = gy - row;
  const at = (r: number, c: number) => mesh[r * PHOTO_MESH_WARP_GRID + c];
  const p00 = at(row, col);
  const p10 = at(row, col + 1);
  const p01 = at(row + 1, col);
  const p11 = at(row + 1, col + 1);
  const dx = p00.dx * (1 - tx) * (1 - ty) + p10.dx * tx * (1 - ty) + p01.dx * (1 - tx) * ty + p11.dx * tx * ty;
  const dy = p00.dy * (1 - tx) * (1 - ty) + p10.dy * tx * (1 - ty) + p01.dy * (1 - tx) * ty + p11.dy * tx * ty;
  return { dx, dy };
}

/** Nudges every grid control point within the gesture's influence radius toward the drag
 * delta, weighted by proximity to the drag start — a smooth structural push rather than a
 * single quantized handle snap. */
export function applyMeshWarpGesture(
  mesh: PhotoMeshWarpPoint[] | null | undefined,
  start: { x: number; y: number },
  end: { x: number; y: number },
): PhotoMeshWarpPoint[] {
  const next = mesh && mesh.length === PHOTO_MESH_WARP_GRID * PHOTO_MESH_WARP_GRID
    ? mesh.map((point) => ({ ...point }))
    : createNeutralMeshWarp();
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const cells = PHOTO_MESH_WARP_GRID - 1;
  for (let row = 0; row < PHOTO_MESH_WARP_GRID; row += 1) {
    for (let col = 0; col < PHOTO_MESH_WARP_GRID; col += 1) {
      const px = col / cells;
      const py = row / cells;
      const distance = Math.hypot(px - start.x, py - start.y);
      const weight = Math.max(0, 1 - distance / MESH_GESTURE_INFLUENCE_RADIUS);
      if (weight <= 0) continue;
      const index = row * PHOTO_MESH_WARP_GRID + col;
      next[index] = {
        dx: clamp(next[index].dx + dx * weight * 0.6, -MAX_MESH_DISPLACEMENT, MAX_MESH_DISPLACEMENT),
        dy: clamp(next[index].dy + dy * weight * 0.6, -MAX_MESH_DISPLACEMENT, MAX_MESH_DISPLACEMENT),
      };
    }
  }
  return next;
}

function smoothFalloff(distance: number, radius: number): number {
  if (radius <= EPSILON) return 0;
  const t = clamp(1 - distance / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

function pushPullDisplacementAt(stroke: PhotoLiquifyStroke, x: number, y: number): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  const path = stroke.path;
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    const distance = Math.hypot(x - point.x, y - point.y);
    const weight = smoothFalloff(distance, stroke.radius);
    if (weight <= 0) continue;
    if (stroke.mode === 'push') {
      const previous = path[Math.max(0, index - 1)];
      const tangentX = point.x - previous.x;
      const tangentY = point.y - previous.y;
      const length = Math.hypot(tangentX, tangentY) || 1;
      dx += (tangentX / length) * weight * stroke.strength * 0.5;
      dy += (tangentY / length) * weight * stroke.strength * 0.5;
    } else if (stroke.mode === 'pull') {
      const towardX = point.x - x;
      const towardY = point.y - y;
      const length = Math.hypot(towardX, towardY) || 1;
      dx += (towardX / length) * weight * stroke.strength * 0.5;
      dy += (towardY / length) * weight * stroke.strength * 0.5;
    }
  }
  return { dx, dy };
}

/** Push/pull strokes accumulate displacement in order; each restore stroke then shrinks the
 * already-accumulated displacement within its own radius — an "erase toward zero" identical
 * in spirit to this codebase's brush erase mode, rather than adding independent displacement. */
export function sampleLiquifyDisplacement(strokes: PhotoLiquifyStroke[], x: number, y: number): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const stroke of strokes) {
    if (stroke.mode === 'restore') continue;
    const contribution = pushPullDisplacementAt(stroke, x, y);
    dx += contribution.dx;
    dy += contribution.dy;
  }
  for (const stroke of strokes) {
    if (stroke.mode !== 'restore') continue;
    for (const point of stroke.path) {
      const distance = Math.hypot(x - point.x, y - point.y);
      const weight = smoothFalloff(distance, stroke.radius) * stroke.strength;
      if (weight <= 0) continue;
      dx *= 1 - weight;
      dy *= 1 - weight;
    }
  }
  return { dx: clamp(dx, -0.4, 0.4), dy: clamp(dy, -0.4, 0.4) };
}

/** Maps an output-space normalized coordinate back to source-space. Subtracting the forward
 * displacement is an approximation of the true inverse warp; it is exact at zero displacement
 * and stays visually coherent across this tool's bounded displacement range, matching how
 * mapPhotoGeometryPoint already approximates lens/perspective inversion for the same reason. */
export function mapPhotoWarpPoint(
  x: number,
  y: number,
  meshWarp: PhotoMeshWarpPoint[] | null | undefined,
  liquifyStrokes: PhotoLiquifyStroke[] | undefined,
): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  if (meshWarp && !isMeshWarpNeutral(meshWarp) && meshWarp.length === PHOTO_MESH_WARP_GRID * PHOTO_MESH_WARP_GRID) {
    const mesh = sampleMeshDisplacement(meshWarp, x, y);
    dx += mesh.dx;
    dy += mesh.dy;
  }
  if (liquifyStrokes && liquifyStrokes.length > 0) {
    const liquify = sampleLiquifyDisplacement(liquifyStrokes, x, y);
    dx += liquify.dx;
    dy += liquify.dy;
  }
  return { x: x - dx, y: y - dy };
}

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  sourceX: number,
  sourceY: number,
  output: Uint8ClampedArray,
  targetOffset: number,
): void {
  if (sourceX < 0 || sourceY < 0 || sourceX > width - 1 || sourceY > height - 1) {
    output[targetOffset] = 0;
    output[targetOffset + 1] = 0;
    output[targetOffset + 2] = 0;
    output[targetOffset + 3] = 0;
    return;
  }
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;
  const offset00 = (y0 * width + x0) * 4;
  const offset10 = (y0 * width + x1) * 4;
  const offset01 = (y1 * width + x0) * 4;
  const offset11 = (y1 * width + x1) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    const top = source[offset00 + channel] * (1 - tx) + source[offset10 + channel] * tx;
    const bottom = source[offset01 + channel] * (1 - tx) + source[offset11 + channel] * tx;
    output[targetOffset + channel] = Math.round(top * (1 - ty) + bottom * ty);
  }
}

export function warpPhotoMeshLiquifyPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  meshWarp: PhotoMeshWarpPoint[] | null | undefined,
  liquifyStrokes: PhotoLiquifyStroke[] | undefined,
): Uint8ClampedArray {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new Error('Photo warp received invalid pixel dimensions.');
  }
  const meshActive = Boolean(meshWarp) && !isMeshWarpNeutral(meshWarp);
  const liquifyActive = Boolean(liquifyStrokes && liquifyStrokes.length > 0);
  if (!meshActive && !liquifyActive) return new Uint8ClampedArray(pixels);

  const output = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = width === 1 ? 0.5 : x / (width - 1);
      const normalizedY = height === 1 ? 0.5 : y / (height - 1);
      const mapped = mapPhotoWarpPoint(normalizedX, normalizedY, meshWarp, liquifyStrokes);
      const sourceX = mapped.x * Math.max(0, width - 1);
      const sourceY = mapped.y * Math.max(0, height - 1);
      const targetOffset = (y * width + x) * 4;
      sampleBilinear(pixels, width, height, sourceX, sourceY, output, targetOffset);
    }
  }
  return output;
}
