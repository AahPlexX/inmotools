import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { combinePdfs, flattenAndSanitizePdf } from '../../src/tools/pdf/pdf-engine';

async function onePagePdf(title: string) {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.setTitle(title);
  return new Uint8Array(await doc.save());
}

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

  it('flattens form fields and clears common metadata', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    const field = doc.getForm().createTextField('name');
    field.addToPage(page, { x: 20, y: 120, width: 150, height: 24 });
    field.setText('Local');
    doc.setTitle('Sensitive title');
    doc.setAuthor('Sensitive author');
    const output = await flattenAndSanitizePdf(new Uint8Array(await doc.save()));
    const loaded = await PDFDocument.load(output);
    expect(loaded.getTitle()).toBeUndefined();
    expect(loaded.getAuthor()).toBeUndefined();
  });
});
