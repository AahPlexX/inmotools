import type {
  ColorGrade,
  HslAdjustment,
  LocalAdjustment,
  PhotoHistogram,
  PhotoHistory,
  PhotoMask,
  PhotoRecipe,
  RetouchOperation,
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

function normalizeMask(mask: PhotoMask): PhotoMask {
  const base = {
    feather: clamp(mask.feather, 0, 1),
    opacity: clamp(mask.opacity, 0, 1),
    invert: Boolean(mask.invert),
  };
  switch (mask.type) {
    case 'brush':
      return {
        type: 'brush',
        points: mask.points.slice(0, 5000).map((point) => ({
          x: clamp(point.x, 0, 1),
          y: clamp(point.y, 0, 1),
          pressure: clamp(point.pressure, 0, 1),
        })),
        radius: clamp(mask.radius, 0.001, 1),
        ...base,
      };
    case 'radial':
      return {
        type: 'radial',
        cx: clamp(mask.cx, 0, 1),
        cy: clamp(mask.cy, 0, 1),
        rx: clamp(mask.rx, 0.001, 1),
        ry: clamp(mask.ry, 0.001, 1),
        ...base,
      };
    case 'linear':
      return {
        type: 'linear',
        x1: clamp(mask.x1, 0, 1),
        y1: clamp(mask.y1, 0, 1),
        x2: clamp(mask.x2, 0, 1),
        y2: clamp(mask.y2, 0, 1),
        ...base,
      };
    case 'luminance': {
      const min = clamp(Math.min(mask.min, mask.max), 0, 1);
      const max = clamp(Math.max(mask.min, mask.max), min, 1);
      return { type: 'luminance', min, max, ...base };
    }
    case 'hue':
      return {
        type: 'hue',
        center: ((Number.isFinite(mask.center) ? mask.center : 0) % 360 + 360) % 360,
        range: clamp(mask.range, 0, 180),
        ...base,
      };
  }
}

function normalizeLocalAdjustment(adjustment: LocalAdjustment): LocalAdjustment {
  return {
    id: adjustment.id || 'local-adjustment',
    label: adjustment.label || 'Local adjustment',
    enabled: adjustment.enabled !== false,
    mask: normalizeMask(adjustment.mask),
    effect: {
      exposure: clamp(adjustment.effect.exposure, -5, 5),
      saturation: clamp(adjustment.effect.saturation, -1, 1),
      sharpness: clamp(adjustment.effect.sharpness, -1, 2),
      blur: clamp(adjustment.effect.blur, 0, 1),
    },
  };
}

function normalizeRetouch(operation: RetouchOperation): RetouchOperation {
  if (operation.type === 'red-eye') {
    return {
      id: operation.id || 'red-eye',
      type: 'red-eye',
      x: clamp(operation.x, 0, 1),
      y: clamp(operation.y, 0, 1),
      radius: clamp(operation.radius, 0.001, 1),
      strength: clamp(operation.strength, 0, 1),
    };
  }
  return {
    id: operation.id || operation.type,
    type: operation.type,
    sourceX: clamp(operation.sourceX, 0, 1),
    sourceY: clamp(operation.sourceY, 0, 1),
    targetX: clamp(operation.targetX, 0, 1),
    targetY: clamp(operation.targetY, 0, 1),
    radius: clamp(operation.radius, 0.001, 1),
    feather: clamp(operation.feather, 0, 1),
    opacity: clamp(operation.opacity, 0, 1),
  };
}

export function normalizeRecipe(recipe: PhotoRecipe): PhotoRecipe {
  const source = cloneRecipe({ ...DEFAULT_RECIPE, ...recipe });
  const cropWidth = clamp(source.crop?.width ?? 1, 0.001, 1);
  const cropHeight = clamp(source.crop?.height ?? 1, 0.001, 1);
  const cropX = clamp(source.crop?.x ?? 0, 0, 1 - cropWidth);
  const cropY = clamp(source.crop?.y ?? 0, 0, 1 - cropHeight);

  return {
    ...source,
    version: 1,
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    straighten: clamp(source.straighten, -45, 45),
    rotateQuarterTurns: Math.round(source.rotateQuarterTurns ?? 0) % 4,
    lensDistortion: clamp(source.lensDistortion, -1, 1),
    perspectiveHorizontal: clamp(source.perspectiveHorizontal, -1, 1),
    perspectiveVertical: clamp(source.perspectiveVertical, -1, 1),

    exposure: clamp(source.exposure, -5, 5),
    contrast: clamp(source.contrast, -1, 1),
    highlights: clamp(source.highlights, -1, 1),
    shadows: clamp(source.shadows, -1, 1),
    whites: clamp(source.whites, -1, 1),
    blacks: clamp(source.blacks, -1, 1),
    midtone: clamp(source.midtone, -1, 1),
    toneCurve: normalizeToneCurve(source.toneCurve),

    temperature: clamp(source.temperature, -1, 1),
    tint: clamp(source.tint, -1, 1),
    saturation: clamp(source.saturation, -1, 1),
    vibrance: clamp(source.vibrance, -1, 1),
    hsl: normalizeHsl(source.hsl),
    shadowGrade: normalizeGrade(source.shadowGrade),
    midtoneGrade: normalizeGrade(source.midtoneGrade),
    highlightGrade: normalizeGrade(source.highlightGrade),
    blackAndWhiteMix: Array.from({ length: HSL_SECTORS }, (_, index) => clamp(source.blackAndWhiteMix[index] ?? 1, 0, 2)),

    texture: clamp(source.texture, -1, 1),
    clarity: clamp(source.clarity, -1, 1),
    dehaze: clamp(source.dehaze, -1, 1),
    sharpenAmount: clamp(source.sharpenAmount, 0, 2),
    sharpenRadius: clamp(source.sharpenRadius, 0.1, 5),
    sharpenThreshold: clamp(source.sharpenThreshold, 0, 1),
    denoiseLuminance: clamp(source.denoiseLuminance, 0, 1),
    denoiseChroma: clamp(source.denoiseChroma, 0, 1),
    chromaticAberration: clamp(source.chromaticAberration, -1, 1),

    vignette: clamp(source.vignette, -1, 1),
    vignetteMidpoint: clamp(source.vignetteMidpoint, 0, 1),
    vignetteFeather: clamp(source.vignetteFeather, 0.01, 1),
    grain: clamp(source.grain, 0, 1),
    grainSize: clamp(source.grainSize, 0.5, 3),
    grainColor: clamp(source.grainColor, 0, 1),

    localAdjustments: source.localAdjustments.map(normalizeLocalAdjustment),
    retouch: source.retouch.map(normalizeRetouch),
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

function hasSpatialDetail(recipe: PhotoRecipe): boolean {
  return recipe.texture !== 0
    || recipe.clarity !== 0
    || recipe.sharpenAmount !== 0
    || recipe.denoiseLuminance !== 0
    || recipe.denoiseChroma !== 0
    || recipe.chromaticAberration !== 0;
}

function hasLocalWork(recipe: PhotoRecipe): boolean {
  return recipe.localAdjustments.some((adjustment) => adjustment.enabled
    && adjustment.mask.opacity > 0
    && (adjustment.effect.exposure !== 0
      || adjustment.effect.saturation !== 0
      || adjustment.effect.sharpness !== 0
      || adjustment.effect.blur !== 0));
}

function seededNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function applyGlobalAdjustments(data: Uint8ClampedArray, width: number, height: number, recipe: PhotoRecipe): void {
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
    const tonalScale = Math.max(0, 1 + shadowGain + highlightGain + whiteGain + blackGain);
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

function boxBlur(source: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, Math.min(6, Math.round(radius)));
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

function applyLuminanceDenoise(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlur(source, width, height, 1 + amount * 2);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    const sourceLuma = source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
    const blurredLuma = blurred[offset] * 0.2126 + blurred[offset + 1] * 0.7152 + blurred[offset + 2] * 0.0722;
    const delta = (blurredLuma - sourceLuma) * amount;
    data[offset] = clamp(Math.round(source[offset] + delta), 0, 255);
    data[offset + 1] = clamp(Math.round(source[offset + 1] + delta), 0, 255);
    data[offset + 2] = clamp(Math.round(source[offset + 2] + delta), 0, 255);
  }
}

function applyChromaDenoise(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlur(source, width, height, 2);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    const sourceLuma = source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
    const blurredLuma = blurred[offset] * 0.2126 + blurred[offset + 1] * 0.7152 + blurred[offset + 2] * 0.0722;
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceChroma = source[offset + channel] - sourceLuma;
      const blurredChroma = blurred[offset + channel] - blurredLuma;
      data[offset + channel] = clamp(Math.round(sourceLuma + sourceChroma * (1 - amount) + blurredChroma * amount), 0, 255);
    }
  }
}

function applyUnsharp(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  amount: number,
  threshold = 0,
): void {
  if (Math.abs(amount) <= EPSILON) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlur(source, width, height, radius);
  const thresholdBytes = clamp(threshold, 0, 1) * 255;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = source[offset + channel] - blurred[offset + channel];
      if (Math.abs(difference) < thresholdBytes) continue;
      data[offset + channel] = clamp(Math.round(source[offset + channel] + difference * amount), 0, 255);
    }
  }
}

function applyChromaticCorrection(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const shift = Math.round(amount * 2);
  if (!shift || width <= 1) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      const redX = clamp(x + shift, 0, width - 1);
      const blueX = clamp(x - shift, 0, width - 1);
      data[target] = source[(y * width + redX) * 4];
      data[target + 2] = source[(y * width + blueX) * 4 + 2];
    }
  }
}

function applySpatialDetail(data: Uint8ClampedArray, width: number, height: number, recipe: PhotoRecipe): void {
  if (!hasSpatialDetail(recipe)) return;
  applyLuminanceDenoise(data, width, height, recipe.denoiseLuminance);
  applyChromaDenoise(data, width, height, recipe.denoiseChroma);
  if (recipe.texture !== 0) applyUnsharp(data, width, height, 1, recipe.texture * 0.65, 0.01);
  if (recipe.clarity !== 0) applyUnsharp(data, width, height, 3, recipe.clarity * 0.55, 0.015);
  if (recipe.sharpenAmount > 0) applyUnsharp(data, width, height, recipe.sharpenRadius, recipe.sharpenAmount * 0.75, recipe.sharpenThreshold);
  applyChromaticCorrection(data, width, height, recipe.chromaticAberration);
}

function circularHueDistance(a: number, b: number): number {
  const raw = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(raw, 360 - raw);
}

function brushWeight(mask: Extract<PhotoMask, { type: 'brush' }>, x: number, y: number): number {
  let best = 0;
  for (const point of mask.points) {
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance > mask.radius) continue;
    const inner = mask.radius * (1 - mask.feather);
    const edge = mask.feather <= EPSILON
      ? (distance <= mask.radius ? 1 : 0)
      : 1 - smoothstep(inner, mask.radius, distance);
    best = Math.max(best, edge * point.pressure);
  }
  return best;
}

function maskWeight(mask: PhotoMask, x: number, y: number, red: number, green: number, blue: number): number {
  let weight = 0;
  if (mask.type === 'radial') {
    const dx = (x - mask.cx) / Math.max(EPSILON, mask.rx);
    const dy = (y - mask.cy) / Math.max(EPSILON, mask.ry);
    const distance = Math.hypot(dx, dy);
    weight = mask.feather <= EPSILON
      ? (distance <= 1 ? 1 : 0)
      : 1 - smoothstep(Math.max(0, 1 - mask.feather), 1, distance);
  } else if (mask.type === 'linear') {
    const vx = mask.x2 - mask.x1;
    const vy = mask.y2 - mask.y1;
    const lengthSquared = Math.max(EPSILON, vx * vx + vy * vy);
    const projection = ((x - mask.x1) * vx + (y - mask.y1) * vy) / lengthSquared;
    const halfFeather = Math.max(0.005, mask.feather * 0.5);
    weight = smoothstep(0.5 - halfFeather, 0.5 + halfFeather, projection);
  } else if (mask.type === 'luminance') {
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    const feather = Math.max(0.001, mask.feather * 0.25);
    const lower = smoothstep(mask.min - feather, mask.min + feather, luminance);
    const upper = 1 - smoothstep(mask.max - feather, mask.max + feather, luminance);
    weight = Math.min(lower, upper);
  } else if (mask.type === 'hue') {
    const [hue] = rgbToHsl(red / 255, green / 255, blue / 255);
    const distance = circularHueDistance(hue, mask.center);
    const featherDegrees = Math.max(1, mask.feather * 60);
    weight = 1 - smoothstep(mask.range, mask.range + featherDegrees, distance);
  } else {
    weight = brushWeight(mask, x, y);
  }
  const resolved = mask.invert ? 1 - weight : weight;
  return clamp(resolved * mask.opacity, 0, 1);
}

function applyLocalColorEffect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adjustment: LocalAdjustment,
): void {
  const exposureScale = 2 ** adjustment.effect.exposure;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    if (data[offset + 3] === 0) continue;
    const x = (pixel % width + 0.5) / width;
    const y = (Math.floor(pixel / width) + 0.5) / height;
    const weight = maskWeight(adjustment.mask, x, y, data[offset], data[offset + 1], data[offset + 2]);
    if (weight <= EPSILON) continue;

    if (adjustment.effect.exposure !== 0) {
      for (let channel = 0; channel < 3; channel += 1) {
        const linear = srgbToLinear(data[offset + channel]);
        const adjusted = linear * (1 + (exposureScale - 1) * weight);
        data[offset + channel] = linearToSrgb(adjusted);
      }
    }

    if (adjustment.effect.saturation !== 0) {
      const [hue, saturation, lightness] = rgbToHsl(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255);
      const targetSaturation = clamp(saturation * (1 + adjustment.effect.saturation), 0, 1);
      const mixedSaturation = saturation + (targetSaturation - saturation) * weight;
      const [r, g, b] = hslToRgb(hue, mixedSaturation, lightness);
      data[offset] = Math.round(r * 255);
      data[offset + 1] = Math.round(g * 255);
      data[offset + 2] = Math.round(b * 255);
    }
  }
}

function applyLocalSpatialEffect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adjustment: LocalAdjustment,
): void {
  if (adjustment.effect.sharpness === 0 && adjustment.effect.blur === 0) return;
  const source = new Uint8ClampedArray(data);
  const blurred = boxBlur(source, width, height, 2);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    if (source[offset + 3] === 0) continue;
    const x = (pixel % width + 0.5) / width;
    const y = (Math.floor(pixel / width) + 0.5) / height;
    const weight = maskWeight(adjustment.mask, x, y, source[offset], source[offset + 1], source[offset + 2]);
    if (weight <= EPSILON) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = source[offset + channel] - blurred[offset + channel];
      const sharpened = source[offset + channel] + difference * adjustment.effect.sharpness;
      const softened = source[offset + channel] + (blurred[offset + channel] - source[offset + channel]) * adjustment.effect.blur;
      const target = adjustment.effect.blur > 0 ? softened : sharpened;
      data[offset + channel] = clamp(Math.round(source[offset + channel] + (target - source[offset + channel]) * weight), 0, 255);
    }
  }
}

function applyLocalAdjustments(data: Uint8ClampedArray, width: number, height: number, recipe: PhotoRecipe): void {
  if (!hasLocalWork(recipe)) return;
  for (const adjustment of recipe.localAdjustments) {
    if (!adjustment.enabled || adjustment.mask.opacity <= 0) continue;
    applyLocalColorEffect(data, width, height, adjustment);
    applyLocalSpatialEffect(data, width, height, adjustment);
  }
}

function pixelFromNormalized(value: number, size: number): number {
  return clamp(Math.round(value * size - 0.5), 0, Math.max(0, size - 1));
}

function retouchCircleWeight(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
  feather: number,
): number {
  const distance = Math.hypot(x - cx, y - cy);
  if (distance >= radius) return 0;
  if (feather <= EPSILON) return 1;
  return 1 - smoothstep(radius * Math.max(0, 1 - feather), radius, distance);
}

function applyRedEye(data: Uint8ClampedArray, width: number, height: number, operation: Extract<RetouchOperation, { type: 'red-eye' }>): void {
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = (px + 0.5) / width;
      const y = (py + 0.5) / height;
      const weight = retouchCircleWeight(x, y, operation.x, operation.y, operation.radius, 0.35) * operation.strength;
      if (weight <= EPSILON) continue;
      const offset = (py * width + px) * 4;
      const targetRed = Math.max(data[offset + 1], data[offset + 2]) * 1.08;
      data[offset] = clamp(Math.round(data[offset] + (targetRed - data[offset]) * weight), 0, 255);
    }
  }
}

function applyCloneOrHeal(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  operation: Extract<RetouchOperation, { type: 'clone' | 'heal' }>,
): void {
  const source = new Uint8ClampedArray(data);
  const sourceCenterX = pixelFromNormalized(operation.sourceX, width);
  const sourceCenterY = pixelFromNormalized(operation.sourceY, height);
  const targetCenterX = pixelFromNormalized(operation.targetX, width);
  const targetCenterY = pixelFromNormalized(operation.targetY, height);
  const sourceCenterOffset = (sourceCenterY * width + sourceCenterX) * 4;
  const targetCenterOffset = (targetCenterY * width + targetCenterX) * 4;
  const centerCorrection = operation.type === 'heal'
    ? [0, 1, 2].map((channel) => source[targetCenterOffset + channel] - source[sourceCenterOffset + channel])
    : [0, 0, 0];

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const nx = (px + 0.5) / width;
      const ny = (py + 0.5) / height;
      const weight = retouchCircleWeight(nx, ny, operation.targetX, operation.targetY, operation.radius, operation.feather) * operation.opacity;
      if (weight <= EPSILON) continue;
      const sourceX = clamp(sourceCenterX + (px - targetCenterX), 0, width - 1);
      const sourceY = clamp(sourceCenterY + (py - targetCenterY), 0, height - 1);
      const sampleOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (py * width + px) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const sample = clamp(source[sampleOffset + channel] + centerCorrection[channel], 0, 255);
        data[targetOffset + channel] = clamp(Math.round(source[targetOffset + channel] + (sample - source[targetOffset + channel]) * weight), 0, 255);
      }
    }
  }
}

function applyRetouch(data: Uint8ClampedArray, width: number, height: number, recipe: PhotoRecipe): void {
  for (const operation of recipe.retouch) {
    if (operation.type === 'red-eye') applyRedEye(data, width, height, operation);
    else applyCloneOrHeal(data, width, height, operation);
  }
}

export function applyPixelAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  inputRecipe: PhotoRecipe,
): void {
  const recipe = inputRecipe === DEFAULT_RECIPE ? inputRecipe : normalizeRecipe(inputRecipe);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return;
  const isFullyNeutral = isNeutralGlobal(recipe)
    && !hasSpatialDetail(recipe)
    && !hasLocalWork(recipe)
    && recipe.retouch.length === 0;
  if (isFullyNeutral) return;

  applyGlobalAdjustments(data, width, height, recipe);
  applySpatialDetail(data, width, height, recipe);
  applyLocalAdjustments(data, width, height, recipe);
  applyRetouch(data, width, height, recipe);
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
