/**
 * Format detection and dispatch.
 *
 * Detection reads the bytes rather than trusting the extension: a `.txt` file
 * that actually contains RTF or a package signature is handled as what it is,
 * and a wrong or missing extension still opens. The full-text formats are
 * decoded here; the package formats (DOCX, EPUB) and PDF are handed to their
 * own readers, with PDF decoding injected so this module stays testable outside
 * a browser.
 */

import { decodeBuffer } from './encoding-engine';
import { buildDocumentModel, type BuildModelInput } from './segmentation-engine';
import { ingestPlainText } from './text-ingest';
import { ingestMarkdown } from './markdown-ingest';
import { ingestHtml, type HtmlStructure } from './html-ingest';
import { ingestRtf } from './rtf-ingest';
import { ingestDocx } from './docx-ingest';
import { ingestEpub } from './epub-ingest';
import { ingestPdf } from './pdf-ingest';
import type {
  DocumentModel,
  IngestDiagnostic,
  IngestOptions,
  IngestResult,
  PdfTextExtractor,
  SourceFormat,
} from './sightline-types';

const EXTENSION_FORMATS: Record<string, SourceFormat> = {
  pdf: 'pdf',
  epub: 'epub',
  docx: 'docx',
  docm: 'docx',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  rtf: 'rtf',
  txt: 'text',
  text: 'text',
};

/**
 * Extensions that are certainly binary or belong to a different kind of tool.
 * Refusing them with a clear message beats decoding a spreadsheet or a JPEG as
 * text and handing the reader a page of mojibake.
 */
const UNSUPPORTED_EXTENSIONS = new Set([
  'xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv',
  'ppt', 'pptx', 'odp', 'odt', 'pages', 'numbers', 'key',
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'bmp', 'tif', 'tiff', 'svg',
  'mp3', 'mp4', 'wav', 'ogg', 'm4a', 'mov', 'avi', 'mkv',
  'exe', 'dmg', 'iso', 'bin', 'woff', 'woff2', 'ttf', 'otf', 'db', 'sqlite',
]);

const MEDIA_TYPE_FORMATS: Record<string, SourceFormat> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-word.document.macroenabled.12': 'docx',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'text',
};

export const isUnsupportedExtension = (fileName: string): boolean =>
  UNSUPPORTED_EXTENSIONS.has(extensionOf(fileName));

export const extensionOf = (fileName: string): string => {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match ? match[1]!.toLowerCase() : '';
};

const startsWith = (bytes: Uint8Array<ArrayBufferLike>, signature: readonly number[]): boolean => {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
};

const looksLikeZip = (bytes: Uint8Array<ArrayBufferLike>): boolean =>
  startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
  || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
  || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);

/** Distinguish an EPUB from a DOCX, which are both ZIP containers. */
const classifyZip = (text: string): SourceFormat | null => {
  const head = text.slice(0, 4096);
  if (/META-INF\/container\.xml/.test(head)) return 'epub';
  if (/word\/document\.xml|wordprocessingml/i.test(head)) return 'docx';
  if (/mimetype[^\n]*application\/epub\+zip/i.test(head)) return 'epub';
  return null;
};

const looksLikeRtf = (text: string): boolean => /^\s*\{\\rtf\d/.test(text);

const looksLikeHtml = (text: string): boolean => {
  const head = text.slice(0, 4096).trim().toLowerCase();
  return /^<!doctype html/.test(head)
    || /^<html[\s>]/.test(head)
    || (/<(?:article|body|main|div|p|h1)\b/.test(head) && /<\/[a-z]+>/.test(head));
};

const looksLikeMarkdown = (text: string): boolean => {
  const head = text.slice(0, 4096);
  let signals = 0;
  if (/^#{1,6}\s+\S/m.test(head)) signals += 1;
  if (/^\s*[-*+]\s+\S/m.test(head)) signals += 1;
  if (/\[[^\]]+\]\([^)]+\)/.test(head)) signals += 1;
  if (/^\s*```/m.test(head)) signals += 1;
  if (/^\s*\|.+\|\s*$/m.test(head)) signals += 1;
  if (/^\s*>\s+\S/m.test(head)) signals += 1;
  if (/^\s*\d+\.\s+\S/m.test(head)) signals += 1;
  return signals >= 2;
};

const looksLikeMarkdownFrontmatter = (text: string): boolean => /^\s*---\r?\n[\s\S]{0,2048}?\r?\n---/.test(text);

export interface FormatDetection {
  readonly format: SourceFormat;
  readonly reason: string;
}

export const detectFormat = (
  bytes: Uint8Array<ArrayBufferLike>,
  fileName: string,
  mediaType = '',
): FormatDetection => {
  const extensionFormat = EXTENSION_FORMATS[extensionOf(fileName)];
  const mediaFormat = MEDIA_TYPE_FORMATS[mediaType.toLowerCase().split(';')[0]!.trim()];

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { format: 'pdf', reason: '%PDF signature' };
  }
  if (looksLikeZip(bytes)) {
    const probe = decodeBuffer(bytes.subarray(0, 8192)).text;
    const classified = classifyZip(probe);
    if (classified) return { format: classified, reason: `ZIP container containing ${classified === 'epub' ? 'META-INF/container.xml' : 'word/document.xml'}` };
    if (extensionFormat === 'epub' || extensionFormat === 'docx') {
      return { format: extensionFormat, reason: 'ZIP container matching the file extension' };
    }
    return { format: 'docx', reason: 'ZIP container with no recognised package descriptor' };
  }

  const { text, detection } = decodeBuffer(bytes.subarray(0, 65536));
  if (looksLikeRtf(text)) return { format: 'rtf', reason: '\\rtf control word' };
  if (looksLikeHtml(text)) return { format: 'html', reason: 'HTML markup signature' };
  if (looksLikeMarkdownFrontmatter(text)) return { format: 'markdown', reason: 'Markdown front matter block' };
  if (looksLikeMarkdown(text)) return { format: 'markdown', reason: 'Markdown block syntax' };

  if (extensionFormat === 'html' || mediaFormat === 'html') return { format: 'html', reason: 'extension or media type' };
  if (extensionFormat === 'markdown' || mediaFormat === 'markdown') return { format: 'markdown', reason: 'extension or media type' };
  if (extensionFormat && extensionFormat !== 'text') return { format: extensionFormat, reason: 'file extension' };
  if (mediaFormat) return { format: mediaFormat, reason: 'media type' };
  return { format: 'text', reason: detection.reason };
};

export interface IngestDependencies {
  readonly pdf?: PdfTextExtractor;
  /** Called with ingestion progress messages so a long decode can report itself. */
  readonly onProgress?: (message: string) => void;
}

const toModelInput = (
  format: SourceFormat,
  fileName: string,
  byteLength: number,
  encoding: string,
  metadata: BuildModelInput['metadata'],
  structure: { paragraphs: BuildModelInput['paragraphs']; chapters?: BuildModelInput['chapters']; diagnostics?: readonly IngestDiagnostic[] },
  options: IngestOptions,
  ingestMs: number,
): BuildModelInput => ({
  format,
  fileName,
  byteLength,
  encoding,
  metadata,
  paragraphs: structure.paragraphs,
  chapters: structure.chapters ?? [],
  diagnostics: structure.diagnostics ?? [],
  proseOnly: options.proseOnly ?? false,
  includeNotes: options.includeNotes ?? false,
  tokenLimit: options.tokenLimit,
  ingestMs,
});

const htmlMetadata = (structure: HtmlStructure, fileName: string) => ({
  title: structure.title || fileName.replace(/\.[^.]+$/, ''),
  author: structure.byline,
  description: structure.description,
});

const success = (model: DocumentModel, options: IngestOptions): IngestResult => {
  const title = options.title?.trim();
  const titled = title && title.length > 0 ? { ...model, title } : model;
  return { ok: true, model: titled, diagnostics: titled.diagnostics };
};

export const ingestDocument = async (
  bytes: Uint8Array<ArrayBufferLike>,
  fileName: string,
  options: IngestOptions = {},
  dependencies: IngestDependencies = {},
): Promise<IngestResult> => {
  const startedAt = Date.now();
  const diagnostics: IngestDiagnostic[] = [];
  const detection = options.format
    ? { format: options.format, reason: 'explicitly selected' }
    : detectFormat(bytes, fileName);
  const format = detection.format;
  if (!options.format && isUnsupportedExtension(fileName)) {
    return {
      ok: false,
      code: 'unsupported-format',
      message: `${fileName} is a ${extensionOf(fileName).toUpperCase()} file, which this reader does not open. Convert it to PDF, EPUB, DOCX, Markdown, HTML, RTF, or plain text first.`,
      diagnostics: [{
        level: 'error',
        code: 'unsupported-format',
        message: 'The file type is outside the supported reading formats.',
      }],
    };
  }
  const { text, detection: encoding } = decodeBuffer(bytes);
  const report = (message: string) => dependencies.onProgress?.(message);

  try {
    switch (format) {
      case 'pdf': {
        if (!dependencies.pdf) {
          return {
            ok: false,
            code: 'pdf-unavailable',
            message: 'PDF decoding needs a browser worker, which is not available in this context.',
            diagnostics: [{
              level: 'error',
              code: 'pdf-unavailable',
              message: 'PDF decoding requires the browser worker runtime.',
            }],
          };
        }
        report(`Decoding ${fileName} with the PDF worker…`);
        const structure = await ingestPdf(bytes, fileName, dependencies.pdf);
        diagnostics.push(...structure.diagnostics);
        if (structure.pageCount > 0) {
          const extracted = structure.pageCharacterCounts.reduce((total, count) => total + count, 0);
          diagnostics.push({
            level: 'info',
            code: 'pdf-pages',
            message: `${structure.pageCount} pages decoded, ${extracted.toLocaleString('en-US')} characters extracted.`,
          });
        }
        const model = buildDocumentModel(toModelInput(
          format,
          fileName,
          bytes.byteLength,
          'binary',
          { ...structure.metadata, title: structure.metadata.title || fileName.replace(/\.pdf$/i, '') },
          structure,
          options,
          Date.now() - startedAt,
        ));
        return success(model, options);
      }

      case 'epub': {
        report(`Unpacking ${fileName}…`);
        const structure = await ingestEpub(bytes, fileName);
        diagnostics.push(...structure.diagnostics);
        const model = buildDocumentModel(toModelInput(
          format,
          fileName,
          bytes.byteLength,
          'binary',
          { ...structure.metadata, title: structure.metadata.title || fileName.replace(/\.epub$/i, '') },
          structure,
          options,
          Date.now() - startedAt,
        ));
        return success(model, options);
      }

      case 'docx': {
        report(`Reading ${fileName}…`);
        const structure = await ingestDocx(bytes, fileName);
        diagnostics.push(...structure.diagnostics);
        const model = buildDocumentModel(toModelInput(
          format,
          fileName,
          bytes.byteLength,
          'binary',
          { ...structure.metadata, title: structure.metadata.title || fileName.replace(/\.docx$/i, '') },
          structure,
          options,
          Date.now() - startedAt,
        ));
        return success(model, options);
      }

      case 'rtf': {
        report(`Transcoding ${fileName}…`);
        const structure = ingestRtf(text);
        diagnostics.push(...structure.diagnostics);
        const metadata = {
          title: structure.info.title || fileName.replace(/\.rtf$/i, ''),
          author: structure.info.author ?? '',
          subject: structure.info.subject ?? '',
          description: structure.info.comment ?? structure.info.documentComment ?? '',
          keywords: (structure.info.keywords ?? '').split(/[,;]\s*/).filter((entry) => entry.length > 0),
          extra: Object.fromEntries(Object.entries(structure.info).filter(([key]) => !['title', 'author', 'subject', 'comment', 'documentComment', 'keywords'].includes(key))),
        };
        const model = buildDocumentModel(toModelInput(
          format, fileName, bytes.byteLength, encoding.encoding, metadata, structure, options, Date.now() - startedAt,
        ));
        return success(model, options);
      }

      case 'html': {
        report(`Reading ${fileName}…`);
        const structure = ingestHtml(text);
        diagnostics.push(...structure.diagnostics);
        const model = buildDocumentModel(toModelInput(
          format,
          fileName,
          bytes.byteLength,
          encoding.encoding,
          htmlMetadata(structure, fileName),
          structure,
          options,
          Date.now() - startedAt,
        ));
        return success(model, options);
      }

      case 'markdown': {
        report(`Reading ${fileName}…`);
        const structure = ingestMarkdown(text);
        diagnostics.push(...structure.diagnostics);
        const frontmatter = structure.frontmatter;
        const metadata = {
          title: frontmatter.title ?? frontmatter.name ?? fileName.replace(/\.mdx?$/i, ''),
          author: frontmatter.author ?? frontmatter.authors ?? '',
          description: frontmatter.description ?? frontmatter.summary ?? '',
          keywords: (frontmatter.tags ?? frontmatter.keywords ?? frontmatter.categories ?? '')
            .replace(/[[\]"']/g, '')
            .split(/[,;]\s*/)
            .filter((entry) => entry.length > 0),
          created: frontmatter.date ?? '',
          extra: Object.fromEntries(
            Object.entries(frontmatter).filter(([key]) => !['title', 'name', 'author', 'authors', 'description', 'summary', 'tags', 'keywords', 'categories', 'date'].includes(key)),
          ),
        };
        const model = buildDocumentModel(toModelInput(
          format, fileName, bytes.byteLength, encoding.encoding, metadata, structure, options, Date.now() - startedAt,
        ));
        return success(model, options);
      }

      default: {
        report(`Reading ${fileName}…`);
        const structure = ingestPlainText(text);
        diagnostics.push(...structure.diagnostics);
        const firstHeading = structure.chapters.find((chapter) => chapter.level <= 2)?.title;
        const model = buildDocumentModel(toModelInput(
          format,
          fileName,
          bytes.byteLength,
          encoding.encoding,
          { title: firstHeading || fileName.replace(/\.[^.]+$/, '') },
          structure,
          options,
          Date.now() - startedAt,
        ));
        return success(model, options);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'ingest-failed',
      message: `This document could not be read (${format}): ${message}`,
      diagnostics: [
        ...diagnostics,
        { level: 'error', code: 'ingest-failed', message: `The ${format.toUpperCase()} reader failed.`, detail: message },
      ],
    };
  }
};

export interface PasteIngestOptions extends IngestOptions {
  /** Name used for the document; also the fallback title. */
  readonly label?: string;
}

/** Ingest pasted or typed text with an explicit format. */
export const ingestPastedText = async (
  value: string,
  options: PasteIngestOptions = {},
): Promise<IngestResult> => {
  const label = options.label ?? 'Pasted text';
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      code: 'empty-input',
      message: 'There was no text to read.',
      diagnostics: [{ level: 'error', code: 'empty-input', message: 'The pasted text was empty.' }],
    };
  }
  const bytes = new TextEncoder().encode(value);
  const detection = options.format ?? detectFormat(bytes, label).format;
  const resolved: SourceFormat = detection === 'html' || detection === 'markdown' || detection === 'rtf'
    ? detection
    : 'text';
  return ingestDocument(bytes, label, { ...options, format: resolved });
};

export const isBinaryFormat = (format: SourceFormat): boolean =>
  format === 'pdf' || format === 'epub' || format === 'docx';

export const describeModel = (model: DocumentModel): string => {
  const chapterCount = model.chapters.length;
  return `${model.tokens.length.toLocaleString('en-US')} words · ${model.sentences.length.toLocaleString('en-US')} sentences · ${model.paragraphs.length.toLocaleString('en-US')} paragraphs · ${chapterCount} ${chapterCount === 1 ? 'section' : 'sections'}`;
};
