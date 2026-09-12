import { degrees, PDFDocument } from 'pdf-lib';

export interface PdfSelection {
  bytes: Uint8Array;
  pages?: number[];
  rotate?: 0 | 90 | 180 | 270;
  flatten?: boolean;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageInspection {
  page: number;
  width: number;
  height: number;
  rotation: number;
  mediaBox: PdfBox;
  cropBox: PdfBox;
  bleedBox: PdfBox;
  trimBox: PdfBox;
}

export interface PdfInspection {
  pageCount: number;
  formFieldCount: number;
  metadataFields: string[];
  encrypted: boolean;
  pages: PdfPageInspection[];
}

export interface PdfMetadataEdits {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  language?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

interface PdfFormFieldBase {
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  readOnly?: boolean;
}

export interface PdfTextFieldDefinition extends PdfFormFieldBase {
  type: 'text';
  value?: string;
  multiline?: boolean;
}

export interface PdfCheckBoxDefinition extends PdfFormFieldBase {
  type: 'checkbox';
  checked?: boolean;
}

export interface PdfDropdownDefinition extends PdfFormFieldBase {
  type: 'dropdown';
  options: string[];
  selected?: string;
}

export type PdfFormFieldDefinition = PdfTextFieldDefinition | PdfCheckBoxDefinition | PdfDropdownDefinition;

export interface PdfOutputOptions {
  metadata?: PdfMetadataEdits;
  formFields?: PdfFormFieldDefinition[];
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

const cleanText = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
};

const cleanKeywords = (values: string[] | undefined): string[] => (
  values?.map((value) => value.trim()).filter(Boolean) ?? []
);

function applyMetadata(document: PDFDocument, metadata: PdfMetadataEdits | undefined): void {
  // Re-establish the privacy boundary before writing any replacement values.
  // This prevents explicit metadata mode from ever inheriting incidental Info
  // entries created earlier in the output lifecycle.
  document.context.trailerInfo.Info = undefined;
  if (!metadata) return;

  const title = cleanText(metadata.title);
  const author = cleanText(metadata.author);
  const subject = cleanText(metadata.subject);
  const creator = cleanText(metadata.creator);
  const producer = cleanText(metadata.producer);
  const language = cleanText(metadata.language);
  const keywords = cleanKeywords(metadata.keywords);

  if (title) document.setTitle(title);
  if (author) document.setAuthor(author);
  if (subject) document.setSubject(subject);
  if (keywords.length) document.setKeywords(keywords);
  if (creator) document.setCreator(creator);
  if (producer) document.setProducer(producer);
  if (language) document.setLanguage(language);
  if (metadata.creationDate) document.setCreationDate(metadata.creationDate);
  if (metadata.modificationDate) document.setModificationDate(metadata.modificationDate);
}

function validateFieldDefinition(document: PDFDocument, definition: PdfFormFieldDefinition): void {
  if (!definition.name.trim()) throw new Error('Form field names cannot be blank.');
  if (!Number.isInteger(definition.page) || definition.page < 1 || definition.page > document.getPageCount()) {
    throw new Error(`Form field ${definition.name} targets page ${definition.page}, which is outside the output document.`);
  }

  const values = [definition.x, definition.y, definition.width, definition.height];
  if (!values.every(Number.isFinite) || definition.x < 0 || definition.y < 0 || definition.width <= 0 || definition.height <= 0) {
    throw new Error(`Form field ${definition.name} must use finite, positive page geometry.`);
  }

  const page = document.getPage(definition.page - 1);
  if (definition.x + definition.width > page.getWidth() || definition.y + definition.height > page.getHeight()) {
    throw new Error(`Form field ${definition.name} extends outside output page ${definition.page}.`);
  }
}

function applyFieldFlags(field: { enableReadOnly(): void; enableRequired(): void }, definition: PdfFormFieldBase): void {
  if (definition.readOnly) field.enableReadOnly();
  if (definition.required) field.enableRequired();
}

function applyFormFields(document: PDFDocument, definitions: PdfFormFieldDefinition[]): void {
  if (!definitions.length) return;
  const form = document.getForm();
  const seen = new Set<string>();

  for (const definition of definitions) {
    validateFieldDefinition(document, definition);
    const name = definition.name.trim();
    if (seen.has(name) || form.getFieldMaybe(name)) throw new Error(`Form field name ${name} is duplicated.`);
    seen.add(name);
    const page = document.getPage(definition.page - 1);
    const rect = {
      x: definition.x,
      y: definition.y,
      width: definition.width,
      height: definition.height,
    };

    if (definition.type === 'text') {
      const field = form.createTextField(name);
      applyFieldFlags(field, definition);
      if (definition.multiline) field.enableMultiline();
      if (definition.value !== undefined) field.setText(definition.value);
      field.addToPage(page, rect);
      continue;
    }

    if (definition.type === 'checkbox') {
      const field = form.createCheckBox(name);
      applyFieldFlags(field, definition);
      field.addToPage(page, rect);
      if (definition.checked) field.check();
      continue;
    }

    if (!definition.options.length) throw new Error(`Dropdown ${name} must contain at least one option.`);
    const options = definition.options.map((option) => option.trim());
    if (options.some((option) => !option)) throw new Error(`Dropdown ${name} cannot contain blank options.`);
    if (new Set(options).size !== options.length) throw new Error(`Dropdown ${name} cannot contain duplicate options.`);
    if (definition.selected !== undefined && !options.includes(definition.selected)) {
      throw new Error(`Dropdown ${name} selected value must match one of its options.`);
    }
    const field = form.createDropdown(name);
    applyFieldFlags(field, definition);
    field.setOptions(options);
    if (definition.selected !== undefined) field.select(definition.selected);
    field.addToPage(page, rect);
  }
}

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
    pages: document.getPages().map((page, index) => ({
      page: index + 1,
      width: page.getWidth(),
      height: page.getHeight(),
      rotation: page.getRotation().angle,
      mediaBox: page.getMediaBox(),
      cropBox: page.getCropBox(),
      bleedBox: page.getBleedBox(),
      trimBox: page.getTrimBox(),
    })),
  };
}

export async function combinePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  return splicePdfs(buffers.map((bytes) => ({ bytes })));
}

export async function flattenAndSanitizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  return splicePdfs([{ bytes, flatten: true }]);
}

export async function splicePdfs(selections: PdfSelection[], options: PdfOutputOptions = {}): Promise<Uint8Array> {
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

  applyFormFields(output, options.formFields ?? []);
  applyMetadata(output, options.metadata);
  return new Uint8Array(await output.save({ updateFieldAppearances: Boolean(options.formFields?.length) }));
}
