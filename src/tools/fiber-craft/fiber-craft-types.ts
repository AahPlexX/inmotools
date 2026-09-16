// Canonical, framework-independent domain model for the Fiber Craft Workstation.
export type FiberCraftDiscipline = 'crochet' | 'embroidery' | 'quilting' | 'cross-stitch' | 'knitting';
export type LengthUnit = 'in' | 'cm';
export interface GaugeSwatch { readonly stitchCount: number; readonly rowCount: number; readonly span: number; readonly unit: LengthUnit; }
export interface FiberCraftMetadata { title: string; author: string; difficulty: string; discipline: FiberCraftDiscipline; materialClass: string; toolSize: string; techniqueTags: readonly string[]; license: string; notes: string; createdAt: string; updatedAt: string; }
export type ColorSlot = { readonly id: string; readonly hex: string; readonly label: string; readonly paletteCode?: string; readonly paletteName?: string; };
export interface GridCell { readonly row: number; readonly col: number; readonly colorId: string | null; readonly symbolId: string | null; }
export interface GridChart { readonly kind: 'grid'; readonly rows: number; readonly cols: number; readonly aspectRatio: number; readonly cells: readonly GridCell[]; }
export interface PolarStitchNode { readonly round: number; readonly angleIndex: number; readonly stitchesInRound: number; readonly symbolId: string | null; readonly colorId: string | null; }
export interface PolarChart { readonly kind: 'polar'; readonly rounds: number; readonly nodes: readonly PolarStitchNode[]; }
export type CountedStitchKind = 'full-cross' | 'half-forward' | 'half-back' | 'quarter-nw' | 'quarter-ne' | 'quarter-sw' | 'quarter-se' | 'three-quarter-nw' | 'three-quarter-ne' | 'three-quarter-sw' | 'three-quarter-se';
export interface CountedThreadCell { readonly row: number; readonly col: number; readonly stitchKind: CountedStitchKind | null; readonly colorId: string | null; }
export interface CountedThreadPoint { readonly row: number; readonly col: number; }
export interface CountedFrenchKnot { readonly id: string; readonly point: CountedThreadPoint; readonly colorId: string; }
export interface CountedBackstitch { readonly id: string; readonly start: CountedThreadPoint; readonly end: CountedThreadPoint; readonly colorId: string; }
export interface CountedThreadChart { readonly kind: 'counted-thread'; readonly rows: number; readonly cols: number; readonly cells: readonly CountedThreadCell[]; readonly knots: readonly CountedFrenchKnot[]; readonly backstitches: readonly CountedBackstitch[]; }
export type VectorStitchKind = 'running' | 'triple' | 'satin' | 'tatami' | 'placement' | 'tackdown';
export interface VectorPathPoint { readonly x: number; readonly y: number; }
export interface VectorStitchPath { readonly id: string; readonly kind: VectorStitchKind; readonly points: readonly VectorPathPoint[]; readonly colorId: string; readonly density?: number; readonly pullCompensation?: number; readonly underlay?: 'edge-walk' | 'center-walk' | 'zigzag' | 'none'; }
export interface EmbroideryChart { readonly kind: 'embroidery'; readonly paths: readonly VectorStitchPath[]; readonly colorStopOrder: readonly string[]; readonly hoopWidthMm: number; readonly hoopHeightMm: number; }
export interface PatchworkPatch { readonly id: string; readonly outline: readonly VectorPathPoint[]; readonly colorId: string; readonly grainAngleDeg: number; }
export interface PatchworkBlock { readonly kind: 'patchwork-block'; readonly finishedSizeIn: number; readonly seamAllowanceIn: number; readonly patches: readonly PatchworkPatch[]; }
export type FiberCraftChart = GridChart | PolarChart | CountedThreadChart | EmbroideryChart | PatchworkBlock;
export interface CrochetProjectSettings { readonly targetRoundCounts: readonly number[]; readonly yarnWeight: number | null; }
export interface FiberCraftSettings { readonly crochet?: CrochetProjectSettings; }
export interface FiberCraftDocument { readonly formatVersion: 1; metadata: FiberCraftMetadata; palette: readonly ColorSlot[]; gauge?: GaugeSwatch; chart: FiberCraftChart; settings?: FiberCraftSettings; swatchImages: Readonly<Record<string, string>>; completedSteps: readonly string[]; }
export const SUPPORTED_EXPORT_TARGETS = ['pdf-pattern-book','svg-vector','dxf-r12','dxf-r2000','png-raster','materials-csv','dst-embroidery','exp-embroidery','jef-embroidery','pes-embroidery','craftproj-bundle','opengraph-card'] as const;
export type FiberCraftExportTarget = (typeof SUPPORTED_EXPORT_TARGETS)[number];
export function createEmptyMetadata(discipline: FiberCraftDiscipline): FiberCraftMetadata { const now = new Date().toISOString(); return { title: 'Untitled pattern', author: '', difficulty: 'Beginner', discipline, materialClass: '', toolSize: '', techniqueTags: [], license: 'All rights reserved', notes: '', createdAt: now, updatedAt: now }; }
