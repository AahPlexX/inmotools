import opentype from 'opentype.js';
import { compress, decompress } from 'woff2-encoder';

export type FontPreset = 'basic-latin' | 'latin-1' | 'digits' | 'punctuation';

export type FontSubsetSelection = {
  presets: FontPreset[];
  customText: string;
};

export type InspectedGlyph = {
  codePoint: number;
  character: string;
  glyphIndex: number;
  name: string;
  advanceWidth: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type FontInspection = {
  fileName: string;
  inputBytes: number;
  familyName: string;
  styleName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  capHeight: number | null;
  glyphCount: number;
  glyphs: InspectedGlyph[];
};

export type FontSubsetResult = {
  bytes: Uint8Array;
  codePoints: number[];
  glyphCount: number;
  inputBytes: number;
  sfntBytes: number;
  familyName: string;
  styleName: string;
};

const PRESETS: Record<FontPreset, number[]> = {
  'basic-latin': Array.from({ length: 95 }, (_, index) => index + 32),
  'latin-1': Array.from({ length: 96 }, (_, index) => index + 160),
  digits: Array.from({ length: 10 }, (_, index) => index + 48),
  punctuation: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 58, 59, 60, 61, 62, 63, 64, 91, 92, 93, 94, 95, 96, 123, 124, 125, 126],
};

export function collectRequiredCodePoints(selection: FontSubsetSelection): number[] {
  const values = new Set<number>();
  for (const preset of selection.presets) for (const value of PRESETS[preset] ?? []) values.add(value);
  for (const character of selection.customText) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) values.add(codePoint);
  }
  return [...values].sort((a, b) => a - b);
}

function signature(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 4));
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

async function normalizeSfnt(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer);
  if (signature(bytes) !== 'wOF2') return buffer.slice(0);
  const sfnt = await decompress(bytes);
  return exactArrayBuffer(sfnt);
}

function firstLocalizedName(font: any, key: string, fallback: string): string {
  const names = font?.names;
  const candidates = [names?.windows?.[key], names?.macintosh?.[key], names?.unicode?.[key], names?.[key]];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.en === 'string' && candidate.en.trim()) return candidate.en.trim();
      for (const value of Object.values(candidate)) {
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
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

async function parseFont(buffer: ArrayBuffer): Promise<{ font: any; sfnt: ArrayBuffer }> {
  const sfnt = await normalizeSfnt(buffer);
  const font = opentype.parse(sfnt);
  if (!font) throw new Error('The font could not be parsed.');
  return { font, sfnt };
}

export async function inspectFont(buffer: ArrayBuffer, fileName: string): Promise<FontInspection> {
  const { font } = await parseFont(buffer);
  const glyphs: InspectedGlyph[] = [];
  for (const [codePoint, glyphIndex] of cmapEntries(font)) {
    const glyph = font.glyphs.get(glyphIndex);
    if (!glyph) continue;
    const bounds = glyph.getBoundingBox();
    glyphs.push({
      codePoint,
      character: String.fromCodePoint(codePoint),
      glyphIndex,
      name: glyph.name || `glyph-${glyphIndex}`,
      advanceWidth: Number(glyph.advanceWidth ?? 0),
      xMin: Number(bounds.x1 ?? 0),
      yMin: Number(bounds.y1 ?? 0),
      xMax: Number(bounds.x2 ?? 0),
      yMax: Number(bounds.y2 ?? 0),
    });
  }

  const capHeight = Number(font?.tables?.os2?.sCapHeight);
  return {
    fileName,
    inputBytes: buffer.byteLength,
    familyName: firstLocalizedName(font, 'fontFamily', 'Untitled Font'),
    styleName: firstLocalizedName(font, 'fontSubfamily', 'Regular'),
    unitsPerEm: Number(font.unitsPerEm),
    ascender: Number(font.ascender),
    descender: Number(font.descender),
    capHeight: Number.isFinite(capHeight) ? capHeight : null,
    glyphCount: Number(font.glyphs.length),
    glyphs,
  };
}

function cloneGlyph(source: any, codePoints: number[]): any {
  const glyph = new opentype.Glyph({
    name: source.name || undefined,
    unicode: codePoints[0],
    advanceWidth: Number(source.advanceWidth ?? 0),
    leftSideBearing: Number(source.leftSideBearing ?? 0),
    path: source.path,
  });
  if (codePoints.length > 1) {
    glyph.unicodes = [...codePoints];
    glyph.unicode = codePoints[0];
  }
  return glyph;
}

export async function subsetToWoff2(
  buffer: ArrayBuffer,
  selection: FontSubsetSelection,
): Promise<FontSubsetResult> {
  const { font } = await parseFont(buffer);
  const requested = collectRequiredCodePoints(selection);
  const cmap = new Map(cmapEntries(font));
  const byGlyph = new Map<number, number[]>();
  for (const codePoint of requested) {
    const glyphIndex = cmap.get(codePoint);
    if (glyphIndex === undefined || glyphIndex <= 0) continue;
    const list = byGlyph.get(glyphIndex) ?? [];
    list.push(codePoint);
    byGlyph.set(glyphIndex, list);
  }

  const notdefSource = font.glyphs.get(0);
  const glyphs: any[] = [new opentype.Glyph({
    name: '.notdef',
    advanceWidth: Number(notdefSource?.advanceWidth ?? font.unitsPerEm ?? 1000),
    leftSideBearing: Number(notdefSource?.leftSideBearing ?? 0),
    path: notdefSource?.path ?? new opentype.Path(),
  })];
  const retainedCodePoints: number[] = [];
  for (const [glyphIndex, codePoints] of [...byGlyph.entries()].sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))) {
    const source = font.glyphs.get(glyphIndex);
    if (!source) continue;
    glyphs.push(cloneGlyph(source, codePoints));
    retainedCodePoints.push(...codePoints);
  }
  retainedCodePoints.sort((a, b) => a - b);

  const familyName = firstLocalizedName(font, 'fontFamily', 'Subset Font');
  const styleName = firstLocalizedName(font, 'fontSubfamily', 'Regular');
  const subset = new opentype.Font({
    familyName,
    styleName,
    unitsPerEm: Number(font.unitsPerEm),
    ascender: Number(font.ascender),
    descender: Number(font.descender),
    glyphs,
  });
  const sfnt = subset.toArrayBuffer();
  const bytes = await compress(sfnt);
  return {
    bytes,
    codePoints: retainedCodePoints,
    glyphCount: glyphs.length,
    inputBytes: buffer.byteLength,
    sfntBytes: sfnt.byteLength,
    familyName,
    styleName,
  };
}
