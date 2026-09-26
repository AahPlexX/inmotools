import type { PhotoMergeRaster } from './photo-merge-types';

/** Pure, deterministic pixel operations for multi-image merges. Every function takes RGBA8
 * rasters and treats alpha 0 as "no coverage" (the registration warp leaves pixels outside a frame
 * fully transparent), so stacks and panoramas never average real pixels with padding. */

function pixels(raster: PhotoMergeRaster): Uint8ClampedArray {
  return new Uint8ClampedArray(raster.buffer, 0, raster.width * raster.height * 4);
}

function assertSameGrid(frames: PhotoMergeRaster[]): void {
  if (!frames.length) throw new Error('At least one frame is required.');
  const { width, height } = frames[0];
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) throw new Error('Stack frames must share one pixel grid.');
  }
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// --- Average and median stacks ---

/** Per-pixel mean of every frame that covers the pixel. Averaging N aligned exposures reduces
 * random noise by roughly √N and simulates a longer exposure. */
export function averageStack(frames: PhotoMergeRaster[]): PhotoMergeRaster {
  assertSameGrid(frames);
  const { width, height } = frames[0];
  const data = frames.map(pixels);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const frame of data) {
      if (frame[o + 3] === 0) continue;
      r += frame[o]; g += frame[o + 1]; b += frame[o + 2]; n += 1;
    }
    if (n === 0) continue;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

function medianOf(values: number[], count: number): number {
  // Insertion sort: at most nine frames, so this beats allocating for Array.prototype.sort.
  for (let i = 1; i < count; i += 1) {
    const value = values[i];
    let j = i - 1;
    while (j >= 0 && values[j] > value) { values[j + 1] = values[j]; j -= 1; }
    values[j + 1] = value;
  }
  const middle = count >> 1;
  return count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/** Per-channel median of the covering frames. Unlike the mean, a value present in only a minority
 * of frames (a passer-by, a bird, a hot pixel) is rejected rather than ghosted in. */
export function medianStack(frames: PhotoMergeRaster[]): PhotoMergeRaster {
  assertSameGrid(frames);
  const { width, height } = frames[0];
  const data = frames.map(pixels);
  const out = new Uint8ClampedArray(width * height * 4);
  const scratch = [new Array<number>(frames.length), new Array<number>(frames.length), new Array<number>(frames.length)];
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    let n = 0;
    for (const frame of data) {
      if (frame[o + 3] === 0) continue;
      scratch[0][n] = frame[o]; scratch[1][n] = frame[o + 1]; scratch[2][n] = frame[o + 2];
      n += 1;
    }
    if (n === 0) continue;
    out[o] = Math.round(medianOf(scratch[0], n));
    out[o + 1] = Math.round(medianOf(scratch[1], n));
    out[o + 2] = Math.round(medianOf(scratch[2], n));
    out[o + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

// --- Focus stack ---

/** Separable box blur of a single-channel float map, clamped at the edges. */
function boxBlur(map: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return map;
  const temp = new Float32Array(map.length);
  const out = new Float32Array(map.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += map[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x += 1) {
      temp[row + x] = sum / span;
      sum += map[row + Math.min(width - 1, x + radius + 1)] - map[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += temp[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / span;
      sum += temp[Math.min(height - 1, y + radius + 1) * width + x] - temp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

/** Local focus energy: absolute 4-neighbour Laplacian of luminance, box-averaged so the choice
 * between frames is made per region rather than per noisy pixel. Uncovered pixels score zero. */
export function focusEnergy(frame: PhotoMergeRaster, radius: number): Float32Array {
  const { width, height } = frame;
  const data = pixels(frame);
  const luma = new Float32Array(width * height);
  for (let p = 0; p < width * height; p += 1) luma[p] = luminance(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  const energy = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (data[p * 4 + 3] === 0) continue;
      const left = luma[y * width + Math.max(0, x - 1)];
      const right = luma[y * width + Math.min(width - 1, x + 1)];
      const up = luma[Math.max(0, y - 1) * width + x];
      const down = luma[Math.min(height - 1, y + 1) * width + x];
      energy[p] = Math.abs(left + right + up + down - 4 * luma[p]);
    }
  }
  return boxBlur(energy, width, height, radius);
}

export interface FocusStackOptions {
  /** Neighbourhood radius in pixels over which sharpness is judged (1–32). */
  radius: number;
  /** How decisively the sharpest frame wins: weights are energy^selectivity (1–8). */
  selectivity: number;
}

export const DEFAULT_FOCUS_STACK_OPTIONS: FocusStackOptions = { radius: 4, selectivity: 4 };

/** Blends aligned frames with per-pixel weights proportional to a power of local focus energy.
 * A high power approaches "take the sharpest frame" while still feathering the transitions, which
 * avoids the hard seams a pure arg-max selection leaves around depth edges. */
export function focusStack(frames: PhotoMergeRaster[], options: FocusStackOptions = DEFAULT_FOCUS_STACK_OPTIONS): PhotoMergeRaster {
  assertSameGrid(frames);
  const radius = Math.round(Math.min(32, Math.max(1, options.radius)));
  const power = Math.min(8, Math.max(1, options.selectivity));
  const { width, height } = frames[0];
  const data = frames.map(pixels);
  const energies = frames.map((frame) => focusEnergy(frame, radius));
  let peak = 0;
  for (const energy of energies) for (let p = 0; p < energy.length; p += 1) if (energy[p] > peak) peak = energy[p];
  const scale = peak > 0 ? 1 / peak : 1;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    let r = 0; let g = 0; let b = 0; let total = 0; let covered = 0;
    for (let f = 0; f < frames.length; f += 1) {
      if (data[f][o + 3] === 0) continue;
      covered += 1;
      // A tiny floor keeps flat regions (zero energy everywhere) as an even average.
      const weight = (energies[f][p] * scale) ** power + 1e-12;
      r += data[f][o] * weight; g += data[f][o + 1] * weight; b += data[f][o + 2] * weight; total += weight;
    }
    if (!covered) continue;
    out[o] = Math.round(r / total); out[o + 1] = Math.round(g / total); out[o + 2] = Math.round(b / total); out[o + 3] = 255;
  }
  return { width, height, buffer: out.buffer };
}

// --- Coverage cropping ---

export interface PixelRect { x: number; y: number; width: number; height: number }

/** Bounding box of every pixel with any coverage (alpha > 0), or null for an empty raster. */
export function opaqueBounds(raster: PhotoMergeRaster): PixelRect | null {
  const data = pixels(raster);
  let minX = raster.width; let minY = raster.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (data[(y * raster.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Largest axis-aligned rectangle made only of fully opaque pixels (alpha 255), using the
 * classic histogram-stack method per row: O(width × height). Used to crop a panorama or an
 * aligned stack to the region every contributing frame actually covers. */
export function largestOpaqueRectangle(raster: PhotoMergeRaster): PixelRect | null {
  const { width, height } = raster;
  const data = pixels(raster);
  const heights = new Int32Array(width);
  const stack = new Int32Array(width + 1);
  let best: PixelRect | null = null;
  let bestArea = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) heights[x] = data[(y * width + x) * 4 + 3] === 255 ? heights[x] + 1 : 0;
    let top = -1;
    for (let x = 0; x <= width; x += 1) {
      const current = x === width ? 0 : heights[x];
      while (top >= 0 && heights[stack[top]] >= current) {
        const h = heights[stack[top]];
        top -= 1;
        const left = top >= 0 ? stack[top] + 1 : 0;
        const area = h * (x - left);
        if (h > 0 && area > bestArea) {
          bestArea = area;
          best = { x: left, y: y - h + 1, width: x - left, height: h };
        }
      }
      top += 1;
      stack[top] = x;
    }
  }
  return best;
}

export function cropRaster(raster: PhotoMergeRaster, rect: PixelRect): PhotoMergeRaster {
  const from = pixels(raster);
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const start = ((rect.y + y) * raster.width + rect.x) * 4;
    out.set(from.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, buffer: out.buffer };
}

// --- Cylindrical projection ---

/** Focal length in pixels for a frame whose horizontal field of view is `degrees`. */
export function focalLengthPixels(width: number, degrees: number): number {
  const radians = (Math.min(170, Math.max(5, degrees)) * Math.PI) / 180;
  return (width / 2) / Math.tan(radians / 2);
}

/** Horizontal field of view from a 35 mm-equivalent focal length (36 mm film width). */
export function fieldOfViewFrom35mm(focal35: number): number | null {
  if (!Number.isFinite(focal35) || focal35 <= 0) return null;
  return (2 * Math.atan(36 / (2 * focal35)) * 180) / Math.PI;
}

function bilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: number[]): boolean {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return false;
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const a = (y0 * width + x0) * 4; const b = (y0 * width + x1) * 4;
  const c = (y1 * width + x0) * 4; const d = (y1 * width + x1) * 4;
  for (let ch = 0; ch < 4; ch += 1) {
    const top = data[a + ch] + (data[b + ch] - data[a + ch]) * fx;
    const bottom = data[c + ch] + (data[d + ch] - data[c + ch]) * fx;
    out[ch] = top + (bottom - top) * fy;
  }
  return true;
}

/** Projects a frame onto a cylinder of radius `focal` around the camera's vertical axis. A camera
 * panned about that axis then differs between frames by a pure horizontal translation, which is
 * what makes wide multi-frame panoramas stitch without the runaway stretching of a planar
 * projection. Pixels outside the source become transparent. */
export function projectCylindrical(frame: PhotoMergeRaster, focal: number): PhotoMergeRaster {
  const { width, height } = frame;
  const data = pixels(frame);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const halfAngle = Math.atan(cx / focal);
  // Odd width keeps the optical centre on a whole pixel column, symmetric on both sides.
  const outWidth = 2 * Math.floor(focal * halfAngle) + 1;
  const outCx = (outWidth - 1) / 2;
  const out = new Uint8ClampedArray(outWidth * height * 4);
  const sample = [0, 0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const theta = (x - outCx) / focal;
      const sx = focal * Math.tan(theta) + cx;
      const sy = ((y - cy) / Math.cos(theta)) + cy;
      if (!bilinear(data, width, height, sx, sy, sample)) continue;
      const o = (y * outWidth + x) * 4;
      out[o] = sample[0]; out[o + 1] = sample[1]; out[o + 2] = sample[2]; out[o + 3] = sample[3];
    }
  }
  return { width: outWidth, height, buffer: out.buffer };
}

// --- Panorama compositing ---

export type Matrix3 = number[];

export function invertMatrix3(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h; const B = -(d * i - f * g); const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Registration produced a singular transform.');
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((value) => value / det);
  return inv;
}

export function multiplyMatrix3(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

export function applyMatrix3(m: Matrix3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

export interface PanoramaFrame {
  raster: PhotoMergeRaster;
  /** Maps panorama (reference-frame) coordinates to this frame's pixel coordinates. */
  toFrame: Matrix3;
}

export interface PanoramaCompositeOptions {
  maxEdge: number;
  maxPixels: number;
  /** Equalize brightness between neighbouring frames from their overlap. */
  gainCompensation: boolean;
}

export interface PanoramaComposite {
  raster: PhotoMergeRaster;
  /** Scale applied to fit the output limits (1 when none was needed). */
  scale: number;
  gains: number[];
}

/** Brightness ratio that matches `frame` to `previous` over their shared coverage, sampled on a
 * sparse panorama grid. Clamped so a bad overlap cannot produce an absurd exposure jump. */
function overlapGain(previous: PanoramaFrame, frame: PanoramaFrame, bounds: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const previousData = pixels(previous.raster);
  const frameData = pixels(frame.raster);
  const a = [0, 0, 0, 0]; const b = [0, 0, 0, 0];
  let sumPrevious = 0; let sumFrame = 0; let samples = 0;
  const step = Math.max(1, Math.round(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 256));
  for (let y = bounds.minY; y <= bounds.maxY; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const p = applyMatrix3(previous.toFrame, x, y);
      const f = applyMatrix3(frame.toFrame, x, y);
      if (!bilinear(previousData, previous.raster.width, previous.raster.height, p.x, p.y, a)) continue;
      if (!bilinear(frameData, frame.raster.width, frame.raster.height, f.x, f.y, b)) continue;
      if (a[3] < 255 || b[3] < 255) continue;
      sumPrevious += luminance(a[0], a[1], a[2]);
      sumFrame += luminance(b[0], b[1], b[2]);
      samples += 1;
    }
  }
  if (samples < 16 || sumFrame <= 0) return 1;
  return Math.min(2, Math.max(0.5, sumPrevious / sumFrame));
}

/** Warps every frame into one panorama canvas and feather-blends the overlaps: each frame's
 * weight falls linearly to zero at its own border, so seams fade instead of cutting. The canvas is
 * uniformly downscaled when it would exceed the output limits. Frames are expected in capture
 * order so gain compensation can chain between neighbours. */
export function compositePanorama(frames: PanoramaFrame[], options: PanoramaCompositeOptions): PanoramaComposite {
  if (!frames.length) throw new Error('A panorama needs at least one frame.');
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const toPanorama = frames.map((frame) => invertMatrix3(frame.toFrame));
  frames.forEach((frame, index) => {
    const { width, height } = frame.raster;
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
      const point = applyMatrix3(toPanorama[index], x, y);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Registration produced a non-finite panorama transform.');
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
  });
  const naturalWidth = Math.ceil(maxX - minX) + 1;
  const naturalHeight = Math.ceil(maxY - minY) + 1;
  if (naturalWidth > 64 * options.maxEdge || naturalHeight > 64 * options.maxEdge) {
    throw new Error('The photos do not form a usable panorama: their alignment spreads far beyond any real overlap.');
  }
  const scale = Math.min(1, options.maxEdge / Math.max(naturalWidth, naturalHeight), Math.sqrt(options.maxPixels / (naturalWidth * naturalHeight)));
  const width = Math.max(1, Math.floor(naturalWidth * scale));
  const height = Math.max(1, Math.floor(naturalHeight * scale));
  // Output pixel (u, v) → panorama coordinate (minX + u / scale, minY + v / scale).
  const fromOutput: Matrix3 = [1 / scale, 0, minX, 0, 1 / scale, minY, 0, 0, 1];
  const outputToFrame = frames.map((frame) => multiplyMatrix3(frame.toFrame, fromOutput));

  const gains = frames.map(() => 1);
  if (options.gainCompensation) {
    const bounds = { minX, minY, maxX, maxY };
    for (let index = 1; index < frames.length; index += 1) gains[index] = gains[index - 1] * overlapGain(frames[index - 1], frames[index], bounds);
    // Normalise around the mean so the whole panorama keeps the photographer's exposure.
    const mean = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    for (let index = 0; index < gains.length; index += 1) gains[index] /= mean;
  }

  const accumulator = new Float32Array(width * height * 4);
  const sample = [0, 0, 0, 0];
  frames.forEach((frame, index) => {
    const data = pixels(frame.raster);
    const fw = frame.raster.width; const fh = frame.raster.height;
    // Only visit the output rectangle this frame can touch.
    let fMinX = Infinity; let fMinY = Infinity; let fMaxX = -Infinity; let fMaxY = -Infinity;
    for (const [x, y] of [[0, 0], [fw - 1, 0], [0, fh - 1], [fw - 1, fh - 1]]) {
      const point = applyMatrix3(toPanorama[index], x, y);
      fMinX = Math.min(fMinX, (point.x - minX) * scale); fMaxX = Math.max(fMaxX, (point.x - minX) * scale);
      fMinY = Math.min(fMinY, (point.y - minY) * scale); fMaxY = Math.max(fMaxY, (point.y - minY) * scale);
    }
    const x0 = Math.max(0, Math.floor(fMinX)); const x1 = Math.min(width - 1, Math.ceil(fMaxX));
    const y0 = Math.max(0, Math.floor(fMinY)); const y1 = Math.min(height - 1, Math.ceil(fMaxY));
    const feather = Math.max(1, Math.min(fw, fh) / 2);
    const m = outputToFrame[index];
    const gain = gains[index];
    for (let v = y0; v <= y1; v += 1) {
      for (let u = x0; u <= x1; u += 1) {
        const w = m[6] * u + m[7] * v + m[8];
        const fx = (m[0] * u + m[1] * v + m[2]) / w;
        const fy = (m[3] * u + m[4] * v + m[5]) / w;
        if (!bilinear(data, fw, fh, fx, fy, sample) || sample[3] === 0) continue;
        const edge = Math.min(fx, fw - 1 - fx, fy, fh - 1 - fy);
        const weight = Math.max(1e-4, Math.min(1, (edge + 1) / feather)) * (sample[3] / 255);
        const o = (v * width + u) * 4;
        accumulator[o] += sample[0] * gain * weight;
        accumulator[o + 1] += sample[1] * gain * weight;
        accumulator[o + 2] += sample[2] * gain * weight;
        accumulator[o + 3] += weight;
      }
    }
  });

  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    const weight = accumulator[o + 3];
    if (weight <= 0) continue;
    out[o] = Math.round(accumulator[o] / weight);
    out[o + 1] = Math.round(accumulator[o + 1] / weight);
    out[o + 2] = Math.round(accumulator[o + 2] / weight);
    out[o + 3] = 255;
  }
  return { raster: { width, height, buffer: out.buffer }, scale, gains };
}

// --- Rotation-only camera model ---

/** Eigen-decomposition of a symmetric 4×4 matrix by cyclic Jacobi rotations. Returns the unit
 * eigenvector of the largest eigenvalue. Four dimensions converge in a handful of sweeps. */
function dominantEigenvector4(input: number[][]): number[] {
  const a = input.map((row) => [...row]);
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    let off = 0;
    for (let p = 0; p < 4; p += 1) for (let q = p + 1; q < 4; q += 1) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p += 1) {
      for (let q = p + 1; q < 4; q += 1) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k += 1) {
          const akp = a[k][p]; const akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k += 1) {
          const apk = a[p][k]; const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k += 1) {
          const vkp = v[k][p]; const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i += 1) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Least-squares rotation R with target ≈ R · source for paired unit rays (Horn's closed-form
 * quaternion method). A camera turning about its optical centre relates two frames by exactly
 * such a rotation, so fitting 3 parameters instead of a free 8-parameter homography stays
 * well-conditioned even when the frames overlap only in a narrow band. Returns row-major 3×3. */
export function fitRotation(source: number[][], target: number[][]): Matrix3 {
  if (source.length !== target.length || source.length < 2) throw new Error('A rotation fit needs at least two paired rays.');
  let sxx = 0; let sxy = 0; let sxz = 0; let syx = 0; let syy = 0; let syz = 0; let szx = 0; let szy = 0; let szz = 0;
  for (let i = 0; i < source.length; i += 1) {
    const [ax, ay, az] = source[i]; const [bx, by, bz] = target[i];
    sxx += ax * bx; sxy += ax * by; sxz += ax * bz;
    syx += ay * bx; syy += ay * by; syz += ay * bz;
    szx += az * bx; szy += az * by; szz += az * bz;
  }
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const [w, x, y, z] = dominantEigenvector4(n);
  return [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
}

/** Unit viewing ray through pixel (x, y) of a frame with focal length `focal` and centre (cx, cy). */
export function pixelRay(x: number, y: number, focal: number, cx: number, cy: number): number[] {
  const rx = (x - cx) / focal; const ry = (y - cy) / focal;
  const length = Math.sqrt(rx * rx + ry * ry + 1);
  return [rx / length, ry / length, 1 / length];
}

export interface CameraIntrinsics { focal: number; cx: number; cy: number }

/** Pixel homography of a pure camera rotation between two frames: K_to · R · K_from⁻¹. */
export function rotationHomography(rotation: Matrix3, from: CameraIntrinsics, to: CameraIntrinsics): Matrix3 {
  const k: Matrix3 = [to.focal, 0, to.cx, 0, to.focal, to.cy, 0, 0, 1];
  const kInverse: Matrix3 = [1 / from.focal, 0, -from.cx / from.focal, 0, 1 / from.focal, -from.cy / from.focal, 0, 0, 1];
  const h = multiplyMatrix3(k, multiplyMatrix3(rotation, kInverse));
  return h.map((value) => value / h[8]);
}

/** Intrinsics of a frame whose horizontal field of view is `degrees`, centred on the frame. */
export function frameIntrinsics(width: number, height: number, degrees: number): CameraIntrinsics {
  return { focal: focalLengthPixels(width, degrees), cx: (width - 1) / 2, cy: (height - 1) / 2 };
}
