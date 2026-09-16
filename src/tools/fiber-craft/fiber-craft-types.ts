// Canonical, framework-independent domain model for the Fiber Craft Workstation.
// Mirrors this catalog's existing pattern (FloorplanProject, VectorDocument, CrystalDocument):
// one serializable document type per tool, owned by pure engines, with React only coordinating
// state. No member of this module imports React or touches the DOM.

export type FiberCraftDiscipline =
  | 'crochet'
  | 'embroidery'
  | 'quilting'
  | 'cross-stitch'
  | 'knitting';

export type LengthUnit = 'in' | 'cm';

export interface GaugeSwatch {
  /** Stitches counted across the swatch width. */
  readonly stitchCount: number;
  /** Rows counted across the swatch height. */
  readonly rowCount: number;
  /** Swatch width/height in the same unit, conventionally 4 in / 10 cm. */
  readonly span: number;
  readonly unit: LengthUnit;
}

export interface FiberCraftMetadata {
  title: string;
  author: string;
  /** Free-text craft-council-style difficulty label, e.g. "Beginner", "Advanced". */
  difficulty: string;
  discipline: FiberCraftDiscipline;
  /** e.g. "worsted", "DK", "40wt polyester", "14-count Aida" — discipline-specific free text. */
  materialClass: string;
  /** e.g. hook size, needle size, hoop size — discipline-specific free text. */
  toolSize: string;
  techniqueTags: readonly string[];
  license: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ColorSlot = {
  readonly id: string;
  readonly hex: string;
  readonly label: string;
  /** Nearest matched code in an external palette (DMC/Anchor/Madeira/Sullivan), if matched. */
  readonly paletteCode?: string;
  readonly paletteName?: string;
};

// --- Shared 2D grid primitive (cross-stitch, filet crochet, C2C, colorwork knitting) ---

export interface GridCell {
  readonly row: number;
  readonly col: number;
  readonly colorId: string | null;
  readonly symbolId: string | null;
}

export interface GridChart {
  readonly kind: 'grid';
  readonly rows: number;
  readonly cols: number;
  /** Row-to-stitch aspect ratio; 1 for square-grid crafts, gauge-derived for knitting. */
  readonly aspectRatio: number;
  readonly cells: readonly GridCell[];
}

// --- Polar primitive (crochet mandalas, doilies, round amigurumi) ---

export interface PolarStitchNode {
  readonly round: number;
  readonly angleIndex: number;
  readonly stitchesInRound: number;
  readonly symbolId: string | null;
  readonly colorId: string | null;
}

export interface PolarChart {
  readonly kind: 'polar';
  readonly rounds: number;
  readonly nodes: readonly PolarStitchNode[];
}

// --- Vector path primitive (embroidery digitizing, appliqué, quilt block drafting) ---

export type VectorStitchKind = 'running' | 'triple' | 'satin' | 'tatami' | 'placement' | 'tackdown';

export interface VectorPathPoint {
  readonly x: number;
  readonly y: number;
}

export interface VectorStitchPath {
  readonly id: string;
  readonly kind: VectorStitchKind;
  readonly points: readonly VectorPathPoint[];
  readonly colorId: string;
  /** Satin/fill only: stitch density in stitches per mm. */
  readonly density?: number;
  /** Satin only: pull compensation as a fraction of column width (0–0.5). */
  readonly pullCompensation?: number;
  readonly underlay?: 'edge-walk' | 'center-walk' | 'zigzag' | 'none';
}

export interface EmbroideryChart {
  readonly kind: 'embroidery';
  readonly paths: readonly VectorStitchPath[];
  /** Ordered color-change/stop/trim command stream, indices into `paths`. */
  readonly colorStopOrder: readonly string[];
  readonly hoopWidthMm: number;
  readonly hoopHeightMm: number;
}

// --- Patchwork block primitive (quilting) ---

export interface PatchworkPatch {
  readonly id: string;
  /** Polygon in inches, pre-seam-allowance. */
  readonly outline: readonly VectorPathPoint[];
  readonly colorId: string;
  readonly grainAngleDeg: number;
}

export interface PatchworkBlock {
  readonly kind: 'patchwork-block';
  readonly finishedSizeIn: number;
  readonly seamAllowanceIn: number;
  readonly patches: readonly PatchworkPatch[];
}

export type FiberCraftChart = GridChart | PolarChart | EmbroideryChart | PatchworkBlock;

export interface CrochetProjectSettings {
  /** Optional shaping target used by the amigurumi assistant and stitch-count validator. */
  readonly targetRoundCounts: readonly number[];
  /** Craft Yarn Council yarn-weight category 0–7, or null when the project has no selected reference. */
  readonly yarnWeight: number | null;
}

export interface FiberCraftSettings {
  readonly crochet?: CrochetProjectSettings;
}

// --- Whole-project envelope ---

export interface FiberCraftDocument {
  readonly formatVersion: 1;
  metadata: FiberCraftMetadata;
  palette: readonly ColorSlot[];
  gauge?: GaugeSwatch;
  chart: FiberCraftChart;
  /** Discipline-specific settings that should survive autosave/project export without polluting shared metadata. */
  settings?: FiberCraftSettings;
  /** Optional embedded fabric/yarn swatch photos as data URIs, keyed by id. */
  swatchImages: Readonly<Record<string, string>>;
  /** Tap-to-track progress: ids of completed rows/rounds/blocks. */
  completedSteps: readonly string[];
}

export const SUPPORTED_EXPORT_TARGETS = [
  'pdf-pattern-book',
  'svg-vector',
  'dxf-r12',
  'dxf-r2000',
  'png-raster',
  'materials-csv',
  'dst-embroidery',
  'exp-embroidery',
  'jef-embroidery',
  'pes-embroidery',
  'craftproj-bundle',
  'opengraph-card',
] as const;

export type FiberCraftExportTarget = (typeof SUPPORTED_EXPORT_TARGETS)[number];

export function createEmptyMetadata(discipline: FiberCraftDiscipline): FiberCraftMetadata {
  const now = new Date().toISOString();
  return {
    title: 'Untitled pattern',
    author: '',
    difficulty: 'Beginner',
    discipline,
    materialClass: '',
    toolSize: '',
    techniqueTags: [],
    license: 'All rights reserved',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}
