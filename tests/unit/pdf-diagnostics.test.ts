import { PDFDocument, PDFName, PDFNull, PDFNumber, PDFRef, PDFString, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { inspectPdf, splicePdfs } from '../../src/tools/pdf/pdf-engine';
import { inspectDocumentDiagnostics, inspectFormFieldCount, inspectReaderDiagnostics } from '../../src/tools/pdf/pdf-diagnostics';

async function specimen() {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([300, 200]);
  return document;
}
const bytes = async (document: PDFDocument) => new Uint8Array(await document.save({ useObjectStreams: false, updateFieldAppearances: false }));

describe('PDF-R04 source diagnostics', () => {
  it('treats absent indirect and explicit null optional values as null while refusing missing required geometry', async () => {
    const document = await specimen();
    document.catalog.set(PDFName.of('Names'), PDFNull);
    document.catalog.set(PDFName.of('AcroForm'), PDFNull);
    document.catalog.set(PDFName.of('Metadata'), PDFRef.of(999));
    document.catalog.set(PDFName.of('OpenAction'), PDFRef.of(998));
    document.getPage(0).node.set(PDFName.of('UserUnit'), PDFNull);
    const inspection = await inspectPdf(await bytes(document));
    expect(inspection.diagnostics).toMatchObject({ complete: true, hasXfa: false, hasXmp: false, indicators: [], warnings: [] });
    expect(inspection.formFieldCount).toBe(0);
    expect(inspection.attachments).toEqual([]);
    document.getPage(0).node.set(PDFName.of('MediaBox'), PDFRef.of(997));
    await expect(inspectPdf(await bytes(document))).rejects.toThrow(/unreadable required page geometry/);
  });
  it.each([false, true])('accepts diagnostics after flattening a source form (authored replacement: %s)', async (authored) => {
    const document = await specimen();
    const field = document.getForm().createTextField('source.name');
    field.addToPage(document.getPage(0), { x: 20, y: 120, width: 150, height: 24 });
    field.setText('Source value');
    const source = new Uint8Array(await document.save());
    const output = await splicePdfs([{ bytes: source, flatten: true }], {
      formFields: authored ? [{ type: 'text', name: 'replacement.note', page: 1, x: 20, y: 30, width: 150, height: 24, value: 'Reviewed' }] : [],
    });
    const inspected = await inspectPdf(output);
    expect(inspected.diagnostics.warnings).toEqual([]);
    expect(inspected.diagnostics.complete).toBe(true);
    expect(inspected.formFieldCount).toBe(authored ? 1 : 0);
  });
  it('leaves parsed forms and XFA untouched and makes scan limits explicit', async () => {
    const document = await specimen();
    document.getForm().createTextField('owned-field');
    const form = document.catalog.lookup(PDFName.of('AcroForm'));
    form.set(PDFName.of('XFA'), document.context.obj(['template', 'owned inert XFA']));
    const before = document.context.enumerateIndirectObjects().length;
    const diagnostics = inspectDocumentDiagnostics(document);
    expect(inspectFormFieldCount(document, diagnostics)).toBe(1);
    expect(form.has(PDFName.of('XFA'))).toBe(true);
    expect(document.context.enumerateIndirectObjects()).toHaveLength(before);
    const limited = inspectDocumentDiagnostics(document, 2);
    expect(limited.complete).toBe(false);
    expect(limited.scannedObjects).toBeLessThanOrEqual(2);
    expect(limited.warnings.join(' ')).toMatch(/limit|partial/);
  });

  it('terminates malformed form parent cycles and blocks their field-detail inspection', async () => {
    const document = await specimen();
    const field = document.getForm().createTextField('owned-field');
    field.acroField.dict.set(PDFName.of('Parent'), field.ref);
    const diagnostics = inspectDocumentDiagnostics(document);
    expect(inspectFormFieldCount(document, diagnostics)).toBe(1);
    expect(diagnostics.formsInspected).toBe(false);
    expect(diagnostics.warnings.join(' ')).toMatch(/cyclic.*parent/i);
  });

  it('uses actual reader information for protected sources and retains unknowns when a getter fails', async () => {
    const reader = {
      getMetadata: async () => ({ info: { EncryptFilterName: 'Standard', IsXFAPresent: false, Title: 'owned' }, metadata: null }),
      getAttachments: async () => new Map([['owned.txt', {}]]),
      getJSActions: async () => new Map([['OpenAction', ['owned inert code']]]),
      getFieldObjects: async () => ({ 'owned-field': [{}] }),
      getPage: async () => ({ getViewport: () => ({ width: 300, height: 400 }), userUnit: 2, rotate: 90, cleanup: () => undefined }),
    };
    const inspected = await inspectReaderDiagnostics(reader);
    expect(inspected).toMatchObject({ attachmentCount: 1, formFieldCount: 1, metadataFields: ['Title'], firstPage: { displayWidth: 300, displayHeight: 400 }, diagnostics: { encrypted: true, complete: false, securityHandler: 'Standard', indicators: ['JavaScript'] } });
    reader.getAttachments = async () => { throw new Error('owned unavailable inventory'); };
    expect((await inspectReaderDiagnostics(reader)).attachmentCount).toBeNull();
  });
  it('reports complete plain-source diagnostics without inventing forms or changing source bytes', async () => {
    const document = await specimen(); const source = await bytes(document); const original = source.slice();
    const inspection = await inspectPdf(source);
    expect(inspection.diagnostics).toMatchObject({ complete: true, encrypted: false, hasXfa: false, hasXmp: false, indicators: [], warnings: [] });
    expect(inspection.formFieldCount).toBe(0);
    expect(source).toEqual(original);
  });

  it('captures XFA before form getters and distinguishes rotated UserUnit display size from raw boxes', async () => {
    const document = await specimen(); const page = document.getPage(0);
    page.setCropBox(20, 30, 200, 150); page.setRotation(degrees(90)); page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    document.getForm().createTextField('owned-field');
    document.catalog.lookup(PDFName.of('AcroForm')).set(PDFName.of('XFA'), document.context.obj(['template', 'owned inert XFA']));
    const inspection = await inspectPdf(await bytes(document));
    expect(inspection.diagnostics.hasXfa).toBe(true);
    expect(inspection.pages[0]).toMatchObject({ width: 300, height: 200 });
    expect(inspection.diagnostics.pageDimensions[0]).toMatchObject({ userUnit: 2, displayWidth: 300, displayHeight: 400 });
    expect(inspection.formFieldCount).toBe(1);
  });

  it('inventories stored script and external-action indicators without executing source content', async () => {
    const document = await specimen();
    document.catalog.set(PDFName.of('OpenAction'), document.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of('globalThis.__ownedPdfAction = true') }));
    document.getPage(0).node.set(PDFName.of('AA'), document.context.obj({ O: { S: 'Launch', F: PDFString.of('owned inert target') } }));
    const inspection = await inspectPdf(await bytes(document));
    expect(inspection.diagnostics.indicators).toEqual(expect.arrayContaining(['JavaScript', 'Launch', 'OpenAction', 'Additional actions']));
    expect((globalThis as Record<string, unknown>).__ownedPdfAction).toBeUndefined();
  });

  it('keeps readable pages when optional Names is malformed and marks inspection incomplete', async () => {
    const document = await specimen(); document.catalog.set(PDFName.of('Names'), PDFString.of('owned malformed optional structure'));
    const inspection = await inspectPdf(await bytes(document));
    expect(inspection.pageCount).toBe(1);
    expect(inspection.diagnostics.complete).toBe(false);
    expect(inspection.diagnostics.warnings.join(' ')).toMatch(/attachment.*could not|names.*dictionary/i);
    await expect(splicePdfs([{ bytes: await bytes(document) }])).rejects.toThrow(/diagnostics.*incomplete/i);
  });

  it('reports invalid optional page boxes and units without opaque parser type errors', async () => {
    const document = await specimen();
    document.getPage(0).node.set(PDFName.of('CropBox'), PDFString.of('owned malformed crop box'));
    document.getPage(0).node.set(PDFName.of('UserUnit'), PDFNumber.of(-2));
    const inspected = await inspectPdf(await bytes(document));
    expect(inspected.diagnostics.complete).toBe(false);
    expect(inspected.diagnostics.warnings.join(' ')).toMatch(/CropBox/);
    expect(inspected.diagnostics.warnings.join(' ')).toMatch(/UserUnit/);
    expect(inspected.diagnostics.pageDimensions[0]).toMatchObject({ userUnit: 1, displayWidth: 300, displayHeight: 200 });
  });

  it('reports recovered malformed indirect objects rather than claiming a clean structural scan', async () => {
    const document = await specimen(); const source = await bytes(document);
    const suffix = new TextEncoder().encode('\n99 0 obj\n<< /Malformed ] >>\nendobj\n');
    const input = new Uint8Array(source.length + suffix.length); input.set(source); input.set(suffix, source.length);
    const inspection = await inspectPdf(input);
    expect(inspection.pageCount).toBe(1);
    expect(inspection.diagnostics.complete).toBe(false);
    expect(inspection.diagnostics.warnings.join(' ')).toMatch(/malformed.*object|invalid.*object/i);
  });
});
