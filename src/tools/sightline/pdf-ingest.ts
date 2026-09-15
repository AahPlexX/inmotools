/**
 * PDF text ingestion.
 *
 * Two layers: `pdfjs-extractor.ts` owns the browser-side decode through
 * pdf.js (worker, glyph geometry, embedded outline, document information), and
 * this module turns the resulting positioned text items into reading paragraphs.
 *
 * Layout reconstruction is geometry-based and conservative. Items are grouped
 * into lines by baseline position, lines are ordered top-to-bottom and
 * left-to-right (handling two-column pages by detecting a width gap), lines are
 * joined into paragraphs when the leading is tight, and headings are inferred
 * from a distinctly larger type size or a short bold line. Every decision that
 * could be wrong is either recoverable or reported: the extracted character
 * count per page is measured so an image-only page is obvious instead of
 * silently producing nothing.
 */

import {
  computeReadability,
  countComplexWords,
  estimateSyllables,
  hasLetters,
} from './syllable-engine';
import { normalizeParagraphText, splitSentences, type RawChapter, type RawParagraph } from './segmentation-engine';
import type {
  DocumentMetadata,
  DocumentPageGeometry,
  IngestDiagnostic,
  PdfExtraction,
  PdfPageText,
  PdfTextExtractor,
} from './sightline-types';

export interface PdfStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly metadata: Partial<DocumentMetadata>;
  readonly diagnostics: readonly IngestDiagnostic[];
  readonly pageCharacterCounts: readonly number[];
  readonly pageCount: number;
  readonly pages: readonly DocumentPageGeometry[];
}

export interface PdfLayoutOptions {
  /** Multiplier over the median line gap that starts a new paragraph. */
  readonly paragraphGapRatio?: number;
  /** Font-size ratio over the median that marks a heading. */
  readonly headingSizeRatio?: number;
  /** Gap in user-space units that splits a page into columns. */
  readonly columnGap?: number;
}

interface PositionedItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
}

interface PageLine {
  readonly y: number;
  readonly x: number;
  /** Right edge of the rightmost item on the line, in user-space units. */
  readonly right: number;
  readonly text: string;
  readonly fontSize: number;
  readonly fontNames: Set<string>;
}

const MIN_CHARS_PER_PAGE_WARNING = 40;
const DEFAULT_PARAGRAPH_GAP = 1.45;
const DEFAULT_HEADING_RATIO = 1.18;
const DEFAULT_COLUMN_GAP = 120;

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

const isBoldFont = (fontName: string): boolean =>
  /(bold|black|heavy|semibold|demi)/i.test(fontName);

export const groupPageIntoLines = (page: PdfPageText): { left: PageLine[]; right: PageLine[] } => {
  const items: PositionedItem[] = page.items
    .filter((item) => item.str.length > 0)
    .map((item) => ({
      text: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      fontName: item.fontName,
    }));
  if (items.length === 0) return { left: [], right: [] };

  const pageWidth = page.width || Math.max(...items.map((item) => item.x + item.width), 1);

  const buildLines = (subset: PositionedItem[]): PageLine[] => {
    const sorted = [...subset].sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const tolerance = Math.max(2, median(subset.map((item) => item.height || 10)) * 0.45);
    const lines: PageLine[] = [];
    for (const item of sorted) {
      const existing = lines.find((line) => Math.abs(line.y - item.y) <= tolerance);
      if (existing) {
        existing.fontNames.add(item.fontName);
        // Text runs on one line are separate items; a visible horizontal gap
        // between them is a word space, and pdf.js does not always emit one.
        const gap = item.x - existing.right;
        const needsSpace = gap > Math.max(1, (item.height || 10) * 0.25)
          && !/\s$/.test(existing.text);
        (existing as { text: string }).text = `${existing.text}${needsSpace ? ' ' : ''}${item.text}`;
        (existing as { fontSize: number }).fontSize = Math.max(existing.fontSize, item.height || 0);
        (existing as { right: number }).right = Math.max(existing.right, item.x + item.width);
        continue;
      }
      lines.push({
        y: item.y,
        x: item.x,
        right: item.x + item.width,
        text: item.text,
        fontSize: item.height || 0,
        fontNames: new Set([item.fontName]),
      });
    }
    return lines
      .map((line) => ({ ...line, text: normalizeParagraphText(line.text) }))
      .filter((line) => line.text.length > 0);
  };

  // Two-column detection: look for a vertical whitespace corridor near the
  // middle of the page with content on both sides. Every item must sit clearly
  // on one side of the corridor, which rejects indented single-column pages and
  // quoted blocks whose lines cross the middle of the measure.
  const findColumnSplit = (): number | null => {
    let bestSplit: number | null = null;
    let bestBalance = 0;
    for (let step = 30; step <= 70; step += 2) {
      const candidate = (pageWidth * step) / 100;
      let leftCount = 0;
      let rightCount = 0;
      let crossing = false;
      for (const item of items) {
        const right = item.x + (item.width || (item.height || 10) * item.text.length * 0.5);
        if (right <= candidate + 2) {
          leftCount += 1;
          continue;
        }
        if (item.x >= candidate - 2) {
          rightCount += 1;
          continue;
        }
        crossing = true;
        break;
      }
      if (crossing || leftCount < 4 || rightCount < 4) continue;
      const balance = Math.min(leftCount, rightCount);
      if (balance > bestBalance) {
        bestBalance = balance;
        bestSplit = candidate;
      }
    }
    return bestSplit;
  };

  const split = findColumnSplit();
  if (split === null) return { left: buildLines(items), right: [] };
  const leftItems = items.filter((item) => item.x < split);
  const rightItems = items.filter((item) => item.x >= split);
  const leftLines = buildLines(leftItems);
  const rightLines = buildLines(rightItems);
  if (leftLines.length < 2 || rightLines.length < 2) return { left: buildLines(items), right: [] };
  const gutter = Math.min(...rightLines.map((line) => line.x)) - Math.max(...leftLines.map((line) => line.right));
  if (gutter < Math.max(8, pageWidth * 0.02)) return { left: buildLines(items), right: [] };
  return { left: buildLines(leftItems), right: buildLines(rightItems) };
};

/**
 * Join the lines of a paragraph. A line-final hyphen before a lower-case word
 * is a word broken by justification, not a real hyphen, so it is closed up.
 */
const joinParagraphLines = (lines: readonly string[]): string => {
  let output = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (output.length === 0) {
      output = trimmed;
      continue;
    }
    if (/-$/.test(output) && /^[a-z\u00e0-\u00f6\u00f8-\u00ff]/.test(trimmed)) {
      output = `${output.slice(0, -1)}${trimmed}`;
      continue;
    }
    output = `${output} ${trimmed}`;
  }
  return output;
};

const endsSentence = (text: string): boolean => /[.!?:"'\u201d\u2019)\]]$/.test(text.trim());

const looksLikeListItem = (text: string): boolean =>
  /^(?:[\u2022\u25cf\u25aa\u25e6\u2043o]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/i.test(text);

const looksLikeCaption = (text: string): boolean =>
  /^(?:figure|fig\.|table|listing|exhibit|chart)\s*\d+/i.test(text.trim());

export const reconstructPdfParagraphs = (
  page: PdfPageText,
  options: PdfLayoutOptions = {},
): { paragraphs: RawParagraph[]; characterCount: number; diagnostic?: IngestDiagnostic } => {
  const { left, right } = groupPageIntoLines(page);
  const columns = [left, right].filter((column) => column.length > 0);
  const lines = columns.flat();
  if (lines.length === 0) {
    return { paragraphs: [], characterCount: 0 };
  }

  const gaps: number[] = [];
  for (const column of [left, right]) {
    for (let index = 1; index < column.length; index += 1) {
      gaps.push(Math.abs(column[index - 1]!.y - column[index]!.y));
    }
  }
  const medianGap = median(gaps.filter((gap) => gap > 0)) || 12;
  const medianFont = median(lines.map((line) => line.fontSize).filter((size) => size > 0)) || 12;
  // The body size is the size that carries the most characters, not the median
  // of the sizes present: a short page can hold as many headings as paragraphs.
  let referenceSize = medianFont;
  let referenceCharacters = 0;
  const charactersBySize = new Map<number, number>();
  for (const line of lines) {
    if (line.fontSize <= 0) continue;
    const size = Math.round(line.fontSize * 2) / 2;
    charactersBySize.set(size, (charactersBySize.get(size) ?? 0) + line.text.length);
  }
  for (const [size, characters] of charactersBySize) {
    if (characters > referenceCharacters) {
      referenceCharacters = characters;
      referenceSize = size;
    }
  }

  const paragraphGap = medianGap * (options.paragraphGapRatio ?? DEFAULT_PARAGRAPH_GAP);
  const headingRatio = options.headingSizeRatio ?? DEFAULT_HEADING_RATIO;

  const paragraphs: RawParagraph[] = [];
  let buffer: string[] = [];
  let characterCount = 0;

  const flush = (kind: RawParagraph['kind'] = 'body', level = 0) => {
    const text = normalizeParagraphText(joinParagraphLines(buffer));
    buffer = [];
    if (text.length === 0) return;
    paragraphs.push({ kind, level, text, page: page.pageNumber });
  };

  const emitLine = (line: PageLine) => {
    const bold = [...line.fontNames].some(isBoldFont);
    const isHeading = line.fontSize >= referenceSize * headingRatio
      && line.text.length <= 140
      && !endsSentence(line.text);
    if (isHeading) {
      flush();
      const ratio = line.fontSize / referenceSize;
      const level = ratio >= 1.6 ? 1 : ratio >= 1.35 ? 2 : 3;
      // A heading's own text should not be merged into the body that follows.
      paragraphs.push({
        kind: 'heading',
        level,
        text: normalizeParagraphText(line.text),
        page: page.pageNumber,
      });
      return;
    }
    if (looksLikeCaption(line.text)) {
      flush();
      paragraphs.push({ kind: 'caption', level: 0, text: normalizeParagraphText(line.text), page: page.pageNumber });
      return;
    }
    if (looksLikeListItem(line.text)) {
      flush();
      paragraphs.push({ kind: 'list-item', level: 1, text: normalizeParagraphText(line.text), page: page.pageNumber });
      return;
    }
    if (bold && line.text.length <= 90 && !endsSentence(line.text) && buffer.length > 0) {
      flush();
      paragraphs.push({ kind: 'heading', level: 3, text: normalizeParagraphText(line.text), page: page.pageNumber });
      return;
    }
    buffer.push(line.text);
  };

  for (const column of columns) {
    // Columns are separate flows: the bottom of the left column never
    // continues into the top of the right column.
    let previousY: number | null = null;
    for (const line of column) {
      if (previousY !== null && Math.abs(previousY - line.y) > paragraphGap) flush();
      emitLine(line);
      previousY = line.y;
    }
    flush();
  }

  for (const paragraph of paragraphs) characterCount += paragraph.text.length;
  const diagnostic = characterCount < MIN_CHARS_PER_PAGE_WARNING
    ? {
      level: 'warning' as const,
      code: 'pdf-page-text',
      message: `Page ${page.pageNumber} yielded only ${characterCount} extractable characters.`,
      page: page.pageNumber,
      detail: 'The page probably stores its text as an image or as glyphs without a text layer. There is no OCR in this release.',
    }
    : undefined;

  return diagnostic ? { paragraphs, characterCount, diagnostic } : { paragraphs, characterCount };
};

export const buildPdfStructure = (
  extraction: PdfExtraction,
  fileName: string,
  options: PdfLayoutOptions = {},
): PdfStructure => {
  const diagnostics: IngestDiagnostic[] = [];
  const paragraphs: RawParagraph[] = [];
  const pageCharacterCounts: number[] = [];
  const pageFirstParagraph = new Map<number, number>();

  for (const page of extraction.pages) {
    const result = reconstructPdfParagraphs(page, options);
    pageCharacterCounts.push(result.characterCount);
    if (result.diagnostic) diagnostics.push(result.diagnostic);
    pageFirstParagraph.set(page.pageNumber, paragraphs.length);
    paragraphs.push(...result.paragraphs);
  }

  const emptyPages = pageCharacterCounts.filter((count) => count === 0).length;
  if (emptyPages > 0) {
    diagnostics.push({
      level: emptyPages === pageCharacterCounts.length ? 'error' : 'warning',
      code: 'pdf-empty-pages',
      message: `${emptyPages} of ${pageCharacterCounts.length} pages contained no extractable text.`,
      detail: 'Scanned documents need OCR before they can be read as text; this tool does not perform OCR.',
    });
  }

  const chapters: RawChapter[] = [];
  const seenTitles = new Set<string>();
  const outline = [...extraction.outline].sort((left, right) => left.depth - right.depth);
  for (const entry of outline) {
    const title = normalizeParagraphText(entry.title);
    if (title.length === 0 || seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());
    const targetParagraph = entry.pageNumber !== null ? pageFirstParagraph.get(entry.pageNumber) : undefined;
    if (targetParagraph === undefined) continue;
    chapters.push({ title, level: Math.max(1, entry.depth), paragraphIndex: targetParagraph, page: entry.pageNumber ?? undefined });
  }
  if (chapters.length === 0) {
    let previousLevel = 0;
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.kind !== 'heading') return;
      const level = paragraph.level ?? 3;
      if (level > 2) return;
      const previous = chapters[chapters.length - 1];
      // Consecutive same-level headings immediately after an already recorded
      // heading are part of the same title block rather than new sections.
      if (previous && previous.level === level && previous.paragraphIndex === index - 1) return;
      previousLevel = level;
      chapters.push({ title: paragraph.text, level, paragraphIndex: index, page: paragraph.page });
    });
    if (chapters.length > 0) {
      diagnostics.push({
        level: 'info',
        code: 'pdf-heading-outline',
        message: 'The document had no embedded outline, so chapters were inferred from heading typography.',
      });
    }
  }

  const info = extraction.metadata;
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = info[key] ?? info[key.toLowerCase()];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return '';
  };
  const producer = pick('Producer');
  const creator = pick('Creator');
  const extras: Record<string, string> = {};
  if (producer) extras.producer = producer;
  if (creator) extras.creator = creator;
  const formatVersion = pick('PDFFormatVersion');
  if (formatVersion) extras.pdfFormatVersion = formatVersion;
  const metadata: Partial<DocumentMetadata> = {
    title: pick('Title') || pick('dc:title') || fileName.replace(/\.pdf$/i, ''),
    author: pick('Author') || pick('dc:creator'),
    subject: pick('Subject') || pick('dc:subject'),
    description: pick('dc:description'),
    language: pick('dc:language'),
    keywords: pick('Keywords').split(/[,;]\s*/).filter((entry) => entry.length > 0),
    created: pick('CreationDate'),
    modified: pick('ModDate'),
    ...(Object.keys(extras).length > 0 ? { extra: extras } : {}),
  };

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-pdf',
      message: 'No readable text could be extracted from this PDF.',
    });
  }

  const pages: DocumentPageGeometry[] = extraction.pages.map((page, index) => {
    const characters = pageCharacterCounts[index] ?? 0;
    return {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      rotation: page.rotation ?? 0,
      characters,
    };
  });

  return {
    paragraphs,
    chapters,
    metadata,
    diagnostics,
    pageCharacterCounts,
    pageCount: extraction.pages.length,
    pages,
  };
};

export const ingestPdf = async (
  data: Uint8Array<ArrayBufferLike>,
  fileName: string,
  extractor: PdfTextExtractor,
  options: PdfLayoutOptions = {},
): Promise<PdfStructure> => {
  const extraction = await extractor.extract(data);
  return buildPdfStructure(extraction, fileName, options);
};

/** Prose metrics for a finished PDF structure, used by the ingestion report. */
export const pdfStructureMetrics = (structure: PdfStructure) => {
  const text = structure.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
  const sentences = structure.paragraphs.flatMap((paragraph) => splitSentences(paragraph.text));
  const words = structure.paragraphs.flatMap((paragraph) => paragraph.text.split(/\s+/).filter((word) => word.length > 0));
  const syllables = words.reduce((total, word) => total + estimateSyllables(word), 0);
  return computeReadability(
    {
      text,
      words: words.length,
      sentences: sentences.length,
      syllables,
      complexWords: countComplexWords(words.filter((word) => hasLetters(word))),
      characters: words.reduce((total, word) => total + word.length, 0),
      charactersNoSpaces: words.join('').length,
      paragraphs: structure.paragraphs.length,
    },
    sentences.reduce((longest, sentence) => Math.max(longest, sentence.text.split(/\s+/).length), 0),
  );
};
