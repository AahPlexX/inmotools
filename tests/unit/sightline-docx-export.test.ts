/**
 * Word export tests.
 *
 * The interesting claim about the Word exporter is that both reading treatments
 * survive inside the package itself: the weighting becomes real bold runs and
 * the trail gradient becomes real run colours, rather than an image or a
 * stylesheet that Word would drop. Each test therefore reopens the produced
 * bytes and checks the reading stream, then looks at the markup Word will
 * actually render.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocxBytes, DEFAULT_DOCX_EXPORT, type DocxTreatment } from '../../src/tools/sightline/export-docx';
import { draftFromModel, exportFileName } from '../../src/tools/sightline/metadata-studio';
import { ingestDocx } from '../../src/tools/sightline/docx-ingest';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';
import { planExport, describeExports, EXPORT_DEFINITIONS, type ExportInputs } from '../../src/tools/sightline/export-plan';
import { DEFAULT_HTML_EXPORT } from '../../src/tools/sightline/export-html';
import { DEFAULT_PDF_EXPORT } from '../../src/tools/sightline/export-pdf';
import { DEFAULT_EPUB_EXPORT } from '../../src/tools/sightline/export-epub';
import { createDefaultState } from '../../src/tools/sightline/sightline-store';
import type { DocumentModel } from '../../src/tools/sightline/sightline-types';

const model = (): DocumentModel => {
  const built = buildDocumentModel({
    format: 'markdown',
    fileName: 'reading-notes.md',
    byteLength: 2048,
    paragraphs: [
      { kind: 'heading', level: 1, text: 'Findings' },
      { kind: 'body', level: 0, text: 'Reading is a skill that responds to practice, and pacing changes the task.' },
      { kind: 'body', level: 0, text: 'Comprehension was checked after each passage with short questions.' },
      { kind: 'heading', level: 2, text: 'Methods' },
      { kind: 'body', level: 0, text: 'Participants read passages at fixed rates with sentence pauses in place.' },
    ],
  });
  return { ...built, metadata: { ...built.metadata, title: 'Reading Notes', author: 'Dana Reader' } };
};

const documentXml = async (bytes: Uint8Array): Promise<string> => {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml is missing from the package.');
  return file.async('string');
};

const readingText = async (bytes: Uint8Array): Promise<string> => {
  const structure = await ingestDocx(bytes, 'reading-notes.docx');
  return structure.paragraphs.map((paragraph) => paragraph.text).join(' ').trim();
};

const expectedText = (source: DocumentModel): string =>
  source.paragraphs.map((paragraph) => paragraph.text).join(' ').trim();

const treatments: readonly DocxTreatment[] = ['plain', 'emphasis', 'gradient', 'emphasis-gradient'];

describe('Word export package', () => {
  it('writes a WordprocessingML package with the document part', async () => {
    const result = await buildDocxBytes(model(), draftFromModel(model()), DEFAULT_DOCX_EXPORT);
    const zip = await JSZip.loadAsync(result.bytes);
    const names = Object.keys(zip.files);
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('word/document.xml');
    expect(result.fileName).toBe('reading-notes-weighted.docx');
  });

  it.each(treatments)('keeps the reading stream intact for the %s treatment', async (treatment) => {
    const source = model();
    const result = await buildDocxBytes(source, draftFromModel(source), { ...DEFAULT_DOCX_EXPORT, treatment });
    expect(await readingText(result.bytes)).toBe(expectedText(source));
  });

  it('writes the weighting as real bold runs', async () => {
    const result = await buildDocxBytes(model(), draftFromModel(model()), { ...DEFAULT_DOCX_EXPORT, treatment: 'emphasis' });
    const xml = await documentXml(result.bytes);
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:b w:val="false"/>');
    expect(xml).not.toMatch(/<w:color w:val="[0-9A-F]{6}"\/>/);
  });

  it('writes the trail gradient as run colours drawn from the palette', async () => {
    const result = await buildDocxBytes(model(), draftFromModel(model()), { ...DEFAULT_DOCX_EXPORT, treatment: 'gradient' });
    const xml = await documentXml(result.bytes);
    const colours = new Set(xml.match(/<w:color w:val="([0-9A-F]{6})"\/>/g) ?? []);
    expect(colours.size).toBeGreaterThan(2);
    expect(xml).not.toContain('<w:b/>');
  });

  it('carries both treatments when both are asked for', async () => {
    const result = await buildDocxBytes(model(), draftFromModel(model()), { ...DEFAULT_DOCX_EXPORT, treatment: 'emphasis-gradient' });
    const xml = await documentXml(result.bytes);
    expect(xml).toContain('<w:b/>');
    expect(xml).toMatch(/<w:color w:val="[0-9A-F]{6}"\/>/);
  });

  it('keeps heading levels so the outline survives', async () => {
    const result = await buildDocxBytes(model(), draftFromModel(model()), DEFAULT_DOCX_EXPORT);
    const structure = await ingestDocx(result.bytes, 'reading-notes.docx');
    const headings = structure.paragraphs.filter((paragraph) => paragraph.kind === 'heading');
    expect(headings.map((heading) => heading.text)).toEqual(['Findings', 'Methods']);
    expect(headings.map((heading) => heading.level)).toEqual([1, 2]);
  });

  it('writes the studio metadata into the Word core properties', async () => {
    const source = model();
    const draft = { ...draftFromModel(source), description: 'A study of paced reading.', tags: ['reading', 'pacing'], publisher: 'Local Press' };
    const result = await buildDocxBytes(source, draft, DEFAULT_DOCX_EXPORT);
    const structure = await ingestDocx(result.bytes, 'reading-notes.docx');
    expect(structure.metadata.title).toBe('Reading Notes');
    expect(structure.metadata.author).toBe('Dana Reader');
    expect(structure.metadata.subject).toBe('A study of paced reading.');
    expect(structure.metadata.keywords).toEqual(['reading', 'pacing']);
  });

  it('survives accented letters and typographic punctuation', async () => {
    const built = buildDocumentModel({
      format: 'text',
      fileName: 'notes.txt',
      byteLength: 200,
      paragraphs: [
        { kind: 'body', level: 0, text: 'Café “reading” — déjà vu, naïve coöperate; 42 % faster.' },
      ],
    });
    const source: DocumentModel = { ...built, metadata: { ...built.metadata, title: 'Café Notes' } };
    const result = await buildDocxBytes(source, draftFromModel(source), { ...DEFAULT_DOCX_EXPORT, treatment: 'emphasis-gradient' });
    expect(await readingText(result.bytes)).toBe(expectedText(source));
  });

  it('applies the requested line spacing and tracking', async () => {
    const source = model();
    const result = await buildDocxBytes(source, draftFromModel(source), { ...DEFAULT_DOCX_EXPORT, lineSpacing: 2, extraTracking: 0.05 });
    const xml = await documentXml(result.bytes);
    // Word measures line spacing in twentieths of a point and letter spacing in
    // twentieths of a point per character.
    expect(xml).toContain('w:line="480"');
    expect(xml).toMatch(/<w:spacing w:val="1"\/>/);
  });

  it('leaves a single unnamed section without a synthetic heading', async () => {
    const built = buildDocumentModel({
      format: 'text',
      fileName: 'notes.txt',
      byteLength: 200,
      paragraphs: [{ kind: 'body', level: 0, text: 'A letter with no headings anywhere in it at all.' }],
    });
    const source: DocumentModel = { ...built, metadata: { ...built.metadata, title: 'Letter' } };
    const result = await buildDocxBytes(source, draftFromModel(source), DEFAULT_DOCX_EXPORT);
    const structure = await ingestDocx(result.bytes, 'letter.docx');
    expect(structure.paragraphs.every((paragraph) => paragraph.kind !== 'heading')).toBe(true);
    expect(await readingText(result.bytes)).toBe(expectedText(source));
  });

  it('adds a heading for a chapter that has none of its own', async () => {
    const built = buildDocumentModel({
      format: 'text',
      fileName: 'report.txt',
      byteLength: 180,
      paragraphs: [
        { kind: 'body', level: 0, text: 'The body starts immediately with no heading of its own.' },
        { kind: 'body', level: 0, text: 'A second paragraph follows the first.' },
        { kind: 'body', level: 0, text: 'A third paragraph opens the second part of the report.' },
      ],
      chapters: [
        { title: 'Opening', level: 1, paragraphIndex: 0 },
        { title: 'Closing', level: 1, paragraphIndex: 2 },
      ],
    });
    const source: DocumentModel = { ...built, metadata: { ...built.metadata, title: 'Report' } };
    const result = await buildDocxBytes(source, draftFromModel(source), { ...DEFAULT_DOCX_EXPORT, includeChapterHeadings: true });
    const structure = await ingestDocx(result.bytes, 'report.docx');
    const headings = structure.paragraphs.filter((paragraph) => paragraph.kind === 'heading');
    expect(headings.map((heading) => heading.text)).toEqual(['Opening', 'Closing']);
  });

  it('names the file from the metadata title', async () => {
    const source = model();
    const draft = draftFromModel(source);
    expect(exportFileName(draft, 'weighted', 'docx')).toBe('reading-notes-weighted.docx');
    const result = await buildDocxBytes(source, draft, DEFAULT_DOCX_EXPORT);
    expect(result.fileName).toBe(exportFileName(draft, 'weighted', 'docx'));
  });
});

describe('Word export in the export plan', () => {
  const inputs = (source?: DocumentModel): ExportInputs => ({
    ...(source ? { model: source } : {}),
    draft: draftFromModel(source ?? model()),
    html: DEFAULT_HTML_EXPORT,
    pdf: DEFAULT_PDF_EXPORT,
    epub: DEFAULT_EPUB_EXPORT,
    docx: DEFAULT_DOCX_EXPORT,
    sessions: [],
    documents: [],
    vocabulary: [],
    state: createDefaultState(),
  });

  it('is listed among the offered exports', () => {
    const entry = EXPORT_DEFINITIONS.find((definition) => definition.id === 'weighted-docx');
    expect(entry?.extension).toBe('docx');
    expect(entry?.mediaType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(entry?.needsDocument).toBe(true);
  });

  it('renders through the plan with the weighted name', async () => {
    const source = model();
    const planned = await planExport('weighted-docx', inputs(source));
    expect(planned.fileName).toBe('reading-notes-weighted.docx');
    expect(planned.bytes.byteLength).toBeGreaterThan(1000);
    expect(await readingText(planned.bytes)).toBe(expectedText(source));
  });

  it('reports why the export is unavailable with no document open', async () => {
    const described = describeExports(undefined, inputs());
    const row = described.find((entry) => entry.id === 'weighted-docx');
    expect(row?.available).toBe(false);
    expect(row?.note).toContain('Open a document');
    await expect(planExport('weighted-docx', inputs())).rejects.toThrow('needs a document');
  });

  it('summarises the Word export by word count when a document is open', () => {
    const source = model();
    const described = describeExports(source, inputs(source));
    const row = described.find((entry) => entry.id === 'weighted-docx');
    expect(row?.available).toBe(true);
    expect(row?.note).toContain(source.metrics.words.toLocaleString('en-US'));
  });
});
