/**
 * Word (DOCX) export.
 *
 * Word is the one office format that can carry both reading treatments natively:
 * runs have their own bold flag and their own colour, so the fixation weighting
 * survives as bold runs and the trail gradient survives as coloured runs without
 * any image or embedded font. The document also carries the studio's metadata as
 * Word core properties, which every reader shows in its document panel.
 *
 * The file is a plain WordprocessingML package written by the `docx` library, so
 * it opens in Word, Pages, LibreOffice, and Google Docs alike.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
} from 'docx';
import { paletteById, samplePalette, type GradientOptions } from './gradient-engine';
import { emphasisForLevel, splitEmphasis, type EmphasisConfig } from './typography-engine';
import { exportFileName, type MetadataDraft } from './metadata-studio';
import type { DocumentModel, ParagraphNode, TokenRecord } from './sightline-types';

export type DocxTreatment = 'plain' | 'emphasis' | 'gradient' | 'emphasis-gradient';

export interface DocxExportOptions {
  readonly treatment: DocxTreatment;
  readonly emphasis: EmphasisConfig;
  readonly gradient: GradientOptions;
  readonly gradientPalette: string;
  /** Word line spacing multiplier for the body text. */
  readonly lineSpacing: number;
  /** Emit each paragraph as its own Word paragraph (keeps page breaks clean). */
  readonly spacedParagraphs: boolean;
  /** Include a heading paragraph for every chapter that lacks one. */
  readonly includeChapterHeadings: boolean;
  /** Optional wider letter spacing, which some readers find easier to track. */
  readonly extraTracking: number;
}

/** Suffix used in the exported file name, matching the treatment inside. */
export const docxSuffix = (treatment: DocxTreatment): string =>
  treatment === 'plain' ? 'document' : treatment === 'gradient' ? 'gradient' : 'weighted';

export const DEFAULT_DOCX_EXPORT: DocxExportOptions = {
  treatment: 'emphasis',
  emphasis: emphasisForLevel(3),
  gradient: { direction: 'horizontal', intensity: 1, wash: false },
  gradientPalette: 'horizon',
  lineSpacing: 1.3,
  spacedParagraphs: true,
  includeChapterHeadings: true,
  extraTracking: 0,
};

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const headingLevelFor = (level: number): (typeof HEADING_LEVELS)[number] =>
  HEADING_LEVELS[Math.min(HEADING_LEVELS.length, Math.max(1, level)) - 1]!;

/** Word wants a six digit colour without the leading hash. */
const docxColor = (hex: string): string => {
  const value = hex.trim().replace('#', '');
  if (value.length === 3) return value.split('').map((character) => character + character).join('').toUpperCase();
  return /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '333333';
};

const tokenRuns = (
  paragraph: ParagraphNode,
  tokens: readonly TokenRecord[],
  options: DocxExportOptions,
): TextRun[] => {
  const weight = options.treatment === 'emphasis' || options.treatment === 'emphasis-gradient';
  const colour = options.treatment === 'gradient' || options.treatment === 'emphasis-gradient';
  const paragraphTokens = tokens.slice(paragraph.tokenStart, paragraph.tokenEnd);
  const palette = paletteById(options.gradientPalette);
  const runs: TextRun[] = [];

  paragraphTokens.forEach((token, index) => {
    const spacing = options.extraTracking > 0 ? Math.round(options.extraTracking * 20) : undefined;
    const position = paragraphTokens.length > 1 ? index / (paragraphTokens.length - 1) : 0;
    const fill = colour ? samplePalette(palette, position * options.gradient.intensity) : null;
    if (weight) {
      const parts = splitEmphasis(token.text, options.emphasis);
      const strong = parts.strong.length > 0;
      const heads = [
        parts.lead.length > 0 ? { text: parts.lead, bold: false } : null,
        parts.strong.length > 0 ? { text: parts.strong, bold: true } : null,
        parts.rest.length > 0 ? { text: parts.rest, bold: false } : null,
      ].filter((part): part is { text: string; bold: boolean } => part !== null);
      heads.forEach((part, partIndex) => {
        const last = partIndex === heads.length - 1;
        // `token.text` already contains the trailing punctuation, and the space
        // between words belongs after the final run of the word.
        const suffix = last && index < paragraphTokens.length - 1 ? ' ' : '';
        runs.push(new TextRun({
          text: `${part.text}${suffix}`,
          bold: strong && part.bold,
          ...(fill ? { color: docxColor(fill) } : {}),
          ...(spacing !== undefined ? { characterSpacing: spacing } : {}),
        }));
      });
      return;
    }
    runs.push(new TextRun({
      text: `${token.text}${index < paragraphTokens.length - 1 ? ' ' : ''}`,
      ...(fill ? { color: docxColor(fill) } : {}),
      ...(spacing !== undefined ? { characterSpacing: spacing } : {}),
    }));
  });
  return runs;
};

const paragraphOptions = (paragraph: ParagraphNode, options: DocxExportOptions): IParagraphOptions => {
  const base: IParagraphOptions = {
    spacing: { line: Math.round(options.lineSpacing * 240), after: options.spacedParagraphs ? 120 : 0 },
  };
  if (paragraph.kind === 'heading') {
    return { ...base, heading: headingLevelFor(paragraph.level || 1), spacing: { before: 240, after: 120 } };
  }
  if (paragraph.kind === 'quote') return { ...base, indent: { left: 480, right: 480 }, alignment: AlignmentType.LEFT };
  if (paragraph.kind === 'caption') return { ...base, alignment: AlignmentType.CENTER, style: 'Caption' };
  if (paragraph.kind === 'code') return { ...base, style: 'NoSpacing' };
  return base;
};

const buildParagraphs = (
  model: DocumentModel,
  options: DocxExportOptions,
): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const tokens = model.tokens;
  const chapterStarts = new Map<number, number>([...model.chapters].map((chapter) => [chapter.paragraphStart, chapter.index]));
  const headings = new Set(model.paragraphs.filter((paragraph) => paragraph.kind === 'heading').map((paragraph) => paragraph.index));
  // A single unnamed section is not structure, so it does not earn a heading.
  const structural = model.chapters.length > 1 || headings.size > 0;

  for (const paragraph of model.paragraphs) {
    if (options.includeChapterHeadings && structural && chapterStarts.has(paragraph.index) && !headings.has(paragraph.index)) {
      const chapter = model.chapters[chapterStarts.get(paragraph.index)!]!;
      paragraphs.push(new Paragraph({
        heading: headingLevelFor(Math.max(1, chapter.level)),
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: chapter.title })],
      }));
    }
    const runs = tokenRuns(paragraph, tokens, options);
    if (runs.length === 0) {
      if (paragraph.text.trim().length === 0) continue;
      paragraphs.push(new Paragraph({ ...paragraphOptions(paragraph, options), children: [new TextRun(paragraph.text)] }));
      continue;
    }
    paragraphs.push(new Paragraph({ ...paragraphOptions(paragraph, options), children: runs }));
  }
  return paragraphs;
};

export interface DocxExportResult {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}

export const buildDocxBytes = async (
  model: DocumentModel,
  draft: MetadataDraft,
  options: DocxExportOptions = DEFAULT_DOCX_EXPORT,
): Promise<DocxExportResult> => {
  const title = draft.title.trim() || model.metadata.title || model.fileName.replace(/\.[^.]+$/, '') || 'Document';
  const paragraphs = buildParagraphs(model, options);
  const document = new Document({
    title,
    subject: draft.description.trim() || title,
    creator: draft.author.trim() || undefined,
    description: draft.description.trim() || undefined,
    keywords: draft.tags.join(', ') || undefined,
    lastModifiedBy: draft.author.trim() || undefined,
    ...(draft.language ? { language: draft.language } : {}),
    styles: {
      default: {
        document: { run: { size: 24 } },
      },
    },
    sections: [{ children: paragraphs }],
  });
  const buffer = await Packer.toArrayBuffer(document);
  return { bytes: new Uint8Array(buffer), fileName: exportFileName(draft, docxSuffix(options.treatment), 'docx') };
};
