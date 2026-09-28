import { srgbToLinear, whiteBalanceMultipliers } from './photo-engine';
import type { PhotoHistogram, PhotoRecipe } from './photo-types';

export type AutoToneSuggestion = Pick<PhotoRecipe,
  'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' | 'midtone'>;

export type AutoWhiteBalanceSuggestion = Pick<PhotoRecipe, 'temperature' | 'tint'>;

const NEUTRAL_TONE: AutoToneSuggestion = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  midtone: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundHundredth(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function countAt(channel: readonly number[], index: number): number {
  const value = channel[index];
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sampleCount(channel: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < 256; index += 1) total += countAt(channel, index);
  return total;
}

function percentile(channel: readonly number[], fraction: number): number {
  const total = sampleCount(channel);
  if (total <= 0) return 0;
  const target = Math.max(1, Math.ceil(total * clamp(fraction, 0, 1)));
  let cumulative = 0;
  for (let index = 0; index < 256; index += 1) {
    cumulative += countAt(channel, index);
    if (cumulative >= target) return index / 255;
  }
  return 1;
}

function channelMean(channel: readonly number[]): number | null {
  const total = sampleCount(channel);
  if (total <= 0) return null;
  let weighted = 0;
  for (let index = 0; index < 256; index += 1) weighted += index * countAt(channel, index);
  return weighted / total / 255;
}

export function suggestAutoTone(histogram: PhotoHistogram): AutoToneSuggestion {
  if (sampleCount(histogram.luminance) <= 0) return { ...NEUTRAL_TONE };

  const black = percentile(histogram.luminance, 0.01);
  const shadow = percentile(histogram.luminance, 0.1);
  const median = percentile(histogram.luminance, 0.5);
  const highlight = percentile(histogram.luminance, 0.9);
  const white = percentile(histogram.luminance, 0.99);
  const exposure = Math.log2(0.45 / Math.max(median, 1 / 255));

  return {
    exposure: roundHundredth(clamp(exposure, -2, 2)),
    contrast: roundHundredth(clamp((0.72 - (white - black)) * 0.8, -0.5, 0.5)),
    highlights: roundHundredth(clamp((0.88 - highlight) * 2, -0.5, 0.5)),
    shadows: roundHundredth(clamp((0.12 - shadow) * 2, -0.5, 0.5)),
    whites: roundHundredth(clamp((0.98 - white) * 2, -0.5, 0.5)),
    blacks: roundHundredth(clamp((0.02 - black) * 2, -0.5, 0.5)),
    midtone: 0,
  };
}

export function suggestAutoWhiteBalance(histogram: PhotoHistogram): AutoWhiteBalanceSuggestion {
  const red = channelMean(histogram.red);
  const green = channelMean(histogram.green);
  const blue = channelMean(histogram.blue);
  if (red === null || green === null || blue === null) return { temperature: 0, tint: 0 };

  return {
    temperature: roundHundredth(clamp((blue - red) * 1.5, -1, 1)),
    tint: roundHundredth(clamp((green - (red + blue) / 2) * 2, -1, 1)),
  };
}

// --- White-balance eyedropper (capability 64) ---

export interface NeutralPatch {
  /** Mean linear-light red, green, blue of the sampled patch (0–1). */
  red: number;
  green: number;
  blue: number;
  /** Pixels that contributed (transparent pixels are skipped). */
  count: number;
}

/** Averages a square patch in linear light around (x, y) in pixels. Averaging linear values, not
 * encoded ones, is what makes the mean describe the light actually reflected by the target. */
export function sampleNeutralPatch(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius = 2): NeutralPatch {
  let red = 0; let green = 0; let blue = 0; let count = 0;
  const cx = Math.round(x); const cy = Math.round(y);
  for (let py = Math.max(0, cy - radius); py <= Math.min(height - 1, cy + radius); py += 1) {
    for (let px = Math.max(0, cx - radius); px <= Math.min(width - 1, cx + radius); px += 1) {
      const offset = (py * width + px) * 4;
      if (pixels[offset + 3] === 0) continue;
      red += srgbToLinear(pixels[offset]);
      green += srgbToLinear(pixels[offset + 1]);
      blue += srgbToLinear(pixels[offset + 2]);
      count += 1;
    }
  }
  return count ? { red: red / count, green: green / count, blue: blue / count, count } : { red: 0, green: 0, blue: 0, count: 0 };
}

export interface NeutralWhiteBalance extends AutoWhiteBalanceSuggestion {
  /** True when the target is too dark, clipped, or outside the slider range to neutralize fully. */
  limited: boolean;
}

function neutralError(patch: NeutralPatch, temperature: number, tint: number): number {
  const [wr, wg, wb] = whiteBalanceMultipliers(temperature, tint);
  const r = Math.log(patch.red * wr); const g = Math.log(patch.green * wg); const b = Math.log(patch.blue * wb);
  return (r - g) ** 2 + (b - g) ** 2;
}

/** Temperature and tint that make the sampled patch neutral (equal red, green, blue after white
 * balance). The renderer's gains are piecewise linear in temperature, so a coarse grid followed by
 * two refinements finds the global minimum exactly enough for the slider's 0.01 precision. */
export function solveNeutralWhiteBalance(patch: NeutralPatch): NeutralWhiteBalance {
  const floor = 1 / 4096;
  if (patch.count === 0 || Math.min(patch.red, patch.green, patch.blue) < floor) return { temperature: 0, tint: 0, limited: true };
  let best = { temperature: 0, tint: 0, error: neutralError(patch, 0, 0) };
  let span = 1; let step = 0.05;
  for (let pass = 0; pass < 3; pass += 1) {
    const centre = { ...best };
    for (let t = Math.max(-1, centre.temperature - span); t <= Math.min(1, centre.temperature + span) + 1e-9; t += step) {
      for (let n = Math.max(-1, centre.tint - span); n <= Math.min(1, centre.tint + span) + 1e-9; n += step) {
        const error = neutralError(patch, t, n);
        if (error < best.error) best = { temperature: t, tint: n, error };
      }
    }
    span = step * 2; step /= 10;
  }
  const clipped = Math.max(patch.red, patch.green, patch.blue) > 0.98;
  return {
    temperature: roundHundredth(clamp(best.temperature, -1, 1)),
    tint: roundHundredth(clamp(best.tint, -1, 1)),
    limited: clipped || best.error > 1e-4,
  };
}
