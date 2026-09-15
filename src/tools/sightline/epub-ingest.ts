/**
 * EPUB ingestion.
 *
 * The container (META-INF/container.xml) names the package document, the
 * package document names the manifest and the spine, and the spine gives the
 * reading order. Navigation comes from the EPUB 3 navigation document when
 * present and from the EPUB 2 NCX otherwise — the NCX is an outdated but still
 * widely produced format that the specification requires reading systems to
 * keep supporting.
 *
 * Chapter text is extracted from each spine document's body, dropping the
 * navigation and footnote markup that would otherwise leak into the stream.
 */

import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import { ingestHtml } from './html-ingest';
import type { DocumentMetadata, IngestDiagnostic } from './sightline-types';

export interface EpubStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly metadata: Partial<DocumentMetadata>;
  readonly cover?: { readonly data: Uint8Array<ArrayBufferLike>; readonly mediaType: string };
  readonly diagnostics: readonly IngestDiagnostic[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ['item', 'itemref', 'navPoint', 'rootfile', 'reference', 'meta'].includes(name),
});

type XmlRecord = Record<string, unknown>;

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const textValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).join('');
  if (typeof value === 'object') {
    const record = value as XmlRecord;
    if (record['#text'] !== undefined) return textValue(record['#text']);
    // No direct text: concatenate the text of every child element, skipping the
    // attribute bag. This is what makes nested markup such as
    // `<navLabel><text>Title</text></navLabel>` readable.
    let collected = '';
    for (const [key, entry] of Object.entries(record)) {
      if (key.startsWith('@')) continue;
      collected += textValue(entry);
    }
    return collected;
  }
  return '';
};

/** Resolve a package-relative href against the package document's own directory. */
export const resolveEpubPath = (base: string, href: string): string => {
  const withoutFragment = href.split('#')[0] ?? href;
  const decoded = decodeURIComponentSafe(withoutFragment);
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return decoded;
  const baseSegments = base.length > 0 ? base.split('/').slice(0, -1) : [];
  const segments = decoded.startsWith('/') ? [] : [...baseSegments];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
};

const decodeURIComponentSafe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCoreMetadata = (metadataNode: XmlRecord | undefined): Partial<DocumentMetadata> => {
  if (!metadataNode) return {};
  const record: Record<string, unknown> = {};
  const title = metadataNode['dc:title'];
  const creator = metadataNode['dc:creator'];
  const language = metadataNode['dc:language'];
  const publisher = metadataNode['dc:publisher'];
  const description = metadataNode['dc:description'];
  const subject = metadataNode['dc:subject'];
  const identifier = metadataNode['dc:identifier'];
  const rights = metadataNode['dc:rights'];
  const date = metadataNode['dc:date'];
  const firstText = (value: unknown): string => {
    const entries = asArray(value);
    return entries.map((entry) => textValue(entry)).find((entry) => entry.trim().length > 0)?.trim() ?? '';
  };
  record.title = firstText(title);
  record.author = asArray(creator)
    .map((entry) => textValue(entry).trim())
    .filter((entry) => entry.length > 0)
    .join(', ');
  record.language = firstText(language);
  record.publisher = firstText(publisher);
  record.description = firstText(description);
  record.subject = firstText(subject);
  record.identifier = firstText(identifier);
  record.rights = firstText(rights);
  record.created = firstText(date);

  const subjects = asArray(subject).map((entry) => textValue(entry).trim()).filter((entry) => entry.length > 0);
  record.keywords = subjects;

  const extras: Record<string, string> = {};
  for (const meta of asArray(metadataNode['meta'] as XmlRecord[] | XmlRecord | undefined)) {
    const record = meta as XmlRecord;
    const property = String(record['@property'] ?? record['property'] ?? '');
    const name = String(record['@name'] ?? record['name'] ?? '');
    const content = String(record['@content'] ?? record['content'] ?? textValue(record));
    if (property && content) extras[property] = content;
    if (name && content) extras[name] = content;
  }
  if (Object.keys(extras).length > 0) record.extra = extras;
  return record as Partial<DocumentMetadata>;
};

const readNavDocument = (html: string, basePath: string): RawChapter[] => {
  const chapters: RawChapter[] = [];
  const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = linkPattern.exec(html);
  while (match) {
    const href = match[1] ?? '';
    const title = normalizeParagraphText(match[2]!.replace(/<[^>]*>/g, ' '));
    if (title.length > 0) {
      chapters.push({
        title,
        level: 1,
        paragraphIndex: 0,
        href: resolveEpubPath(basePath, href),
      });
    }
    match = linkPattern.exec(html);
  }
  return chapters;
};

const readNcx = (xml: string, basePath: string): RawChapter[] => {
  const chapters: RawChapter[] = [];
  let parsed: XmlRecord;
  try {
    parsed = xmlParser.parse(xml) as XmlRecord;
  } catch {
    return chapters;
  }
  const navMap = (parsed['ncx'] as XmlRecord | undefined)?.['navMap'] as XmlRecord | undefined;
  if (!navMap) return chapters;
  const visit = (points: XmlRecord[], depth: number) => {
    for (const point of points) {
      const label = textValue(point['navLabel']);
      const src = textValue(point['content'] && (point['content'] as XmlRecord)['@src']);
      const title = normalizeParagraphText(label);
      if (title.length > 0) {
        chapters.push({
          title,
          level: depth,
          paragraphIndex: 0,
          ...(src ? { href: resolveEpubPath(basePath, src) } : {}),
        });
      }
      visit(asArray(point['navPoint'] as XmlRecord[]), depth + 1);
    }
  };
  visit(asArray(navMap['navPoint'] as XmlRecord[]), 1);
  return chapters;
};

export const ingestEpub = async (
  data: Uint8Array<ArrayBufferLike>,
  fileName: string,
): Promise<EpubStructure> => {
  const diagnostics: IngestDiagnostic[] = [];
  const zip = await JSZip.loadAsync(data);
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    return {
      paragraphs: [],
      chapters: [],
      metadata: { title: fileName.replace(/\.epub$/i, '') },
      diagnostics: [{
        level: 'error',
        code: 'epub-container',
        message: 'This file is not an EPUB container: META-INF/container.xml is missing.',
      }],
    };
  }

  const container = xmlParser.parse(await containerFile.async('string')) as XmlRecord;
  const rootfilesNodes = asArray<XmlRecord>(
    (container['container'] as XmlRecord | undefined)?.['rootfiles'] as XmlRecord | undefined,
  );
  const rootfileList = rootfilesNodes.flatMap((node) => asArray<XmlRecord>(node['rootfile'] as XmlRecord[]));
  const packagePath = textValue(rootfileList[0]?.['@full-path']) || 'OEBPS/content.opf';
  const packageFile = zip.file(packagePath) ?? zip.file(decodeURIComponentSafe(packagePath));
  if (!packageFile) {
    diagnostics.push({
      level: 'error',
      code: 'epub-package',
      message: `The package document referenced by the container was not found (${packagePath}).`,
    });
    return { paragraphs: [], chapters: [], metadata: {}, diagnostics };
  }

  const pkg = xmlParser.parse(await packageFile.async('string')) as XmlRecord;
  const packageNode = (pkg['package'] ?? pkg) as XmlRecord;
  const version = textValue(packageNode['@version']) || '3.0';
  const metadataNode = packageNode['metadata'] as XmlRecord | undefined;
  const manifestNode = packageNode['manifest'] as XmlRecord | undefined;
  const spineNode = packageNode['spine'] as XmlRecord | undefined;
  const parsedMetadata = parseCoreMetadata(metadataNode);
  const metadata: Partial<DocumentMetadata> = {
    ...parsedMetadata,
    title: parsedMetadata.title || fileName.replace(/\.epub$/i, ''),
  };

  // fast-xml-parser keeps attributes inline on the element record, prefixed by
  // the configured `@` marker, so an item is its own attribute bag.
  const attribute = (record: XmlRecord, name: string): string => {
    const value = record[`@${name}`] ?? record[name];
    return value === undefined || value === null ? '' : String(value);
  };

  const manifestItems = asArray(manifestNode?.['item'] as XmlRecord[]).map((item) => ({
    id: attribute(item, 'id'),
    href: attribute(item, 'href'),
    mediaType: attribute(item, 'media-type'),
    properties: attribute(item, 'properties'),
  }));
  const spineItems = asArray(spineNode?.['itemref'] as XmlRecord[]).map((item) => ({
    idref: attribute(item, 'idref'),
    linear: attribute(item, 'linear') || 'yes',
  }));

  if (manifestItems.length === 0 || spineItems.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'epub-spine',
      message: 'The package document declared no readable spine, so no chapter order could be built.',
    });
  }

  const byId = new Map(manifestItems.map((item) => [item.id, item]));
  const navItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('nav'));
  const ncxItem = manifestItems.find((item) => item.mediaType === 'application/x-dtbncx+xml')
    ?? (() => {
      const tocId = textValue(spineNode?.['@toc']);
      return tocId ? byId.get(tocId) : undefined;
    })();
  const coverItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('cover-image'));

  let navChapters: RawChapter[] = [];
  if (navItem) {
    const file = zip.file(resolveEpubPath(packagePath, navItem.href));
    if (file) navChapters = readNavDocument(await file.async('string'), resolveEpubPath(packagePath, navItem.href));
  }
  if (navChapters.length === 0 && ncxItem) {
    const file = zip.file(resolveEpubPath(packagePath, ncxItem.href));
    if (file) {
      navChapters = readNcx(await file.async('string'), resolveEpubPath(packagePath, ncxItem.href));
      if (navChapters.length > 0) {
        diagnostics.push({
          level: 'info',
          code: 'epub-ncx',
          message: 'Chapter navigation came from the EPUB 2 NCX because no EPUB 3 nav document was usable.',
        });
      }
    }
  }

  const paragraphs: RawParagraph[] = [];
  const chapterStarts: RawChapter[] = [];
  const navByHref = new Map<string, string>();
  for (const chapter of navChapters) {
    if (chapter.href) navByHref.set(chapter.href, chapter.title);
  }

  for (const spineEntry of spineItems) {
    const item = byId.get(spineEntry.idref);
    if (!item) {
      diagnostics.push({
        level: 'warning',
        code: 'epub-missing-item',
        message: `Spine entry "${spineEntry.idref}" has no manifest item and was skipped.`,
      });
      continue;
    }
    const path = resolveEpubPath(packagePath, item.href);
    const file = zip.file(path) ?? zip.file(decodeURIComponentSafe(path));
    if (!file) {
      diagnostics.push({
        level: 'warning',
        code: 'epub-missing-resource',
        message: `Chapter resource "${item.href}" was not present in the container and was skipped.`,
      });
      continue;
    }
    const content = await file.async('string');
    const structure = ingestHtml(content);
    const navTitle = navByHref.get(path);
    const firstHeading = structure.paragraphs.find((paragraph) => paragraph.kind === 'heading')?.text ?? '';
    const title = navTitle ?? firstHeading ?? `Section ${chapterStarts.length + 1}`;
    const paragraphStart = paragraphs.length;
    chaptersOfContent(paragraphs, structure.paragraphs, title, path);
    chapterStarts.push({
      title: normalizeParagraphText(title),
      level: 1,
      paragraphIndex: paragraphStart,
      href: path,
    });
    void version;
  }

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-epub',
      message: 'No readable text was found in this EPUB.',
    });
  }

  let cover: EpubStructure['cover'];
  if (coverItem) {
    const path = resolveEpubPath(packagePath, coverItem.href);
    const file = zip.file(path) ?? zip.file(decodeURIComponentSafe(path));
    if (file) {
      cover = {
        data: await file.async('uint8array'),
        mediaType: coverItem.mediaType || 'image/jpeg',
      };
    }
  }

  return { paragraphs, chapters: chapterStarts, metadata, ...(cover ? { cover } : {}), diagnostics };
};

/**
 * Convert one chapter's extracted blocks into reading paragraphs. The chapter's
 * own leading heading is replaced by the chapter title so the stream does not
 * repeat the same text twice.
 */
const chaptersOfContent = (
  target: RawParagraph[],
  blocks: readonly RawParagraph[],
  title: string,
  href: string,
): void => {
  let consumedTitle = false;
  for (const block of blocks) {
    if (!consumedTitle && block.kind === 'heading' && normalizeParagraphText(block.text) === normalizeParagraphText(title)) {
      consumedTitle = true;
      continue;
    }
    target.push({ ...block, href });
  }
};
