import { PDFDocument } from 'pdf-lib';

export async function combinePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  for (const bytes of buffers) {
    const source = await PDFDocument.load(bytes.slice());
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return new Uint8Array(await output.save());
}

export async function flattenAndSanitizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes.slice());
  const form = document.getForm();
  if (form.getFields().length) form.flatten();
  document.setTitle(undefined as unknown as string);
  document.setAuthor(undefined as unknown as string);
  document.setSubject(undefined as unknown as string);
  document.setKeywords([]);
  document.setProducer('');
  document.setCreator('');
  return new Uint8Array(await document.save({ updateFieldAppearances: false }));
}
