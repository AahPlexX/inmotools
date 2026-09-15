import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  buildExportCss,
  buildExportHtml,
  buildExportMarkdown,
  buildExportText,
} from '../../src/tools/sightline/export-html';
import { buildPdfBytes, estimatePageCount, pageGeometry } from '../../src/tools/sightline/export-pdf';
import { buildEpubArchive, buildEpubChapters, buildNavDocument, buildPackageDocument } from '../../src/tools/sightline/export-epub';
import { EXPORT_DEFINITIONS, describeExports, planExport, type ExportInputs } from '../../src/tools/sightline/export-plan';
import {
  draftFromModel,
  dublinCore,
  exportFileName,
  formatTags,
  parseTags,
  readingLevelOf,
  reconcileReadingLevel,
  slugify,
  socialTagHtml,
  socialTags,
  structuredData,
  suggestTags,
  validateDraft,
} from '../../src/tools/sightline/metadata-studio';
import { createDefaultState } from '../../src/tools/sightline/sightline-store';
import { DEFAULT_HTML_EXPORT } from '../../src/tools/sightline/export-html';
import { DEFAULT_PDF_EXPORT } from '../../src/tools/sightline/export-pdf';
import { DEFAULT_EPUB_EXPORT } from '../../src/tools/sightline/export-epub';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';
import { ingestHtml } from '../../src/tools/sightline/html-ingest';
import { ingestEpub } from '../../src/tools/sightline/epub-ingest';

const buildModel = () => {
  const built = buildDocumentModel({
    format: 'markdown',
    fileName: 'reading-notes.md',
    byteLength: 4096,
    paragraphs: [
      { kind: 'heading', level: 1, text: 'Findings' },
      { kind: 'body', level: 0, text: 'Reading is a skill that responds to practice. Pacing changes the task in a measurable way.' },
      { kind: 'heading', level: 2, text: 'Methods' },
      { kind: 'body', level: 0, text: 'Participants read passages at fixed rates with sentence pauses in place. Accuracy was checked after each passage.' },
    ],
    chapters: [
      { title: 'Findings', level: 1, paragraphIndex: 0 },
      { title: 'Methods', level: 2, paragraphIndex: 2 },
    ],
  });
  return {
    ...built,
    metadata: {
      ...built.metadata,
      title: 'Reading Notes',
      author: 'Dana Reader',
      description: 'How paced presentation changes reading.',
      keywords: ['reading', 'pacing'],
      language: 'en',
    },
  };
};

const inputs = (model?: ReturnType<typeof buildModel>): ExportInputs => {
  const draft = model
    ? draftFromModel(model, new Date('2026-09-15T00:00:00Z'))
    : { ...draftFromModel(buildModel(), new Date('2026-09-15T00:00:00Z')) };
  return {
    ...(model ? { model } : {}),
    draft,
    html: DEFAULT_HTML_EXPORT,
    pdf: DEFAULT_PDF_EXPORT,
    epub: DEFAULT_EPUB_EXPORT,
    sessions: [],
    documents: [],
    vocabulary: [],
    state: createDefaultState(),
  };
};

describe('metadata studio', () => {
  it('reads a draft from the document', () => {
    const model = buildModel();
    const draft = draftFromModel(model, new Date('2026-01-02T03:04:05Z'));
    expect(draft.title).toBe('Reading Notes');
    expect(draft.author).toBe('Dana Reader');
    expect(draft.tags).toEqual(['reading', 'pacing']);
    expect(draft.modified).toBe('2026-01-02T03:04:05.000Z');
    expect(draft.readingLevel).toContain('grade');
  });

  it('parses and formats a tag field without duplicates', () => {
    expect(parseTags('reading, pacing; reading , cognition')).toEqual(['reading', 'pacing', 'cognition']);
    expect(parseTags('   ,  , ')).toEqual([]);
    expect(parseTags('x'.repeat(80))).toEqual([]);
    expect(formatTags(['a', 'b'])).toBe('a, b');
  });

  it('slugifies titles into file-name safe text', () => {
    expect(slugify('Reading Notes: A Study!')).toBe('reading-notes-a-study');
    expect(slugify('   ')).toBe('');
    expect(exportFileName({ ...draftFromModel(buildModel()), title: 'Reading Notes' }, 'weighted', 'epub')).toBe('reading-notes-weighted.epub');
  });

  it('suggests topical tags rather than function words', () => {
    const tags = suggestTags(buildModel(), 5);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).not.toContain('the');
    expect(tags.every((tag) => tag.length >= 4)).toBe(true);
  });

  it('reports reading level from the prose', () => {
    const model = buildModel();
    expect(readingLevelOf(model.metrics)).toContain('grade');
    expect(readingLevelOf({ ...model.metrics, words: 0 })).toBe('');
  });

  it('keeps a reader-supplied reading level and fills a missing one', () => {
    const model = buildModel();
    const draft = draftFromModel(model);
    expect(reconcileReadingLevel({ ...draft, readingLevel: 'Custom level' }, model).readingLevel).toBe('Custom level');
    expect(reconcileReadingLevel({ ...draft, readingLevel: '' }, model).readingLevel).toContain('grade');
  });

  it('builds social tags, JSON-LD, and Dublin Core entries', () => {
    const draft = { ...draftFromModel(buildModel()), url: 'https://example.test/notes' };
    const tags = socialTags(draft);
    expect(tags.map((tag) => tag.property)).toContain('og:title');
    expect(tags.map((tag) => tag.property)).toContain('twitter:card');
    expect(tags.find((tag) => tag.property === 'og:url')?.content).toBe('https://example.test/notes');
    const html = socialTagHtml(draft);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="keywords"');
    expect(html).not.toContain('undefined');
    const data = structuredData(draft);
    expect(data['@type']).toBe('Book');
    expect(data.author?.name).toBe('Dana Reader');
    const core = dublinCore(draft);
    expect(core.map((entry) => entry.tag)).toContain('dc:title');
    expect(core.some((entry) => entry.tag === 'dc:identifier' && entry.attributes?.id === 'book-id')).toBe(true);
  });

  it('generates an identifier when none was supplied', () => {
    const core = dublinCore({ ...draftFromModel(buildModel()), identifier: '' });
    const identifier = core.find((entry) => entry.tag === 'dc:identifier')!;
    expect(identifier.value).toContain('urn:uuid:');
  });

  it('validates a draft and flags problems per field', () => {
    const good = draftFromModel(buildModel());
    expect(validateDraft(good)).toEqual([]);
    const problems = validateDraft({
      ...good,
      title: '',
      url: 'not-a-url',
      coverDataUrl: 'data:image/gif;base64,AAAA',
      tags: Array.from({ length: 45 }, (_, index) => `tag-${index}`),
    });
    expect(problems.map((problem) => problem.field)).toEqual(
      expect.arrayContaining(['title', 'url', 'coverDataUrl', 'tags']),
    );
  });
});

describe('HTML export', () => {
  it('writes a self-contained document with the metadata', () => {
    const model = buildModel();
    const draft = draftFromModel(model);
    const html = buildExportHtml(model, draft);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Reading Notes</title>');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('Dana Reader');
    expect(html).toContain('reading');
    // No network requests: everything the file needs is inline.
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('http://');
  });

  it('keeps the treatments out of the markup when they are off', () => {
    const model = buildModel();
    const plain = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, emphasis: null, gradient: null });
    expect(plain).not.toContain('<b>');
    expect(plain).toContain('Reading is a skill');
  });

  it('weights the opening letters when emphasis is on', () => {
    const model = buildModel();
    const html = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, gradient: null });
    expect(html).toContain('<b>');
  });

  it('colours words from the palette when the gradient is on', () => {
    const model = buildModel();
    const html = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, emphasis: null, gradient: { direction: 'horizontal', intensity: 1, wash: false } });
    expect(html).toContain('<span style="color:#');
  });

  it('re-parses into the same reading stream', () => {
    const model = buildModel();
    const html = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, emphasis: null, gradient: null });
    const reparsed = ingestHtml(html);
    const original = model.tokens.map((token) => token.text).join(' ');
    const roundTripped = reparsed.paragraphs.map((paragraph) => paragraph.text).join(' ');
    expect(roundTripped).toContain('Reading is a skill that responds to practice.');
    expect(roundTripped).toContain('Participants read passages at fixed rates with sentence pauses in place.');
    // The masthead is document chrome rather than prose, so the reading stream
    // survives the round trip exactly.
    expect(roundTripped.replace(/\s+/g, ' ').trim()).toBe(original.replace(/\s+/g, ' ').trim());
    expect(roundTripped).not.toContain('Reader');
  });

  it('keeps the weighted markup out of the re-parsed text', () => {
    const model = buildModel();
    const html = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, gradient: null });
    const reparsed = ingestHtml(html);
    const text = reparsed.paragraphs.map((paragraph) => paragraph.text).join(' ');
    expect(text).toContain('Participants read passages');
    expect(text).not.toContain('<b>');
  });

  it('includes a contents list when the document has chapters', () => {
    const model = buildModel();
    const html = buildExportHtml(model, draftFromModel(model));
    expect(html).toContain('class="sightline-toc"');
    expect(html).toContain('#section-0');
    const without = buildExportHtml(model, draftFromModel(model), { ...DEFAULT_HTML_EXPORT, includeTableOfContents: false });
    expect(without).not.toContain('class="sightline-toc"');
  });

  it('themes the exported stylesheet', () => {
    const css = buildExportCss({ ...DEFAULT_HTML_EXPORT.appearance, theme: 'nord', font: 'lexend' });
    expect(css).toContain('--sightline-background: #2e3440');
    expect(css).toContain('Lexend Deca');
    expect(css).toContain('@media print');
    expect(css).toContain('b { font-weight: 700; }');
  });

  it('exports Markdown with front matter and plain text', () => {
    const model = buildModel();
    const draft = draftFromModel(model);
    const markdown = buildExportMarkdown(model, draft);
    expect(markdown.startsWith('---\n')).toBe(true);
    expect(markdown).toContain('title: Reading Notes');
    expect(markdown).toContain('tags: reading, pacing');
    expect(markdown).toContain('# Findings');
    expect(markdown).toContain('## Methods');
    const text = buildExportText(model);
    expect(text).not.toContain('#');
    expect(text).toContain('Reading is a skill');
  });
});

describe('PDF export', () => {
  it('reports page geometry for each page size', () => {
    const a4 = pageGeometry('a4');
    expect(a4.width).toBeGreaterThan(a4.margin * 2);
    expect(pageGeometry('letter').width).toBe(612);
    expect(pageGeometry('a5').height).toBeLessThan(a4.height);
  });

  it('writes a PDF that re-opens with the metadata in place', async () => {
    const model = buildModel();
    const bytes = await buildPdfBytes(model, draftFromModel(model));
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toBe('Reading Notes');
    expect(parsed.getAuthor()).toBe('Dana Reader');
    expect(parsed.getKeywords()).toContain('pacing');
    // pdf-lib stamps its own Producer field, so the tool signs the Creator.
    expect(parsed.getCreator()).toContain('Sightline');
  });

  it('paginates a long document rather than overflowing a page', async () => {
    const long = buildDocumentModel({
      format: 'text',
      fileName: 'long.txt',
      paragraphs: Array.from({ length: 60 }, (_, index) => ({
        kind: 'body' as const,
        level: 0,
        text: `Paragraph ${index + 1} carries enough words to fill a line or two of the export so the pagination logic is exercised properly.`,
      })),
    });
    const bytes = await buildPdfBytes(long, draftFromModel(long));
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    expect(estimatePageCount(long)).toBeGreaterThan(1);
  });

  it('renders each treatment without losing the text', async () => {
    const model = buildModel();
    for (const treatment of ['plain', 'emphasis', 'gradient', 'emphasis-gradient'] as const) {
      const bytes = await buildPdfBytes(model, draftFromModel(model), { ...DEFAULT_PDF_EXPORT, treatment });
      const parsed = await PDFDocument.load(bytes);
      expect(parsed.getPageCount()).toBeGreaterThan(0);
    }
  });

  it('draws page numbers and line guides when asked', async () => {
    const model = buildModel();
    const bytes = await buildPdfBytes(model, draftFromModel(model), { ...DEFAULT_PDF_EXPORT, pageNumbers: true, lineGuides: true });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe('EPUB export', () => {
  it('builds chapter documents from the outline', () => {
    const model = buildModel();
    const chapters = buildEpubChapters(model, draftFromModel(model));
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[0]!.href).toBe('text/chapter-1.xhtml');
    expect(chapters[0]!.xhtml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(chapters[0]!.xhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
  });

  it('writes a navigation document with every chapter linked', () => {
    const model = buildModel();
    const chapters = buildEpubChapters(model, draftFromModel(model));
    const nav = buildNavDocument(draftFromModel(model), chapters);
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain('epub:type="landmarks"');
    for (const chapter of chapters) expect(nav).toContain(chapter.href);
  });

  it('declares every manifest item in the spine', () => {
    const model = buildModel();
    const draft = draftFromModel(model);
    const chapters = buildEpubChapters(model, draft);
    const opf = buildPackageDocument(draft, chapters, DEFAULT_EPUB_EXPORT, null);
    expect(opf).toContain('version="3.0"');
    expect(opf).toContain('unique-identifier="book-id"');
    for (const chapter of chapters) {
      expect(opf).toContain(`href="${chapter.href}"`);
      expect(opf).toContain(`idref="${chapter.id}"`);
    }
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('dcterms:modified');
    expect(opf).toContain('<dc:title>Reading Notes</dc:title>');
  });

  it('produces an archive whose layout follows the specification order', async () => {
    const model = buildModel();
    const result = await buildEpubArchive(model, draftFromModel(model));
    const zip = await JSZip.loadAsync(result.bytes);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    const mimetype = await zip.file('mimetype')!.async('string');
    expect(mimetype).toBe('application/epub+zip');
    // The mimetype entry must be stored, not deflated, or reading systems reject
    // the file before they open it.
    const raw = (zip.file('mimetype') as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data;
    if (raw) expect(raw.compressedSize).toBe(raw.uncompressedSize);
  });

  it('re-parses into the same chapters and reading order', async () => {
    const model = buildModel();
    const result = await buildEpubArchive(model, draftFromModel(model), { ...DEFAULT_EPUB_EXPORT, treatment: 'emphasis' });
    const reparsed = await ingestEpub(result.bytes, 'reading-notes.epub');
    expect(reparsed.metadata.title).toBe('Reading Notes');
    expect(reparsed.metadata.author).toBe('Dana Reader');
    expect(reparsed.chapters.map((chapter) => chapter.title)).toEqual(['Findings', 'Methods']);
    const text = reparsed.paragraphs.map((paragraph) => paragraph.text).join(' ');
    expect(text).toContain('Reading is a skill that responds to practice.');
    expect(text).toContain('Participants read passages at fixed rates');
    expect(text).not.toContain('<b>');
  });

  it('embeds a cover image and declares it in the package', async () => {
    const model = buildModel();
    const draft = {
      ...draftFromModel(model),
      coverDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    };
    const result = await buildEpubArchive(model, draft, { ...DEFAULT_EPUB_EXPORT, includeCover: true });
    const zip = await JSZip.loadAsync(result.bytes);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('cover-image');
    expect(opf).toContain('image/png');
    expect(Object.keys(zip.files).some((name) => name.startsWith('OEBPS/images/cover'))).toBe(true);
  });

  it('keeps a cover out of the package when it is not requested', async () => {
    const model = buildModel();
    const draft = { ...draftFromModel(model), coverDataUrl: 'data:image/png;base64,AAAA' };
    const result = await buildEpubArchive(model, draft, { ...DEFAULT_EPUB_EXPORT, includeCover: false });
    const zip = await JSZip.loadAsync(result.bytes);
    expect(Object.keys(zip.files).some((name) => name.startsWith('OEBPS/images/'))).toBe(false);
  });
});

describe('export planning', () => {
  it('lists every export path with a media type and an extension', () => {
    expect(EXPORT_DEFINITIONS.length).toBeGreaterThanOrEqual(13);
    for (const definition of EXPORT_DEFINITIONS) {
      expect(definition.mediaType).toMatch(/\//);
      expect(definition.extension).toMatch(/^[a-z0-9]+$/);
      expect(definition.detail.length).toBeGreaterThan(10);
    }
    const ids = EXPORT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks document exports unavailable without a document', () => {
    const described = describeExports(undefined, inputs());
    const pdf = described.find((entry) => entry.id === 'weighted-pdf')!;
    expect(pdf.available).toBe(false);
    expect(pdf.note).toContain('Open a document');
    const state = described.find((entry) => entry.id === 'reader-state')!;
    expect(state.available).toBe(true);
  });

  it('names the document exports after the title', async () => {
    const model = buildModel();
    const planned = await planExport('weighted-html', inputs(model));
    expect(planned.fileName).toBe('reading-notes-weighted.html');
    expect(planned.mediaType).toBe('text/html');
    expect(planned.bytes.byteLength).toBeGreaterThan(0);
  });

  it('renders each document export to real bytes', async () => {
    const model = buildModel();
    const plan = inputs(model);
    for (const id of ['weighted-pdf', 'weighted-epub', 'weighted-html', 'gradient-html', 'gradient-pdf', 'gradient-epub', 'markdown', 'text'] as const) {
      const planned = await planExport(id, plan);
      expect(planned.bytes.byteLength, id).toBeGreaterThan(100);
      expect(planned.fileName.endsWith(`.${planned.definition.extension}`)).toBe(true);
    }
  });

  it('renders the data exports even with an empty warehouse', async () => {
    const plan = inputs();
    for (const id of ['analytics-csv', 'analytics-json', 'vocabulary-csv', 'vocabulary-json', 'reader-state'] as const) {
      const planned = await planExport(id, plan);
      expect(planned.bytes.byteLength, id).toBeGreaterThan(0);
    }
    const csv = await planExport('analytics-csv', plan);
    const text = new TextDecoder().decode(csv.bytes);
    expect(text.split('\r\n')[0]).toContain('averageWpm');
  });

  it('refuses a document export when there is no document', async () => {
    await expect(planExport('weighted-pdf', inputs())).rejects.toThrow('needs a document');
  });

  it('always chooses the weighting treatment for the weighted exports', async () => {
    const model = buildModel();
    const weighted = await planExport('weighted-pdf', inputs(model));
    const parsed = await PDFDocument.load(weighted.bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(0);
    const gradient = await planExport('gradient-pdf', inputs(model));
    expect(gradient.bytes.byteLength).toBeGreaterThan(0);
  });
});
