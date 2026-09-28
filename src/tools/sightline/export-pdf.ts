/**
 * PDF export.
 *
 * PDFs are written with pdf-lib using the standard fonts every reader already
 * has, so the file needs no embedded font and stays small. Two treatments are
 * supported and both survive the export:
 *
 * - fixation weighting, drawn by rendering the heavy segment of each word in a
 *   bold standard font on the same baseline;
 * - a trail gradient, drawn by giving each word its own fill colour from the
 *   palette, which is why each word is a separate text operation.
 *
 * The document information dictionary carries the title, author, subject,
 * keywords, creation and modification dates, and producer fields.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { paletteById, samplePalette, type GradientOptions } from './gradient-engine';
import { emphasisForLevel, splitEmphasis, type EmphasisConfig } from './typography-engine';
import type { MetadataDraft } from './metadata-studio';
import type { DocumentModel, ParagraphNode, TokenRecord } from './sightline-types';

export type PdfPageSize = 'a4' | 'letter' | 'a5';
export type PdfTreatment = 'plain' | 'emphasis' | 'gradient' | 'emphasis-gradient';

export interface PdfExportOptions {
  readonly pageSize: PdfPageSize;
  readonly treatment: PdfTreatment;
  readonly emphasis: EmphasisConfig;
  readonly gradient: GradientOptions;
  readonly gradientPalette: string;
  readonly bodySize: number;
  /** Lines-per-page pacing aid: draw a faint rule under every line. */
  readonly lineGuides: boolean;
  /** Show page numbers in the footer. */
  readonly pageNumbers: boolean;
  /** Include a contents page when the document has chapters. */
  readonly includeTableOfContents: boolean;
}

export const DEFAULT_PDF_EXPORT: PdfExportOptions = {
  pageSize: 'a4',
  treatment: 'emphasis',
  emphasis: emphasisForLevel(3),
  gradient: { direction: 'horizontal', intensity: 1, wash: false },
  gradientPalette: 'horizon',
  bodySize: 12,
  lineGuides: false,
  pageNumbers: true,
  includeTableOfContents: true,
};

interface PageGeometry {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

const PAGE_SIZES: Record<PdfPageSize, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  a5: { width: 419.53, height: 595.28 },
};

export const pageGeometry = (size: PdfPageSize): PageGeometry => {
  const base = PAGE_SIZES[size];
  return { ...base, margin: Math.round(base.width * 0.1) };
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
  const number = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(number)) return { r: 0, g: 0, b: 0 };
  return {
    r: ((number >> 16) & 0xff) / 255,
    g: ((number >> 8) & 0xff) / 255,
    b: (number & 0xff) / 255,
  };
};

const pdfColor = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
};

interface Word {
  readonly text: string;
  readonly strong: string;
  readonly rest: string;
  readonly color: string;
  /** True when this word is the last of its paragraph. */
  readonly endsParagraph: boolean;
}

const wordsForTokens = (
  tokens: readonly TokenRecord[],
  options: PdfExportOptions,
  lineIndex: number,
  lineWords: number,
): Word[] => {
  const palette = paletteById(options.gradientPalette);
  const emphasise = options.treatment === 'emphasis' || options.treatment === 'emphasis-gradient';
  const gradient = options.treatment === 'gradient' || options.treatment === 'emphasis-gradient';
  const baseColor = '#111827';
  return tokens.map((token, index) => {
    const parts = emphasise ? splitEmphasis(token.text, options.emphasis) : { lead: '', strong: '', rest: token.text };
    const fraction = lineWords <= 1 ? 0 : index / (lineWords - 1);
    return {
      text: token.text,
      strong: parts.strong,
      rest: `${parts.lead}${parts.rest}`,
      color: gradient ? samplePalette(palette, fraction * Math.min(1, Math.max(0, options.gradient.intensity))) : baseColor,
      endsParagraph: token.breakAfter === 'paragraph' || token.breakAfter === 'chapter',
    };
  });
  void lineIndex;
};

const wrapParagraph = (
  paragraphTokens: readonly TokenRecord[],
  font: PDFFont,
  strongFont: PDFFont,
  size: number,
  maxWidth: number,
  options: PdfExportOptions,
): Word[][] => {
  const lines: Word[][] = [];
  let current: Word[] = [];
  let width = 0;
  const spaceWidth = font.widthOfTextAtSize(' ', size);

  for (const token of paragraphTokens) {
    const candidate = wordsForTokens([token], options, lines.length, paragraphTokens.length)[0]!;
    const tokenWidth = strongFont.widthOfTextAtSize(candidate.strong, size)
      + font.widthOfTextAtSize(candidate.rest, size);
    if (current.length > 0 && width + spaceWidth + tokenWidth > maxWidth) {
      lines.push(current);
      current = [candidate];
      width = tokenWidth;
      continue;
    }
    current.push(candidate);
    width += (current.length > 1 ? spaceWidth : 0) + tokenWidth;
  }
  if (current.length > 0) lines.push(current);
  return lines;
};

export const buildPdfBytes = async (
  model: DocumentModel,
  draft: MetadataDraft,
  options: PdfExportOptions = DEFAULT_PDF_EXPORT,
): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const body = await document.embedFont(StandardFonts.Helvetica);
  const strong = await document.embedFont(StandardFonts.HelveticaBold);
  const geometry = pageGeometry(options.pageSize);
  const maxWidth = geometry.width - geometry.margin * 2;
  const size = Math.max(8, Math.min(28, options.bodySize));
  const leading = size * 1.6;

  const pages: PDFPage[] = [];
  let page = document.addPage([geometry.width, geometry.height]);
  pages.push(page);
  let cursorY = geometry.height - geometry.margin;

  const newPage = () => {
    page = document.addPage([geometry.width, geometry.height]);
    pages.push(page);
    cursorY = geometry.height - geometry.margin;
  };

  const writeLine = (words: readonly Word[], isHeading: boolean) => {
    if (cursorY < geometry.margin + leading) newPage();
    const usedFont = isHeading ? strong : body;
    let cursorX = geometry.margin;
    const spaceWidth = usedFont.widthOfTextAtSize(' ', size);
    for (const word of words) {
      if (word.strong.length > 0) {
        page.drawText(word.strong, { x: cursorX, y: cursorY, size, font: strong, color: pdfColor(word.color) });
        cursorX += strong.widthOfTextAtSize(word.strong, size);
      }
      if (word.rest.length > 0) {
        page.drawText(word.rest, { x: cursorX, y: cursorY, size, font: isHeading ? strong : body, color: pdfColor(word.color) });
        cursorX += (isHeading ? strong : body).widthOfTextAtSize(word.rest, size);
      }
      cursorX += spaceWidth;
    }
    if (options.lineGuides) {
      page.drawLine({
        start: { x: geometry.margin, y: cursorY - size * 0.28 },
        end: { x: geometry.margin + maxWidth, y: cursorY - size * 0.28 },
        thickness: 0.3,
        color: rgb(0.75, 0.75, 0.75),
      });
    }
    cursorY -= leading;
  };

  page.drawText(draft.title.slice(0, 120), {
    x: geometry.margin,
    y: cursorY - size * 1.6,
    size: size * 1.6,
    font: strong,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursorY -= size * 3;
  if (draft.author) {
    page.drawText(draft.author.slice(0, 120), { x: geometry.margin, y: cursorY, size, font: body, color: rgb(0.35, 0.38, 0.45) });
    cursorY -= leading;
  }
  if (draft.readingLevel) {
    page.drawText(draft.readingLevel.slice(0, 120), { x: geometry.margin, y: cursorY, size: size * 0.85, font: body, color: rgb(0.45, 0.48, 0.55) });
    cursorY -= leading;
  }
  cursorY -= leading * 0.6;

  if (options.includeTableOfContents && model.chapters.length > 1) {
    writeLine([{ text: 'Contents', strong: 'Contents', rest: '', color: '#111827', endsParagraph: true }], true);
    for (const chapter of model.chapters.filter((entry) => entry.level > 0).slice(0, 40)) {
      writeLine(
        wordsForTokens(
          [{ ...model.tokens[0]!, text: chapter.title } as TokenRecord],
          options, 0, 1,
        ),
        false,
      );
    }
    cursorY -= leading * 0.6;
  }

  for (const paragraph of model.paragraphs) {
    const isHeading = paragraph.kind === 'heading';
    const tokens = model.tokens.slice(paragraph.tokenStart, paragraph.tokenEnd);
    if (tokens.length === 0) continue;
    const lines = wrapParagraph(tokens, body, strong, isHeading ? size * 1.25 : size, maxWidth, options);
    if (isHeading) cursorY -= leading * 0.5;
    for (const line of lines) writeLine(line, isHeading);
    cursorY -= leading * (isHeading ? 0.4 : 0.55);
  }

  if (options.pageNumbers) {
    pages.forEach((current, index) => {
      const label = `Page ${index + 1} of ${pages.length}`;
      const width = body.widthOfTextAtSize(label, size * 0.8);
      current.drawText(label, {
        x: (geometry.width - width) / 2,
        y: geometry.margin / 2,
        size: size * 0.8,
        font: body,
        color: rgb(0.45, 0.48, 0.55),
      });
    });
  }

  const created = draft.created ? new Date(draft.created) : new Date();
  const modified = draft.modified ? new Date(draft.modified) : new Date();
  document.setTitle(draft.title || 'Untitled');
  document.setAuthor(draft.author || 'Unknown');
  document.setSubject(draft.subject || draft.readingLevel || 'Reading document');
  if (draft.tags.length > 0) document.setKeywords([...draft.tags]);
  document.setCreationDate(Number.isNaN(created.getTime()) ? new Date() : created);
  document.setModificationDate(Number.isNaN(modified.getTime()) ? new Date() : modified);
  // pdf-lib writes its own library name into the Producer field on every save,
  // so the tool identifies itself through Creator, which is preserved.
  document.setCreator('Sightline Velocity Studio');

  return document.save();
};

/** Approximate page count, used by the export summary before rendering. */
export const estimatePageCount = (
  model: DocumentModel,
  options: PdfExportOptions = DEFAULT_PDF_EXPORT,
): number => {
  const geometry = pageGeometry(options.pageSize);
  const size = Math.max(8, Math.min(28, options.bodySize));
  const leading = size * 1.6;
  const usableLines = Math.max(1, Math.floor((geometry.height - geometry.margin * 2) / leading));
  // Roughly eleven words fit on a line of A4 at the default size.
  const wordsPerLine = Math.max(6, Math.round((geometry.width - geometry.margin * 2) / (size * 0.52)));
  const lines = model.paragraphs.reduce((total, paragraph) => {
    const words = Math.max(1, paragraph.tokenEnd - paragraph.tokenStart);
    return total + Math.max(1, Math.ceil(words / wordsPerLine)) + (paragraph.kind === 'heading' ? 1 : 0);
  }, 0);
  return Math.max(1, Math.ceil((lines + 4) / usableLines));
};
