import { DEFAULT_RECIPE, normalizeRecipe } from './photo-engine';
import type { PhotoRecipe } from './photo-types';

/** Adjustment groups used by partial copy/paste, multi-project sync, and recipe comparison.
 * Every recipe field belongs to exactly one group; `FIELD_GROUPS` is typed against the recipe's
 * own keys, so adding a recipe field without choosing its group is a compile error rather than a
 * field that silently never copies. */
export type PhotoRecipeGroup =
  | 'light'
  | 'curves-levels'
  | 'white-balance'
  | 'color'
  | 'color-ranges'
  | 'grading'
  | 'black-white'
  | 'channel-mixer'
  | 'lut'
  | 'color-management'
  | 'detail'
  | 'finishing'
  | 'crop-geometry'
  | 'warp'
  | 'local'
  | 'retouch'
  | 'layers'
  | 'raw';

type RecipeField = Exclude<keyof PhotoRecipe, 'version'>;

const FIELD_GROUPS: Record<RecipeField, PhotoRecipeGroup> = {
  raw: 'raw',
  crop: 'crop-geometry',
  straighten: 'crop-geometry',
  rotateQuarterTurns: 'crop-geometry',
  flipX: 'crop-geometry',
  flipY: 'crop-geometry',
  lensDistortion: 'crop-geometry',
  perspectiveHorizontal: 'crop-geometry',
  perspectiveVertical: 'crop-geometry',
  meshWarp: 'warp',
  liquifyStrokes: 'warp',
  exposure: 'light',
  contrast: 'light',
  highlights: 'light',
  shadows: 'light',
  whites: 'light',
  blacks: 'light',
  midtone: 'light',
  toneCurve: 'curves-levels',
  rgbToneCurves: 'curves-levels',
  levels: 'curves-levels',
  channelMixer: 'channel-mixer',
  lut: 'lut',
  colorManagement: 'color-management',
  temperature: 'white-balance',
  tint: 'white-balance',
  saturation: 'color',
  vibrance: 'color',
  dehaze: 'color',
  hsl: 'color-ranges',
  shadowGrade: 'grading',
  midtoneGrade: 'grading',
  highlightGrade: 'grading',
  blackAndWhite: 'black-white',
  blackAndWhiteMix: 'black-white',
  texture: 'detail',
  clarity: 'detail',
  sharpenAmount: 'detail',
  sharpenRadius: 'detail',
  sharpenThreshold: 'detail',
  denoiseLuminance: 'detail',
  denoiseChroma: 'detail',
  chromaticAberration: 'detail',
  detailFilters: 'detail',
  vignette: 'finishing',
  vignetteMidpoint: 'finishing',
  vignetteFeather: 'finishing',
  grain: 'finishing',
  grainSize: 'finishing',
  grainColor: 'finishing',
  selection: 'local',
  localAdjustments: 'local',
  retouch: 'retouch',
  layers: 'layers',
};

export const PHOTO_RECIPE_GROUPS: Array<{ id: PhotoRecipeGroup; label: string; imageSpecific: boolean }> = [
  { id: 'light', label: 'Light & tone', imageSpecific: false },
  { id: 'curves-levels', label: 'Curves & levels', imageSpecific: false },
  { id: 'white-balance', label: 'White balance', imageSpecific: false },
  { id: 'color', label: 'Saturation, vibrance & dehaze', imageSpecific: false },
  { id: 'color-ranges', label: 'Color ranges', imageSpecific: false },
  { id: 'grading', label: 'Color grading', imageSpecific: false },
  { id: 'black-white', label: 'Black & white', imageSpecific: false },
  { id: 'channel-mixer', label: 'Channel mixer', imageSpecific: false },
  { id: 'lut', label: '3D LUT', imageSpecific: false },
  { id: 'color-management', label: 'ICC color management', imageSpecific: false },
  { id: 'detail', label: 'Detail, noise & filters', imageSpecific: false },
  { id: 'finishing', label: 'Vignette & grain', imageSpecific: false },
  { id: 'raw', label: 'RAW development', imageSpecific: false },
  // Tied to where things are in one particular frame, so they are off by default when copying.
  { id: 'crop-geometry', label: 'Crop & geometry', imageSpecific: true },
  { id: 'warp', label: 'Mesh warp & liquify', imageSpecific: true },
  { id: 'local', label: 'Selections & local masks', imageSpecific: true },
  { id: 'retouch', label: 'Retouch spots', imageSpecific: true },
  { id: 'layers', label: 'Layers', imageSpecific: true },
];

export const ALL_RECIPE_GROUPS: PhotoRecipeGroup[] = PHOTO_RECIPE_GROUPS.map((group) => group.id);
export const DEFAULT_COPY_GROUPS: PhotoRecipeGroup[] = PHOTO_RECIPE_GROUPS.filter((group) => !group.imageSpecific).map((group) => group.id);

const FIELDS = Object.keys(FIELD_GROUPS) as RecipeField[];

export function recipeFieldsInGroups(groups: Iterable<PhotoRecipeGroup>): RecipeField[] {
  const wanted = new Set(groups);
  return FIELDS.filter((field) => wanted.has(FIELD_GROUPS[field]));
}

export function normalizeRecipeGroups(value: unknown): PhotoRecipeGroup[] {
  if (!Array.isArray(value)) return [...DEFAULT_COPY_GROUPS];
  const known = new Set<PhotoRecipeGroup>(ALL_RECIPE_GROUPS);
  return ALL_RECIPE_GROUPS.filter((group) => value.includes(group) && known.has(group));
}

/** Copies the chosen groups from `source` onto `target`, leaving every other field of `target`
 * untouched. The result is normalized (and therefore deep-copied), so later edits to either
 * recipe can never leak into the other. */
export function applyRecipeGroups(target: PhotoRecipe, source: PhotoRecipe, groups: Iterable<PhotoRecipeGroup>): PhotoRecipe {
  const from = normalizeRecipe(source);
  const next: Record<string, unknown> = { ...normalizeRecipe(target) };
  for (const field of recipeFieldsInGroups(groups)) next[field] = from[field];
  return normalizeRecipe(next as unknown as PhotoRecipe);
}

// --- Recipe comparison (capability 151) ---

const FIELD_LABELS: Partial<Record<RecipeField, string>> = {
  exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights', shadows: 'Shadows', whites: 'White point',
  blacks: 'Black point', midtone: 'Midtone', temperature: 'Temperature', tint: 'Tint', saturation: 'Saturation',
  vibrance: 'Vibrance', dehaze: 'Dehaze', texture: 'Texture', clarity: 'Clarity', sharpenAmount: 'Sharpen amount',
  sharpenRadius: 'Sharpen radius', sharpenThreshold: 'Sharpen threshold', denoiseLuminance: 'Luminance denoise',
  denoiseChroma: 'Color denoise', chromaticAberration: 'Chromatic edge correction', vignette: 'Vignette',
  vignetteMidpoint: 'Vignette midpoint', vignetteFeather: 'Vignette feather', grain: 'Grain amount', grainSize: 'Grain size',
  grainColor: 'Grain color', straighten: 'Straighten', rotateQuarterTurns: 'Quarter-turn rotation', flipX: 'Horizontal flip',
  flipY: 'Vertical flip', lensDistortion: 'Lens distortion', perspectiveHorizontal: 'Horizontal perspective',
  perspectiveVertical: 'Vertical perspective', blackAndWhite: 'Black & white', crop: 'Crop', toneCurve: 'Tone curve',
  rgbToneCurves: 'Red/green/blue curves', levels: 'Levels', channelMixer: 'Channel mixer', lut: '3D LUT',
  colorManagement: 'ICC color management', hsl: 'Color ranges', shadowGrade: 'Shadow grade', midtoneGrade: 'Midtone grade',
  highlightGrade: 'Highlight grade', blackAndWhiteMix: 'Black & white mix', detailFilters: 'Detail filters',
  meshWarp: 'Mesh warp', liquifyStrokes: 'Liquify strokes', selection: 'Active selection', localAdjustments: 'Local adjustments',
  retouch: 'Retouch operations', layers: 'Layers', raw: 'RAW development',
};

export interface PhotoRecipeDifference {
  group: PhotoRecipeGroup;
  groupLabel: string;
  field: string;
  label: string;
  before: string;
  after: string;
}

function describeValue(field: RecipeField, value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value === null || value === undefined) return 'None';
  if (Array.isArray(value)) {
    if (field === 'localAdjustments' || field === 'retouch' || field === 'layers' || field === 'liquifyStrokes') return `${value.length} item${value.length === 1 ? '' : 's'}`;
    if (field === 'toneCurve') return `${value.length} points`;
    return 'Custom';
  }
  if (field === 'crop' && typeof value === 'object') {
    const crop = value as PhotoRecipe['crop'];
    return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1 ? 'Full frame' : `${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`;
  }
  if (field === 'lut' && typeof value === 'object') return (value as { title?: string }).title ?? 'Active';
  return 'Custom';
}

/** Field-by-field differences between two recipes, grouped and ordered as the editor presents
 * them. Numbers are compared at display precision so floating-point noise is not reported. */
export function diffRecipes(before: PhotoRecipe, after: PhotoRecipe): PhotoRecipeDifference[] {
  const a = normalizeRecipe(before);
  const b = normalizeRecipe(after);
  const differences: PhotoRecipeDifference[] = [];
  for (const group of PHOTO_RECIPE_GROUPS) {
    for (const field of recipeFieldsInGroups([group.id])) {
      const left = a[field]; const right = b[field];
      const same = typeof left === 'number' && typeof right === 'number'
        ? Math.abs(left - right) < 0.005
        : JSON.stringify(left) === JSON.stringify(right);
      if (same) continue;
      differences.push({
        group: group.id,
        groupLabel: group.label,
        field,
        label: FIELD_LABELS[field] ?? field,
        before: describeValue(field, left),
        after: describeValue(field, right),
      });
    }
  }
  return differences;
}

/** Plain-language summary of a recipe relative to the neutral default, e.g. for a variant card. */
export function summarizeRecipe(recipe: PhotoRecipe): string {
  const differences = diffRecipes(DEFAULT_RECIPE, recipe);
  if (!differences.length) return 'No edits';
  const groups = [...new Set(differences.map((difference) => difference.groupLabel))];
  return `${differences.length} change${differences.length === 1 ? '' : 's'} in ${groups.join(', ')}`;
}
