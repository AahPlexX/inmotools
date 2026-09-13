export type VectorTool = 'select' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'star' | 'pen' | 'pencil' | 'text' | 'pan';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';
export type StrokeLineCap = 'butt' | 'round' | 'square';
export type StrokeLineJoin = 'miter' | 'round' | 'bevel';

export interface VectorPoint {
  x: number;
  y: number;
}

export interface SolidFill {
  kind: 'solid';
  color: string;
}

export interface LinearGradientFill {
  kind: 'linear-gradient';
  start: string;
  end: string;
  angle: number;
}

export interface RadialGradientFill {
  kind: 'radial-gradient';
  start: string;
  end: string;
  cx?: number;
  cy?: number;
}

export interface PatternFill {
  kind: 'pattern';
  foreground: string;
  background: string;
  size: number;
  rotation: number;
  pattern: 'dots' | 'stripes' | 'grid';
}

export type VectorFill = SolidFill | LinearGradientFill | RadialGradientFill | PatternFill;

export interface VectorStroke {
  color: string;
  width: number;
  linecap: StrokeLineCap;
  linejoin: StrokeLineJoin;
  dash: string;
}

export interface VectorElementBase {
  id: string;
  type: VectorElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: VectorFill;
  stroke: VectorStroke;
  blendMode: BlendMode;
  title: string;
  description: string;
}

export interface RectElement extends VectorElementBase {
  type: 'rect';
  cornerRadius: number;
}

export interface EllipseElement extends VectorElementBase {
  type: 'ellipse';
}

export interface LineElement extends VectorElementBase {
  type: 'line';
  x2: number;
  y2: number;
}

export interface PathElement extends VectorElementBase {
  type: 'path';
  d: string;
  closed: boolean;
}

export interface TextElement extends VectorElementBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  textAnchor: 'start' | 'middle' | 'end';
  pathId?: string;
}

export interface ImageElement extends VectorElementBase {
  type: 'image';
  href: string;
  preserveAspectRatio: string;
}

export interface VectorComposition {
  mode: 'clip' | 'difference';
  shape: VectorElement;
}

export interface GroupElement extends VectorElementBase {
  type: 'group';
  children: VectorElement[];
  composition?: VectorComposition;
}

export interface SymbolElement extends VectorElementBase {
  type: 'symbol-instance';
  symbolId: string;
}

export type VectorElement = RectElement | EllipseElement | LineElement | PathElement | TextElement | ImageElement | GroupElement | SymbolElement;
export type VectorElementType = 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'image' | 'group' | 'symbol-instance';

export interface VectorSymbol {
  id: string;
  name: string;
  viewBox: string;
  elements: VectorElement[];
}

export interface VectorMetadata {
  title: string;
  description: string;
  creator: string;
  rights: string;
  license: string;
  language: string;
  tags: string[];
  custom: string;
}

export interface VectorArtboard {
  width: number;
  height: number;
  background: string;
  exportBackground: boolean;
  gridVisible: boolean;
  gridSize: number;
  snapToGrid: boolean;
  snapToObjects: boolean;
}

export interface VectorDocument {
  format: 'inmotools-vector';
  version: 1;
  id: string;
  name: string;
  artboard: VectorArtboard;
  metadata: VectorMetadata;
  elements: VectorElement[];
  symbols: VectorSymbol[];
  swatches: string[];
}

export interface VectorHistory {
  past: VectorDocument[];
  present: VectorDocument;
  future: VectorDocument[];
  limit: number;
}

export interface VectorSelectionResult {
  document: VectorDocument;
  selection: string[];
}

export interface SnapOptions {
  grid: number;
  threshold: number;
  guidesX?: number[];
  guidesY?: number[];
}

export interface SnappedPoint extends VectorPoint {
  snappedX: boolean;
  snappedY: boolean;
}

export interface SvgExportOptions {
  includeBackground?: boolean;
  responsive?: boolean;
  pretty?: boolean;
}

export interface RasterExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  scale: number;
  quality?: number;
  background?: string;
}

export interface PdfExportOptions {
  scale: number;
  background?: string;
}

export interface VectorExportSettings {
  filename: string;
  format: 'svg' | 'svg-optimized' | 'png' | 'jpeg' | 'webp' | 'pdf' | 'json';
  scale: number;
  quality: number;
  responsive: boolean;
  includeBackground: boolean;
}

export const DEFAULT_FILL: SolidFill = { kind: 'solid', color: '#7c3aed' };
export const DEFAULT_STROKE: VectorStroke = { color: '#111827', width: 0, linecap: 'round', linejoin: 'round', dash: '' };
