/**
 * Canonical model for Sightline Velocity Studio.
 *
 * Every ingestion path produces this shape, and every reader, drill, analysis,
 * and export path consumes it. Nothing here depends on React, the DOM, or a
 * storage API so the whole pipeline stays unit-testable.
 */

export type SourceFormat =
  | 'pdf'
  | 'epub'
  | 'docx'
  | 'markdown'
  | 'html'
  | 'rtf'
  | 'text'
  | 'clipboard';

export const SOURCE_FORMAT_LABELS: Record<SourceFormat, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  docx: 'Word (DOCX)',
  markdown: 'Markdown',
  html: 'HTML',
  rtf: 'Rich Text (RTF)',
  text: 'Plain text',
  clipboard: 'Pasted text',
};

/** What follows a token, which drives the pacing multipliers. */
export type BreakKind = 'none' | 'clause' | 'sentence' | 'paragraph' | 'chapter';

export type ParagraphKind =
  | 'body'
  | 'heading'
  | 'list-item'
  | 'quote'
  | 'code'
  | 'table'
  | 'caption'
  | 'footnote'
  | 'endnote'
  | 'byline';

export interface TokenRecord {
  /** Global token index across the whole document. */
  readonly index: number;
  /** Display text exactly as it should be shown in the reader. */
  readonly text: string;
  /** Character offset of `text` inside `DocumentModel.text`. */
  readonly start: number;
  readonly end: number;
  /** Index of the optimal recognition point character inside `text`. */
  readonly orp: number;
  /** Estimated syllable count; 0 for tokens with no letters. */
  readonly syllables: number;
  /** Alphabetic character count, used by the length compensator. */
  readonly letters: number;
  /** Letter-free token (a number, symbol run, or standalone punctuation mark). */
  readonly symbolic: boolean;
  /** Trailing punctuation retained on the token, e.g. "." or "),". */
  readonly trailing: string;
  readonly breakAfter: BreakKind;
  readonly paragraphIndex: number;
  readonly sentenceIndex: number;
}

export interface SentenceNode {
  readonly index: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly paragraphIndex: number;
  readonly wordCount: number;
}

export interface ParagraphNode {
  readonly index: number;
  readonly kind: ParagraphKind;
  /** Heading level 1–6 for headings; list depth for list items; 0 otherwise. */
  readonly level: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
  readonly wordCount: number;
  /** 1-based page number when the source has pages. */
  readonly page?: number;
  /** Source href when the source has documents or chapter files. */
  readonly href?: string;
}

export interface ChapterNode {
  readonly index: number;
  readonly title: string;
  /** 1 for a top-level chapter, 2+ for nested sections, 0 for front matter. */
  readonly level: number;
  readonly paragraphStart: number;
  readonly paragraphEnd: number;
  readonly wordCount: number;
  readonly href?: string;
  readonly page?: number;
}

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface IngestDiagnostic {
  readonly level: DiagnosticLevel;
  readonly code: string;
  readonly message: string;
  /** 1-based source page, when the diagnostic is page-specific. */
  readonly page?: number;
  readonly detail?: string;
}

export interface DocumentMetadata {
  readonly title: string;
  readonly author: string;
  readonly language: string;
  readonly publisher: string;
  readonly description: string;
  readonly subject: string;
  readonly keywords: readonly string[];
  readonly identifier: string;
  readonly created: string;
  readonly modified: string;
  readonly rights: string;
  /** Extra format-specific fields such as `dcterms:modified` or DOCX `lastModifiedBy`. */
  readonly extra: Readonly<Record<string, string>>;
}

export interface ProseMetrics {
  readonly words: number;
  readonly sentences: number;
  readonly syllables: number;
  readonly complexWords: number;
  readonly characters: number;
  readonly charactersNoSpaces: number;
  readonly paragraphs: number;
  readonly readingMinutes: number;
  readonly speakingMinutes: number;
  readonly fleschReadingEase: number;
  readonly fleschKincaidGrade: number;
  readonly gunningFog: number;
  readonly averageSentenceWords: number;
  readonly longestSentenceWords: number;
}

export interface DocumentModel {
  readonly format: SourceFormat;
  readonly fileName: string;
  readonly byteLength: number;
  readonly encoding: string;
  readonly metadata: DocumentMetadata;
  /** Flattened text the tokens index into. */
  readonly text: string;
  readonly tokens: readonly TokenRecord[];
  readonly sentences: readonly SentenceNode[];
  readonly paragraphs: readonly ParagraphNode[];
  readonly chapters: readonly ChapterNode[];
  readonly diagnostics: readonly IngestDiagnostic[];
  readonly paragraphBreaks: readonly number[];
  readonly metrics: ProseMetrics;
  /** Milliseconds spent ingesting, for the ingestion report. */
  readonly ingestMs: number;
}

export interface IngestFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly diagnostics: readonly IngestDiagnostic[];
}

export interface IngestSuccess {
  readonly ok: true;
  readonly model: DocumentModel;
  readonly diagnostics: readonly IngestDiagnostic[];
}

export type IngestResult = IngestSuccess | IngestFailure;

export interface IngestOptions {
  /** Skip code blocks, tables, and captions when building the prose stream. */
  readonly proseOnly?: boolean;
  /** Include footnote and endnote bodies in the reading stream. */
  readonly includeNotes?: boolean;
  /** Maximum tokens to keep; documents above this are truncated with a diagnostic. */
  readonly tokenLimit?: number;
  /** Prefer this format over detection, for pasted text and overrides. */
  readonly format?: SourceFormat;
  /** Original file name, used for titles and detection. */
  readonly fileName?: string;
  /** Title to use in place of the one found in the document. */
  readonly title?: string;
}

/** Injectable text extractor so PDF decoding can be unit-tested without a browser. */
export interface PdfPageText {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly items: readonly PdfTextItem[];
}

export interface PdfTextItem {
  readonly str: string;
  /** Baseline y position in PDF user space (larger is higher on the page). */
  readonly y: number;
  readonly x: number;
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
}

export interface PdfExtraction {
  readonly pages: readonly PdfPageText[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly outline: readonly PdfOutlineEntry[];
}

export interface PdfOutlineEntry {
  readonly title: string;
  readonly pageNumber: number | null;
  readonly depth: number;
}

export interface PdfTextExtractor {
  extract(data: Uint8Array<ArrayBufferLike>): Promise<PdfExtraction>;
}

export const EMPTY_METADATA: DocumentMetadata = {
  title: '',
  author: '',
  language: '',
  publisher: '',
  description: '',
  subject: '',
  keywords: [],
  identifier: '',
  created: '',
  modified: '',
  rights: '',
  extra: {},
};

export const createMetadata = (patch: Partial<DocumentMetadata> = {}): DocumentMetadata => ({
  ...EMPTY_METADATA,
  ...patch,
  keywords: patch.keywords ? [...patch.keywords] : [],
  extra: patch.extra ? { ...patch.extra } : {},
});
