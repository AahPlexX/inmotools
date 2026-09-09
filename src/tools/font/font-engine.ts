import opentype from 'opentype.js';
import { compress, decompress } from 'woff2-encoder';

export type FontPreset = 'basic-latin' | 'latin-1' | 'digits' | 'punctuation';
export type FontSubsetSelection = { presets: FontPreset[]; customText: string };
export type InspectedGlyph = { codePoint: number; character: string; glyphIndex: number; name: string; advanceWidth: number; xMin: number; yMin: number; xMax: number; yMax: number };
export type FontInspection = { fileName: string; inputBytes: number; familyName: string; styleName: string; cssStyle: 'normal' | 'italic' | 'oblique'; weight: number; unitsPerEm: number; ascender: number; descender: number; capHeight: number | null; glyphCount: number; glyphs: InspectedGlyph[]; tableTags: string[]; unsupportedFeatures: string[]; safeToSubset: boolean };
export type FontSubsetResult = { bytes: Uint8Array; codePoints: number[]; missingCodePoints: number[]; glyphCount: number; inputBytes: number; sfntBytes: number; familyName: string; styleName: string; cssStyle: 'normal' | 'italic' | 'oblique'; weight: number; sourceWeight: number; unicodeRange: string };

const PRESETS: Record<FontPreset, number[]> = {
  'basic-latin': Array.from({ length: 95 }, (_, index) => index + 32),
  'latin-1': Array.from({ length: 96 }, (_, index) => index + 160),
  digits: Array.from({ length: 10 }, (_, index) => index + 48),
  punctuation: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 58, 59, 60, 61, 62, 63, 64, 91, 92, 93, 94, 95, 96, 123, 124, 125, 126],
};

const UNSAFE_TABLES: Record<string, string> = {
  GSUB: 'glyph substitution (GSUB)',
  GPOS: 'glyph positioning (GPOS)',
  GDEF: 'glyph definition (GDEF)',
  BASE: 'baseline layout (BASE)',
  JSTF: 'justification layout (JSTF)',
  kern: 'kerning (kern)',
  fvar: 'variable-font axes (fvar)',
  gvar: 'glyph variations (gvar)',
  avar: 'axis variations (avar)',
  HVAR: 'horizontal metric variations (HVAR)',
  VVAR: 'vertical metric variations (VVAR)',
  MVAR: 'metric variations (MVAR)',
  COLR: 'color glyph layers (COLR)',
  CPAL: 'color palettes (CPAL)',
  SVG: 'SVG glyphs',
  CBDT: 'bitmap color glyphs (CBDT)',
  CBLC: 'bitmap locations (CBLC)',
  sbix: 'Apple bitmap glyphs (sbix)',
  morx: 'AAT glyph transformations (morx)',
  kerx: 'AAT kerning (kerx)',
  MATH: 'math layout (MATH)',
};
const UNSAFE_TABLE_BY_LOWER = new Map(Object.keys(UNSAFE_TABLES).map((tag) => [tag.toLowerCase(), tag] as const));

export function collectRequiredCodePoints(selection: FontSubsetSelection): number[] {
  const values = new Set<number>();
  for (const preset of selection.presets) for (const value of PRESETS[preset] ?? []) values.add(value);
  for (const character of selection.customText) {
    const point = character.codePointAt(0);
    if (point !== undefined) values.add(point);
  }
  return [...values].sort((a, b) => a - b);
}

const signature = (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 4));
const exactArrayBuffer = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;
const readTag = (bytes: Uint8Array, offset: number): string => String.fromCharCode(...bytes.slice(offset, offset + 4));

export function scanFontContainerTableTags(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12) return [];
  const view = new DataView(buffer);
  const sig = signature(bytes);
  let count = 0;
  let start = 0;
  let stride = 0;

  if (sig === 'wOFF') {
    if (bytes.byteLength < 44) return [];
    count = view.getUint16(12, false);
    start = 44;
    stride = 20;
  } else if (sig === 'OTTO' || sig === 'true' || view.getUint32(0, false) === 0x00010000) {
    count = view.getUint16(4, false);
    start = 12;
    stride = 16;
  } else {
    return [];
  }

  if (count > Math.floor((bytes.byteLength - start) / stride)) return [];
  const tags = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const tag = readTag(bytes, start + index * stride);
    if (tag.length === 4) tags.add(tag);
  }
  return [...tags].sort();
}

export function unsupportedFeaturesForTableTags(tags: readonly string[]): string[] {
  const descriptions = new Set<string>();
  for (const tag of tags) {
    const canonical = UNSAFE_TABLE_BY_LOWER.get(tag.toLowerCase());
    if (canonical) descriptions.add(UNSAFE_TABLES[canonical]);
  }
  return [...descriptions];
}

async function normalizeSfnt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer);
  if (signature(bytes) !== 'wOF2') return buffer.slice(0);
  return exactArrayBuffer(await decompress(bytes));
}

function firstLocalizedName(font: any, key: string, fallback: string): string {
  const names = font?.names;
  const candidates = [names?.windows?.[key], names?.macintosh?.[key], names?.unicode?.[key], names?.[key]];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.en === 'string' && candidate.en.trim()) return candidate.en.trim();
      for (const value of Object.values(candidate)) if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function cmapEntries(font: any): Array<[number, number]> {
  const map = font?.tables?.cmap?.glyphIndexMap ?? {};
  return Object.entries(map)
    .map(([codePoint, glyphIndex]) => [Number(codePoint), Number(glyphIndex)] as [number, number])
    .filter(([codePoint, glyphIndex]) => Number.isInteger(codePoint) && Number.isInteger(glyphIndex) && codePoint >= 0 && glyphIndex >= 0)
    .sort((a, b) => a[0] - b[0]);
}

function fontTableTags(original: ArrayBuffer, sfnt: ArrayBuffer, font: any): string[] {
  const byLower = new Map<string, string>();
  const add = (tag: string) => {
    if (tag.length !== 4) return;
    const lower = tag.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, tag);
  };
  for (const tag of scanFontContainerTableTags(original)) add(tag);
  for (const tag of scanFontContainerTableTags(sfnt)) add(tag);
  for (const key of Object.keys(font?.tables ?? {})) add(key);
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

function cssStyle(styleName: string): 'normal' | 'italic' | 'oblique' {
  if (/oblique/i.test(styleName)) return 'oblique';
  if (/italic/i.test(styleName)) return 'italic';
  return 'normal';
}

function fontWeight(font: any): number {
  const value = Number(font?.tables?.os2?.usWeightClass);
  return Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.round(value))) : 400;
}

function fontWidthClass(font: any): number {
  const value = Number(font?.tables?.os2?.usWidthClass);
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : 5;
}

function fontSelection(font: any): number {
  const value = Number(font?.tables?.os2?.fsSelection);
  return Number.isInteger(value) && value >= 0 && value <= 0xffff ? value : 0;
}

async function parseFont(buffer: ArrayBuffer) {
  const sfnt = await normalizeSfnt(buffer);
  const font = opentype.parse(sfnt);
  if (!font) throw new Error('The font could not be parsed.');
  return { font, sfnt };
}

export function unicodeRangeForCodePoints(points: number[]): string {
  const sorted = [...new Set(points.filter((value) => Number.isInteger(value) && value >= 0 && value <= 0x10ffff))].sort((a, b) => a - b);
  if (!sorted.length) return '';
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;
  const push = () => ranges.push(start === end ? `U+${start.toString(16).toUpperCase()}` : `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`);
  for (const value of sorted.slice(1)) {
    if (value === end + 1) {
      end = value;
      continue;
    }
    push();
    start = end = value;
  }
  push();
  return ranges.join(', ');
}

export async function inspectFont(buffer: ArrayBuffer, fileName: string): Promise<FontInspection> {
  const { font, sfnt } = await parseFont(buffer);
  const glyphs: InspectedGlyph[] = [];
  for (const [codePoint, glyphIndex] of cmapEntries(font)) {
    const glyph = font.glyphs.get(glyphIndex);
    if (!glyph) continue;
    const bounds = glyph.getBoundingBox();
    glyphs.push({ codePoint, character: String.fromCodePoint(codePoint), glyphIndex, name: glyph.name || `glyph-${glyphIndex}`, advanceWidth: Number(glyph.advanceWidth ?? 0), xMin: Number(bounds.x1 ?? 0), yMin: Number(bounds.y1 ?? 0), xMax: Number(bounds.x2 ?? 0), yMax: Number(bounds.y2 ?? 0) });
  }
  const capHeight = Number(font?.tables?.os2?.sCapHeight);
  const styleName = firstLocalizedName(font, 'fontSubfamily', 'Regular');
  const tableTags = fontTableTags(buffer, sfnt, font);
  const unsupportedFeatures = unsupportedFeaturesForTableTags(tableTags);
  return {
    fileName,
    inputBytes: buffer.byteLength,
    familyName: firstLocalizedName(font, 'fontFamily', 'Untitled Font'),
    styleName,
    cssStyle: cssStyle(styleName),
    weight: fontWeight(font),
    unitsPerEm: Number(font.unitsPerEm),
    ascender: Number(font.ascender),
    descender: Number(font.descender),
    capHeight: Number.isFinite(capHeight) ? capHeight : null,
    glyphCount: Number(font.glyphs.length),
    glyphs,
    tableTags,
    unsupportedFeatures,
    safeToSubset: unsupportedFeatures.length === 0,
  };
}

function cloneGlyph(source: any, codePoints: number[]) {
  const glyph = new opentype.Glyph({ name: source.name || undefined, unicode: codePoints[0], advanceWidth: Number(source.advanceWidth ?? 0), leftSideBearing: Number(source.leftSideBearing ?? 0), path: source.path });
  if (codePoints.length > 1) {
    glyph.unicodes = [...codePoints];
    glyph.unicode = codePoints[0];
  }
  return glyph;
}

export async function subsetToWoff2(buffer: ArrayBuffer, selection: FontSubsetSelection): Promise<FontSubsetResult> {
  const inspection = await inspectFont(buffer, 'font');
  if (!inspection.safeToSubset) throw new Error(`Safe subsetting is blocked because this font uses ${inspection.unsupportedFeatures.join(', ')}. Reconstructing glyph outlines would discard those layout features.`);

  const { font } = await parseFont(buffer);
  const requested = collectRequiredCodePoints(selection);
  const cmap = new Map(cmapEntries(font));
  const byGlyph = new Map<number, number[]>();
  const missing: number[] = [];
  for (const point of requested) {
    const index = cmap.get(point);
    if (index === undefined || index <= 0) {
      missing.push(point);
      continue;
    }
    byGlyph.set(index, [...(byGlyph.get(index) ?? []), point]);
  }

  const notdefSource = font.glyphs.get(0);
  const glyphs: any[] = [new opentype.Glyph({ name: '.notdef', advanceWidth: Number(notdefSource?.advanceWidth ?? font.unitsPerEm ?? 1000), leftSideBearing: Number(notdefSource?.leftSideBearing ?? 0), path: notdefSource?.path ?? new opentype.Path() })];
  const retained: number[] = [];
  for (const [glyphIndex, points] of [...byGlyph.entries()].sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))) {
    const source = font.glyphs.get(glyphIndex);
    if (!source) continue;
    glyphs.push(cloneGlyph(source, points));
    retained.push(...points);
  }
  retained.sort((a, b) => a - b);
  if (!retained.length) throw new Error('None of the requested characters are present in the source font. Select at least one character that the font actually contains.');

  const subsetOptions: any = {
    familyName: inspection.familyName,
    styleName: inspection.styleName,
    unitsPerEm: Number(font.unitsPerEm),
    ascender: Number(font.ascender),
    descender: Number(font.descender),
    weightClass: inspection.weight,
    widthClass: fontWidthClass(font),
    fsSelection: fontSelection(font),
    glyphs,
  };
  const subset = new opentype.Font(subsetOptions);
  const sfnt = subset.toArrayBuffer();
  const bytes = await compress(sfnt);
  const outputInspection = await inspectFont(exactArrayBuffer(bytes), 'subset.woff2');
  if (outputInspection.weight !== inspection.weight) {
    throw new Error(`Generated font metadata changed weight from ${inspection.weight} to ${outputInspection.weight}; the subset was not exported.`);
  }

  return {
    bytes,
    codePoints: retained,
    missingCodePoints: missing,
    glyphCount: glyphs.length,
    inputBytes: buffer.byteLength,
    sfntBytes: sfnt.byteLength,
    familyName: outputInspection.familyName,
    styleName: outputInspection.styleName,
    cssStyle: outputInspection.cssStyle,
    weight: outputInspection.weight,
    sourceWeight: inspection.weight,
    unicodeRange: unicodeRangeForCodePoints(retained),
  };
}
