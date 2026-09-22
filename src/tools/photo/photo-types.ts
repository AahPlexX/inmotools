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

export interface PhotoBrushPoint {
  x: number;
  y: number;
  pressure: number;
  /** Groups points from one continuous paint gesture so flow builds up per pass, not per point. */
  strokeId: number;
  /** When true, this stroke's coverage subtracts from the mask instead of adding to it. */
  erase: boolean;
}

export type PhotoPrimitiveMask =
  | {
      type: 'brush';
      points: PhotoBrushPoint[];
      radius: number;
      feather: number;
      opacity: number;
      invert: boolean;
      /** Maximum coverage a single stroke pass can add; repeated passes build toward full coverage. */
      flow: number;
      /** Minimum distance between recorded dabs, as a fraction of radius. */
      spacing: number;
      /** Stroke-stabilization strength applied to the interior of a gesture path. */
      smoothing: number;
    }
  | { type: 'radial'; cx: number; cy: number; rx: number; ry: number; feather: number; opacity: number; invert: boolean }
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
  | { id: string; type: 'red-eye'; x: number; y: number; radius: number; strength: number; enabled: boolean }
  | {
      id: string;
      type: 'clone';
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      radius: number;
      feather: number;
      opacity: number;
      enabled: boolean;
      /** Additional stroke points painted after the source/target anchor, all sharing its locked offset. */
      path: Array<{ x: number; y: number }>;
      /** True once a target has been explicitly placed, locking the source offset for further strokes. */
      anchored: boolean;
    }
  | {
      id: string;
      type: 'heal';
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      radius: number;
      feather: number;
      opacity: number;
      enabled: boolean;
      path: Array<{ x: number; y: number }>;
      anchored: boolean;
    };

/** One control point's displacement in a fixed-size normalized mesh-warp grid (see PHOTO_MESH_WARP_GRID). */
export interface PhotoMeshWarpPoint {
  dx: number;
  dy: number;
}

export type PhotoLiquifyMode = 'push' | 'pull' | 'restore';

/** One liquify brush stroke; 'restore' shrinks displacement already added by earlier strokes
 * within its own radius rather than adding new displacement. */
export interface PhotoLiquifyStroke {
  id: string;
  mode: PhotoLiquifyMode;
  radius: number;
  strength: number;
  path: Array<{ x: number; y: number }>;
}

export interface PhotoDefringe {
  /** Target hue in degrees, 0-360. */
  hue: number;
  /** Half-width of the targeted hue band, in degrees. */
  range: number;
  amount: number;
}

export interface PhotoDetailFilters {
  gaussianBlur: number;
  medianFilter: number;
  bilateralSmoothing: number;
  highPass: number;
  /** -1 softens the extracted high-frequency detail band toward the low-frequency base
   * (skin-smoothing direction), +1 boosts it (extra micro-contrast); 0 is neutral. */
  frequencySeparationDetail: number;
  defringe: PhotoDefringe;
  moireReduction: number;
  hotPixelCorrection: number;
}

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
  /** Optional on older version-1 recipes; normalized to null (no distortion). */
  meshWarp?: PhotoMeshWarpPoint[] | null;
  /** Optional on older version-1 recipes; normalized to an empty stack. */
  liquifyStrokes?: PhotoLiquifyStroke[];

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
  /** Optional on older version-1 recipes; normalized to explicit neutral defaults. */
  detailFilters?: PhotoDetailFilters;

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
  /** Optional on older version-1 recipes; normalized to an empty stack. */
  layers?: PhotoLayer[];
}

export type PhotoBlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light'
  | 'darken' | 'lighten' | 'color' | 'luminosity' | 'hue' | 'saturation';

export interface PhotoLayerTransform {
  /** Normalized canvas-space offset of the layer's own center. */
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
}

/**
 * 'image' composites a decoded source image (also used for a watermark/logo layer — same
 * content, placed via an anchor preset instead of freeform dragging). 'text' and 'shape' are
 * rendered to a bitmap once at decode time and then flow through the exact same transform/
 * blend/mask compositing as an image layer. 'adjustment' has no bitmap of its own; it applies
 * LocalAdjustment-style effect math directly to the pixels already composited beneath it,
 * restricted by its own mask — transform and blendMode are unused for this role.
 */
export type PhotoLayerRole = 'image' | 'adjustment' | 'text' | 'shape';
export type PhotoShapeKind = 'rectangle' | 'ellipse' | 'line';

export interface PhotoLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: PhotoBlendMode;
  transform: PhotoLayerTransform;
  /** In canvas-normalized space, same convention as LocalAdjustment masks. */
  mask?: PhotoMask | null;
  role: PhotoLayerRole;
  /** Self-contained like PhotoLut.data, so a recipe stays a single portable JSON document.
   * Populated for 'image' layers only; 'text'/'shape' layers render their own bitmap at decode
   * time and never persist it here, so edits to text/shape fields always re-render from source. */
  sourceDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  /** True for an 'image' layer added via the watermark quick-action, purely for UI labeling. */
  isWatermark?: boolean;
  /** 'adjustment' role. */
  effect?: LocalEffect;
  /** 'text' role. */
  text?: string;
  textColor?: string;
  fontSize?: number;
  /** 'shape' role. */
  shapeKind?: PhotoShapeKind;
  shapeColor?: string;
  shapeStrokeWidth?: number;
  shapeFilled?: boolean;
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
