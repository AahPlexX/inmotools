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
