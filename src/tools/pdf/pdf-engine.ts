import { degrees, PDFDocument } from 'pdf-lib';

export async function combinePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  const output = await PDFDocument.create({ updateMetadata: false });
  for (const bytes of buffers) {
    const source = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  output.context.trailerInfo.Info = undefined;
  return new Uint8Array(await output.save());
}

export async function flattenAndSanitizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  const form = document.getForm();
  if (form.getFields().length) form.flatten();
  document.context.trailerInfo.Info = undefined;
  return new Uint8Array(await document.save({ updateFieldAppearances: false }));
}

export interface PdfSelection {
  bytes: Uint8Array;
  pages?: number[];
  rotate?: 0 | 90 | 180 | 270;
  flatten?: boolean;
}

export async function splicePdfs(selections: PdfSelection[]): Promise<Uint8Array> {
  const output = await PDFDocument.create({ updateMetadata: false });
  for (const selection of selections) {
    const source = await PDFDocument.load(selection.bytes.slice(), { updateMetadata: false });
    if (selection.flatten) {
      const form = source.getForm();
      if (form.getFields().length) form.flatten();
    }
    source.context.trailerInfo.Info = undefined;
    const indices = selection.pages?.length ? selection.pages.map((page) => page - 1) : source.getPageIndices();
    if (indices.some((index) => index < 0 || index >= source.getPageCount())) throw new Error('A selected page is outside the document page range.');
    const pages = await output.copyPages(source, indices);
    pages.forEach((page) => {
      if (selection.rotate) page.setRotation(degrees((page.getRotation().angle + selection.rotate) % 360));
      output.addPage(page);
    });
  }
  output.context.trailerInfo.Info = undefined;
  return new Uint8Array(await output.save());
}
