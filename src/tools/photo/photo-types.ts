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

export interface PhotoRgbToneCurves {
  red: TonePoint[];
  green: TonePoint[];
  blue: TonePoint[];
}

export interface PhotoLevels {
  inputBlack: number;
  gamma: number;
  inputWhite: number;
  outputBlack: number;
  outputWhite: number;
}

export interface PhotoChannelMixerRow {
  red: number;
  green: number;
  blue: number;
  constant: number;
}

export interface PhotoChannelMixer {
  red: PhotoChannelMixerRow;
  green: PhotoChannelMixerRow;
  blue: PhotoChannelMixerRow;
}

export interface PhotoLut {
  fileName: string;
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** Base64-encoded little-endian Float32 RGB rows in Cube red-fastest order. */
  data: string;
  strength: number;
}

export type PhotoRenderingIntent =
  | 'perceptual'
  | 'relative-colorimetric'
  | 'saturation'
  | 'absolute-colorimetric';

export type PhotoIccColorSpace = 'RGB' | 'CMYK' | 'GRAY';

export interface PhotoIccProfile {
  fileName: string;
  description: string;
  colorSpace: PhotoIccColorSpace;
  /** Base64-encoded, bounded original ICC/ICM profile bytes. */
  data: string;
  size: number;
  fingerprint: string;
}

export interface PhotoColorManagement {
  /** Interprets source RGB samples before the ordinary edit pipeline. */
  assignedProfile: PhotoIccProfile | null;
  /** Converts edited sRGB samples during export and is embedded in the output. */
  outputProfile: PhotoIccProfile | null;
  /** Simulates this device/profile in the preview only. */
  proofProfile: PhotoIccProfile | null;
  renderingIntent: PhotoRenderingIntent;
  proofIntent: PhotoRenderingIntent;
  blackPointCompensation: boolean;
  softProof: boolean;
  gamutWarning: boolean;
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

export type PhotoSelectionCombineMode = 'replace' | 'add' | 'subtract' | 'intersect';

export type PhotoSelectionSource =
  | { type: 'rectangle'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> }
  | { type: 'color'; red: number; green: number; blue: number; tolerance: number }
  | { type: 'luminance'; min: number; max: number };

export interface PhotoSelectionOperation {
  mode: PhotoSelectionCombineMode;
  source: PhotoSelectionSource;
}

export interface PhotoSelection {
  operations: PhotoSelectionOperation[];
  /** Normalized image-space transition width. */
  feather: number;
  /** Positive values grow the boundary; negative values shrink it. */
  expansion: number;
  inverted: boolean;
}

export type PhotoPrimitiveMask =
  | { type: 'brush'; points: Array<{ x: number; y: number; pressure: number }>; radius: number; feather: number; opacity: number; invert: boolean }
  | { type: 'radial'; cx: number; cy: number; rx: number; ry: number; feather: number; opacity: number; invert: boolean }
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; feather: number; opacity: number; invert: boolean }
  | { type: 'luminance'; min: number; max: number; feather: number; opacity: number; invert: boolean }
  | { type: 'hue'; center: number; range: number; feather: number; opacity: number; invert: boolean }
  | { type: 'selection'; selection: PhotoSelection; feather: number; opacity: number; invert: boolean };

export interface PhotoCompositeMask {
  type: 'composite';
  operations: Array<{ mode: PhotoSelectionCombineMode; mask: PhotoMask }>;
  feather: number;
  opacity: number;
  invert: boolean;
}

export type PhotoMask = PhotoPrimitiveMask | PhotoCompositeMask;

export interface PhotoMaskOverlay {
  visible: boolean;
  color: string;
  opacity: number;
}

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
  /** Optional on older version-1 recipes; normalized to view-only defaults. */
  overlay?: PhotoMaskOverlay;
}

export type RetouchOperation =
  | { id: string; type: 'red-eye'; x: number; y: number; radius: number; strength: number }
  | { id: string; type: 'clone'; sourceX: number; sourceY: number; targetX: number; targetY: number; radius: number; feather: number; opacity: number }
  | { id: string; type: 'heal'; sourceX: number; sourceY: number; targetX: number; targetY: number; radius: number; feather: number; opacity: number };

export interface PhotoRecipe {
  version: 1;
  /** Optional on older version-1 recipes; normalized before decoding. */
  raw?: PhotoRawSettings;
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
  rgbToneCurves: PhotoRgbToneCurves;
  levels: PhotoLevels;
  channelMixer: PhotoChannelMixer;
  /** Optional on older version-1 recipes; normalized to null. */
  lut?: PhotoLut | null;
  /** Optional on older version-1 recipes; normalized to explicit defaults. */
  colorManagement?: PhotoColorManagement;

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

  /** Optional on older version-1 recipes; normalized to null. */
  selection?: PhotoSelection | null;
  localAdjustments: LocalAdjustment[];
  retouch: RetouchOperation[];
}

export interface PhotoHistogram {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}

export interface PhotoRawSettings {
  whiteBalance: 'camera' | 'daylight' | 'custom';
  redMultiplier: number;
  blueMultiplier: number;
  highlight: 'clip' | 'unclip' | 'blend';
  demosaic: 'ahd' | 'bilinear' | 'vng' | 'ppg';
  /** Stops applied as LibRaw's dcraw brightness multiplier (2^EV) before raster editing. */
  exposureEv: number;
}

export interface PhotoRawSource {
  make: string;
  model: string;
  rawWidth: number;
  rawHeight: number;
  activeWidth: number;
  activeHeight: number;
  layout: 'Bayer CFA' | 'X-Trans CFA' | 'Linear RGB' | 'Other';
  cameraWhiteBalance: boolean;
  colorControls: boolean;
  demosaicControl: boolean;
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
