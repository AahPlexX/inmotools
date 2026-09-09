import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { combinePdfs, flattenAndSanitizePdf, pageSelectionPreset, parsePageSelection, splicePdfs } from '../../src/tools/pdf/pdf-engine';

async function onePagePdf(title: string) {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.setTitle(title);
  return new Uint8Array(await doc.save());
}

async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 20, y: 120, width: 150, height: 24 });
  field.setText('Local');
  return new Uint8Array(await doc.save());
}

describe('PDF page selection', () => {
  it('validates ranges before processing and preserves explicit order/repeats', () => {
    expect(parsePageSelection('3,1,3,4-5', 5)).toEqual([3, 1, 3, 4, 5]);
    expect(() => parsePageSelection('1,6', 5)).toThrow(/between 1 and 5/);
    expect(() => parsePageSelection('4-2', 5)).toThrow(/lower page/);
    expect(() => parsePageSelection('1,,2', 5)).toThrow(/empty items/);
  });

  it('keeps an empty preset distinct from the all-pages sentinel', () => {
    expect(pageSelectionPreset('all', 5)).toBe('');
    expect(pageSelectionPreset('odd', 5)).toBe('1,3,5');
    expect(pageSelectionPreset('even', 5)).toBe('2,4');
    expect(pageSelectionPreset('even', 1)).toBeNull();
    expect(pageSelectionPreset('reverse', 4)).toBe('4,3,2,1');
  });
});

describe('PDF binary processing', () => {
  it('combines local PDFs without changing the source buffers', async () => {
    const first = await onePagePdf('One');
    const second = await onePagePdf('Two');
    const originalFirst = first.slice();
    const merged = await combinePdfs([first, second]);
    const loaded = await PDFDocument.load(merged);
    expect(loaded.getPageCount()).toBe(2);
    expect(first).toEqual(originalFirst);
  });

  it('flattens form fields and rebuilds into a metadata-clean output document', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const field = doc.getForm().createTextField('name');
    field.addToPage(page, { x: 20, y: 120, width: 150, height: 24 });
    field.setText('Local');
    doc.setTitle('Sensitive title');
    doc.setAuthor('Sensitive author');
    doc.setSubject('Sensitive subject');
    const output = await flattenAndSanitizePdf(new Uint8Array(await doc.save()));
    const loaded = await PDFDocument.load(output);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toBeUndefined();
    expect(loaded.getAuthor()).toBeUndefined();
    expect(loaded.getSubject()).toBeUndefined();
    expect(loaded.getForm().getFields()).toHaveLength(0);
  });

  it('blocks form-bearing page copies when flattening is disabled instead of silently losing fields', async () => {
    await expect(splicePdfs([{ bytes: await formPdf(), flatten: false }])).rejects.toThrow(/editable AcroForm preservation is not supported/i);
    await expect(splicePdfs([{ bytes: await formPdf() }])).rejects.toThrow(/enable flattening/i);
  });

  it('uses the requested page order and preserves duplicates', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.addPage([200, 100]);
    doc.addPage([300, 100]);
    const output = await splicePdfs([{ bytes: new Uint8Array(await doc.save()), pages: [3, 1, 3] }]);
    const loaded = await PDFDocument.load(output);
    expect(loaded.getPages().map((page) => page.getWidth())).toEqual([300, 100, 300]);
  });
});
