import { degrees, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import {
  attachPdfFiles,
  extractPdfAttachments,
  inspectDocumentAttachments,
  type PdfAttachmentDefinition,
  type PdfAttachmentInventory,
} from './pdf-attachments';

export { extractPdfAttachments } from './pdf-attachments';
export type { PdfAttachmentDefinition, PdfAttachmentInventory, PdfExtractedAttachment } from './pdf-attachments';

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
  attachments: PdfAttachmentInventory[];
  attachmentWarnings: string[];
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

export interface PdfBlankPageDefinition {
  afterPage: number;
  width: number;
  height: number;
  count?: number;
}

export interface PdfPageBoxEdit {
  page: number;
  mediaBox?: PdfBox;
  cropBox?: PdfBox;
  bleedBox?: PdfBox;
  trimBox?: PdfBox;
}

interface PdfFormFieldFlags {
  name: string;
  required?: boolean;
  readOnly?: boolean;
}

interface PdfPositionedFormFieldBase extends PdfFormFieldFlags {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextFieldDefinition extends PdfPositionedFormFieldBase {
  type: 'text';
  value?: string;
  multiline?: boolean;
}

export interface PdfCheckBoxDefinition extends PdfPositionedFormFieldBase {
  type: 'checkbox';
  checked?: boolean;
}

export interface PdfDropdownDefinition extends PdfPositionedFormFieldBase {
  type: 'dropdown';
  options: string[];
  selected?: string;
}

export interface PdfRadioOptionDefinition {
  value: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfRadioGroupDefinition extends PdfFormFieldFlags {
  type: 'radio';
  options: PdfRadioOptionDefinition[];
  selected?: string;
}

export interface PdfOptionListDefinition extends PdfPositionedFormFieldBase {
  type: 'option-list';
  options: string[];
  selected?: string[];
  multiselect?: boolean;
}

export type PdfFormFieldDefinition =
  | PdfTextFieldDefinition
  | PdfCheckBoxDefinition
  | PdfDropdownDefinition
  | PdfRadioGroupDefinition
  | PdfOptionListDefinition;

export interface PdfOutputOptions {
  metadata?: PdfMetadataEdits;
  formFields?: PdfFormFieldDefinition[];
  blankPages?: PdfBlankPageDefinition[];
  pageBoxEdits?: PdfPageBoxEdit[];
  attachments?: PdfAttachmentDefinition[];
}

export type PageSelectionPreset = 'all' | 'odd' | 'even' | 'reverse';

const METADATA_FIELDS = [
  ['Title', 'Title'],
  ['Author', 'Author'],
  ['Subject', 'Subject'],
  ['Keywords', 'Keywords'],
  ['Creator', 'Creator'],
  ['Producer', 'Producer'],
  ['Creation date', 'CreationDate'],
  ['Modification date', 'ModDate'],
] as const;

function infoDictionary(document: PDFDocument): PDFDict | undefined {
  const info = document.context.trailerInfo.Info;
  return info ? document.context.lookupMaybe(info, PDFDict) : undefined;
}

const cleanText = (value: string | undefined): string | undefined => {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
};

const cleanKeywords = (values: string[] | undefined): string[] => (
  values?.map((value) => value.trim()).filter(Boolean) ?? []
);

function applyMetadata(document: PDFDocument, metadata: PdfMetadataEdits | undefined): void {
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

function validateBox(box: PdfBox, label: string): void {
  const values = [box.x, box.y, box.width, box.height];
  if (!values.every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
    throw new Error(`${label} must use finite coordinates and positive width/height.`);
  }
}

function boxInside(outer: PdfBox, inner: PdfBox): boolean {
  const epsilon = 0.0001;
  return inner.x >= outer.x - epsilon
    && inner.y >= outer.y - epsilon
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon;
}

function applyBlankPages(document: PDFDocument, definitions: PdfBlankPageDefinition[]): void {
  if (!definitions.length) return;
  const copiedPageCount = document.getPageCount();
  const normalized = definitions.map((definition, index) => ({ ...definition, index, count: definition.count ?? 1 }));

  for (const definition of normalized) {
    if (!Number.isInteger(definition.afterPage) || definition.afterPage < 0 || definition.afterPage > copiedPageCount) {
      throw new Error(`Blank-page anchor ${definition.afterPage} must be between 0 and ${copiedPageCount}.`);
    }
    if (![definition.width, definition.height].every(Number.isFinite) || definition.width <= 0 || definition.height <= 0) {
      throw new Error('Blank-page width and height must be finite positive numbers.');
    }
    if (!Number.isInteger(definition.count) || definition.count < 1 || definition.count > 100) {
      throw new Error('Blank-page count must be an integer between 1 and 100.');
    }
  }

  normalized.sort((left, right) => left.afterPage - right.afterPage || left.index - right.index);
  let inserted = 0;
  for (const definition of normalized) {
    let insertIndex = definition.afterPage + inserted;
    for (let offset = 0; offset < definition.count; offset += 1) {
      document.insertPage(insertIndex, [definition.width, definition.height]);
      insertIndex += 1;
      inserted += 1;
    }
  }
}

function applyPageBoxEdits(document: PDFDocument, edits: PdfPageBoxEdit[]): void {
  const seen = new Set<number>();
  for (const edit of edits) {
    if (!Number.isInteger(edit.page) || edit.page < 1 || edit.page > document.getPageCount()) {
      throw new Error(`Page-box edit targets page ${edit.page}, which is outside the output document.`);
    }
    if (seen.has(edit.page)) throw new Error(`Page-box edits for output page ${edit.page} must be combined into one definition.`);
    seen.add(edit.page);

    const page = document.getPage(edit.page - 1);
    if (edit.mediaBox) {
      validateBox(edit.mediaBox, 'MediaBox');
      page.setMediaBox(edit.mediaBox.x, edit.mediaBox.y, edit.mediaBox.width, edit.mediaBox.height);
    }
    if (edit.cropBox) {
      validateBox(edit.cropBox, 'CropBox');
      page.setCropBox(edit.cropBox.x, edit.cropBox.y, edit.cropBox.width, edit.cropBox.height);
    }
    if (edit.bleedBox) {
      validateBox(edit.bleedBox, 'BleedBox');
      page.setBleedBox(edit.bleedBox.x, edit.bleedBox.y, edit.bleedBox.width, edit.bleedBox.height);
    }
    if (edit.trimBox) {
      validateBox(edit.trimBox, 'TrimBox');
      page.setTrimBox(edit.trimBox.x, edit.trimBox.y, edit.trimBox.width, edit.trimBox.height);
    }

    const mediaBox = page.getMediaBox();
    const constrained = [
      ['CropBox', page.getCropBox()],
      ['BleedBox', page.getBleedBox()],
      ['TrimBox', page.getTrimBox()],
    ] as const;
    for (const [label, box] of constrained) {
      validateBox(box, label);
      if (!boxInside(mediaBox, box)) throw new Error(`${label} on output page ${edit.page} must remain inside its MediaBox.`);
    }
  }
}

function validatePositionedGeometry(
  document: PDFDocument,
  label: string,
  definition: Pick<PdfPositionedFormFieldBase, 'page' | 'x' | 'y' | 'width' | 'height'>,
): void {
  if (!Number.isInteger(definition.page) || definition.page < 1 || definition.page > document.getPageCount()) {
    throw new Error(`${label} targets page ${definition.page}, which is outside the output document.`);
  }
  const values = [definition.x, definition.y, definition.width, definition.height];
  if (!values.every(Number.isFinite) || definition.x < 0 || definition.y < 0 || definition.width <= 0 || definition.height <= 0) {
    throw new Error(`${label} must use finite, positive page geometry.`);
  }
  const page = document.getPage(definition.page - 1);
  if (definition.x + definition.width > page.getWidth() || definition.y + definition.height > page.getHeight()) {
    throw new Error(`${label} extends outside output page ${definition.page}.`);
  }
}

function cleanFieldOptions(values: string[], label: string): string[] {
  if (!values.length) throw new Error(`${label} must contain at least one option.`);
  const options = values.map((option) => option.trim());
  if (options.some((option) => !option)) throw new Error(`${label} cannot contain blank options.`);
  if (new Set(options).size !== options.length) throw new Error(`${label} cannot contain duplicate options.`);
  return options;
}

function validateFieldDefinition(document: PDFDocument, definition: PdfFormFieldDefinition): void {
  if (!definition.name.trim()) throw new Error('Form field names cannot be blank.');
  if (definition.type === 'radio') {
    const options = cleanFieldOptions(definition.options.map((option) => option.value), `Radio group ${definition.name}`);
    definition.options.forEach((option, index) => validatePositionedGeometry(document, `Radio option ${options[index]} in ${definition.name}`, option));
    if (definition.selected !== undefined && !options.includes(definition.selected)) {
      throw new Error(`Radio group ${definition.name} selected value must match one of its options.`);
    }
    return;
  }

  validatePositionedGeometry(document, `Form field ${definition.name}`, definition);
  if (definition.type === 'dropdown') {
    const options = cleanFieldOptions(definition.options, `Dropdown ${definition.name}`);
    if (definition.selected !== undefined && !options.includes(definition.selected)) {
      throw new Error(`Dropdown ${definition.name} selected value must match one of its options.`);
    }
  }
  if (definition.type === 'option-list') {
    const options = cleanFieldOptions(definition.options, `Option list ${definition.name}`);
    const selected = definition.selected ?? [];
    if (!definition.multiselect && selected.length > 1) throw new Error(`Option list ${definition.name} must enable multiselect before selecting multiple values.`);
    if (selected.some((value) => !options.includes(value))) {
      throw new Error(`Option list ${definition.name} selected values must match its declared options.`);
    }
  }
}

function applyFieldFlags(field: { enableReadOnly(): void; enableRequired(): void }, definition: PdfFormFieldFlags): void {
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

    if (definition.type === 'radio') {
      const field = form.createRadioGroup(name);
      applyFieldFlags(field, definition);
      for (const option of definition.options) {
        const page = document.getPage(option.page - 1);
        field.addOptionToPage(option.value.trim(), page, {
          x: option.x,
          y: option.y,
          width: option.width,
          height: option.height,
        });
      }
      if (definition.selected !== undefined) field.select(definition.selected);
      continue;
    }

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

    if (definition.type === 'dropdown') {
      const field = form.createDropdown(name);
      applyFieldFlags(field, definition);
      field.setOptions(definition.options.map((option) => option.trim()));
      if (definition.selected !== undefined) field.select(definition.selected);
      field.addToPage(page, rect);
      continue;
    }

    const field = form.createOptionList(name);
    applyFieldFlags(field, definition);
    field.setOptions(definition.options.map((option) => option.trim()));
    if (definition.multiselect) field.enableMultiselect();
    if (definition.selected?.length) field.select(definition.multiselect ? definition.selected : definition.selected[0]);
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
  const info = infoDictionary(document);
  const attachmentScan = inspectDocumentAttachments(document);
  return {
    pageCount: document.getPageCount(),
    formFieldCount: form.getFields().length,
    metadataFields: info ? METADATA_FIELDS.filter(([, key]) => info.has(PDFName.of(key))).map(([label]) => label) : [],
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
    attachments: attachmentScan.attachments,
    attachmentWarnings: attachmentScan.warnings,
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

  applyBlankPages(output, options.blankPages ?? []);
  applyPageBoxEdits(output, options.pageBoxEdits ?? []);
  applyFormFields(output, options.formFields ?? []);
  await attachPdfFiles(output, options.attachments ?? []);
  applyMetadata(output, options.metadata);
  return new Uint8Array(await output.save({ updateFieldAppearances: Boolean(options.formFields?.length) }));
}
