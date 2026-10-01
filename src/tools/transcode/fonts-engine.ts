// Font format transcoding (F24-F27).
// WOFF1 containers are handled with pure JavaScript + fflate zlib so they run
// in unit tests; WOFF2 uses the repo's wasm encoder. SVG fonts are compiled to
// TrueType via opentype.js.

import { unzlibSync, zlibSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import opentype from 'opentype.js';
import type { FormatId } from './formats';

const textEncoder = new TextEncoder();

// ---------------------------------------------------------------------------
// SFNT table access
// ---------------------------------------------------------------------------

interface SfntTable {
  tag: string;
  checksum: number;
  data: Uint8Array;
}

export function parseSfnt(bytes: Uint8Array): { version: number; tables: SfntTable[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  const numTables = view.getUint16(4);
  const tables: SfntTable[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3]);
    const checksum = view.getUint32(record + 4);
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    tables.push({ tag, checksum, data: bytes.slice(offset, offset + length) });
  }
  return { version, tables };
}

const pad4 = (value: number): number => (value + 3) & ~3;

export function buildSfnt(version: number, tables: SfntTable[]): Uint8Array {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const numTables = sorted.length;
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector += 1; }
  searchRange *= 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  let dataOffset = headerSize;
  const placements = sorted.map((table) => {
    const placement = { table, offset: dataOffset };
    dataOffset += pad4(table.data.length);
    return placement;
  });

  const out = new Uint8Array(dataOffset);
  const view = new DataView(out.buffer);
  view.setUint32(0, version);
  view.setUint16(4, numTables);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, rangeShift);
  placements.forEach(({ table, offset }, index) => {
    const record = 12 + index * 16;
    out.set(textEncoder.encode(table.tag), record);
    view.setUint32(record + 4, table.checksum >>> 0);
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.data.length);
    out.set(table.data, offset);
  });
  return out;
}

export function tagString(version: number): string {
  return String.fromCharCode((version >>> 24) & 0xff, (version >>> 16) & 0xff, (version >>> 8) & 0xff, version & 0xff);
}

// ---------------------------------------------------------------------------
// WOFF1 codec (deterministic, pure JS)
// ---------------------------------------------------------------------------

export function sfntToWoff1(sfnt: Uint8Array, majorVersion = 1, minorVersion = 0): Uint8Array {
  const { version, tables } = parseSfnt(sfnt);
  const numTables = tables.length;
  const directorySize = 44 + numTables * 20;
  let totalSfntSize = 12 + numTables * 16;
  for (const table of tables) totalSfntSize += pad4(table.data.length);

  const payloads: Uint8Array[] = [];
  const entries: Array<{ table: SfntTable; compLength: number; offset: number }> = [];
  let cursor = directorySize;
  for (const table of tables) {
    const compressed = zlibSync(table.data, { level: 9 });
    const useCompressed = compressed.length < table.data.length;
    const payload = useCompressed ? compressed : table.data;
    entries.push({ table, compLength: payload.length, offset: cursor });
    payloads.push(payload);
    cursor += pad4(payload.length);
  }

  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  out.set(textEncoder.encode('wOFF'), 0);
  view.setUint32(4, version);
  view.setUint32(8, out.length);
  view.setUint16(12, numTables);
  view.setUint16(14, 0);
  view.setUint32(16, totalSfntSize);
  view.setUint16(20, majorVersion);
  view.setUint16(22, minorVersion);
  // metaOffset/metaLength/metaOrigLength/privOffset/privLength stay zero.
  entries.forEach((entry, index) => {
    const record = 44 + index * 20;
    out.set(textEncoder.encode(entry.table.tag), record);
    view.setUint32(record + 4, entry.offset);
    view.setUint32(record + 8, entry.compLength);
    view.setUint32(record + 12, entry.table.data.length);
    view.setUint32(record + 16, entry.table.checksum >>> 0);
  });
  payloads.forEach((payload, index) => {
    out.set(payload, entries[index].offset);
  });
  return out;
}

export function woff1ToSfnt(woff: Uint8Array): Uint8Array {
  if (String.fromCharCode(woff[0], woff[1], woff[2], woff[3]) !== 'wOFF') {
    throw new Error('Input is not a WOFF file.');
  }
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables: SfntTable[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const record = 44 + i * 20;
    const tag = String.fromCharCode(woff[record], woff[record + 1], woff[record + 2], woff[record + 3]);
    const offset = view.getUint32(record + 4);
    const compLength = view.getUint32(record + 8);
    const origLength = view.getUint32(record + 12);
    const checksum = view.getUint32(record + 16);
    const chunk = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? new Uint8Array(unzlibSync(chunk)) : chunk.slice();
    if (data.length !== origLength) throw new Error(`WOFF table ${tag} decompressed to an unexpected size.`);
    tables.push({ tag, checksum, data });
  }
  return buildSfnt(flavor, tables);
}

// ---------------------------------------------------------------------------
// WOFF2 (wasm)
// ---------------------------------------------------------------------------

export async function sfntToWoff2(sfnt: Uint8Array): Promise<Uint8Array> {
  const { compress } = await import('woff2-encoder');
  const result = await compress(sfnt.slice().buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength) as ArrayBuffer);
  return new Uint8Array(result);
}

export async function woff2ToSfnt(bytes: Uint8Array): Promise<Uint8Array> {
  const { decompress } = await import('woff2-encoder');
  const result = await decompress(bytes.slice().buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// Universal normalization
// ---------------------------------------------------------------------------

export async function toSfnt(bytes: Uint8Array, format: FormatId): Promise<Uint8Array> {
  switch (format) {
    case 'ttf':
    case 'otf':
      return bytes;
    case 'woff':
      return woff1ToSfnt(bytes);
    case 'woff2':
      return woff2ToSfnt(bytes);
    default:
      throw new Error(`Unsupported font source format: ${format}`);
  }
}

// ---------------------------------------------------------------------------
// SVG font -> TrueType (F27)
// ---------------------------------------------------------------------------

export function svgFontToSfnt(svgText: string): Uint8Array {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true });
  const parsed = parser.parse(svgText) as Record<string, unknown>;
  const svg = parsed.svg as Record<string, unknown> | undefined;
  const defs = svg?.defs as Record<string, unknown> | undefined;
  const fontNode = (defs?.font ?? svg?.font) as Record<string, unknown> | undefined;
  if (!fontNode) throw new Error('No <font> element found in the SVG document.');

  const face = fontNode['font-face'] as Record<string, unknown> | undefined;
  const unitsPerEm = Number(face?.['@_units-per-em'] ?? 1000);
  const ascent = Number(face?.['@_ascent'] ?? unitsPerEm * 0.8);
  const descent = Number(face?.['@_descent'] ?? -unitsPerEm * 0.2);
  const family = String(face?.['@_font-family'] ?? 'Converted SVG Font');
  const defaultAdvance = Number(fontNode['@_horiz-adv-x'] ?? unitsPerEm);

  const glyphNodes = Array.isArray(fontNode.glyph) ? (fontNode.glyph as unknown[]) : fontNode.glyph ? [fontNode.glyph] : [];
  const missing = fontNode['missing-glyph'] as Record<string, unknown> | undefined;

  // SVG 1.1 font glyphs live in the same y-up font coordinate space as
  // TrueType, so parse path data without any vertical flip.
  const fromSvg = (opentype.Path as unknown as {
    fromSVG?: (d: string, options?: Record<string, unknown>) => opentype.Path;
  }).fromSVG;
  const parsePath = (d: string): opentype.Path => (fromSvg ? fromSvg(d, { flipY: false }) : new opentype.Path());
  const notdefPath = missing?.['@_d'] ? parsePath(String(missing['@_d'])) : new opentype.Path();

  const glyphObjects: opentype.Glyph[] = [
    new opentype.Glyph({
      name: '.notdef',
      advanceWidth: Number(missing?.['@_horiz-adv-x'] ?? defaultAdvance),
      path: notdefPath,
    }),
  ];

  for (const node of glyphNodes) {
    const glyph = node as Record<string, unknown>;
    const unicode = glyph['@_unicode'];
    if (unicode === undefined) continue;
    const codePoint = String(unicode).codePointAt(0);
    if (codePoint === undefined) continue;
    const d = glyph['@_d'] ? String(glyph['@_d']) : '';
    glyphObjects.push(new opentype.Glyph({
      name: glyph['@_glyph-name'] ? String(glyph['@_glyph-name']) : `uni${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      unicode: codePoint,
      advanceWidth: Number(glyph['@_horiz-adv-x'] ?? defaultAdvance),
      path: d ? parsePath(d) : new opentype.Path(),
    }));
  }

  if (glyphObjects.length < 2) throw new Error('The SVG font defines no glyphs.');

  const font = new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm,
    ascender: ascent,
    descender: descent,
    glyphs: glyphObjects,
  });
  const buffer = font.toArrayBuffer();
  return new Uint8Array(buffer);
}


