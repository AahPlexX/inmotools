import type {
  ColorGrade,
  HslAdjustment,
  PhotoHistogram,
  PhotoHistory,
  PhotoRecipe,
  TonePoint,
} from './photo-types';

const EPSILON = 1e-7;
const HSL_SECTORS = 8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cloneRecipe(recipe: PhotoRecipe): PhotoRecipe {
  return {
    ...recipe,
    crop: { ...recipe.crop },
    toneCurve: recipe.toneCurve.map((point) => ({ ...point })),
    hsl: recipe.hsl.map((entry) => ({ ...entry })),
    shadowGrade: { ...recipe.shadowGrade },
    midtoneGrade: { ...recipe.midtoneGrade },
    highlightGrade: { ...recipe.highlightGrade },
    blackAndWhiteMix: [...recipe.blackAndWhiteMix],
    localAdjustments: recipe.localAdjustments.map((adjustment) => ({
      ...adjustment,
      mask: adjustment.mask.type === 'brush'
        ? { ...adjustment.mask, points: adjustment.mask.points.map((point) => ({ ...point })) }
        : { ...adjustment.mask },
      effect: { ...adjustment.effect },
    })),
    retouch: recipe.retouch.map((operation) => ({ ...operation })),
  };
}

const neutralHsl = (): HslAdjustment[] => Array.from({ length: HSL_SECTORS }, () => ({
  hue: 0,
  saturation: 0,
  luminance: 0,
}));

const neutralGrade = (): ColorGrade => ({ hue: 0, saturation: 0, luminance: 0 });

export const DEFAULT_RECIPE: PhotoRecipe = {
  version: 1,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  straighten: 0,
  rotateQuarterTurns: 0,
  flipX: false,
  flipY: false,
  lensDistortion: 0,
  perspectiveHorizontal: 0,
  perspectiveVertical: 0,

  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  midtone: 0,
  toneCurve: [{ x: 0, y: 0 }, { x: 1, y: 1 }],

  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  hsl: neutralHsl(),
  shadowGrade: neutralGrade(),
  midtoneGrade: neutralGrade(),
  highlightGrade: neutralGrade(),
  blackAndWhite: false,
  blackAndWhiteMix: Array.from({ length: HSL_SECTORS }, () => 1),

  texture: 0,
  clarity: 0,
  dehaze: 0,
  sharpenAmount: 0,
  sharpenRadius: 1,
  sharpenThreshold: 0,
  denoiseLuminance: 0,
  denoiseChroma: 0,
  chromaticAberration: 0,

  vignette: 0,
  vignetteMidpoint: 0.5,
  vignetteFeather: 0.5,
  grain: 0,
  grainSize: 1,
  grainColor: 0,

  localAdjustments: [],
  retouch: [],
};

function normalizeToneCurve(points: TonePoint[]): TonePoint[] {
  const normalized = (points.length >= 2 ? points : DEFAULT_RECIPE.toneCurve)
    .map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);
  normalized[0] = { x: 0, y: normalized[0]?.y ?? 0 };
  normalized[normalized.length - 1] = { x: 1, y: normalized.at(-1)?.y ?? 1 };
  for (let index = 1; index < normalized.length; index += 1) {
    normalized[index].x = Math.max(normalized[index].x, normalized[index - 1].x + EPSILON);
  }
  normalized[normalized.length - 1].x = 1;
  return normalized;
}

function normalizeHsl(entries: HslAdjustment[]): HslAdjustment[] {
  return Array.from({ length: HSL_SECTORS }, (_, index) => {
    const entry = entries[index] ?? DEFAULT_RECIPE.hsl[index];
    return {
      hue: clamp(entry.hue, -180, 180),
      saturation: clamp(entry.saturation, -1, 1),
      luminance: clamp(entry.luminance, -1, 1),
    };
  });
}

function normalizeGrade(grade: ColorGrade): ColorGrade {
  return {
    hue: ((Number.isFinite(grade.hue) ? grade.hue : 0) % 360 + 360) % 360,
    saturation: clamp(grade.saturation, 0, 1),
    luminance: clamp(grade.luminance, -1, 1),
  };
}

export function normalizeRecipe(recipe: PhotoRecipe): PhotoRecipe {
  const cropWidth = clamp(recipe.crop?.width ?? 1, 0.001, 1);
  const cropHeight = clamp(recipe.crop?.height ?? 1, 0.001, 1);
  const cropX = clamp(recipe.crop?.x ?? 0, 0, 1 - cropWidth);
  const cropY = clamp(recipe.crop?.y ?? 0, 0, 1 - cropHeight);

  return {
    ...cloneRecipe({ ...DEFAULT_RECIPE, ...recipe }),
    version: 1,
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    straighten: clamp(recipe.straighten, -45, 45),
    rotateQuarterTurns: Math.round(recipe.rotateQuarterTurns ?? 0) % 4,
    lensDistortion: clamp(recipe.lensDistortion, -1, 1),
    perspectiveHorizontal: clamp(recipe.perspectiveHorizontal, -1, 1),
    perspectiveVertical: clamp(recipe.perspectiveVertical, -1, 1),

    exposure: clamp(recipe.exposure, -5, 5),
    contrast: clamp(recipe.contrast, -1, 1),
    highlights: clamp(recipe.highlights, -1, 1),
    shadows: clamp(recipe.shadows, -1, 1),
    whites: clamp(recipe.whites, -1, 1),
    blacks: clamp(recipe.blacks, -1, 1),
    midtone: clamp(recipe.midtone, -1, 1),
    toneCurve: normalizeToneCurve(recipe.toneCurve),

    temperature: clamp(recipe.temperature, -1, 1),
    tint: clamp(recipe.tint, -1, 1),
    saturation: clamp(recipe.saturation, -1, 1),
    vibrance: clamp(recipe.vibrance, -1, 1),
    hsl: normalizeHsl(recipe.hsl),
    shadowGrade: normalizeGrade(recipe.shadowGrade),
    midtoneGrade: normalizeGrade(recipe.midtoneGrade),
    highlightGrade: normalizeGrade(recipe.highlightGrade),
    blackAndWhiteMix: Array.from({ length: HSL_SECTORS }, (_, index) => clamp(recipe.blackAndWhiteMix[index] ?? 1, 0, 2)),

    texture: clamp(recipe.texture, -1, 1),
    clarity: clamp(recipe.clarity, -1, 1),
    dehaze: clamp(recipe.dehaze, -1, 1),
    sharpenAmount: clamp(recipe.sharpenAmount, 0, 2),
    sharpenRadius: clamp(recipe.sharpenRadius, 0.1, 5),
    sharpenThreshold: clamp(recipe.sharpenThreshold, 0, 1),
    denoiseLuminance: clamp(recipe.denoiseLuminance, 0, 1),
    denoiseChroma: clamp(recipe.denoiseChroma, 0, 1),
    chromaticAberration: clamp(recipe.chromaticAberration, -1, 1),

    vignette: clamp(recipe.vignette, -1, 1),
    vignetteMidpoint: clamp(recipe.vignetteMidpoint, 0, 1),
    vignetteFeather: clamp(recipe.vignetteFeather, 0.01, 1),
    grain: clamp(recipe.grain, 0, 1),
    grainSize: clamp(recipe.grainSize, 0.5, 3),
    grainColor: clamp(recipe.grainColor, 0, 1),
  };
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const clamped = clamp(value, 0, 1);
  const encoded = clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return clamp(Math.round(encoded * 255), 0, 255);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (Math.abs(max - min) < EPSILON) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue /= 6;
  return [hue * 360, saturation, lightness];
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  if (s < EPSILON) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function interpolateCurve(value: number, points: TonePoint[]): number {
  const x = clamp(value, 0, 1);
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (x <= right.x) {
      const span = Math.max(EPSILON, right.x - left.x);
      const t = clamp((x - left.x) / span, 0, 1);
      return left.y + (right.y - left.y) * t;
    }
  }
  return points.at(-1)?.y ?? x;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(EPSILON, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hueSectorBlend(hue: number, entries: HslAdjustment[]): HslAdjustment {
  const sectorWidth = 360 / HSL_SECTORS;
  const position = (((hue % 360) + 360) % 360) / sectorWidth;
  const low = Math.floor(position) % HSL_SECTORS;
  const high = (low + 1) % HSL_SECTORS;
  const t = position - Math.floor(position);
  return {
    hue: entries[low].hue * (1 - t) + entries[high].hue * t,
    saturation: entries[low].saturation * (1 - t) + entries[high].saturation * t,
    luminance: entries[low].luminance * (1 - t) + entries[high].luminance * t,
  };
}

function gradeColor(grade: ColorGrade): [number, number, number] {
  return hslToRgb(grade.hue, grade.saturation, 0.5 + grade.luminance * 0.2);
}

function applyGrade(
  rgb: [number, number, number],
  grade: ColorGrade,
  weight: number,
): [number, number, number] {
  if (grade.saturation <= EPSILON || weight <= EPSILON) return rgb;
  const tint = gradeColor(grade);
  const mix = clamp(grade.saturation * weight * 0.55, 0, 0.7);
  return [
    rgb[0] * (1 - mix) + tint[0] * mix,
    rgb[1] * (1 - mix) + tint[1] * mix,
    rgb[2] * (1 - mix) + tint[2] * mix,
  ];
}

function isIdentityCurve(points: TonePoint[]): boolean {
  return points.length === 2
    && Math.abs(points[0].x) < EPSILON
    && Math.abs(points[0].y) < EPSILON
    && Math.abs(points[1].x - 1) < EPSILON
    && Math.abs(points[1].y - 1) < EPSILON;
}

function isNeutralGlobal(recipe: PhotoRecipe): boolean {
  return recipe.exposure === 0
    && recipe.contrast === 0
    && recipe.highlights === 0
    && recipe.shadows === 0
    && recipe.whites === 0
    && recipe.blacks === 0
    && recipe.midtone === 0
    && isIdentityCurve(recipe.toneCurve)
    && recipe.temperature === 0
    && recipe.tint === 0
    && recipe.saturation === 0
    && recipe.vibrance === 0
    && recipe.hsl.every((entry) => entry.hue === 0 && entry.saturation === 0 && entry.luminance === 0)
    && recipe.shadowGrade.saturation === 0
    && recipe.midtoneGrade.saturation === 0
    && recipe.highlightGrade.saturation === 0
    && !recipe.blackAndWhite
    && recipe.dehaze === 0
    && recipe.vignette === 0
    && recipe.grain === 0;
}

function seededNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function applyPixelAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  inputRecipe: PhotoRecipe,
): void {
  const recipe = inputRecipe === DEFAULT_RECIPE ? inputRecipe : normalizeRecipe(inputRecipe);
  if (isNeutralGlobal(recipe)) return;

  const exposureScale = 2 ** recipe.exposure;
  const temperature = recipe.temperature;
  const tint = recipe.tint;
  const wbR = 1 + Math.max(0, temperature) * 0.28 - Math.max(0, -temperature) * 0.12 + tint * 0.04;
  const wbG = 1 - tint * 0.16;
  const wbB = 1 + Math.max(0, -temperature) * 0.28 - Math.max(0, temperature) * 0.12 + tint * 0.04;
  const contrastSlope = 1 + recipe.contrast * 1.8 + recipe.dehaze * 0.55;
  const gamma = 2 ** (-recipe.midtone * 0.8);

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    let r = srgbToLinear(data[offset]) * exposureScale * wbR;
    let g = srgbToLinear(data[offset + 1]) * exposureScale * wbG;
    let b = srgbToLinear(data[offset + 2]) * exposureScale * wbB;

    let luminance = clamp(r * 0.2126 + g * 0.7152 + b * 0.0722, 0, 1);
    const shadowMask = 1 - smoothstep(0.08, 0.62, luminance);
    const highlightMask = smoothstep(0.38, 0.96, luminance);
    const shadowGain = recipe.shadows * shadowMask * 0.6;
    const highlightGain = recipe.highlights * highlightMask * 0.55;
    const whiteGain = recipe.whites * smoothstep(0.68, 1, luminance) * 0.4;
    const blackGain = recipe.blacks * (1 - smoothstep(0, 0.32, luminance)) * 0.35;
    const toneGain = shadowGain + highlightGain + whiteGain + blackGain;
    const tonalScale = Math.max(0, 1 + toneGain);
    r *= tonalScale;
    g *= tonalScale;
    b *= tonalScale;

    r = (r - 0.18) * contrastSlope + 0.18;
    g = (g - 0.18) * contrastSlope + 0.18;
    b = (b - 0.18) * contrastSlope + 0.18;
    r = clamp(r, 0, 1) ** gamma;
    g = clamp(g, 0, 1) ** gamma;
    b = clamp(b, 0, 1) ** gamma;

    let sr = linearToSrgb(r) / 255;
    let sg = linearToSrgb(g) / 255;
    let sb = linearToSrgb(b) / 255;
    let [hue, sat, light] = rgbToHsl(sr, sg, sb);

    const sector = hueSectorBlend(hue, recipe.hsl);
    hue += sector.hue;
    const vibranceWeight = 1 - sat;
    sat = clamp(sat * (1 + recipe.saturation) * (1 + recipe.vibrance * vibranceWeight), 0, 1);
    sat = clamp(sat * (1 + sector.saturation), 0, 1);
    light = clamp(light + sector.luminance * 0.25, 0, 1);
    [sr, sg, sb] = hslToRgb(hue, sat, light);

    luminance = clamp(sr * 0.2126 + sg * 0.7152 + sb * 0.0722, 0, 1);
    [sr, sg, sb] = applyGrade([sr, sg, sb], recipe.shadowGrade, 1 - smoothstep(0.15, 0.6, luminance));
    [sr, sg, sb] = applyGrade([sr, sg, sb], recipe.midtoneGrade, 1 - Math.abs(luminance - 0.5) * 2);
    [sr, sg, sb] = applyGrade([sr, sg, sb], recipe.highlightGrade, smoothstep(0.4, 0.9, luminance));

    if (recipe.blackAndWhite) {
      const sectorIndex = Math.floor((((hue % 360) + 360) % 360) / (360 / HSL_SECTORS)) % HSL_SECTORS;
      const mix = recipe.blackAndWhiteMix[sectorIndex] ?? 1;
      const gray = clamp((sr * 0.2126 + sg * 0.7152 + sb * 0.0722) * mix, 0, 1);
      sr = gray;
      sg = gray;
      sb = gray;
    }

    sr = interpolateCurve(sr, recipe.toneCurve);
    sg = interpolateCurve(sg, recipe.toneCurve);
    sb = interpolateCurve(sb, recipe.toneCurve);

    const pixelIndex = offset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (recipe.vignette !== 0 && width > 0 && height > 0) {
      const nx = (x + 0.5) / width - 0.5;
      const ny = (y + 0.5) / height - 0.5;
      const radius = Math.sqrt(nx * nx + ny * ny) / Math.SQRT1_2;
      const start = recipe.vignetteMidpoint * 0.75;
      const mask = smoothstep(start, Math.min(1, start + recipe.vignetteFeather), radius);
      const gain = 1 - recipe.vignette * mask * 0.65;
      sr = clamp(sr * gain, 0, 1);
      sg = clamp(sg * gain, 0, 1);
      sb = clamp(sb * gain, 0, 1);
    }

    if (recipe.grain > 0) {
      const grainScale = Math.max(1, recipe.grainSize);
      const baseNoise = seededNoise(Math.floor(x / grainScale), Math.floor(y / grainScale)) * recipe.grain * 0.08;
      const chromaNoise = recipe.grainColor * recipe.grain * 0.035;
      sr = clamp(sr + baseNoise + seededNoise(x + 17, y + 31) * chromaNoise, 0, 1);
      sg = clamp(sg + baseNoise + seededNoise(x + 47, y + 11) * chromaNoise, 0, 1);
      sb = clamp(sb + baseNoise + seededNoise(x + 7, y + 71) * chromaNoise, 0, 1);
    }

    data[offset] = Math.round(sr * 255);
    data[offset + 1] = Math.round(sg * 255);
    data[offset + 2] = Math.round(sb * 255);
  }
}

export function sampleHistogram(data: Uint8ClampedArray): PhotoHistogram {
  const histogram: PhotoHistogram = {
    red: Array.from({ length: 256 }, () => 0),
    green: Array.from({ length: 256 }, () => 0),
    blue: Array.from({ length: 256 }, () => 0),
    luminance: Array.from({ length: 256 }, () => 0),
  };
  for (let offset = 0; offset + 3 < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    histogram.red[red] += 1;
    histogram.green[green] += 1;
    histogram.blue[blue] += 1;
    const luminance = clamp(Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722), 0, 255);
    histogram.luminance[luminance] += 1;
  }
  return histogram;
}

export function createHistory(initial: PhotoRecipe, limit = 80): PhotoHistory {
  return { past: [], present: cloneRecipe(normalizeRecipe(initial)), future: [], limit: Math.max(1, Math.floor(limit)) };
}

export function commitHistory(history: PhotoHistory, recipe: PhotoRecipe): PhotoHistory {
  const normalized = cloneRecipe(normalizeRecipe(recipe));
  return {
    past: [...history.past, cloneRecipe(history.present)].slice(-history.limit),
    present: normalized,
    future: [],
    limit: history.limit,
  };
}

export function undoHistory(history: PhotoHistory): PhotoHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: cloneRecipe(previous),
    future: [cloneRecipe(history.present), ...history.future].slice(0, history.limit),
    limit: history.limit,
  };
}

export function redoHistory(history: PhotoHistory): PhotoHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, cloneRecipe(history.present)].slice(-history.limit),
    present: cloneRecipe(next),
    future: history.future.slice(1),
    limit: history.limit,
  };
}
