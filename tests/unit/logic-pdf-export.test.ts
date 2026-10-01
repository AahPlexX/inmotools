import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateMetadata } from '../../src/tools/logic/circuit-model';
import { renderSchematicSvg } from '../../src/tools/logic/export-engine';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import { exportSchematicPdf, pageSizeFor, pdfSafeText, placeSheet } from '../../src/tools/logic/pdf-export';

const DATE = new Date(Date.UTC(2026, 8, 29, 12, 0, 0));

class Builder {
  doc: LogicDocument;
  private x = 0;
  constructor(title: string) {
    this.doc = createInitialDocument(title);
  }

  add(type: ComponentType, label: string): string {
    this.doc = addComponent(this.doc, type, this.x, 0);
    this.x += 12;
    const id = this.doc.components[this.doc.components.length - 1]!.id;
    this.doc = relabelComponent(this.doc, id, label);
    return id;
  }

  wire(from: string, fromPort: string, to: string, toPort: string): void {
    this.doc = addWire(this.doc, { componentId: from, portId: fromPort }, { componentId: to, portId: toPort });
  }
}

const sample = (): LogicDocument => {
  const b = new Builder('Half adder');
  const a = b.add('SWITCH', 'A');
  const bb = b.add('SWITCH', 'B');
  const xor = b.add('XOR', 'X1');
  const sum = b.add('LED', 'SUM');
  b.wire(a, 'Y', xor, 'A');
  b.wire(bb, 'Y', xor, 'B');
  b.wire(xor, 'Y', sum, 'A');
  return b.doc;
};

/** Every compressed stream in the file, decompressed and joined, for looking at what a page draws. */
const contentStreams = (bytes: Uint8Array): string => {
  const raw = Buffer.from(bytes);
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = raw.indexOf('stream', from, 'latin1');
    if (start < 0) break;
    let dataStart = start + 'stream'.length;
    if (raw[dataStart] === 0x0d) dataStart += 1;
    if (raw[dataStart] === 0x0a) dataStart += 1;
    const end = raw.indexOf('endstream', dataStart, 'latin1');
    if (end < 0) break;
    try {
      found.push(inflateSync(raw.subarray(dataStart, end)).toString('latin1'));
    } catch {
      // Not every stream is compressed data; those are simply not text to look at.
    }
    from = end + 'endstream'.length;
  }
  return found.join('\n');
};

const HAVE_POPPLER = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).status === 0;
const work = mkdtempSync(join(tmpdir(), 'logic-pdf-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('schematic SVG: sheet, designators and net labels', () => {
  it('leaves the plain export exactly as it was', () => {
    const svg = renderSchematicSvg(sample());
    expect(svg).not.toContain('#9a3412');
    expect(svg).not.toContain('#1d4ed8');
    expect(svg).not.toContain('translate(40,40)');
    expect(svg).toBe(renderSchematicSvg(sample(), {}));
  });

  it('writes each part\'s reference designator above it', () => {
    const svg = renderSchematicSvg(sample(), { designators: true });
    const designators = [...svg.matchAll(/fill="#9a3412">([^<]+)</g)].map((match) => match[1]);
    expect(designators.sort()).toEqual(['D1', 'SW1', 'SW2', 'U1']);
  });

  it('names each named net once and never an anonymous one', () => {
    const svg = renderSchematicSvg(sample(), { netLabels: true });
    const labels = [...svg.matchAll(/fill="#1d4ed8">([^<]+)</g)].map((match) => match[1]);
    expect(labels.sort()).toEqual(['A', 'B', 'SUM']);
  });

  it('adds a border with lettered columns and numbered rows and grows by the sheet padding', () => {
    const plain = renderSchematicSvg(sample());
    const sheet = renderSchematicSvg(sample(), { sheet: true });
    const size = (svg: string): [number, number] => {
      const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
      return [Number(match[1]), Number(match[2])];
    };
    expect(size(sheet)[0]).toBe(size(plain)[0] + 80);
    expect(size(sheet)[1]).toBe(size(plain)[1] + 80);
    expect(sheet).toContain('translate(40,40)');
    expect(sheet).toMatch(/>A<\/text>/);
    expect(sheet).toMatch(/>1<\/text>/);
    // Every element is closed: the wrapping group is balanced.
    expect(sheet.match(/<g[ >]/g)!.length).toBe(sheet.match(/<\/g>/g)!.length);
  });

  it('escapes a hostile label in the designator and net label text', () => {
    const doc = relabelComponent(sample(), sample().components[0]!.id, '"><script>alert(1)</script>');
    const svg = renderSchematicSvg(doc, { designators: true, netLabels: true, sheet: true });
    expect(svg).not.toContain('<script>');
  });
});

describe('PDF layout helpers', () => {
  it('picks portrait or landscape from the sheet unless told otherwise', () => {
    expect(pageSizeFor('a4', 'auto', 800, 400)).toEqual([841.89, 595.28]);
    expect(pageSizeFor('a4', 'auto', 400, 800)).toEqual([595.28, 841.89]);
    expect(pageSizeFor('letter', 'portrait', 800, 400)).toEqual([612, 792]);
    expect(pageSizeFor('a3', 'landscape', 400, 800)).toEqual([1190.55, 841.89]);
  });

  it('fits the sheet inside the margins, centers it, and never enlarges past double', () => {
    const large = placeSheet(600, 800, 1200, 400);
    expect(large.scale).toBeCloseTo(560 / 1200, 9);
    expect(large.offsetX).toBeCloseTo(20, 9);
    expect(large.offsetY).toBeCloseTo((800 - 400 * large.scale) / 2, 9);
    expect(placeSheet(600, 800, 50, 50).scale).toBe(2);
  });

  it('replaces characters the built-in font lacks with ASCII stand-ins', () => {
    const supported = new Set([...'ABC>+#?'].map((character) => character.codePointAt(0)!));
    expect(pdfSafeText('AB▦C', supported)).toBe('AB#C');
    expect(pdfSafeText('⊕▶', supported)).toBe('+>');
    expect(pdfSafeText('A😀C', supported)).toBe('A?C');
  });
});

describe('PDF export', () => {
  it('writes one page whose size matches the chosen paper and orientation', async () => {
    const bytes = await exportSchematicPdf(sample(), { paper: 'a4', orientation: 'landscape', date: DATE });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    const letter = await PDFDocument.load(await exportSchematicPdf(sample(), { paper: 'letter', orientation: 'portrait', date: DATE }));
    expect(letter.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('records the circuit\'s title, author, description and tags as document properties', async () => {
    let doc = sample();
    doc = updateMetadata(doc, { title: 'Half adder', author: 'Ada', description: 'Adds two bits', tags: ['adder', 'demo'] });
    const pdf = await PDFDocument.load(await exportSchematicPdf(doc, { date: DATE }), { updateMetadata: false });
    expect(pdf.getTitle()).toBe('Half adder');
    expect(pdf.getAuthor()).toBe('Ada');
    expect(pdf.getSubject()).toBe('Adds two bits');
    expect(pdf.getKeywords()).toBe('adder demo');
    expect(pdf.getCreator()).toBe('InMo Tools Digital Logic Workstation');
    expect(pdf.getProducer()).toBe('InMo Tools');
    expect(pdf.getCreationDate()?.toISOString()).toBe(DATE.toISOString());
  });

  it('is deterministic for a fixed date', async () => {
    const first = await exportSchematicPdf(sample(), { date: DATE });
    const second = await exportSchematicPdf(sample(), { date: DATE });
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('draws the title, the designators and the net names as text', async () => {
    const bytes = await exportSchematicPdf(sample(), { date: DATE });
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Courier);
    // pdf-lib compresses the page's content stream and writes text in it as hex strings.
    const stream = contentStreams(bytes).toUpperCase();
    const hex = (text: string): string => Buffer.from(text, 'latin1').toString('hex').toUpperCase();
    expect(font.getCharacterSet().length).toBeGreaterThan(90);
    for (const text of ['Half adder', 'SW1', 'SW2', 'U1', 'D1', 'SUM']) expect(stream, text).toContain(`<${hex(text)}>`);
  });

  it('exports an empty circuit', async () => {
    const empty = await PDFDocument.load(await exportSchematicPdf(createInitialDocument('Empty'), { date: DATE }));
    expect(empty.getPageCount()).toBe(1);
  });

  it.skipIf(!HAVE_POPPLER)('reads back through pdftotext with the title block and labels intact', async () => {
    const file = join(work, 'sample.pdf');
    writeFileSync(file, await exportSchematicPdf(sample(), { date: DATE }));
    const result = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    for (const text of ['Half adder', 'SW1', 'SW2', 'U1', 'D1', 'SUM', 'Version: 0.1.0', 'License: MIT']) expect(result.stdout, text).toContain(text);
    const info = spawnSync('pdfinfo', [file], { encoding: 'utf8' });
    if (info.status === 0) expect(info.stdout).toMatch(/Pages:\s+1/);
  });
});
