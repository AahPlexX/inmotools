import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { extractPdfAttachments, inspectPdf, splicePdfs } from '../../src/tools/pdf/pdf-engine';

const textBytes = (value: string) => new TextEncoder().encode(value);
const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function onePagePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  return new Uint8Array(await doc.save());
}

async function pdfWithNestedAttachmentNameTree() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  await doc.attach(textBytes('nested evidence'), 'nested.txt', {
    mimeType: 'text/plain',
    description: 'Nested evidence',
    creationDate: new Date('2026-09-12T10:30:00.000Z'),
    modificationDate: new Date('2026-09-12T14:45:00.000Z'),
  });
  const initial = await doc.save();
  const loaded = await PDFDocument.load(initial, { updateMetadata: false });
  const names = loaded.catalog.lookup(PDFName.of('Names'), PDFDict);
  const embeddedFiles = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
  const entries = embeddedFiles.lookup(PDFName.of('Names'), PDFArray);
  const child = loaded.context.obj({ Names: entries });
  const childRef = loaded.context.register(child);
  embeddedFiles.delete(PDFName.of('Names'));
  embeddedFiles.set(PDFName.of('Kids'), loaded.context.obj([childRef]));
  return new Uint8Array(await loaded.save({ updateFieldAppearances: false }));
}

describe('PDF embedded-file attachments', () => {
  it('authors attachments with metadata and reopens their exact bytes', async () => {
    const creationDate = new Date('2026-09-12T10:30:00.000Z');
    const modificationDate = new Date('2026-09-12T14:45:00.000Z');
    const output = await splicePdfs([{ bytes: await onePagePdf() }], {
      attachments: [{
        bytes: textBytes('chain of custody'),
        name: 'evidence.txt',
        mimeType: 'text/plain',
        description: 'Evidence note',
        creationDate,
        modificationDate,
      }],
    });

    const inspected = await inspectPdf(output);
    expect(inspected.attachments).toEqual([expect.objectContaining({
      name: 'evidence.txt',
      mimeType: 'text/plain',
      description: 'Evidence note',
      size: 'chain of custody'.length,
      creationDate,
      modificationDate,
    })]);

    const extracted = await extractPdfAttachments(output);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ name: 'evidence.txt', mimeType: 'text/plain' }));
    expect(textOf(extracted[0].bytes)).toBe('chain of custody');
  });

  it('recursively inventories and extracts attachments stored under name-tree Kids', async () => {
    const bytes = await pdfWithNestedAttachmentNameTree();
    const inspected = await inspectPdf(bytes);
    expect(inspected.attachments).toEqual([expect.objectContaining({
      name: 'nested.txt',
      mimeType: 'text/plain',
      description: 'Nested evidence',
    })]);
    const extracted = await extractPdfAttachments(bytes);
    expect(extracted.map((attachment) => attachment.name)).toEqual(['nested.txt']);
    expect(textOf(extracted[0].bytes)).toBe('nested evidence');
  });

  it('does not silently carry source attachments into rebuilt output', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 200]);
    await source.attach(textBytes('private source attachment'), 'source-private.txt', { mimeType: 'text/plain' });
    const sourceBytes = new Uint8Array(await source.save());
    expect((await inspectPdf(sourceBytes)).attachments).toHaveLength(1);

    const output = await splicePdfs([{ bytes: sourceBytes }]);
    expect((await inspectPdf(output)).attachments).toEqual([]);
  });

  it('rejects blank, duplicate, path-like, and oversized staged attachment names', async () => {
    const source = await onePagePdf();
    await expect(splicePdfs([{ bytes: source }], {
      attachments: [{ bytes: textBytes('x'), name: '   ' }],
    })).rejects.toThrow(/attachment name/i);
    await expect(splicePdfs([{ bytes: source }], {
      attachments: [
        { bytes: textBytes('a'), name: 'same.txt' },
        { bytes: textBytes('b'), name: 'same.txt' },
      ],
    })).rejects.toThrow(/duplicate attachment name/i);
    await expect(splicePdfs([{ bytes: source }], {
      attachments: [{ bytes: textBytes('x'), name: '../escape.txt' }],
    })).rejects.toThrow(/path separators|path segments/i);
    await expect(splicePdfs([{ bytes: source }], {
      attachments: [{ bytes: textBytes('x'), name: `${'a'.repeat(256)}.txt` }],
    })).rejects.toThrow(/255/i);
  });
});
