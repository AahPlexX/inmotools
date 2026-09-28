import { describe, expect, it } from 'vitest';
import opentype from 'opentype.js';
import { parseSfnt, sfntToWoff1, svgFontToSfnt, woff1ToSfnt } from '../../src/tools/transcode/fonts-engine';
import { registerFontConverters } from '../../src/tools/transcode/fonts-converters';
import { runConversion } from '../../src/tools/transcode/transcode-engine';

registerFontConverters();

const makeTestFont = (): Uint8Array => {
  const notdef = new opentype.Glyph({ name: '.notdef', advanceWidth: 650, path: new opentype.Path() });
  const a = new opentype.Path();
  a.moveTo(0, 0);
  a.lineTo(300, 0);
  a.lineTo(150, 700);
  a.close();
  const glyphA = new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 400, path: a });
  const font = new opentype.Font({
    familyName: 'TestFamily',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [notdef, glyphA],
  });
  return new Uint8Array(font.toArrayBuffer());
};

describe('WOFF1 codec (F24)', () => {
  it('round-trips sfnt -> woff -> sfnt table-for-table', () => {
    const sfnt = makeTestFont();
    const woff = sfntToWoff1(sfnt);
    expect(String.fromCharCode(...woff.slice(0, 4))).toBe('wOFF');

    const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
    expect(view.getUint32(8)).toBe(woff.length); // total length field
    const numTables = view.getUint16(12);
    expect(numTables).toBe(parseSfnt(sfnt).tables.length);

    const restored = woff1ToSfnt(woff);
    const original = parseSfnt(sfnt);
    const roundTripped = parseSfnt(restored);
    expect(roundTripped.tables.map((table) => table.tag)).toEqual(original.tables.map((table) => table.tag));
    for (const table of original.tables) {
      const restoredTable = roundTripped.tables.find((candidate) => candidate.tag === table.tag);
      expect(Array.from(restoredTable?.data ?? [])).toEqual(Array.from(table.data));
    }
  });

  it('rejects non-WOFF input', () => {
    expect(() => woff1ToSfnt(new Uint8Array(64))).toThrow(/not a woff/i);
  });
});

describe('registry font conversions', () => {
  it('converts TTF -> WOFF through the registry', async () => {
    const sfnt = makeTestFont();
    const artifacts = await runConversion('ttf', 'woff', {
      sourceId: 'ttf',
      fileName: 'demo.ttf',
      bytes: sfnt,
      text: () => '',
    }, {});
    expect(artifacts[0].name).toBe('demo.woff');
    expect(String.fromCharCode(...artifacts[0].bytes.slice(0, 4))).toBe('wOFF');
  });

  it('re-wraps TTF as OTF with identical outline tables', async () => {
    const sfnt = makeTestFont();
    const artifacts = await runConversion('ttf', 'otf', {
      sourceId: 'ttf',
      fileName: 'demo.ttf',
      bytes: sfnt,
      text: () => '',
    }, {});
    const parsed = parseSfnt(artifacts[0].bytes);
    expect(parsed.tables.some((table) => table.tag === 'cmap')).toBe(true);
    expect(parsed.tables.some((table) => table.tag === 'head')).toBe(true);
  });
});

describe('SVG font compilation (F27)', () => {
  const svgFont = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <font horiz-adv-x="500">
      <font-face font-family="Converted" units-per-em="1000" ascent="800" descent="-200"/>
      <missing-glyph horiz-adv-x="500" d="M0 0L500 0L500 700L0 700Z"/>
      <glyph unicode="A" glyph-name="A" horiz-adv-x="600" d="M0 0L300 0L150 700Z"/>
      <glyph unicode="B" glyph-name="B" horiz-adv-x="600" d="M0 0L250 0L250 700L0 700Z"/>
    </font>
  </defs>
</svg>`;

  it('compiles SVG font XML into a parseable TrueType font', () => {
    const ttf = svgFontToSfnt(svgFont);
    const reparsed = opentype.parse(ttf.slice().buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer);
    expect(reparsed.numGlyphs).toBe(3);
    const glyphA = reparsed.charToGlyph('A');
    expect(glyphA.advanceWidth).toBe(600);
    expect(glyphA.path.commands.length).toBeGreaterThan(0);
  });

  it('runs svg-font -> ttf through the registry', async () => {
    const artifacts = await runConversion('svg-font', 'ttf', {
      sourceId: 'svg-font',
      fileName: 'legacy.svg',
      bytes: new TextEncoder().encode(svgFont),
      text: () => svgFont,
    }, {});
    expect(artifacts[0].name).toBe('legacy.ttf');
    const reparsed = opentype.parse(artifacts[0].bytes.slice().buffer.slice(artifacts[0].bytes.byteOffset, artifacts[0].bytes.byteOffset + artifacts[0].bytes.byteLength) as ArrayBuffer);
    expect(reparsed.numGlyphs).toBe(3);
  });

  it('rejects SVG documents without a font element', () => {
    expect(() => svgFontToSfnt('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toThrow(/no <font>/i);
  });
});
