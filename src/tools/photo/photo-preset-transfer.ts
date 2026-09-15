import { DEFAULT_RECIPE, normalizeRecipe } from './photo-engine';
import type { PhotoRecipe } from './photo-types';

export const PHOTO_PRESET_TRANSFER_KIND = 'inmotools-photo-preset' as const;
export const PHOTO_PRESET_TRANSFER_VERSION = 1 as const;

export interface PhotoPresetTransferEnvelope {
  kind: typeof PHOTO_PRESET_TRANSFER_KIND;
  version: typeof PHOTO_PRESET_TRANSFER_VERSION;
  name: string;
  recipe: PhotoRecipe;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedTransferRecipe(value: Record<string, unknown> | PhotoRecipe): PhotoRecipe {
  try {
    return normalizeRecipe({ ...DEFAULT_RECIPE, ...value } as PhotoRecipe);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Photo preset recipe could not be normalized${detail}`);
  }
}

function requiredPresetName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Photo preset name must be a non-empty string.');
  }
  return value.trim();
}

/** Serialize one normalized, portable Photo Studio preset. */
export function serializePhotoPreset(name: string, recipe: PhotoRecipe): string {
  const envelope: PhotoPresetTransferEnvelope = {
    kind: PHOTO_PRESET_TRANSFER_KIND,
    version: PHOTO_PRESET_TRANSFER_VERSION,
    name: requiredPresetName(name),
    recipe: normalizedTransferRecipe(recipe),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Parse and normalize a portable Photo Studio preset envelope. */
export function parsePhotoPreset(input: string): PhotoPresetTransferEnvelope {
  if (typeof input !== 'string') {
    throw new Error('Photo preset input must be a JSON string.');
  }

  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    throw new Error('Invalid Photo preset JSON.');
  }

  if (!isRecord(value)) {
    throw new Error('Photo preset envelope must be a JSON object.');
  }
  if (value.kind !== PHOTO_PRESET_TRANSFER_KIND) {
    throw new Error(`Unsupported Photo preset kind; expected "${PHOTO_PRESET_TRANSFER_KIND}".`);
  }
  if (value.version !== PHOTO_PRESET_TRANSFER_VERSION) {
    throw new Error(`Unsupported Photo preset version; expected ${PHOTO_PRESET_TRANSFER_VERSION}.`);
  }

  const name = requiredPresetName(value.name);
  if (!isRecord(value.recipe)) {
    throw new Error('Photo preset recipe must be a JSON object.');
  }

  return {
    kind: PHOTO_PRESET_TRANSFER_KIND,
    version: PHOTO_PRESET_TRANSFER_VERSION,
    name,
    recipe: normalizedTransferRecipe(value.recipe),
  };
}

function safeFilenameStem(value: string): string {
  return value
    .replace(/\.[^./\\]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '');
}

/** Return a safe local download name for a preset JSON file. */
export function suggestPhotoPresetFilename(name: string): string {
  const stem = safeFilenameStem(typeof name === 'string' ? name : '') || 'photo-preset';
  return stem === 'photo-preset' ? `${stem}.json` : `${stem}-photo-preset.json`;
}

// Friendly aliases for callers that describe the same operations as export/import.
export const exportPhotoPreset = serializePhotoPreset;
export const importPhotoPreset = parsePhotoPreset;
export const safePhotoPresetFilename = suggestPhotoPresetFilename;
