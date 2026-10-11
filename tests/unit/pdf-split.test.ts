import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fixtures from '../fixtures/pdf-password-fixtures.json';
import { createPdfSplitWriter, extractPdfAttachments, splicePdfs } from '../../src/tools/pdf/pdf-engine';
import { MAX_SPLIT_PARTS, parsePdfSplitRanges, pdfSplitByteCeiling, pdfSplitPrefix, splitPreparedPdf, zipPdfParts } from '../../src/tools/pdf/pdf-split';

async function prepared(count: number, metadata?: { title: string }, attachments: { name: string; bytes: Uint8Array }[] = []) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 1; i <= count; i++) doc.addPage([300 + i, 200]).drawText(`Owned split page ${i}`);
  return splicePdfs([{ bytes: await doc.save(), flatten: true }], { metadata, attachments });
}
afterEach(() => vi.restoreAllMocks());

describe('PDF-R07 range outputs', () => {
  it('round-trips separate ranges with exact page order, metadata and attachment bytes without mutating or repeatedly parsing input', async () => {
    const metadata = { title: 'Owned split title' }; const attachments = [{ name: 'evidence.txt', bytes: new TextEncoder().encode('owned evidence') }];
    const bytes = await prepared(5, metadata, attachments); const original = bytes.slice();
    const load = vi.spyOn(PDFDocument, 'load');
    const parts = await splitPreparedPdf(bytes, { mode: 'ranges', ranges: '1-2, 3, 4-5, 1' }, { filename: '../owned.pdf', metadata, attachments });
    expect(load.mock.calls.filter(([value]) => value instanceof Uint8Array && Buffer.from(value).equals(Buffer.from(bytes)))).toHaveLength(1);
    expect(bytes).toEqual(original); expect(parts.map(part => part.pages)).toEqual([[1, 2], [3], [4, 5], [1]]);
    expect(new Set(parts.map(part => part.filename)).size).toBe(4);
    for (const part of parts) {
      const pdf = await PDFDocument.load(part.bytes);
      expect(pdf.getPages().map(page => page.getWidth())).toEqual(part.pages.map(page => 300 + page));
      expect(pdf.getTitle()).toBe(metadata.title);
      const files = await extractPdfAttachments(part.bytes); expect(files).toHaveLength(1); expect(files[0].bytes).toEqual(attachments[0].bytes);
    }
  });
  it('rejects empty, reversed, invalid and out-of-bounds groups and excessive file counts', () => {
    for (const value of ['', ' ', ',1', '1,', '3-1', '0', '6', '1e1', '1.5', '1,,2']) expect(() => parsePdfSplitRanges(value, 5)).toThrow();
    expect(() => parsePdfSplitRanges(Array(MAX_SPLIT_PARTS + 1).fill('1').join(','), 5)).toThrow(/at most/);
  });
  it('uses property checks for range grouping, repeated groups and exact decimal ceilings', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 })), { minLength: 1, maxLength: 20 }), pairs => {
      const groups = pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
      const text = groups.map(([a, b]) => `${a}-${b}`).join(', ');
      expect(parsePdfSplitRanges(text, 20)).toEqual(groups.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));
    }), { numRuns: 100, seed: 7109 });
    fc.assert(fc.property(fc.integer({ min: 1, max: 128 * 1024 * 1024 }), bytes => {
      const text = `${Math.floor(bytes / 1_000_000)}.${String(bytes % 1_000_000).padStart(6, '0')}`;
      expect(pdfSplitByteCeiling(text)).toBe(bytes);
    }), { numRuns: 100, seed: 911 });
    for (const invalid of ['', '0', '-1', 'NaN', 'Infinity', '1e3', '0.0000001', '999999999999999']) expect(() => pdfSplitByteCeiling(invalid)).toThrow();
  });
  it('refuses encrypted documents, editable forms and unsupplied prepared metadata/attachments', async () => {
    const encrypted = fixtures.files.find(file => file.name === 'owned-aes256.pdf')!;
    await expect(createPdfSplitWriter(new Uint8Array(Buffer.from(encrypted.base64, 'base64')))).rejects.toThrow(/encrypt|protected/i);
    const doc = await PDFDocument.create({ updateMetadata: false }); const page = doc.addPage();
    doc.getForm().createTextField('owned').addToPage(page); doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
    await expect(createPdfSplitWriter(await doc.save())).rejects.toThrow(/fields/);
    await expect(createPdfSplitWriter(await prepared(1, { title: 'preserve me' }))).rejects.toThrow(/metadata/);
    await expect(createPdfSplitWriter(await prepared(1, undefined, [{ name: 'keep.txt', bytes: new Uint8Array([1]) }]))).rejects.toThrow(/attachments/);
  });
});

describe('PDF-R08 burst and download bundle', () => {
  it('creates three verified one-page PDFs and exact matching ZIP entries', async () => {
    const parts = await splitPreparedPdf(await prepared(3), { mode: 'burst' }, { filename: 'owned.pdf' });
    expect(parts.map(part => part.pages)).toEqual([[1], [2], [3]]);
    const zip = await JSZip.loadAsync(await zipPdfParts(parts));
    expect(Object.keys(zip.files)).toEqual(parts.map(part => part.filename));
    for (const part of parts) {
      expect((await PDFDocument.load(part.bytes)).getPageCount()).toBe(1);
      expect(await zip.file(part.filename)!.async('uint8array')).toEqual(part.bytes);
    }
  });
  it('cancels preparation before publication, rejects already cancelled ZIP and unsafe/duplicate filenames', async () => {
    const controller = new AbortController();
    await expect(splitPreparedPdf(await prepared(3), { mode: 'burst' }, { filename: 'owned.pdf', signal: controller.signal, onProgress: () => controller.abort() })).rejects.toThrow();
    const part = { pages: [1], bytes: new Uint8Array([1]), filename: 'part.pdf' };
    await expect(zipPdfParts([part], controller.signal)).rejects.toThrow();
    await expect(zipPdfParts([part, part])).rejects.toThrow(/unique/);
    await expect(zipPdfParts([{ ...part, filename: '../escape.pdf' }])).rejects.toThrow(/filenames/);
  });
  it('stops actual native ZIP streaming when cancellation occurs after its first data chunk', async () => {
    const parts = await splitPreparedPdf(await prepared(3), { mode: 'burst' }, { filename: 'owned.pdf' });
    const controller = new AbortController(); let chunks = 0;
    const generate = JSZip.prototype.generateInternalStream;
    vi.spyOn(JSZip.prototype, 'generateInternalStream').mockImplementation(function (options) {
      const stream = generate.call(this, options);
      stream.on('data', () => { chunks += 1; controller.abort(); });
      return stream;
    });
    await expect(zipPdfParts(parts, controller.signal)).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true); expect(chunks).toBe(1);
  });
  it('bounds portable Unicode filenames and removes source path/control characters', () => {
    const prefix = pdfSplitPrefix('../' + '😀'.repeat(100) + ':?\u0000.pdf');
    expect(new TextEncoder().encode(prefix).byteLength).toBeLessThanOrEqual(160); expect(prefix).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/);
    fc.assert(fc.property(fc.string({ maxLength: 300 }), text => {
      const result = pdfSplitPrefix(text); expect(result.length).toBeGreaterThan(0); expect(new TextEncoder().encode(result).byteLength).toBeLessThanOrEqual(160);
    }), { numRuns: 100, seed: 7802 });
  });
});

describe('PDF-R09 measured ceilings', () => {
  it('packs every source page once within real serialized ceilings in ordered and best-fit modes', async () => {
    const bytes = await prepared(6);
    const single = await splitPreparedPdf(bytes, { mode: 'burst' }, { filename: 'owned.pdf' });
    const maxBytes = Math.max(...single.map(part => part.bytes.byteLength)) + 100;
    for (const preserveOrder of [true, false]) {
      const parts = await splitPreparedPdf(bytes, { mode: 'size', maxBytes, preserveOrder }, { filename: 'owned.pdf' });
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.flatMap(part => part.pages).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      for (const part of parts) { expect(part.bytes.byteLength).toBeLessThanOrEqual(maxBytes); expect((await PDFDocument.load(part.bytes)).getPageCount()).toBe(part.pages.length); }
      if (preserveOrder) expect(parts.flatMap(part => part.pages)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });
  it('rejects invalid ceilings and oversized individual pages without returning partial files', async () => {
    const bytes = await prepared(2);
    for (const maxBytes of [0, -1, 1.5, Infinity, NaN]) await expect(splitPreparedPdf(bytes, { mode: 'size', maxBytes, preserveOrder: true }, { filename: 'owned.pdf' })).rejects.toThrow(/ceiling/);
    await expect(splitPreparedPdf(bytes, { mode: 'size', maxBytes: 1, preserveOrder: true }, { filename: 'owned.pdf' })).rejects.toThrow(/Page 1 alone requires/);
  });
});
