import type { PhotoMergeCrop, PhotoMergeRaster, PhotoStackMethod } from './photo-merge-types';

const FOCUS_SMOOTH_RADIUS = 2;
const FOCUS_WEIGHT_POWER = 3;

function outputFor(crop: PhotoMergeCrop): { bytes: Uint8Array; raster: () => PhotoMergeRaster } {
  const bytes = new Uint8Array(crop.width * crop.height * 4);
  return { bytes, raster: () => ({ width: crop.width, height: crop.height, buffer: bytes.buffer }) };
}

function sources(frames: PhotoMergeRaster[]): Uint8Array[] {
  return frames.map((frame) => new Uint8Array(frame.buffer));
}

/** Per-channel mean. Random sensor noise falls with the square root of the frame count. */
export function averageStack(frames: PhotoMergeRaster[], crop: PhotoMergeCrop): PhotoMergeRaster {
  const data = sources(frames);
  const { bytes, raster } = outputFor(crop);
  const stride = frames[0].width;
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const from = ((crop.y + y) * stride + crop.x + x) * 4;
      const to = (y * crop.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (const frame of data) sum += frame[from + channel];
        bytes[to + channel] = Math.round(sum / data.length);
      }
      bytes[to + 3] = 255;
    }
  }
  return raster();
}

/** Per-channel median. Anything present in fewer than half the frames (a passer-by, a bird) is
 * rejected outright, which a mean cannot do. An even count averages the two middle values. */
export function medianStack(frames: PhotoMergeRaster[], crop: PhotoMergeCrop): PhotoMergeRaster {
  const data = sources(frames);
  const { bytes, raster } = outputFor(crop);
  const stride = frames[0].width;
  const values = new Array<number>(frames.length);
  const middle = frames.length >> 1;
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const from = ((crop.y + y) * stride + crop.x + x) * 4;
      const to = (y * crop.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        for (let i = 0; i < data.length; i += 1) values[i] = data[i][from + channel];
        values.sort((a, b) => a - b);
        bytes[to + channel] = frames.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
      }
      bytes[to + 3] = 255;
    }
  }
  return raster();
}

/** Mean over a (2r+1) square window, edges clamped, via running sums along each axis. */
function boxSmooth(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(source.length);
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += source[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / window;
      sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
    }
  }
  const output = new Float32Array(source.length);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += horizontal[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / window;
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
    }
  }
  return output;
}

/** Local sharpness: smoothed absolute Laplacian of luminance. Flat areas score near zero in every
 * frame, so their weights tie and they blend evenly instead of picking an arbitrary frame. */
function sharpnessMap(frame: Uint8Array, stride: number, crop: PhotoMergeCrop): Float32Array {
  const { width, height } = crop;
  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = ((crop.y + y) * stride + crop.x + x) * 4;
      luma[y * width + x] = 0.299 * frame[o] + 0.587 * frame[o + 1] + 0.114 * frame[o + 2];
    }
  }
  const edges = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (px: number, py: number) => luma[Math.min(height - 1, Math.max(0, py)) * width + Math.min(width - 1, Math.max(0, px))];
      edges[y * width + x] = Math.abs(4 * at(x, y) - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1));
    }
  }
  return boxSmooth(edges, width, height, FOCUS_SMOOTH_RADIUS);
}

/** Focus stack: every frame contributes to each pixel in proportion to its local sharpness raised
 * to a power, so the sharpest frame dominates while the smoothed weight maps blend the transitions
 * between in-focus regions instead of leaving hard seams. Only the running sums are kept, so peak
 * memory does not grow with the frame count. */
export function focusStack(frames: PhotoMergeRaster[], crop: PhotoMergeCrop): PhotoMergeRaster {
  const data = sources(frames);
  const stride = frames[0].width;
  const pixels = crop.width * crop.height;
  const sums = new Float32Array(pixels * 3);
  const weights = new Float32Array(pixels);
  for (const frame of data) {
    const sharp = sharpnessMap(frame, stride, crop);
    for (let y = 0; y < crop.height; y += 1) {
      for (let x = 0; x < crop.width; x += 1) {
        const p = y * crop.width + x;
        const weight = (sharp[p] + 1) ** FOCUS_WEIGHT_POWER;
        const from = ((crop.y + y) * stride + crop.x + x) * 4;
        sums[p * 3] += frame[from] * weight;
        sums[p * 3 + 1] += frame[from + 1] * weight;
        sums[p * 3 + 2] += frame[from + 2] * weight;
        weights[p] += weight;
      }
    }
  }
  const { bytes, raster } = outputFor(crop);
  for (let p = 0; p < pixels; p += 1) {
    bytes[p * 4] = Math.round(sums[p * 3] / weights[p]);
    bytes[p * 4 + 1] = Math.round(sums[p * 3 + 1] / weights[p]);
    bytes[p * 4 + 2] = Math.round(sums[p * 3 + 2] / weights[p]);
    bytes[p * 4 + 3] = 255;
  }
  return raster();
}

export function stackFrames(method: PhotoStackMethod, frames: PhotoMergeRaster[], crop: PhotoMergeCrop): PhotoMergeRaster {
  if (method === 'average') return averageStack(frames, crop);
  if (method === 'median') return medianStack(frames, crop);
  return focusStack(frames, crop);
}
