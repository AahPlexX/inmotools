import { degrees, PDFDocument } from 'pdf-lib';

export interface PdfSelection {
  bytes: Uint8Array;
  pages?: number[];
  rotate?: 0 | 90 | 180 | 270;
  flatten?: boolean;
}

export interface PdfInspection {
  pageCount: number;
  formFieldCount: number;
  metadataFields: string[];
  encrypted: boolean;
}

export type PageSelectionPreset = 'all' | 'odd' | 'even' | 'reverse';

const METADATA_READERS = [
  ['Title', (doc: PDFDocument) => doc.getTitle()],
  ['Author', (doc: PDFDocument) => doc.getAuthor()],
  ['Subject', (doc: PDFDocument) => doc.getSubject()],
  ['Keywords', (doc: PDFDocument) => doc.getKeywords()],
  ['Creator', (doc: PDFDocument) => doc.getCreator()],
  ['Producer', (doc: PDFDocument) => doc.getProducer()],
  ['Creation date', (doc: PDFDocument) => doc.getCreationDate()],
  ['Modification date', (doc: PDFDocument) => doc.getModificationDate()],
] as const;

export function parsePageSelection(value: string, max: number): number[] {
  if (!Number.isInteger(max) || max < 1) throw new Error('PDF must contain at least one page.');
  const source = value.trim();
  if (!source) return Array.from({ length: max }, (_, index) => index + 1);
  const pages: number[] = [];
  for (const raw of source.split(',')) {
    const token = raw.trim();
    if (!token) throw new Error('Remove empty items from the page list.');
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end > max) throw new Error(`Page range ${token} must stay between 1 and ${max}.`);
      if (start > end) throw new Error(`Page range ${token} must run from a lower page to a higher page.`);
      for (let page = start; page <= end; page += 1) pages.push(page);
      continue;
    }
    if (!/^\d+$/.test(token)) throw new Error(`Invalid page item: ${token}.`);
    const page = Number(token);
    if (page < 1 || page > max) throw new Error(`Page ${page} must stay between 1 and ${max}.`);
    pages.push(page);
  }
  if (!pages.length) throw new Error('Select at least one page.');
  return pages;
}

/**
 * Returns null when a preset has no pages. Empty string remains reserved for
 * the explicit “all pages” selection, so an empty even/odd result can never be
 * mistaken for all pages by parsePageSelection().
 */
export function pageSelectionPreset(kind: PageSelectionPreset, max: number): string | null {
  if (!Number.isInteger(max) || max < 1) throw new Error('PDF must contain at least one page.');
  if (kind === 'all') return '';
  const pages = Array.from({ length: max }, (_, index) => index + 1);
  let selected: number[];
  if (kind === 'odd') selected = pages.filter((page) => page % 2 === 1);
  else if (kind === 'even') selected = pages.filter((page) => page % 2 === 0);
  else selected = pages.reverse();
  return selected.length ? selected.join(',') : null;
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  const form = document.getForm();
  return {
    pageCount: document.getPageCount(),
    formFieldCount: form.getFields().length,
    metadataFields: METADATA_READERS.filter(([, read]) => read(document) !== undefined).map(([label]) => label),
    encrypted: document.isEncrypted,
  };
}

export async function combinePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  return splicePdfs(buffers.map((bytes) => ({ bytes })));
}

export async function flattenAndSanitizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  return splicePdfs([{ bytes, flatten: true }]);
}

export async function splicePdfs(selections: PdfSelection[]): Promise<Uint8Array> {
  if (!selections.length) throw new Error('Add at least one PDF.');
  const output = await PDFDocument.create({ updateMetadata: false });
  for (const selection of selections) {
    const source = await PDFDocument.load(selection.bytes.slice(), { updateMetadata: false });
    if (source.isEncrypted) throw new Error('Encrypted PDFs are not supported and cannot be safely modified by this tool.');

    const form = source.getForm();
    const formFieldCount = form.getFields().length;
    if (formFieldCount && selection.flatten !== true) {
      throw new Error(
        `Editable AcroForm preservation is not supported when copying pages. This source contains ${formFieldCount} form field${formFieldCount === 1 ? '' : 's'}. Enable flattening before processing so the current field appearances are preserved as page content instead of being silently discarded.`,
      );
    }
    if (formFieldCount) form.flatten({ updateFieldAppearances: false });

    const indices = selection.pages?.length ? selection.pages.map((page) => page - 1) : source.getPageIndices();
    if (indices.some((index) => index < 0 || index >= source.getPageCount())) throw new Error('A selected page is outside the document page range.');
    const pages = await output.copyPages(source, indices);
    pages.forEach((page) => {
      if (selection.rotate) page.setRotation(degrees((page.getRotation().angle + selection.rotate) % 360));
      output.addPage(page);
    });
  }
  output.context.trailerInfo.Info = undefined;
  return new Uint8Array(await output.save({ updateFieldAppearances: false }));
}
