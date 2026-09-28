/**
 * EPUB export.
 *
 * The archive is built to the current specification: the `mimetype` entry is
 * first and stored uncompressed, the container names the package document, the
 * package declares its metadata and spine, and a navigation document carries
 * the contents. Text is XHTML with the same treatments the studio shows —
 * fixation weighting as `<b>` runs and the trail gradient as coloured spans.
 *
 * The structure produced here is a valid reading-system package; it is not run
 * through a conformance validator, and this module does not claim that it has
 * been. What it does guarantee is checked by the tests: the archive layout, the
 * package references, and the reading order.
 */

import JSZip from 'jszip';
import { gradientLineHtml, paletteById, type GradientOptions } from './gradient-engine';
import { emphasisHtml, type EmphasisConfig } from './typography-engine';
import { dublinCore, slugify, type MetadataDraft } from './metadata-studio';
import type { DocumentModel, ParagraphNode } from './sightline-types';

export type EpubTreatment = 'plain' | 'emphasis' | 'gradient' | 'emphasis-gradient';

export interface EpubExportOptions {
  readonly treatment: EpubTreatment;
  readonly emphasis: EmphasisConfig;
  readonly gradient: GradientOptions;
  readonly gradientPalette: string;
  readonly includeCover: boolean;
  readonly stylesheet: string;
}

export const DEFAULT_EPUB_EXPORT: EpubExportOptions = {
  treatment: 'emphasis',
  emphasis: { level: 3, fraction: 0.4, maxLetters: 4, minLetters: 1 },
  gradient: { direction: 'horizontal', intensity: 1, wash: false },
  gradientPalette: 'horizon',
  includeCover: false,
  stylesheet: `body { font-family: serif; line-height: 1.6; margin: 1rem; }
h1, h2, h3, h4, h5, h6 { font-family: sans-serif; line-height: 1.25; }
p { margin: 0 0 0.9rem; }
blockquote { margin: 1rem 1.5rem; font-style: italic; }
pre { font-family: monospace; white-space: pre-wrap; }
table, .sightline-table { font-size: 0.95em; }
.sightline-caption, .sightline-footnote { font-size: 0.9em; color: #555; }`,
};

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character] ?? character));

/** Paragraph text with the chosen treatment applied, as XHTML. */
export const paragraphXhtml = (
  model: DocumentModel,
  paragraph: ParagraphNode,
  options: EpubExportOptions,
): string => {
  const tokens = model.tokens.slice(paragraph.tokenStart, paragraph.tokenEnd);
  const text = tokens.map((token) => token.text).join(' ');
  const emphasise = options.treatment === 'emphasis' || options.treatment === 'emphasis-gradient';
  const gradient = options.treatment === 'gradient' || options.treatment === 'emphasis-gradient';
  if (gradient) return gradientLineHtml(text, paletteById(options.gradientPalette), options.gradient);
  if (emphasise) return emphasisHtml(tokens, options.emphasis);
  return escapeXml(text);
};

export interface EpubChapter {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly xhtml: string;
}

/**
 * Split the document into chapter documents. A chapter file holds its heading
 * and every paragraph up to the next heading, which is what a reading system
 * expects a spine item to contain.
 */
export const buildEpubChapters = (
  model: DocumentModel,
  draft: MetadataDraft,
  options: EpubExportOptions = DEFAULT_EPUB_EXPORT,
): EpubChapter[] => {
  const content = buildEpubCss(options);
  const sectioned = model.chapters.length > 1
    ? model.chapters.filter((chapter) => chapter.level > 0)
    : [{ index: 0, title: draft.title, level: 1, paragraphStart: 0, paragraphEnd: model.paragraphs.length, wordCount: model.metrics.words }];

  const chunks: { title: string; start: number; end: number }[] = [];
  for (const chapter of sectioned) {
    const start = Math.min(model.paragraphs.length, Math.max(0, chapter.paragraphStart));
    if (!model.paragraphs[start]) continue;
    // The heading paragraph is kept inside the file, where it belongs; the
    // navigation label comes from the chapter, not from the heading text.
    // Chapter ranges are inclusive, so the slice end is one past the last index.
    const end = Math.max(start + 1, Math.min(model.paragraphs.length, chapter.paragraphEnd + 1));
    chunks.push({ title: chapter.title, start, end });
  }
  if (chunks.length === 0) {
    chunks.push({ title: draft.title, start: 0, end: model.paragraphs.length });
  }

  return chunks.map((chunk, index) => {
    const paragraphs = model.paragraphs
      .slice(chunk.start, chunk.end)
      .map((paragraph) => renderParagraphTag(model, paragraph, options))
      .join('\n      ');
    const id = `chapter-${index + 1}`;
    return {
      id,
      title: chunk.title || `Section ${index + 1}`,
      href: `text/${id}.xhtml`,
      xhtml: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(draft.language || 'en')}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(chunk.title || draft.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/reader.css" />
  </head>
  <body epub:type="bodymatter">
      <h1 id="${id}-title">${escapeXml(chunk.title || draft.title)}</h1>
      ${paragraphs}
  </body>
</html>
`,
    };
  });
  void content;
};

const renderParagraphTag = (
  model: DocumentModel,
  paragraph: ParagraphNode,
  options: EpubExportOptions,
): string => {
  const xhtml = paragraphXhtml(model, paragraph, options);
  if (paragraph.kind === 'heading') {
    const level = Math.min(6, Math.max(2, (paragraph.level || 1) + 1));
    return `<h${level}>${xhtml}</h${level}>`;
  }
  if (paragraph.kind === 'list-item') return `<p class="list-item">${xhtml}</p>`;
  if (paragraph.kind === 'quote') return `<blockquote><p>${xhtml}</p></blockquote>`;
  if (paragraph.kind === 'code') return `<pre>${xhtml}</pre>`;
  if (paragraph.kind === 'table') return `<p class="sightline-table">${xhtml}</p>`;
  if (paragraph.kind === 'caption') return `<p class="sightline-caption">${xhtml}</p>`;
  if (paragraph.kind === 'footnote' || paragraph.kind === 'endnote') return `<aside epub:type="footnote"><p>${xhtml}</p></aside>`;
  return `<p>${xhtml}</p>`;
};

export const buildEpubCss = (options: EpubExportOptions): string => options.stylesheet;

export const buildNavDocument = (draft: MetadataDraft, chapters: readonly EpubChapter[]): string => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(draft.language || 'en')}">
  <head>
    <meta charset="utf-8" />
    <title>Contents</title>
    <link rel="stylesheet" type="text/css" href="styles/reader.css" />
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        ${chapters.map((chapter) => `<li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`).join('\n        ')}
      </ol>
    </nav>
    <nav epub:type="landmarks" hidden="hidden">
      <ol>
        <li><a epub:type="bodymatter" href="${chapters[0]?.href ?? 'text/chapter-1.xhtml'}">Start of content</a></li>
      </ol>
    </nav>
  </body>
</html>
`;

export const buildPackageDocument = (
  draft: MetadataDraft,
  chapters: readonly EpubChapter[],
  options: EpubExportOptions,
  coverFileName: string | null,
): string => {
  const metadata = dublinCore(draft);
  const modified = (draft.modified || new Date().toISOString());
  const manifest = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '    <item id="css" href="styles/reader.css" media-type="text/css" />',
    ...(coverFileName ? [`    <item id="cover-image" href="${coverFileName}" media-type="image/${coverFileName.endsWith('.png') ? 'png' : 'jpeg'}" properties="cover-image" />`] : []),
    ...chapters.map((chapter) => `    <item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml" />`),
  ].join('\n');
  const spine = chapters.map((chapter) => `    <itemref idref="${chapter.id}" />`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(draft.language || 'en')}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metadata.map((entry) => `<${entry.tag}${entry.attributes ? ' ' + Object.entries(entry.attributes).map(([name, value]) => `${name}="${escapeXml(value)}"`).join(' ') : ''}>${escapeXml(entry.value)}</${entry.tag}>`).join('\n    ')}
${draft.tags.length > 0 ? `    <meta property="dcterms:subject">${escapeXml(draft.tags.join(', '))}</meta>` : ''}
${draft.readingLevel ? `    <meta property="sightline:reading-level">${escapeXml(draft.readingLevel)}</meta>` : ''}
    <meta property="dcterms:modified">${escapeXml(modified.slice(0, 19))}Z</meta>
    <meta name="generator" content="Sightline Velocity Studio" />
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>
`;
};

export const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`;

export interface EpubBuildResult {
  readonly bytes: Uint8Array;
  readonly chapters: readonly EpubChapter[];
  readonly fileName: string;
}

export const buildEpubArchive = async (
  model: DocumentModel,
  draft: MetadataDraft,
  options: EpubExportOptions = DEFAULT_EPUB_EXPORT,
): Promise<EpubBuildResult> => {
  const zip = new JSZip();
  // The mimetype entry must come first and must not be compressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER_XML);

  const chapters = buildEpubChapters(model, draft, options);
  for (const chapter of chapters) zip.file(`OEBPS/${chapter.href}`, chapter.xhtml);
  zip.file('OEBPS/nav.xhtml', buildNavDocument(draft, chapters));
  zip.file('OEBPS/styles/reader.css', buildEpubCss(options));

  let coverFileName: string | null = null;
  if (options.includeCover && draft.coverDataUrl.startsWith('data:image/')) {
    const match = /^data:image\/(png|jpeg|jpg|webp|avif);base64,(.*)$/.exec(draft.coverDataUrl);
    if (match) {
      const extension = match[1] === 'jpg' ? 'jpeg' : match[1]!;
      coverFileName = `images/cover.${extension === 'jpeg' ? 'jpg' : extension}`;
      zip.file(`OEBPS/${coverFileName}`, match[2]!, { base64: true });
    }
  }

  zip.file('OEBPS/content.opf', buildPackageDocument(draft, chapters, options, coverFileName));

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/epub+zip',
  });
  return {
    bytes,
    chapters,
    fileName: `${slugify(draft.title) || 'sightline'}.epub`,
  };
};
