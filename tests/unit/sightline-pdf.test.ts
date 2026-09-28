import { describe, expect, it } from 'vitest';
import {
  buildPdfStructure,
  groupPageIntoLines,
  ingestPdf,
  pdfStructureMetrics,
  reconstructPdfParagraphs,
} from '../../src/tools/sightline/pdf-ingest';
import type { PdfExtraction, PdfPageText, PdfTextItem } from '../../src/tools/sightline/sightline-types';

const item = (str: string, x: number, y: number, height = 12, fontName = 'Body', width?: number): PdfTextItem => ({
  str,
  x,
  y,
  width: width ?? str.length * height * 0.5,
  height,
  fontName,
});

/** A paragraph is a run of lines with the same x origin and even vertical steps. */
const paragraphItems = (lines: readonly string[], x: number, top: number, height = 12, leading = 16): PdfTextItem[] =>
  lines.flatMap((line, index) => {
    const parts = line.split(' ');
    let cursor = x;
    return parts.map((part, partIndex) => {
      const width = part.length * height * 0.5;
      const built = item(partIndex === parts.length - 1 ? part : `${part} `, cursor, top - index * leading, height, 'Body', width);
      cursor += width;
      return built;
    });
  });

const page = (pageNumber: number, items: readonly PdfTextItem[], width = 612, height = 792): PdfPageText => ({
  pageNumber,
  width,
  height,
  items,
});

describe('PDF line grouping', () => {
  it('merges items that share a baseline into one line in reading order', () => {
    const { left } = groupPageIntoLines(page(1, [
      item('Second', 120, 700),
      item('First', 72, 700),
      item('Third', 200, 700),
    ]));
    expect(left).toHaveLength(1);
    expect(left[0]!.text).toBe('First Second Third');
  });

  it('keeps items within the y tolerance on the same line', () => {
    const { left } = groupPageIntoLines(page(1, [item('alpha', 72, 700), item('beta', 72, 701.2)]));
    expect(left).toHaveLength(1);
  });

  it('splits a two-column page into left and right flows', () => {
    const { left, right } = groupPageIntoLines(page(1, [
      ...paragraphItems(['Left column line one here.', 'Left column line two here.'], 72, 700),
      ...paragraphItems(['Right column line one here.', 'Right column line two here.'], 340, 700),
    ]));
    expect(left.map((line) => line.text)).toEqual(['Left column line one here.', 'Left column line two here.']);
    expect(right.map((line) => line.text)).toEqual(['Right column line one here.', 'Right column line two here.']);
  });

  it('is not fooled by a wide single-column page', () => {
    const { left, right } = groupPageIntoLines(page(1, [
      item('A single wide line that spans most of the measure of the page.', 72, 700),
      item('Another single wide line that also spans the measure of it.', 72, 684),
    ]));
    expect(right).toHaveLength(0);
    expect(left).toHaveLength(2);
  });
});

describe('PDF paragraph reconstruction', () => {
  it('joins wrapped lines into one paragraph and separates blocks at wide gaps', () => {
    const items = [
      ...paragraphItems(['The first paragraph starts here and', 'continues on the next line of the page.'], 72, 700),
      ...paragraphItems(['A second paragraph after a wider gap in the flow.'], 72, 620),
    ];
    const result = reconstructPdfParagraphs(page(1, items));
    expect(result.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'The first paragraph starts here and continues on the next line of the page.',
      'A second paragraph after a wider gap in the flow.',
    ]);
  });

  it('dehyphenates a word broken across lines', () => {
    const result = reconstructPdfParagraphs(page(1, [
      ...paragraphItems(['A long consider-', 'ation of pacing follows.'], 72, 700),
    ]));
    expect(result.paragraphs[0]!.text).toBe('A long consideration of pacing follows.');
  });

  it('marks larger text as a heading', () => {
    const result = reconstructPdfParagraphs(page(1, [
      ...paragraphItems(['Chapter Heading'], 72, 740, 20, 24),
      ...paragraphItems(['Body text below the heading runs on for a while.'], 72, 700, 12, 16),
    ]));
    expect(result.paragraphs[0]!.kind).toBe('heading');
    expect(result.paragraphs[0]!.level).toBeGreaterThan(0);
    expect(result.paragraphs[1]!.kind).toBe('body');
  });

  it('keeps each column of a two-column page as its own paragraph flow', () => {
    const result = reconstructPdfParagraphs(page(1, [
      ...paragraphItems(['Left column text runs down the page here.', 'Left column second line.'], 72, 700),
      ...paragraphItems(['Right column text runs down the page here.', 'Right column second line.'], 340, 700),
    ]));
    expect(result.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Left column text runs down the page here. Left column second line.',
      'Right column text runs down the page here. Right column second line.',
    ]);
  });

  it('reports pages that yield almost no extractable text', () => {
    const result = reconstructPdfParagraphs(page(1, [item('x', 72, 700)]));
    expect(result.characterCount).toBeLessThan(40);
    expect(result.diagnostic?.level).toBe('warning');
    expect(result.diagnostic?.code).toBe('pdf-page-text');
    expect(result.diagnostic?.detail).toContain('no OCR in this release');
  });

  it('sorts lines top-down regardless of the order items arrive in', () => {
    const result = reconstructPdfParagraphs(page(1, [
      ...paragraphItems(['Second line of the flow.'], 72, 660),
      ...paragraphItems(['First line of the flow.'], 72, 700),
    ]));
    expect(result.paragraphs[0]!.text.startsWith('First line')).toBe(true);
  });
});

const extraction: PdfExtraction = {
  pages: [
    page(1, [
      ...paragraphItems(['Chapter One'], 72, 740, 20, 26),
      ...paragraphItems(['The opening paragraph of the first page of this document.'], 72, 690),
      ...paragraphItems(['A second paragraph on the same page, further down the flow.'], 72, 640),
    ]),
    page(2, [
      ...paragraphItems(['Chapter Two'], 72, 740, 20, 26),
      ...paragraphItems(['The opening paragraph of the second page of this document.'], 72, 690),
    ]),
  ],
  metadata: { Title: 'A Paced Study', Author: 'Dana Reader', Subject: 'Reading', Keywords: 'reading; pace' },
  outline: [
    { title: 'Chapter One', pageNumber: 1, depth: 1 },
    { title: 'Chapter Two', pageNumber: 2, depth: 1 },
  ],
};

describe('PDF structure assembly', () => {
  it('uses the outline for chapters and keeps them out of the reading stream', () => {
    const structure = buildPdfStructure(extraction, 'study.pdf');
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(structure.chapters.map((chapter) => chapter.page)).toEqual([1, 2]);
  });

  it('falls back to detected headings when no outline exists', () => {
    const structure = buildPdfStructure({ ...extraction, outline: [] }, 'study.pdf');
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'pdf-heading-outline')).toBe(true);
  });

  it('copies information-dictionary metadata into the model metadata', () => {
    const structure = buildPdfStructure(extraction, 'study.pdf');
    expect(structure.metadata.title).toBe('A Paced Study');
    expect(structure.metadata.author).toBe('Dana Reader');
    expect(structure.metadata.keywords).toEqual(['reading', 'pace']);
  });

  it('records a per-page character count so thin pages can be reported', () => {
    const structure = buildPdfStructure(extraction, 'study.pdf');
    expect(structure.pageCount).toBe(2);
    expect(structure.pageCharacterCounts).toHaveLength(2);
    expect(structure.pageCharacterCounts[0]).toBeGreaterThan(40);
  });

  it('builds a title from the file name when the PDF carries none', () => {
    const structure = buildPdfStructure({ ...extraction, metadata: {} }, 'no-title.pdf');
    expect(structure.metadata.title).toBe('no-title');
  });

  it('runs the injected extractor and returns a structure', async () => {
    let received: Uint8Array | null = null;
    const structure = await ingestPdf(new Uint8Array([1, 2, 3]), 'study.pdf', {
      extract: async (data) => {
        received = data;
        return extraction;
      },
    });
    expect(received).not.toBeNull();
    expect(structure.pageCount).toBe(2);
    expect(structure.paragraphs.length).toBeGreaterThan(0);
  });

  it('propagates extractor failures to the caller', async () => {
    await expect(ingestPdf(new Uint8Array([]), 'broken.pdf', {
      extract: async () => {
        throw new Error('password protected');
      },
    })).rejects.toThrow('password protected');
  });

  it('computes prose metrics over the reconstructed text', () => {
    const metrics = pdfStructureMetrics(buildPdfStructure(extraction, 'study.pdf'));
    expect(metrics.words).toBeGreaterThan(20);
    expect(metrics.sentences).toBeGreaterThan(0);
    expect(metrics.readingMinutes).toBeGreaterThan(0);
  });
});
