export type PhotoOutputMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TonePoint {
  x: number;
  y: number;
}

export interface HslAdjustment {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ColorGrade {
  hue: number;
  saturation: number;
  luminance: number;
}

export type PhotoMask =
  | { type: 'brush'; points: Array<{ x: number; y: number; pressure: number }>; radius: number; feather: number; opacity: number; invert: boolean }
  | { type: 'radial'; cx: number; cy: number; rx: number; ry: number; feather: number; opacity: number; invert: boolean }
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; feather: number; opacity: number; invert: boolean }
  | { type: 'luminance'; min: number; max: number; feather: number; opacity: number; invert: boolean }
  | { type: 'hue'; center: number; range: number; feather: number; opacity: number; invert: boolean };

export interface LocalEffect {
  exposure: number;
  saturation: number;
  sharpness: number;
  blur: number;
}

export interface LocalAdjustment {
  id: string;
  label: string;
  enabled: boolean;
  mask: PhotoMask;
  effect: LocalEffect;
}

export type RetouchOperation =
  | { id: string; type: 'red-eye'; x: number; y: number; radius: number; strength: number }
  | { id: string; type: 'clone'; sourceX: number; sourceY: number; targetX: number; targetY: number; radius: number; feather: number; opacity: number }
  | { id: string; type: 'heal'; sourceX: number; sourceY: number; targetX: number; targetY: number; radius: number; feather: number; opacity: number };

export interface PhotoRecipe {
  version: 1;
  crop: NormalizedCrop;
  straighten: number;
  rotateQuarterTurns: number;
  flipX: boolean;
  flipY: boolean;
  lensDistortion: number;
  perspectiveHorizontal: number;
  perspectiveVertical: number;

  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  midtone: number;
  toneCurve: TonePoint[];

  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  hsl: HslAdjustment[];
  shadowGrade: ColorGrade;
  midtoneGrade: ColorGrade;
  highlightGrade: ColorGrade;
  blackAndWhite: boolean;
  blackAndWhiteMix: number[];

  texture: number;
  clarity: number;
  dehaze: number;
  sharpenAmount: number;
  sharpenRadius: number;
  sharpenThreshold: number;
  denoiseLuminance: number;
  denoiseChroma: number;
  chromaticAberration: number;

  vignette: number;
  vignetteMidpoint: number;
  vignetteFeather: number;
  grain: number;
  grainSize: number;
  grainColor: number;

  localAdjustments: LocalAdjustment[];
  retouch: RetouchOperation[];
}

export interface PhotoHistogram {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}

export interface PhotoHistory {
  past: PhotoRecipe[];
  present: PhotoRecipe;
  future: PhotoRecipe[];
  limit: number;
}

export interface PhotoExportMetadata {
  title?: string;
  headline?: string;
  description?: string;
  creator?: string;
  credit?: string;
  copyright?: string;
  usageTerms?: string;
  source?: string;
  jobIdentifier?: string;
  rating?: number;
  label?: string;
  keywords?: string[];
  hierarchicalKeywords?: string[];
  city?: string;
  state?: string;
  country?: string;
  sublocation?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  creationDate?: string;
  altText?: string;
  extendedDescription?: string;
  ppi?: number;
}

export interface PhotoCapabilities {
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  jpeg: boolean;
  png: boolean;
  webp: boolean;
  maxCanvasEdge: number;
  maxCanvasArea: number;
}

export interface PhotoSnapshot {
  id: string;
  name: string;
  createdAt: string;
  recipe: PhotoRecipe;
}
