/**
 * Export planning.
 *
 * Every download the studio offers goes through this module, so the file name,
 * media type, and content are decided in one place and the interface can list
 * what will be produced before anything is rendered. Rows for tabular exports
 * are built here too, from the analytics and vocabulary engines.
 */

import { unparse } from 'papaparse';
import { analyticsPayload, sessionRows, type StoredDocument, type StoredSession } from './analytics-engine';
import { buildDocxBytes, DEFAULT_DOCX_EXPORT, type DocxExportOptions } from './export-docx';
import { buildEpubArchive, DEFAULT_EPUB_EXPORT, type EpubExportOptions } from './export-epub';
import { buildExportHtml, buildExportMarkdown, buildExportText, DEFAULT_HTML_EXPORT, type HtmlExportOptions } from './export-html';
import { buildPdfBytes, DEFAULT_PDF_EXPORT, estimatePageCount, type PdfExportOptions } from './export-pdf';
import { exportFileName, type MetadataDraft } from './metadata-studio';
import { exportState, type SightlineState } from './sightline-store';
import { vocabularyPayload, vocabularyRows, type VocabularyEntry } from './vocabulary-engine';
import type { DocumentModel } from './sightline-types';

export type ExportId =
  | 'weighted-pdf'
  | 'weighted-epub'
  | 'weighted-html'
  | 'weighted-docx'
  | 'gradient-html'
  | 'gradient-pdf'
  | 'gradient-epub'
  | 'markdown'
  | 'text'
  | 'analytics-csv'
  | 'analytics-json'
  | 'vocabulary-csv'
  | 'vocabulary-json'
  | 'reader-state';

export interface ExportDefinition {
  readonly id: ExportId;
  readonly label: string;
  readonly detail: string;
  readonly mediaType: string;
  readonly extension: string;
  /** True when the export needs a finished document model. */
  readonly needsDocument: boolean;
}

export const EXPORT_DEFINITIONS: readonly ExportDefinition[] = [
  { id: 'weighted-pdf', label: 'Weighted PDF', detail: 'Fixation-weighted type in a paginated PDF with document metadata.', mediaType: 'application/pdf', extension: 'pdf', needsDocument: true },
  { id: 'weighted-epub', label: 'Weighted EPUB', detail: 'Fixation-weighted XHTML in an EPUB package with a contents document.', mediaType: 'application/epub+zip', extension: 'epub', needsDocument: true },
  { id: 'weighted-html', label: 'Weighted HTML', detail: 'One self-contained HTML file with the weighting baked in.', mediaType: 'text/html', extension: 'html', needsDocument: true },
  { id: 'weighted-docx', label: 'Weighted Word document', detail: 'A .docx with the weighting as real bold runs, ready for comments and track changes.', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', needsDocument: true },
  { id: 'gradient-html', label: 'Gradient HTML', detail: 'One self-contained HTML file with a trail gradient on every line.', mediaType: 'text/html', extension: 'html', needsDocument: true },
  { id: 'gradient-pdf', label: 'Gradient PDF', detail: 'A paginated PDF where each word carries its palette colour.', mediaType: 'application/pdf', extension: 'pdf', needsDocument: true },
  { id: 'gradient-epub', label: 'Gradient EPUB', detail: 'An EPUB package with palette-coloured words.', mediaType: 'application/epub+zip', extension: 'epub', needsDocument: true },
  { id: 'markdown', label: 'Markdown', detail: 'The document as Markdown with its metadata as front matter.', mediaType: 'text/markdown', extension: 'md', needsDocument: true },
  { id: 'text', label: 'Plain text', detail: 'The reading stream with no formatting.', mediaType: 'text/plain', extension: 'txt', needsDocument: true },
  { id: 'analytics-csv', label: 'Analytics CSV', detail: 'One row per reading session, with the rates and pauses recorded.', mediaType: 'text/csv', extension: 'csv', needsDocument: false },
  { id: 'analytics-json', label: 'Analytics JSON', detail: 'Sessions, per-document rollups, and the velocity series.', mediaType: 'application/json', extension: 'json', needsDocument: false },
  { id: 'vocabulary-csv', label: 'Vocabulary CSV', detail: 'The word bank with weights, timings, and review dates.', mediaType: 'text/csv', extension: 'csv', needsDocument: false },
  { id: 'vocabulary-json', label: 'Vocabulary JSON', detail: 'The word bank with retention figures.', mediaType: 'application/json', extension: 'json', needsDocument: false },
  { id: 'reader-state', label: 'Reader state', detail: 'Settings, bookmarks, highlights, notes, and positions, for backup.', mediaType: 'application/json', extension: 'json', needsDocument: false },
];

export const exportById = (id: ExportId): ExportDefinition =>
  EXPORT_DEFINITIONS.find((definition) => definition.id === id) ?? EXPORT_DEFINITIONS[0]!;

export interface ExportInputs {
  readonly model?: DocumentModel;
  readonly draft: MetadataDraft;
  readonly html: HtmlExportOptions;
  readonly pdf: PdfExportOptions;
  readonly epub: EpubExportOptions;
  readonly docx: DocxExportOptions;
  readonly sessions: readonly StoredSession[];
  readonly documents: readonly StoredDocument[];
  readonly vocabulary: readonly VocabularyEntry[];
  readonly state: SightlineState;
}

export interface PlannedExport {
  readonly definition: ExportDefinition;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  /** True when the content was written after the reader asked for it. */
  readonly rendered: boolean;
}

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const csvBytes = (rows: readonly (readonly (string | number)[])[]): Uint8Array =>
  encode(unparse(rows.map((row) => [...row]), { newline: '\r\n' }));

/**
 * Render one export. The two paginated and packaged formats are the only slow
 * ones, so they are rendered on demand rather than prepared in advance.
 */
export const planExport = async (id: ExportId, inputs: ExportInputs): Promise<PlannedExport> => {
  const definition = exportById(id);
  const suffix = (): string => {
    switch (id) {
      case 'weighted-pdf': case 'weighted-html': case 'weighted-epub': case 'weighted-docx': return 'weighted';
      case 'gradient-pdf': case 'gradient-html': case 'gradient-epub': return 'gradient';
      case 'markdown': return 'document';
      case 'text': return 'text';
      case 'analytics-csv': case 'analytics-json': return 'reading-analytics';
      case 'vocabulary-csv': case 'vocabulary-json': return 'vocabulary';
      default: return 'reader-state';
    }
  };

  const fileName = id === 'reader-state'
    ? 'sightline-reader-state.json'
    : exportFileName(inputs.draft, suffix(), definition.extension);

  if (definition.needsDocument && !inputs.model) {
    throw new Error('This export needs a document. Open or paste one first.');
  }
  const model = inputs.model;

  switch (id) {
    case 'weighted-pdf': {
      const bytes = await buildPdfBytes(model!, inputs.draft, { ...inputs.pdf, treatment: inputs.pdf.treatment === 'plain' ? 'emphasis' : 'emphasis-gradient' });
      return { definition, fileName, mediaType: definition.mediaType, bytes, rendered: true };
    }
    case 'gradient-pdf': {
      const bytes = await buildPdfBytes(model!, inputs.draft, { ...inputs.pdf, treatment: 'gradient' });
      return { definition, fileName, mediaType: definition.mediaType, bytes, rendered: true };
    }
    case 'weighted-epub': {
      const result = await buildEpubArchive(model!, inputs.draft, {
        ...(inputs.epub ?? DEFAULT_EPUB_EXPORT),
        treatment: 'emphasis',
        includeCover: inputs.epub?.includeCover ?? false,
      });
      return { definition, fileName: exportFileName(inputs.draft, 'weighted', 'epub'), mediaType: definition.mediaType, bytes: result.bytes, rendered: true };
    }
    case 'gradient-epub': {
      const result = await buildEpubArchive(model!, inputs.draft, { ...(inputs.epub ?? DEFAULT_EPUB_EXPORT), treatment: 'gradient' });
      return { definition, fileName: exportFileName(inputs.draft, 'gradient', 'epub'), mediaType: definition.mediaType, bytes: result.bytes, rendered: true };
    }
    case 'weighted-docx': {
      const result = await buildDocxBytes(model!, inputs.draft, { ...(inputs.docx ?? DEFAULT_DOCX_EXPORT), treatment: 'emphasis' });
      return { definition, fileName: result.fileName, mediaType: definition.mediaType, bytes: result.bytes, rendered: true };
    }
    case 'weighted-html':
    case 'gradient-html': {
      const gradient = id === 'gradient-html' ? inputs.html.gradient : null;
      const emphasis = id === 'gradient-html' ? null : inputs.html.emphasis;
      const bytes = encode(buildExportHtml(model!, inputs.draft, { ...inputs.html, gradient, emphasis }));
      return { definition, fileName, mediaType: definition.mediaType, bytes, rendered: true };
    }
    case 'markdown':
      return { definition, fileName, mediaType: definition.mediaType, bytes: encode(buildExportMarkdown(model!, inputs.draft)), rendered: true };
    case 'text':
      return { definition, fileName, mediaType: definition.mediaType, bytes: encode(buildExportText(model!)), rendered: true };
    case 'analytics-csv':
      return { definition, fileName, mediaType: definition.mediaType, bytes: csvBytes(sessionRows(inputs.sessions)), rendered: true };
    case 'analytics-json':
      return { definition, fileName, mediaType: definition.mediaType, bytes: encode(analyticsPayload(inputs.sessions, inputs.documents)), rendered: true };
    case 'vocabulary-csv':
      return { definition, fileName, mediaType: definition.mediaType, bytes: csvBytes(vocabularyRows(inputs.vocabulary)), rendered: true };
    case 'vocabulary-json':
      return { definition, fileName, mediaType: definition.mediaType, bytes: encode(vocabularyPayload(inputs.vocabulary)), rendered: true };
    default:
      return { definition, fileName, mediaType: definition.mediaType, bytes: encode(exportState(inputs.state)), rendered: true };
  }
};

/** What each export will contain, for the export panel summary. */
export const describeExports = (model: DocumentModel | undefined, inputs: ExportInputs): readonly (ExportDefinition & { readonly available: boolean; readonly note: string })[] =>
  EXPORT_DEFINITIONS.map((definition) => {
    if (definition.needsDocument && !model) {
      return { ...definition, available: false, note: 'Open a document to enable this export.' };
    }
    if (definition.id === 'reader-state') {
      return {
        ...definition,
        available: true,
        note: `${inputs.state.bookmarks.length} bookmark(s), ${inputs.state.highlights.length} highlight(s), ${inputs.state.notes.length} note(s).`,
      };
    }
    if (definition.id === 'analytics-csv' || definition.id === 'analytics-json') {
      return {
        ...definition,
        available: inputs.sessions.length > 0,
        note: inputs.sessions.length > 0
          ? `${inputs.sessions.length} session${inputs.sessions.length === 1 ? '' : 's'} recorded locally.`
          : 'No sessions recorded yet; read for a moment and the history fills in.',
      };
    }
    if (definition.id === 'vocabulary-csv' || definition.id === 'vocabulary-json') {
      return {
        ...definition,
        available: inputs.vocabulary.length > 0,
        note: inputs.vocabulary.length > 0
          ? `${inputs.vocabulary.length} word${inputs.vocabulary.length === 1 ? '' : 's'} in the bank.`
          : 'The word bank is empty; collect words from a session or mark them by hand.',
      };
    }
    if (definition.id === 'weighted-pdf' || definition.id === 'gradient-pdf') {
      return { ...definition, available: true, note: `About ${estimatePageCount(model!, inputs.pdf)} pages at the current settings.` };
    }
    if (definition.id === 'weighted-docx') {
      return {
        ...definition,
        available: true,
        note: `A Word document with ${model!.metrics.words.toLocaleString('en-US')} words weighted for fixation.`,
      };
    }
    if (definition.id === 'weighted-epub' || definition.id === 'gradient-epub') {
      const chapters = Math.max(1, model!.chapters.length);
      return { ...definition, available: true, note: `${chapters} chapter document${chapters === 1 ? '' : 's'} in the package.` };
    }
    const words = model!.metrics.words.toLocaleString('en-US');
    return { ...definition, available: true, note: `${words} words and ${model!.metrics.sentences.toLocaleString('en-US')} sentences.` };
  });

export { DEFAULT_HTML_EXPORT, DEFAULT_PDF_EXPORT, DEFAULT_EPUB_EXPORT, DEFAULT_DOCX_EXPORT };
