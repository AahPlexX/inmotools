/**
 * Segmentation: raw extracted paragraphs become the canonical document model of
 * chapters, paragraphs, sentences, and display tokens with character offsets.
 *
 * Every downstream engine reads this model, so the offsets, break kinds, and
 * counts produced here are the contract that progress saving, annotations,
 * exports, and analytics all rely on.
 */

import { computeOrp, type OrpMode } from './orp-engine';
import { computeReadability, countComplexWords, estimateSyllables, hasLetters } from './syllable-engine';
import {
  createMetadata,
  type BreakKind,
  type ChapterNode,
  type DiagnosticLevel,
  type DocumentMetadata,
  DocumentPageGeometry,
  type DocumentModel,
  type IngestDiagnostic,
  type ParagraphKind,
  type ParagraphNode,
  type SentenceNode,
  type SourceFormat,
  type TokenRecord,
} from './sightline-types';

export interface RawParagraph {
  readonly kind: ParagraphKind;
  readonly level?: number;
  readonly text: string;
  readonly page?: number;
  readonly href?: string;
}

export interface RawChapter {
  readonly title: string;
  readonly level: number;
  readonly paragraphIndex: number;
  readonly href?: string;
  readonly page?: number;
}

export interface BuildModelInput {
  readonly format: SourceFormat;
  readonly fileName: string;
  readonly byteLength?: number;
  readonly encoding?: string;
  readonly metadata?: Partial<DocumentMetadata>;
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters?: readonly RawChapter[];
  readonly diagnostics?: readonly IngestDiagnostic[];
  /** Skip non-prose blocks (code, tables) when true. */
  readonly proseOnly?: boolean;
  /** Retain footnote and endnote bodies when true. */
  readonly includeNotes?: boolean;
  readonly tokenLimit?: number;
  readonly ingestMs?: number;
  readonly orp?: { mode?: OrpMode; ratio?: number };
  /** Page geometry from the decoded source, for the page map. */
  readonly pages?: readonly DocumentPageGeometry[];
}

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie', 'fig',
  'figs', 'no', 'nos', 'vol', 'vols', 'pp', 'p', 'ed', 'eds', 'inc', 'ltd', 'co', 'corp',
  'dept', 'univ', 'approx', 'est', 'al', 'cf', 'ibid', 'et', 'ca', 'ch', 'chs', 'sec',
  'secs', 'art', 'para', 'ex', 'gen', 'sen', 'rep', 'gov', 'sgt', 'capt', 'lt', 'col',
  'maj', 'adm', 'hon', 'rev', 'pres', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs',
  'fri', 'sat', 'sun', 'u.s', 'u.k', 'e.g', 'i.e',
]);

const SENTENCE_TERMINATORS = new Set(['.', '!', '?', '\u2026', '\u203c', '\u2047', '\u2048', '\u2049']);
const CLOSING_MARKS = new Set(['"', '\u201d', '\u2019', "'", ')', ']', '}', '\u00bb']);
const TRAILING_PUNCTUATION = /["'\u201d\u2019)\]}.,;:!?\u2026\u2014\u2013\u00bb]+$/;
const CLAUSE_MARKS = /[,;:\u2014\u2013)}\]"'\u201d\u2019\u00bb]+$/;

export interface SentenceSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The word ending at `index` inclusive, i.e. the token the terminator belongs
 * to. Walking back must include the terminator itself, otherwise "Dr." looks
 * like the word "Dr" and every abbreviation boundary is missed.
 */
const wordEndingAt = (text: string, index: number): string => {
  let cursor = index;
  while (cursor >= 0 && /[A-Za-z0-9.'\u2019-]/.test(text[cursor]!)) cursor -= 1;
  return text.slice(cursor + 1, index + 1);
};

const endsWithInitialism = (text: string, index: number): boolean => {
  const word = wordEndingAt(text, index);
  if (word.length === 0 || !word.endsWith('.')) return false;
  const pieces = word.split('.').filter((piece) => piece.length > 0);
  if (pieces.length === 0) return false;
  // "J." and "U.S." style initialisms: every dotted piece is a single letter.
  if (pieces.length > 1 && pieces.every((piece) => piece.length === 1)) return true;
  const normalized = word.toLowerCase().replace(/\.$/, '');
  return ABBREVIATIONS.has(normalized);
};

/** Split a paragraph into sentences, keeping offsets into the paragraph text. */
export const splitSentences = (text: string): readonly SentenceSpan[] => {
  const spans: SentenceSpan[] = [];
  let sentenceStart = 0;
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (!SENTENCE_TERMINATORS.has(character)) {
      index += 1;
      continue;
    }
    // Consume runs of terminators ("?!" or "...").
    let terminatorEnd = index;
    while (terminatorEnd + 1 < text.length && SENTENCE_TERMINATORS.has(text[terminatorEnd + 1]!)) {
      terminatorEnd += 1;
    }
    // A decimal number or an abbreviation is not a boundary.
    const decimal = character === '.'
      && /\d/.test(text[index - 1] ?? '')
      && /\d/.test(text[index + 1] ?? '');
    const abbreviation = character === '.' && endsWithInitialism(text, index);
    let probe = terminatorEnd + 1;
    while (probe < text.length && CLOSING_MARKS.has(text[probe]!)) probe += 1;
    const next = text[probe];
    const atEnd = next === undefined;
    const whitespaceAfter = next !== undefined && /\s/.test(next);
    const boundary = !decimal && !abbreviation && (atEnd || whitespaceAfter);
    if (!boundary) {
      index = terminatorEnd + 1;
      continue;
    }
    let end = terminatorEnd + 1;
    while (end < text.length && CLOSING_MARKS.has(text[end]!)) end += 1;
    const raw = text.slice(sentenceStart, end);
    if (raw.trim().length > 0) spans.push({ text: raw, start: sentenceStart, end });
    sentenceStart = end;
    index = end;
  }
  const tail = text.slice(sentenceStart);
  if (tail.trim().length > 0) spans.push({ text: tail, start: sentenceStart, end: text.length });
  return spans;
};

export const normalizeParagraphText = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

const hasClauseMark = (trailing: string): boolean => trailing.length > 0 && CLAUSE_MARKS.test(trailing.slice(-1));

const classifyBreak = (trailing: string, isSentenceEnd: boolean): BreakKind => {
  if (isSentenceEnd) return 'sentence';
  if (hasClauseMark(trailing)) return 'clause';
  return 'none';
};

const defaultChapterTitle = (format: SourceFormat): string => {
  switch (format) {
    case 'pdf': return 'Document';
    case 'epub': return 'Book';
    case 'docx': return 'Document';
    case 'markdown': return 'Document';
    case 'html': return 'Article';
    case 'rtf': return 'Document';
    default: return 'Text';
  }
};

export const buildDocumentModel = (input: BuildModelInput): DocumentModel => {
  const diagnostics: IngestDiagnostic[] = [...(input.diagnostics ?? [])];
  const pushDiagnostic = (level: DiagnosticLevel, code: string, message: string, detail?: string) => {
    diagnostics.push(detail === undefined ? { level, code, message } : { level, code, message, detail });
  };

  const includeNotes = input.includeNotes ?? false;
  const paragraphs: RawParagraph[] = [];
  for (const paragraph of input.paragraphs) {
    if (input.proseOnly && (paragraph.kind === 'code' || paragraph.kind === 'table')) continue;
    if (!includeNotes && (paragraph.kind === 'footnote' || paragraph.kind === 'endnote')) continue;
    const text = normalizeParagraphText(paragraph.text);
    if (text.length === 0) continue;
    paragraphs.push({ ...paragraph, text });
  }

  const tokenLimit = input.tokenLimit ?? 400_000;
  const pieces: string[] = [];
  const paragraphModel: ParagraphNode[] = [];
  const tokens: TokenRecord[] = [];
  const sentences: SentenceNode[] = [];
  const paragraphBreaks: number[] = [];
  const properNounCandidates = new Set<string>();
  let offset = 0;
  let wordCount = 0;
  let syllableTotal = 0;
  let characterCount = 0;
  let characterCountNoSpaces = 0;
  let truncated = false;
  let longestSentenceWords = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const separator = pieces.length === 0 ? '' : '\n\n';
    const start = offset + separator.length;
    const text = paragraph.text;
    pieces.push(separator + text);
    offset = start + text.length;
    const end = offset;

    const paragraphTokenStart = tokens.length;
    const paragraphSentenceStart = sentences.length;
    let paragraphWords = 0;

    const spans = splitSentences(text);
    spans.forEach((span) => {
      const sentenceIndex = sentences.length;
      const sentenceTokenStart = tokens.length;
      const words = span.text.split(/\s+/).filter((piece) => piece.length > 0);
      let sentenceWords = 0;
      let sentenceCursor = span.start;
      words.forEach((raw, wordIndex) => {
        if (tokens.length >= tokenLimit) {
          truncated = true;
          return;
        }
        const localIndex = text.indexOf(raw, sentenceCursor);
        const resolvedLocalIndex = localIndex >= 0 ? localIndex : sentenceCursor;
        sentenceCursor = resolvedLocalIndex + raw.length;
        const tokenStart = start + resolvedLocalIndex;
        const base = raw;
        const trailingMatch = base.match(TRAILING_PUNCTUATION);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const symbolic = !hasLetters(base);
        const letters = (base.match(/[0-9A-Za-z\u00c0-\u024f]/g) ?? []).length;
        const isLastInSentence = wordIndex === words.length - 1;
        const rawBreak = classifyBreak(trailing, isLastInSentence);
        const token: TokenRecord = {
          index: tokens.length,
          text: base,
          start: tokenStart,
          end: tokenStart + base.length,
          orp: computeOrp(base, input.orp ?? {}),
          syllables: symbolic ? 0 : estimateSyllables(base),
          letters,
          symbolic,
          trailing,
          breakAfter: rawBreak,
          paragraphIndex,
          sentenceIndex,
        };
        tokens.push(token);
        wordCount += 1;
        sentenceWords += 1;
        paragraphWords += 1;
        syllableTotal += token.syllables;
        characterCount += base.length;
        characterCountNoSpaces += base.replace(/\s/g, '').length;
        if (wordIndex > 0 && /^[A-Z][a-z]{2,}$/.test(base)) properNounCandidates.add(base.toLowerCase());
      });
      if (sentenceWords > 0) {
        sentences.push({
          index: sentenceIndex,
          text: span.text,
          start,
          end: start + span.end,
          tokenStart: sentenceTokenStart,
          tokenEnd: tokens.length,
          paragraphIndex,
          wordCount: sentenceWords,
        });
        longestSentenceWords = Math.max(longestSentenceWords, sentenceWords);
      }
    });

    // The final token of every paragraph carries the paragraph break, which
    // outranks a sentence or clause break for pacing purposes.
    if (tokens.length > paragraphTokenStart) {
      const lastIndex = tokens.length - 1;
      tokens[lastIndex] = { ...tokens[lastIndex]!, breakAfter: 'paragraph' };
      paragraphBreaks.push(lastIndex);
    }

    if (paragraphWords > 0 || paragraph.kind === 'heading') {
      paragraphModel.push({
        index: paragraphIndex,
        kind: paragraph.kind,
        level: paragraph.level ?? 0,
        text,
        start,
        end,
        tokenStart: paragraphTokenStart,
        tokenEnd: tokens.length,
        sentenceStart: paragraphSentenceStart,
        sentenceEnd: sentences.length,
        wordCount: paragraphWords,
        ...(paragraph.page !== undefined ? { page: paragraph.page } : {}),
        ...(paragraph.href !== undefined ? { href: paragraph.href } : {}),
      });
    }
  });

  if (tokens.length > paragraphBreaks.length) {
    const lastIndex = tokens.length - 1;
    const lastToken = tokens[lastIndex]!;
    tokens[lastIndex] = { ...lastToken, breakAfter: 'chapter' };
    if (!paragraphBreaks.includes(lastIndex)) paragraphBreaks.push(lastIndex);
  }

  const text = pieces.join('');
  const modelDiagnostics = diagnostics;

  if (truncated) {
    pushDiagnostic('warning', 'token-limit', `Reading stream truncated at the ${tokenLimit.toLocaleString('en-US')} token guard.`);
  }
  if (wordCount === 0) {
    pushDiagnostic('error', 'no-text', 'No readable text was extracted from this document.');
  }

  const chapters = buildChapters(input, paragraphModel, pushDiagnostic);
  // Chapter-final tokens pause slightly longer than paragraph-final tokens.
  for (const chapter of chapters) {
    const lastParagraph = paragraphModel.find((paragraph) => paragraph.index === chapter.paragraphEnd);
    const lastTokenIndex = lastParagraph ? lastParagraph.tokenEnd - 1 : -1;
    if (lastTokenIndex >= 0 && tokens[lastTokenIndex]) {
      tokens[lastTokenIndex] = { ...tokens[lastTokenIndex]!, breakAfter: 'chapter' };
    }
  }

  const complexWords = countComplexWords(
    tokens.filter((token) => !token.symbolic).map((token) => token.text),
    { minimumSyllables: 3, properNouns: properNounCandidates },
  );

  const metrics = computeReadability(
    {
      text,
      words: wordCount,
      sentences: sentences.length,
      syllables: syllableTotal,
      complexWords,
      characters: characterCount,
      charactersNoSpaces: characterCountNoSpaces,
      paragraphs: paragraphModel.length,
    },
    longestSentenceWords,
  );

  return {
    format: input.format,
    fileName: input.fileName,
    byteLength: input.byteLength ?? 0,
    encoding: input.encoding ?? 'utf-8',
    metadata: createMetadata(input.metadata ?? {}),
    text,
    tokens,
    sentences,
    paragraphs: paragraphModel,
    chapters,
    diagnostics: modelDiagnostics,
    paragraphBreaks,
    metrics,
    ingestMs: input.ingestMs ?? 0,
    ...(input.pages && input.pages.length > 0 ? { pages: input.pages } : {}),
  };
};

type PushDiagnostic = (level: DiagnosticLevel, code: string, message: string, detail?: string) => void;

const buildChapters = (
  input: BuildModelInput,
  paragraphs: readonly ParagraphNode[],
  pushDiagnostic: PushDiagnostic,
): readonly ChapterNode[] => {
  if (paragraphs.length === 0) return [];
  const explicit = input.chapters ?? [];
  const boundaries: { title: string; level: number; paragraphIndex: number; href?: string; page?: number }[] = [];
  if (explicit.length > 0) {
    for (const chapter of explicit) boundaries.push({ ...chapter });
  } else {
    for (const paragraph of paragraphs) {
      if (paragraph.kind === 'heading' && paragraph.level >= 1 && paragraph.level <= 2) {
        boundaries.push({ title: paragraph.text, level: paragraph.level, paragraphIndex: paragraph.index });
      }
    }
    if (boundaries.length === 0) {
      boundaries.push({ title: defaultChapterTitle(input.format), level: 1, paragraphIndex: paragraphs[0]!.index });
    } else if (boundaries[0]!.paragraphIndex > paragraphs[0]!.index) {
      boundaries.unshift({ title: 'Front matter', level: 0, paragraphIndex: paragraphs[0]!.index });
    }
  }
  const chapters: ChapterNode[] = [];
  boundaries.forEach((boundary, index) => {
    const next = boundaries[index + 1];
    const startParagraph = boundary.paragraphIndex;
    const endParagraph = next ? next.paragraphIndex - 1 : paragraphs[paragraphs.length - 1]!.index;
    const included = paragraphs.filter((paragraph) => paragraph.index >= startParagraph && paragraph.index <= endParagraph);
    if (included.length === 0) return;
    const wordCount = included.reduce((total, paragraph) => total + paragraph.wordCount, 0);
    const first = included[0]!;
    const last = included[included.length - 1]!;
    chapters.push({
      index: chapters.length,
      title: normalizeParagraphText(boundary.title).slice(0, 160) || `Section ${chapters.length + 1}`,
      level: boundary.level,
      paragraphStart: first.index,
      paragraphEnd: last.index,
      wordCount,
      ...(boundary.href !== undefined ? { href: boundary.href } : {}),
      ...(boundary.page !== undefined ? { page: boundary.page } : {}),
    });
  });
  if (chapters.length === 0) {
    pushDiagnostic('info', 'no-chapters', 'No chapter structure was detected; the whole document is one section.');
  }
  return chapters;
};

/** Sentence index containing a token, using the offsets recorded at build time. */
export const sentenceIndexForToken = (model: DocumentModel, tokenIndex: number): number => {
  const token = model.tokens[Math.min(Math.max(tokenIndex, 0), Math.max(0, model.tokens.length - 1))];
  return token ? token.sentenceIndex : 0;
};

/** The first token index of the sentence that contains `tokenIndex`. */
export const sentenceStartToken = (model: DocumentModel, tokenIndex: number): number => {
  const token = model.tokens[tokenIndex];
  if (!token) return 0;
  return model.sentences[token.sentenceIndex]?.tokenStart ?? 0;
};

/** The first token index of the paragraph that contains `tokenIndex`. */
export const paragraphStartToken = (model: DocumentModel, tokenIndex: number): number => {
  const token = model.tokens[tokenIndex];
  if (!token) return 0;
  return model.paragraphs.find((paragraph) => paragraph.index === token.paragraphIndex)?.tokenStart ?? 0;
};

export const chapterForToken = (model: DocumentModel, tokenIndex: number): ChapterNode | undefined => {
  const token = model.tokens[tokenIndex];
  if (!token) return model.chapters[0];
  return model.chapters.find(
    (chapter) => token.paragraphIndex >= chapter.paragraphStart && token.paragraphIndex <= chapter.paragraphEnd,
  ) ?? model.chapters[0];
};
