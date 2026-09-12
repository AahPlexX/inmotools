import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { combinePdfs, flattenAndSanitizePdf, inspectPdf, pageSelectionPreset, parsePageSelection, splicePdfs } from '../../src/tools/pdf/pdf-engine';

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

  it('writes explicit workstation metadata without restoring source metadata', async () => {
    const source = await onePagePdf('Sensitive source title');
    const output = await splicePdfs([{ bytes: source }], {
      metadata: {
        title: 'Filed copy',
        author: 'Records team',
        subject: 'Matter 24-001',
        keywords: ['filed', 'reviewed'],
        creator: 'InMoTools PDF Workstation',
        producer: 'InMoTools PDF Workstation',
        language: 'en-US',
      },
    });
    const loaded = await PDFDocument.load(output, { updateMetadata: false });
    expect(loaded.getTitle()).toBe('Filed copy');
    expect(loaded.getAuthor()).toBe('Records team');
    expect(loaded.getSubject()).toBe('Matter 24-001');
    expect(loaded.getKeywords()).toBe('filed reviewed');
    expect(loaded.getCreator()).toBe('InMoTools PDF Workstation');
    expect(loaded.getProducer()).toBe('InMoTools PDF Workstation');
    expect(loaded.catalog.get(PDFName.of('Lang'))).toBeDefined();
  });

  it('keeps unspecified source Info metadata out of partial replacement exports', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 200]);
    source.setTitle('Sensitive source title');
    source.setAuthor('Sensitive source author');
    source.setSubject('Sensitive source subject');
    source.setCreator('Sensitive source creator');
    source.setProducer('Sensitive source producer');
    source.setKeywords(['sensitive', 'source']);

    const output = await splicePdfs([{ bytes: new Uint8Array(await source.save()) }], {
      metadata: { title: 'Public replacement title' },
    });
    const loaded = await PDFDocument.load(output, { updateMetadata: false });
    expect(loaded.getTitle()).toBe('Public replacement title');
    expect(loaded.getAuthor()).toBeUndefined();
    expect(loaded.getSubject()).toBeUndefined();
    expect(loaded.getCreator()).toBeUndefined();
    expect(loaded.getProducer()).toBeUndefined();
    expect(loaded.getKeywords()).toBeUndefined();
  });

  it('authors deterministic workstation form fields onto copied output pages', async () => {
    const source = await onePagePdf('Forms');
    const output = await splicePdfs([{ bytes: source }], {
      formFields: [
        { type: 'text', name: 'client.name', page: 1, x: 20, y: 140, width: 140, height: 24, value: 'Ada', required: true },
        { type: 'checkbox', name: 'client.approved', page: 1, x: 20, y: 100, width: 18, height: 18, checked: true },
        { type: 'dropdown', name: 'client.status', page: 1, x: 60, y: 95, width: 100, height: 24, options: ['Draft', 'Filed'], selected: 'Filed' },
      ],
    });
    const loaded = await PDFDocument.load(output);
    const form = loaded.getForm();
    expect(form.getFields().map((field) => field.getName())).toEqual(['client.name', 'client.approved', 'client.status']);
    expect(form.getTextField('client.name').getText()).toBe('Ada');
    expect(form.getTextField('client.name').isRequired()).toBe(true);
    expect(form.getCheckBox('client.approved').isChecked()).toBe(true);
    expect(form.getDropdown('client.status').getSelected()).toEqual(['Filed']);
  });

  it('reports final page geometry for workstation page-box tooling', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    page.setCropBox(10, 20, 250, 150);
    page.setBleedBox(5, 10, 280, 175);
    page.setTrimBox(15, 25, 240, 140);
    const inspected = await inspectPdf(new Uint8Array(await doc.save()));
    expect(inspected.pages).toEqual([
      {
        page: 1,
        width: 300,
        height: 200,
        rotation: 0,
        mediaBox: { x: 0, y: 0, width: 300, height: 200 },
        cropBox: { x: 10, y: 20, width: 250, height: 150 },
        bleedBox: { x: 5, y: 10, width: 280, height: 175 },
        trimBox: { x: 15, y: 25, width: 240, height: 140 },
      },
    ]);
  });
});
