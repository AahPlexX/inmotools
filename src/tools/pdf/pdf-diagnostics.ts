import { PDFArray, PDFDict, PDFDocument, PDFInvalidObject, PDFName, PDFObject, PDFRef, PDFStream } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfDiagnostics {
  complete: boolean;
  encrypted: boolean;
  securityHandler: string | null;
  hasXfa: boolean | null;
  hasXmp: boolean | null;
  formsInspected: boolean;
  metadataInspected: boolean;
  attachmentsInspected: boolean;
  indicators: string[];
  warnings: string[];
  scannedObjects: number;
  objectLimit: number;
  pageDimensions: { page: number; userUnit: number; displayWidth: number; displayHeight: number }[];
}

export const PDF_DIAGNOSTIC_OBJECT_LIMIT = 10_000;
const DEPTH_LIMIT = 32;
const EDGE_LIMIT = 50_000;
const WARNING_LIMIT = 30;
const ACTIONS = new Set(['JavaScript', 'Launch', 'URI', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData', 'Rendition', 'Movie', 'Sound']);
const META = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

export function diagnosticWarning(diagnostics: PdfDiagnostics, message: string): void {
  diagnostics.complete = false;
  if (diagnostics.warnings.includes(message)) return;
  if (diagnostics.warnings.length < WARNING_LIMIT) diagnostics.warnings.push(message);
  else if (diagnostics.warnings.length === WARNING_LIMIT) diagnostics.warnings.push('Further inspection warnings omitted; inspection remains incomplete.');
}

/** Non-mutating, post-parse inventory. Library parsing/enumeration allocations are not bounded here. */
export function inspectDocumentDiagnostics(document: PDFDocument, objectLimit = PDF_DIAGNOSTIC_OBJECT_LIMIT): PdfDiagnostics {
  if (!Number.isInteger(objectLimit) || objectLimit < 1 || objectLimit > PDF_DIAGNOSTIC_OBJECT_LIMIT) throw new Error('Invalid diagnostic object limit.');
  const result: PdfDiagnostics = {
    complete: true, encrypted: document.isEncrypted, securityHandler: null, hasXfa: false, hasXmp: false,
    formsInspected: true, metadataInspected: true, attachmentsInspected: true,
    indicators: [], warnings: [], scannedObjects: 0, objectLimit, pageDimensions: [],
  };
  const resolve = (value: PDFObject | undefined) => value instanceof PDFRef ? document.context.lookup(value) : value;
  const optionalDict = (key: string, section: 'formsInspected' | 'metadataInspected' | 'attachmentsInspected') => {
    const raw = document.catalog.get(PDFName.of(key));
    if (!raw) return;
    const value = resolve(raw);
    if (value instanceof PDFDict) return value;
    result[section] = false;
    diagnosticWarning(result, `${key} should be a dictionary; this optional inspection is incomplete.`);
  };
  const form = optionalDict('AcroForm', 'formsInspected');
  result.hasXfa = form ? form.has(PDFName.of('XFA')) : result.formsInspected ? false : null;
  if (result.hasXfa) diagnosticWarning(result, 'XFA forms are present; dynamic content preservation cannot be verified. Export is blocked for this source.');
  optionalDict('Names', 'attachmentsInspected');
  const metadata = document.catalog.get(PDFName.of('Metadata'));
  result.hasXmp = Boolean(metadata);
  if (metadata && !(resolve(metadata) instanceof PDFStream)) {
    result.metadataInspected = false;
    diagnosticWarning(result, 'XMP metadata should be a stream; metadata inspection is incomplete.');
  }
  const indicators = new Set<string>();
  const visited = new Set<PDFObject>();
  const indirect = document.context.enumerateIndirectObjects();
  if (indirect.length > objectLimit) diagnosticWarning(result, `Object scan limited to ${objectLimit.toLocaleString('en-US')} objects; indicators and structural diagnostics are partial.`);
  const roots = [document.catalog, ...indirect.slice(0, objectLimit).map(([, value]) => value)];
  let edges = 0;
  for (const root of roots) {
    const stack: { value: PDFObject; depth: number }[] = [{ value: root, depth: 0 }];
    while (stack.length) {
      const current = stack.pop()!;
      const value = resolve(current.value);
      if (!value) { diagnosticWarning(result, 'Unresolved object reference found; structural inspection is incomplete.'); continue; }
      if (visited.has(value)) continue;
      if (visited.size >= objectLimit || edges >= EDGE_LIMIT) {
        diagnosticWarning(result, 'Diagnostic traversal limit reached; remaining objects were not inspected.');
        stack.length = 0;
        break;
      }
      if (current.depth > DEPTH_LIMIT) { diagnosticWarning(result, `Diagnostic nesting exceeds ${DEPTH_LIMIT} levels; inspection is partial.`); continue; }
      visited.add(value);
      if (value instanceof PDFInvalidObject) { diagnosticWarning(result, 'Recovered malformed PDF object found; successful opening does not prove structural validity.'); continue; }
      const dictionary = value instanceof PDFStream ? value.dict : value instanceof PDFDict ? value : null;
      if (dictionary) {
        const action = resolve(dictionary.get(PDFName.of('S')));
        if (action instanceof PDFName && ACTIONS.has(action.decodeText())) indicators.add(action.decodeText());
        for (const [key, child] of dictionary.entries()) {
          if (++edges > EDGE_LIMIT) break;
          const name = key.decodeText();
          if (name === 'JS' || name === 'JavaScript') indicators.add('JavaScript');
          if (name === 'OpenAction') indicators.add('OpenAction');
          if (name === 'AA') indicators.add('Additional actions');
          if (name === 'RichMedia' || name === 'RichMediaContent') indicators.add('Rich media');
          stack.push({ value: child, depth: current.depth + 1 });
        }
      } else if (value instanceof PDFArray) {
        for (let index = 0; index < value.size(); index++) {
          if (++edges > EDGE_LIMIT) break;
          stack.push({ value: value.get(index), depth: current.depth + 1 });
        }
      }
    }
    if (visited.size >= objectLimit || edges >= EDGE_LIMIT) {
      diagnosticWarning(result, 'Diagnostic traversal limit reached; inspection is partial.');
      break;
    }
  }
  if (edges >= EDGE_LIMIT) diagnosticWarning(result, 'Diagnostic edge limit reached; inspection is partial.');
  result.scannedObjects = visited.size;
  result.indicators = [...indicators].sort();
  return result;
}

/** Counts terminal AcroForm fields without creating an AcroForm or removing XFA. */
export function inspectFormFieldCount(document: PDFDocument, diagnostics: PdfDiagnostics): number {
  const form = document.context.lookup(document.catalog.get(PDFName.of('AcroForm')));
  if (!form) return 0;
  if (!(form instanceof PDFDict)) return 0;
  const fields = document.context.lookup(form.get(PDFName.of('Fields')));
  if (!fields) return 0;
  if (!(fields instanceof PDFArray)) { diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'AcroForm field list could not be inspected.'); return 0; }
  const visited = new Set<PDFDict>();
  const stack: { value: PDFObject; depth: number; fieldType?: PDFObject }[] = [];
  let operations = 0;
  const append = (array: PDFArray, depth: number, fieldType?: PDFObject) => {
    if (array.size() > diagnostics.objectLimit || operations + array.size() > EDGE_LIMIT) { diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'AcroForm field list exceeds the diagnostic limit; count is partial.'); }
    for (let i = 0; i < Math.min(array.size(), diagnostics.objectLimit) && operations < EDGE_LIMIT; i++) { operations++; stack.push({ value: array.get(i), depth, fieldType }); }
  };
  append(fields, 0);
  let count = 0;
  while (stack.length) {
    const current = stack.pop()!;
    const value = document.context.lookup(current.value);
    if (!(value instanceof PDFDict) || visited.has(value) || current.depth > DEPTH_LIMIT || visited.size >= diagnostics.objectLimit) {
      diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'Malformed, repeated or excessive AcroForm field tree; count is partial.'); continue;
    }
    visited.add(value);
    const parents = new Set<PDFDict>();
    let parent: PDFObject | undefined = value;
    while (parent instanceof PDFDict) {
      if (parents.has(parent) || parents.size >= DEPTH_LIMIT) {
        diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'Cyclic or excessive AcroForm parent chain; field details are unavailable.'); break;
      }
      parents.add(parent);
      parent = document.context.lookup(parent.get(PDFName.of('Parent')));
    }
    const fieldType = value.get(PDFName.of('FT')) ?? current.fieldType;
    const children = document.context.lookup(value.get(PDFName.of('Kids')));
    let hasFields = false;
    if (children instanceof PDFArray) {
      for (let i = 0; i < Math.min(children.size(), diagnostics.objectLimit); i++) {
        if (++operations > EDGE_LIMIT) { diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'AcroForm traversal limit reached; count is partial.'); break; }
        const child = document.context.lookup(children.get(i));
        if (child instanceof PDFDict && child.has(PDFName.of('T'))) { hasFields = true; break; }
      }
      if (hasFields) { append(children, current.depth + 1, fieldType); continue; }
    } else if (children) { diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'AcroForm child list could not be inspected.'); }
    const type = document.context.lookup(fieldType);
    if (type instanceof PDFName) {
      count++;
      if (type === PDFName.of('Sig')) diagnosticWarning(diagnostics, 'Signature fields are present; signatures cannot be preserved by a rebuilt output. Export is blocked for this source.');
    }
    else { diagnostics.formsInspected = false; diagnosticWarning(diagnostics, 'AcroForm field type could not be inspected.'); }
  }
  return count;
}

export interface PdfReaderDiagnostics {
  diagnostics: PdfDiagnostics;
  formFieldCount: number | null;
  metadataFields: string[] | null;
  attachmentCount: number | null;
  firstPage: { displayWidth: number; displayHeight: number; userUnit: number; rotation: number } | null;
}

/** Reader APIs return stored information only; this does not execute PDF actions. */
export async function inspectReaderDiagnostics(document: Pick<PDFDocumentProxy, 'getMetadata' | 'getAttachments' | 'getJSActions' | 'getFieldObjects' | 'getPage'>): Promise<PdfReaderDiagnostics> {
  const diagnostics: PdfDiagnostics = {
    complete: false, encrypted: true, securityHandler: null, hasXfa: null, hasXmp: null,
    formsInspected: false, metadataInspected: false, attachmentsInspected: false,
    indicators: [], warnings: ['Raw structural inspection is unavailable for this protected source. Reader diagnostics do not establish structural validity.', 'Reader action indicators cover document JavaScript only; other action types and field/page actions have not been inspected.'],
    scannedObjects: 0, objectLimit: PDF_DIAGNOSTIC_OBJECT_LIMIT, pageDimensions: [],
  };
  const results = await Promise.allSettled([document.getMetadata(), document.getAttachments(), document.getJSActions(), document.getFieldObjects(), document.getPage(1)] as const);
  const [metadata, attachments, actions, fields, page] = results;
  let metadataFields: string[] | null = null;
  if (metadata.status === 'fulfilled') {
    const info = metadata.value.info as Record<string, unknown>;
    diagnostics.securityHandler = typeof info.EncryptFilterName === 'string' ? info.EncryptFilterName.slice(0, 100) : null;
    diagnostics.hasXfa = typeof info.IsXFAPresent === 'boolean' ? info.IsXFAPresent : null;
    diagnostics.hasXmp = metadata.value.metadata ? true : false;
    metadataFields = META.filter((key) => info[key] !== undefined && info[key] !== null && info[key] !== '');
    diagnostics.metadataInspected = true;
  } else diagnosticWarning(diagnostics, 'Reader metadata could not be inspected.');
  let attachmentCount: number | null = null;
  if (attachments.status === 'fulfilled') { attachmentCount = attachments.value?.size ?? 0; diagnostics.attachmentsInspected = true; }
  else diagnosticWarning(diagnostics, 'Reader attachments could not be inspected.');
  if (actions.status === 'fulfilled') {
    if (actions.value?.size) diagnostics.indicators.push('JavaScript');
  } else diagnosticWarning(diagnostics, 'Reader JavaScript indicators could not be inspected.');
  let formFieldCount: number | null = null;
  if (fields.status === 'fulfilled') { formFieldCount = fields.value ? Object.keys(fields.value).length : 0; diagnostics.formsInspected = true; }
  else diagnosticWarning(diagnostics, 'Reader form fields could not be inspected.');
  let firstPage: PdfReaderDiagnostics['firstPage'] = null;
  if (page.status === 'fulfilled') {
    try {
      const viewport = page.value.getViewport({ scale: 1 });
      if (![viewport.width, viewport.height, page.value.userUnit, page.value.rotate].every(Number.isFinite)) throw new Error('Invalid page dimensions');
      firstPage = { displayWidth: viewport.width, displayHeight: viewport.height, userUnit: page.value.userUnit, rotation: page.value.rotate };
    } catch { diagnosticWarning(diagnostics, 'Reader page dimensions could not be inspected.'); }
    finally { page.value.cleanup(); }
  } else diagnosticWarning(diagnostics, 'Reader page dimensions could not be inspected.');
  return { diagnostics, formFieldCount, metadataFields, attachmentCount, firstPage };
}
