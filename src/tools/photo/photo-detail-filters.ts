import type { PhotoDefringe, PhotoDetailFilters } from './photo-types';

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const NEUTRAL_DETAIL_FILTERS: PhotoDetailFilters = {
  gaussianBlur: 0,
  medianFilter: 0,
  bilateralSmoothing: 0,
  highPass: 0,
  frequencySeparationDetail: 0,
  defringe: { hue: 300, range: 30, amount: 0 },
  moireReduction: 0,
  hotPixelCorrection: 0,
};

export function isDetailFiltersNeutral(filters: PhotoDetailFilters | undefined): boolean {
  if (!filters) return true;
  return filters.gaussianBlur <= EPSILON
    && filters.medianFilter <= EPSILON
    && filters.bilateralSmoothing <= EPSILON
    && filters.highPass <= EPSILON
    && Math.abs(filters.frequencySeparationDetail) <= EPSILON
    && filters.defringe.amount <= EPSILON
    && filters.moireReduction <= EPSILON
    && filters.hotPixelCorrection <= EPSILON;
}

export function normalizeDetailFilters(filters: PhotoDetailFilters | undefined): PhotoDetailFilters {
  const source = filters ?? NEUTRAL_DETAIL_FILTERS;
  const defringeSource = source.defringe ?? NEUTRAL_DETAIL_FILTERS.defringe;
  return {
    gaussianBlur: clamp(source.gaussianBlur, 0, 1),
    medianFilter: clamp(source.medianFilter, 0, 1),
    bilateralSmoothing: clamp(source.bilateralSmoothing, 0, 1),
    highPass: clamp(source.highPass, 0, 1),
    frequencySeparationDetail: clamp(source.frequencySeparationDetail, -1, 1),
    defringe: {
      hue: ((Number.isFinite(defringeSource.hue) ? defringeSource.hue : 300) % 360 + 360) % 360,
      range: clamp(defringeSource.range, 1, 90),
      amount: clamp(defringeSource.amount, 0, 1),
    },
    moireReduction: clamp(source.moireReduction, 0, 1),
    hotPixelCorrection: clamp(source.hotPixelCorrection, 0, 1),
  };
}

function boxBlurLocal(source: ArrayLike<number>, width: number, height: number, radius: number): Uint8ClampedArray<ArrayBuffer> {
  const r = Math.max(1, Math.round(radius));
  const output = new Uint8ClampedArray(source.length);
  if (width <= 0 || height <= 0) return output;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      const top = Math.max(0, y - r);
      const bottom = Math.min(height - 1, y + r);
      const left = Math.max(0, x - r);
      const right = Math.min(width - 1, x + r);
      for (let sy = top; sy <= bottom; sy += 1) {
        for (let sx = left; sx <= right; sx += 1) {
          const offset = (sy * width + sx) * 4;
          red += source[offset];
          green += source[offset + 1];
          blue += source[offset + 2];
          alpha += source[offset + 3];
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      output[target] = Math.round(red / count);
      output[target + 1] = Math.round(green / count);
      output[target + 2] = Math.round(blue / count);
      output[target + 3] = Math.round(alpha / count);
    }
  }
  return output;
}

function luminanceAt(pixels: Uint8ClampedArray, offset: number): number {
  return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
}

/** Deterministic Gaussian approximation via three box-blur passes — a well-established
 * technique that converges close to a true Gaussian kernel without a separate kernel table. */
export function applyGaussianBlur(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON) return;
  const passRadius = Math.max(1, (1 + amount * 11) / 3);
  let working = new Uint8ClampedArray(data);
  for (let pass = 0; pass < 3; pass += 1) {
    working = boxBlurLocal(working, width, height, passRadius);
  }
  for (let index = 0; index < data.length; index += 1) {
    data[index] = working[index];
  }
}

export function applyMedianFilter(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON || width < 1 || height < 1) return;
  const radius = Math.max(1, Math.min(3, Math.round(1 + amount * 2)));
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const reds: number[] = [];
      const greens: number[] = [];
      const blues: number[] = [];
      for (let sy = top; sy <= bottom; sy += 1) {
        for (let sx = left; sx <= right; sx += 1) {
          const offset = (sy * width + sx) * 4;
          reds.push(source[offset]);
          greens.push(source[offset + 1]);
          blues.push(source[offset + 2]);
        }
      }
      reds.sort((a, b) => a - b);
      greens.sort((a, b) => a - b);
      blues.sort((a, b) => a - b);
      const mid = Math.floor(reds.length / 2);
      const target = (y * width + x) * 4;
      data[target] = reds[mid];
      data[target + 1] = greens[mid];
      data[target + 2] = blues[mid];
    }
  }
}

/** Fixed small 5x5 window keeps this interactive at preview resolution; `amount` blends
 * toward the edge-preserving result rather than widening the window, so cost stays bounded. */
export function applyBilateralSmoothing(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON || width < 1 || height < 1) return;
  const radius = 2;
  const sigmaSpace = radius;
  const sigmaRange = 35;
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetOffset = (y * width + x) * 4;
      if (source[targetOffset + 3] === 0) continue;
      const cr = source[targetOffset];
      const cg = source[targetOffset + 1];
      const cb = source[targetOffset + 2];
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      for (let sy = top; sy <= bottom; sy += 1) {
        for (let sx = left; sx <= right; sx += 1) {
          const offset = (sy * width + sx) * 4;
          const dr = source[offset] - cr;
          const dg = source[offset + 1] - cg;
          const db = source[offset + 2] - cb;
          const rangeDist = dr * dr + dg * dg + db * db;
          const spaceDist = (sx - x) * (sx - x) + (sy - y) * (sy - y);
          const weight = Math.exp(-spaceDist / (2 * sigmaSpace * sigmaSpace) - rangeDist / (2 * sigmaRange * sigmaRange));
          sumR += source[offset] * weight;
          sumG += source[offset + 1] * weight;
          sumB += source[offset + 2] * weight;
          sumW += weight;
        }
      }
      if (sumW <= EPSILON) continue;
      data[targetOffset] = clamp(Math.round(cr + (sumR / sumW - cr) * amount), 0, 255);
      data[targetOffset + 1] = clamp(Math.round(cg + (sumG / sumW - cg) * amount), 0, 255);
      data[targetOffset + 2] = clamp(Math.round(cb + (sumB / sumW - cb) * amount), 0, 255);
    }
  }
}

export function applyHighPass(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlurLocal(source, width, height, 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const detail = source[offset + channel] - blurred[offset + channel];
      data[offset + channel] = clamp(Math.round(source[offset + channel] + detail * amount * 1.5), 0, 255);
    }
  }
}

/** Splits into a fixed-radius low-frequency base and its high-frequency residual, then scales
 * the residual by `detail` before recombining — the editable half of a frequency-separation
 * workflow (soften toward the base at -1, boost micro-contrast toward +1). */
export function applyFrequencySeparationDetail(data: Uint8ClampedArray, width: number, height: number, detail: number): void {
  if (Math.abs(detail) <= EPSILON) return;
  const source = new Uint8ClampedArray(data);
  const low = boxBlurLocal(source, width, height, 6);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const high = source[offset + channel] - low[offset + channel];
      data[offset + channel] = clamp(Math.round(low[offset + channel] + high * (1 + detail)), 0, 255);
    }
  }
}

/** Desaturates pixels whose hue falls within the targeted band AND sit on a local-contrast
 * edge — the classic chromatic-fringe signature — leaving flat-color regions of the same hue
 * untouched, distinct from the existing global chromatic-aberration channel shift. */
export function applyDefringe(data: Uint8ClampedArray, width: number, height: number, config: PhotoDefringe): void {
  if (config.amount <= EPSILON || width < 1 || height < 1) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] === 0) continue;
      const r = source[offset] / 255;
      const g = source[offset + 1] / 255;
      const b = source[offset + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (delta < 0.03) continue;
      let hue: number;
      if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0));
      else if (max === g) hue = ((b - r) / delta + 2);
      else hue = ((r - g) / delta + 4);
      hue = ((hue * 60) % 360 + 360) % 360;
      const hueDiff = Math.min(Math.abs(hue - config.hue), 360 - Math.abs(hue - config.hue));
      if (hueDiff > config.range) continue;

      const nx = Math.min(width - 1, x + 1);
      const px = Math.max(0, x - 1);
      const ny = Math.min(height - 1, y + 1);
      const py = Math.max(0, y - 1);
      const gradX = luminanceAt(source, (y * width + nx) * 4) - luminanceAt(source, (y * width + px) * 4);
      const gradY = luminanceAt(source, (ny * width + x) * 4) - luminanceAt(source, (py * width + x) * 4);
      const edgeStrength = Math.min(1, Math.hypot(gradX, gradY) / 180);
      if (edgeStrength < 0.15) continue;

      const strength = config.amount * edgeStrength * (1 - hueDiff / Math.max(1, config.range));
      const gray = (r + g + b) / 3;
      data[offset] = clamp(Math.round((r + (gray - r) * strength) * 255), 0, 255);
      data[offset + 1] = clamp(Math.round((g + (gray - g) * strength) * 255), 0, 255);
      data[offset + 2] = clamp(Math.round((b + (gray - b) * strength) * 255), 0, 255);
    }
  }
}

/** Blends toward a light blur only where local high-frequency energy is elevated (fine
 * repetitive detail, the moiré-prone case), leaving smooth regions untouched so the whole
 * image is not softened to chase an aliasing artifact confined to one area. */
export function applyMoireReduction(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON || width < 1 || height < 1) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlurLocal(source, width, height, 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] === 0) continue;
      const nx = Math.min(width - 1, x + 1);
      const px = Math.max(0, x - 1);
      const ny = Math.min(height - 1, y + 1);
      const py = Math.max(0, y - 1);
      // Center-to-immediate-neighbor differences (not a symmetric left/right gradient, which
      // cancels out on an alternating checkerboard despite it being the densest aliasing case).
      const centerLuma = luminanceAt(source, offset);
      const spread = Math.abs(centerLuma - luminanceAt(source, (y * width + nx) * 4))
        + Math.abs(centerLuma - luminanceAt(source, (y * width + px) * 4))
        + Math.abs(centerLuma - luminanceAt(source, (ny * width + x) * 4))
        + Math.abs(centerLuma - luminanceAt(source, (py * width + x) * 4));
      const energy = clamp(spread / 4 / 90, 0, 1);
      const blend = amount * energy;
      if (blend <= EPSILON) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = clamp(Math.round(source[offset + channel] + (blurred[offset + channel] - source[offset + channel]) * blend), 0, 255);
      }
    }
  }
}

/** Per-channel: replaces a pixel with its 8-neighbor median only when the deviation exceeds a
 * threshold that tightens as `amount` rises — targets isolated single-pixel defects (hot/dead
 * sensor pixels) without touching ordinary detail, which rarely disagrees with every neighbor. */
export function applyHotPixelCorrection(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= EPSILON || width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  const threshold = 255 * (1 - amount) * 0.6 + 15;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] === 0) continue;
      const top = Math.max(0, y - 1);
      const bottom = Math.min(height - 1, y + 1);
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      for (let channel = 0; channel < 3; channel += 1) {
        const values: number[] = [];
        for (let sy = top; sy <= bottom; sy += 1) {
          for (let sx = left; sx <= right; sx += 1) {
            if (sx === x && sy === y) continue;
            values.push(source[(sy * width + sx) * 4 + channel]);
          }
        }
        values.sort((a, b) => a - b);
        const median = values[Math.floor(values.length / 2)];
        if (Math.abs(source[offset + channel] - median) > threshold) {
          data[offset + channel] = median;
        }
      }
    }
  }
}

export function applyDetailFilters(data: Uint8ClampedArray, width: number, height: number, filters: PhotoDetailFilters | undefined): void {
  if (isDetailFiltersNeutral(filters)) return;
  const config = filters ?? NEUTRAL_DETAIL_FILTERS;
  applyHotPixelCorrection(data, width, height, config.hotPixelCorrection);
  applyDefringe(data, width, height, config.defringe);
  applyMoireReduction(data, width, height, config.moireReduction);
  applyBilateralSmoothing(data, width, height, config.bilateralSmoothing);
  applyMedianFilter(data, width, height, config.medianFilter);
  applyGaussianBlur(data, width, height, config.gaussianBlur);
  applyFrequencySeparationDetail(data, width, height, config.frequencySeparationDetail);
  applyHighPass(data, width, height, config.highPass);
}
