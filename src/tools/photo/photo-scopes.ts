export const PHOTO_SCOPE_WIDTH = 256;
export const PHOTO_SCOPE_HEIGHT = 128;
export const PHOTO_VECTORSCOPE_SIZE = 128;
export const PHOTO_EXPOSURE_ZONE_LABELS = ['≤ −5', '−4', '−3', '−2', '−1', '0', '+1', '+2', '+3', '+4', '≥ +5'] as const;

export interface PhotoScopeAnalysis {
  waveform: number[];
  parade: { red: number[]; green: number[]; blue: number[] };
  vectorscope: number[];
  exposureZones: number[];
  sampleCount: number;
}

export type PhotoInspectionOverlay = 'focus' | 'exposure-zones' | 'dust';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function photoExposureZone(luma: number): number {
  const stops = Math.log2(Math.max(1 / 4096, luma) / 0.18);
  return clamp(Math.round(stops) + 5, 0, 10);
}

export function analyzePhotoScopes(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxSamples = 200_000,
): PhotoScopeAnalysis {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) {
    throw new Error('Scope analysis requires a complete positive-size RGBA raster.');
  }
  const binCount = PHOTO_SCOPE_WIDTH * PHOTO_SCOPE_HEIGHT;
  const waveform = new Array<number>(binCount).fill(0);
  const parade = {
    red: new Array<number>(binCount).fill(0),
    green: new Array<number>(binCount).fill(0),
    blue: new Array<number>(binCount).fill(0),
  };
  const vectorscope = new Array<number>(PHOTO_VECTORSCOPE_SIZE ** 2).fill(0);
  const exposureZones = new Array<number>(PHOTO_EXPOSURE_ZONE_LABELS.length).fill(0);
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / Math.max(1, maxSamples))));
  let sampleCount = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const luma = luminance(r, g, b);
      const xBin = clamp(Math.floor(x / width * PHOTO_SCOPE_WIDTH), 0, PHOTO_SCOPE_WIDTH - 1);
      const lumaBin = clamp(PHOTO_SCOPE_HEIGHT - 1 - Math.round(luma * (PHOTO_SCOPE_HEIGHT - 1)), 0, PHOTO_SCOPE_HEIGHT - 1);
      waveform[lumaBin * PHOTO_SCOPE_WIDTH + xBin] += 1;

      const values = [r, g, b] as const;
      const channels = [parade.red, parade.green, parade.blue] as const;
      for (let channel = 0; channel < 3; channel += 1) {
        const valueBin = PHOTO_SCOPE_HEIGHT - 1 - Math.round(values[channel] / 255 * (PHOTO_SCOPE_HEIGHT - 1));
        channels[channel][valueBin * PHOTO_SCOPE_WIDTH + xBin] += 1;
      }

      const red = r / 255;
      const green = g / 255;
      const blue = b / 255;
      const cb = clamp(0.5 - 0.168736 * red - 0.331264 * green + 0.5 * blue, 0, 1);
      const cr = clamp(0.5 + 0.5 * red - 0.418688 * green - 0.081312 * blue, 0, 1);
      const vectorX = clamp(Math.round(cb * (PHOTO_VECTORSCOPE_SIZE - 1)), 0, PHOTO_VECTORSCOPE_SIZE - 1);
      const vectorY = clamp(Math.round((1 - cr) * (PHOTO_VECTORSCOPE_SIZE - 1)), 0, PHOTO_VECTORSCOPE_SIZE - 1);
      vectorscope[vectorY * PHOTO_VECTORSCOPE_SIZE + vectorX] += 1;
      exposureZones[photoExposureZone(luma)] += 1;
      sampleCount += 1;
    }
  }

  return { waveform, parade, vectorscope, exposureZones, sampleCount };
}

const EXPOSURE_ZONE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [30, 41, 59], [30, 64, 175], [37, 99, 235], [6, 182, 212], [34, 197, 94],
  [250, 204, 21], [251, 146, 60], [249, 115, 22], [239, 68, 68], [217, 70, 239], [255, 255, 255],
];

export function createPhotoInspectionOverlay(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mode: PhotoInspectionOverlay,
): Uint8ClampedArray {
  if (width < 1 || height < 1 || pixels.length < width * height * 4) {
    throw new Error('Inspection overlay requires a complete positive-size RGBA raster.');
  }
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] === 0) continue;
      if (mode === 'exposure-zones') {
        const color = EXPOSURE_ZONE_COLORS[photoExposureZone(luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]))];
        output[offset] = color[0];
        output[offset + 1] = color[1];
        output[offset + 2] = color[2];
        output[offset + 3] = 156;
        continue;
      }

      if (mode === 'dust') {
        // Isolated local-contrast spikes (a single point that disagrees with its whole ring of
        // neighbors) — distinct from 'focus', which flags ordinary directional edges instead.
        const leftX = Math.max(0, x - 1);
        const rightX = Math.min(width - 1, x + 1);
        const topY = Math.max(0, y - 1);
        const bottomY = Math.min(height - 1, y + 1);
        let neighborSum = 0;
        let neighborCount = 0;
        for (let sy = topY; sy <= bottomY; sy += 1) {
          for (let sx = leftX; sx <= rightX; sx += 1) {
            if (sx === x && sy === y) continue;
            const neighborOffset = (sy * width + sx) * 4;
            neighborSum += luminance(pixels[neighborOffset], pixels[neighborOffset + 1], pixels[neighborOffset + 2]);
            neighborCount += 1;
          }
        }
        const centerLuma = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        const neighborAvg = neighborCount ? neighborSum / neighborCount : centerLuma;
        const deviation = Math.abs(centerLuma - neighborAvg);
        if (deviation < 0.18) continue;
        output[offset] = 239;
        output[offset + 1] = 68;
        output[offset + 2] = 68;
        output[offset + 3] = Math.round(140 + Math.min(1, deviation) * 115);
        continue;
      }

      const leftX = Math.max(0, x - 1);
      const rightX = Math.min(width - 1, x + 1);
      const topY = Math.max(0, y - 1);
      const bottomY = Math.min(height - 1, y + 1);
      const left = (y * width + leftX) * 4;
      const right = (y * width + rightX) * 4;
      const top = (topY * width + x) * 4;
      const bottom = (bottomY * width + x) * 4;
      const horizontal = Math.abs(luminance(pixels[right], pixels[right + 1], pixels[right + 2])
        - luminance(pixels[left], pixels[left + 1], pixels[left + 2]));
      const vertical = Math.abs(luminance(pixels[bottom], pixels[bottom + 1], pixels[bottom + 2])
        - luminance(pixels[top], pixels[top + 1], pixels[top + 2]));
      const energy = Math.min(1, Math.hypot(horizontal, vertical) * 2.4);
      if (energy < 0.08) continue;
      output[offset] = 34;
      output[offset + 1] = 211;
      output[offset + 2] = 238;
      output[offset + 3] = Math.round(48 + energy * 207);
    }
  }
  return output;
}
