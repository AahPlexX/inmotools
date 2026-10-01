import { normalizeResamplingKernel, type PhotoResamplingKernel } from './photo-resample';
import { safeFilenameStem } from './photo-metadata';
import type { PhotoMetadataPolicy, PhotoOutputSharpening } from './photo-export';
import type { PhotoResizeMode } from './photo-export-dimensions';
import type { PhotoOutputMime } from './photo-types';

/** Everything that decides how one export is rendered and named. Export presets store exactly this
 * shape, so single, batch, multi-output, and contact-sheet exports all share one definition. */
export interface PhotoExportSettings {
  outputMime: PhotoOutputMime;
  /** 0.01–1; ignored by lossless formats. */
  quality: number;
  resizeMode: PhotoResizeMode;
  resizeValue: number;
  /** When false, a size larger than the edited frame exports at the frame's own size instead. */
  allowEnlarge: boolean;
  resampling: PhotoResamplingKernel;
  /** AVIF only: lossless encoding (quality is then ignored). */
  lossless: boolean;
  outputSharpening: PhotoOutputSharpening;
  jpegBackground: string;
  metadataPolicy: PhotoMetadataPolicy;
  /** Metadata template applied at export, or null to use the dialog's current fields. */
  metadataTemplateId: string | null;
  /** Watermark preset stamped on this export only (never saved into the project), or null. */
  watermarkPresetId: string | null;
  /** File name rule; see `renderFilenamePattern` for tokens. */
  filenamePattern: string;
}

export const DEFAULT_EXPORT_SETTINGS: PhotoExportSettings = {
  outputMime: 'image/jpeg',
  quality: 0.92,
  resizeMode: 'original',
  resizeValue: 100,
  allowEnlarge: true,
  resampling: 'browser',
  lossless: false,
  outputSharpening: 'none',
  jpegBackground: '#ffffff',
  metadataPolicy: 'strip',
  metadataTemplateId: null,
  watermarkPresetId: null,
  filenamePattern: '{name}',
};

const MIMES: PhotoOutputMime[] = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/avif'];
const RESIZE_MODES: PhotoResizeMode[] = ['original', 'percent', 'width', 'height', 'long-edge', 'short-edge'];
const SHARPENING: PhotoOutputSharpening[] = ['none', 'light', 'standard', 'strong'];
const POLICIES: PhotoMetadataPolicy[] = ['strip', 'rights', 'custom'];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function finite(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Rebuilds settings field by field so a stored or imported preset can never inject an unknown
 * format, a NaN quality, or an unbounded size into an export. */
export function normalizeExportSettings(value: unknown): PhotoExportSettings {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const d = DEFAULT_EXPORT_SETTINGS;
  const resizeMode = pick(input.resizeMode, RESIZE_MODES, d.resizeMode);
  return {
    outputMime: pick(input.outputMime, MIMES, d.outputMime),
    quality: finite(input.quality, 0.01, 1, d.quality),
    resizeMode,
    resizeValue: Math.round(finite(input.resizeValue, 1, resizeMode === 'percent' ? 400 : 50_000, d.resizeValue)),
    allowEnlarge: typeof input.allowEnlarge === 'boolean' ? input.allowEnlarge : d.allowEnlarge,
    resampling: normalizeResamplingKernel(input.resampling),
    lossless: input.lossless === true,
    outputSharpening: pick(input.outputSharpening, SHARPENING, d.outputSharpening),
    jpegBackground: typeof input.jpegBackground === 'string' && /^#[0-9a-f]{6}$/i.test(input.jpegBackground) ? input.jpegBackground.toLowerCase() : d.jpegBackground,
    metadataPolicy: pick(input.metadataPolicy, POLICIES, d.metadataPolicy),
    metadataTemplateId: typeof input.metadataTemplateId === 'string' && input.metadataTemplateId ? input.metadataTemplateId : null,
    watermarkPresetId: typeof input.watermarkPresetId === 'string' && input.watermarkPresetId ? input.watermarkPresetId : null,
    filenamePattern: typeof input.filenamePattern === 'string' && input.filenamePattern.trim() ? input.filenamePattern.trim().slice(0, 120) : d.filenamePattern,
  };
}

// --- Lossless / lossy disclosure (capability 154) ---

export interface PhotoFormatFacts {
  label: string;
  compression: 'lossless' | 'lossy';
  usesQuality: boolean;
  supportsTransparency: boolean;
  note: string;
}

/** What each output container actually does with pixels in this app, stated plainly. WebP is
 * lossy here because the browser canvas encoder exposes no lossless switch. */
export const PHOTO_FORMAT_FACTS: Record<PhotoOutputMime, PhotoFormatFacts> = {
  'image/jpeg': { label: 'JPEG', compression: 'lossy', usesQuality: true, supportsTransparency: false, note: 'Lossy. Smallest files for photos; transparent areas are filled with the background color.' },
  'image/png': { label: 'PNG', compression: 'lossless', usesQuality: false, supportsTransparency: true, note: 'Lossless. Exact pixels and transparency, larger files.' },
  'image/webp': { label: 'WebP', compression: 'lossy', usesQuality: true, supportsTransparency: true, note: 'Lossy (the browser encoder has no lossless mode). Small files with transparency.' },
  'image/tiff': { label: 'TIFF', compression: 'lossless', usesQuality: false, supportsTransparency: true, note: 'Lossless, uncompressed 8-bit. Large files for print and archive workflows.' },
  'image/avif': { label: 'AVIF', compression: 'lossy', usesQuality: true, supportsTransparency: true, note: 'Lossy by default (or lossless when ticked below). Very small files for the web; encoding big photos can take a while. Metadata travels in the XMP sidecar, and color-managed ICC output is not available for AVIF.' },
};

// --- File name rules (capability 143) ---

export interface FilenameContext {
  sourceName: string;
  /** 1-based position within a batch or multi-output run. */
  index: number;
  total: number;
  presetName?: string;
  width?: number;
  height?: number;
  date?: Date;
}

export const FILENAME_TOKENS: Array<{ token: string; meaning: string }> = [
  { token: '{name}', meaning: 'original file name without extension' },
  { token: '{n}', meaning: 'sequence number (use {n:3} for 001, 002…)' },
  { token: '{date}', meaning: 'export date as YYYY-MM-DD' },
  { token: '{preset}', meaning: 'export preset name' },
  { token: '{w}', meaning: 'output width in pixels' },
  { token: '{h}', meaning: 'output height in pixels' },
];

const EXTENSIONS: Record<PhotoOutputMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/tiff': 'tif', 'image/avif': 'avif' };

function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Expands a file name rule into a safe file name with the correct extension. Unknown tokens are
 * kept literally so a typo is visible in the preview rather than silently dropped. */
export function renderFilenamePattern(pattern: string, mime: PhotoOutputMime, context: FilenameContext): string {
  const stem = context.sourceName.replace(/\.[^./\\]+$/, '') || 'photo';
  const expanded = (pattern.trim() || '{name}').replace(/\{(name|n(?::(\d))?|date|preset|w|h)\}/g, (_match, token: string, digits?: string) => {
    if (token === 'name') return stem;
    if (token.startsWith('n')) return String(context.index).padStart(digits ? Number(digits) : 1, '0');
    if (token === 'date') return isoDate(context.date ?? new Date());
    if (token === 'preset') return context.presetName ?? 'export';
    if (token === 'w') return context.width ? String(context.width) : 'w';
    return context.height ? String(context.height) : 'h';
  });
  const safe = safeFilenameStem(expanded.replace(/\.(jpe?g|png|webp|tiff?|avif)$/i, '')).slice(0, 180) || 'photo';
  return `${safe}.${EXTENSIONS[mime]}`;
}

// --- Collision handling (capability 162) ---

/** Returns `name` if unused, otherwise "stem (2).ext", "stem (3).ext"… Comparison ignores case
 * because Windows and macOS file systems do. The chosen name is recorded in `used`. */
export function uniqueFilename(name: string, used: Set<string>): string {
  const match = /^(.*?)(\.[^.]+)?$/.exec(name);
  const stem = match?.[1] ?? name;
  const extension = match?.[2] ?? '';
  let candidate = name;
  for (let copy = 2; used.has(candidate.toLowerCase()); copy += 1) candidate = `${stem} (${copy})${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// --- Delivery-size presets (capability 149) ---

/** Common delivery targets described by what they are for, not by any service's brand. */
export const PHOTO_RESIZE_PRESETS: Array<{ id: string; label: string; mode: PhotoResizeMode; value: number }> = [
  { id: 'original', label: 'Full size', mode: 'original', value: 100 },
  { id: 'uhd', label: '4K screen · 3840 px wide', mode: 'width', value: 3840 },
  { id: 'web-large', label: 'Web large · 2560 px long edge', mode: 'long-edge', value: 2560 },
  { id: 'hd', label: 'HD screen · 1920 px wide', mode: 'width', value: 1920 },
  { id: 'web', label: 'Web / email · 1600 px long edge', mode: 'long-edge', value: 1600 },
  { id: 'social', label: 'Social feed · 1080 px short edge', mode: 'short-edge', value: 1080 },
  { id: 'thumbnail', label: 'Thumbnail · 400 px long edge', mode: 'long-edge', value: 400 },
];
