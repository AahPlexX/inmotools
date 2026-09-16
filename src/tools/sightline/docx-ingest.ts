/**
 * WordprocessingML (DOCX) ingestion.
 *
 * The OPC package is opened with the repository's existing `jszip` pin and the
 * XML is read with `fast-xml-parser` configured to preserve ordered children,
 * because WordprocessingML is order-significant: text runs, breaks, and tabs
 * only reconstruct correctly when their document order is kept.
 *
 * Heading hierarchy comes from the paragraph style reference (`w:pStyle`),
 * including Word's outline levels in the style definition when the style name
 * is not one of the built-ins, and falls back to direct outline level
 * (`w:outlineLvl`) and to bold large-type runs.
 */

import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import type { DocumentMetadata, IngestDiagnostic } from './sightline-types';

export interface DocxStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly metadata: Partial<DocumentMetadata>;
  readonly diagnostics: readonly IngestDiagnostic[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

type OrderedNode = Record<string, unknown>;

const tagOf = (node: OrderedNode): string | null => {
  for (const key of Object.keys(node)) {
    if (key !== ':@') return key;
  }
  return null;
};

const childrenOf = (node: OrderedNode): OrderedNode[] => {
  const tag = tagOf(node);
  if (!tag) return [];
  const value = node[tag];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
};

const attributesOf = (node: OrderedNode): Record<string, string> => {
  const attributes = node[':@'];
  if (!attributes || typeof attributes !== 'object') return {};
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    output[key.replace(/^@/, '').replace(/^[^:]*:/, '')] = String(value);
  }
  return output;
};

const textOf = (node: OrderedNode): string => {
  const tag = tagOf(node);
  if (tag === '#text') {
    const value = node['#text'];
    return typeof value === 'string' ? value : String(value ?? '');
  }
  return childrenOf(node).map(textOf).join('');
};

const findChildren = (nodes: readonly OrderedNode[], tag: string): OrderedNode[] =>
  nodes.filter((node) => tagOf(node) === tag);

const findDescendants = (nodes: readonly OrderedNode[], tag: string): OrderedNode[] => {
  const found: OrderedNode[] = [];
  const visit = (list: readonly OrderedNode[]) => {
    for (const node of list) {
      if (tagOf(node) === tag) found.push(node);
      visit(childrenOf(node));
    }
  };
  visit(nodes);
  return found;
};

const headingLevelFromStyle = (styleId: string, styleOutline: Map<string, number>): number => {
  const normalized = styleId.replace(/\s+/g, '').toLowerCase();
  const direct = /^heading(\d)$/.exec(normalized);
  if (direct) return Number(direct[1]);
  const titled = /^title$/.exec(normalized);
  if (titled) return 1;
  const subtitle = /^subtitle$/.exec(normalized);
  if (subtitle) return 2;
  const outline = styleOutline.get(normalized);
  if (outline !== undefined) return Math.min(6, Math.max(1, outline + 1));
  return 0;
};

const readStyles = (xml: string): Map<string, number> => {
  const outlineByStyle = new Map<string, number>();
  let parsed: OrderedNode[];
  try {
    parsed = parser.parse(xml) as OrderedNode[];
  } catch {
    return outlineByStyle;
  }
  const styles = findDescendants(parsed, 'w:style');
  for (const style of styles) {
    const attributes = attributesOf(style);
    const styleId = attributes['styleId'] ?? '';
    if (!styleId) continue;
    const outlines = findDescendants(childrenOf(style), 'w:outlineLvl');
    for (const outline of outlines) {
      const value = Number(attributesOf(outline)['val'] ?? Number.NaN);
      if (Number.isFinite(value)) outlineByStyle.set(styleId.toLowerCase(), value);
    }
  }
  return outlineByStyle;
};

interface RunState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  sizeHalfPoints: number;
}

const readRunState = (runProperties: OrderedNode | undefined, inherited: RunState): RunState => {
  if (!runProperties) return inherited;
  const next: RunState = { ...inherited };
  const children = childrenOf(runProperties);
  for (const child of children) {
    const tag = tagOf(child);
    const attributes = attributesOf(child);
    const off = attributes['val'] === '0' || attributes['val'] === 'false';
    switch (tag) {
      case 'w:b': next.bold = !off; break;
      case 'w:i': next.italic = !off; break;
      case 'w:strike':
      case 'w:dstrike': next.strike = !off; break;
      case 'w:sz': {
        const size = Number(attributes['val'] ?? Number.NaN);
        if (Number.isFinite(size)) next.sizeHalfPoints = size;
        break;
      }
      default: break;
    }
  }
  return next;
};

const runPropertiesOf = (node: OrderedNode): OrderedNode | undefined =>
  childrenOf(node).find((child) => tagOf(child) === 'w:rPr');

interface ParagraphBuild {
  text: string;
  styleId: string;
  outlineLevel: number | null;
  maxSize: number;
  bold: boolean;
  numbering: boolean;
}

const readParagraph = (paragraph: OrderedNode, styleOutline: Map<string, number>): ParagraphBuild => {
  const children = childrenOf(paragraph);
  const paragraphProperties = children.find((child) => tagOf(child) === 'w:pPr');
  const propertyChildren = paragraphProperties ? childrenOf(paragraphProperties) : [];
  const styleNode = propertyChildren.find((child) => tagOf(child) === 'w:pStyle');
  const styleId = styleNode ? (attributesOf(styleNode)['val'] ?? '') : '';
  const outlineNode = propertyChildren.find((child) => tagOf(child) === 'w:outlineLvl');
  const outlineValue = outlineNode ? Number(attributesOf(outlineNode)['val'] ?? Number.NaN) : Number.NaN;
  const numberingNode = propertyChildren.find((child) => tagOf(child) === 'w:numPr');

  let text = '';
  let maxSize = 0;
  let bold = false;
  let inherited = readRunState(propertyChildren.find((child) => tagOf(child) === 'w:rPr'), {
    bold: false, italic: false, strike: false, sizeHalfPoints: 0,
  });

  const visit = (node: OrderedNode) => {
    const tag = tagOf(node);
    if (tag === 'w:r') {
      const runChildren = childrenOf(node);
      const state = readRunState(runPropertiesOf(node), inherited);
      maxSize = Math.max(maxSize, state.sizeHalfPoints);
      if (state.bold) bold = true;
      for (const child of runChildren) {
        const childTag = tagOf(child);
        if (childTag === 'w:t') {
          text += textOf(child);
        } else if (childTag === 'w:tab') {
          text += ' ';
        } else if (childTag === 'w:br') {
          text += ' ';
        } else if (childTag === 'w:noBreakHyphen') {
          text += '-';
        } else if (childTag === 'w:softHyphen') {
          // Soft hyphens are invisible unless a line breaks there.
        } else if (childTag === 'w:drawing' || childTag === 'w:pict' || childTag === 'w:object') {
          // Figures contribute no text; captions arrive as their own paragraph.
        } else if (childTag === 'w:footnoteReference' || childTag === 'w:endnoteReference') {
          text += ' ';
        }
      }
      return;
    }
    if (tag === 'w:hyperlink') {
      for (const child of childrenOf(node)) visit(child);
      return;
    }
    if (tag === 'w:smartTag' || tag === 'w:sdt' || tag === 'w:sdtContent' || tag === 'w:ins') {
      for (const child of childrenOf(node)) visit(child);
      return;
    }
    if (tag === 'w:del' || tag === 'w:delText') {
      // Tracked deletions are not part of the accepted text.
      return;
    }
    for (const child of childrenOf(node)) visit(child);
  };
  for (const child of children) {
    if (tagOf(child) === 'w:pPr') continue;
    visit(child);
  }
  inherited = inherited;
  return {
    text,
    styleId,
    outlineLevel: Number.isFinite(outlineValue) ? outlineValue : null,
    maxSize,
    bold,
    numbering: Boolean(numberingNode),
  };
};

const resolveHeadingLevel = (paragraph: ParagraphBuild, styleOutline: Map<string, number>): number => {
  const fromStyle = paragraph.styleId ? headingLevelFromStyle(paragraph.styleId, styleOutline) : 0;
  if (fromStyle > 0) return fromStyle;
  if (paragraph.outlineLevel !== null && paragraph.outlineLevel >= 0 && paragraph.outlineLevel <= 5) {
    return paragraph.outlineLevel + 1;
  }
  // Bold, large, short paragraphs behave as headings in documents generated by
  // tools that apply direct formatting instead of styles.
  if (paragraph.bold && paragraph.maxSize >= 28 && paragraph.text.trim().length <= 120 && !/[.!?;]$/.test(paragraph.text.trim())) {
    return paragraph.maxSize >= 36 ? 1 : 2;
  }
  return 0;
};

const readCoreProperties = (xml: string): Partial<DocumentMetadata> => {
  let parsed: OrderedNode[];
  try {
    parsed = parser.parse(xml) as OrderedNode[];
  } catch {
    return {};
  }
  const read = (tag: string): string => {
    const nodes = findDescendants(parsed, tag);
    const node = nodes[0];
    if (!node) return '';
    return normalizeParagraphText(textOf(node));
  };
  const keywords = read('cp:keywords');
  const metadata: Record<string, unknown> = {
    title: read('dc:title'),
    author: read('dc:creator'),
    subject: read('dc:subject'),
    description: read('dc:description'),
    language: read('dc:language'),
    created: read('dcterms:created'),
    modified: read('dcterms:modified'),
    rights: read('dc:rights'),
    publisher: read('dc:publisher'),
    identifier: read('dc:identifier'),
    keywords: keywords.length > 0 ? keywords.split(/[,;]\s*/).filter((entry) => entry.length > 0) : [],
  };
  const extras: Record<string, string> = {};
  for (const [tag, key] of [
    ['cp:lastModifiedBy', 'lastModifiedBy'],
    ['cp:category', 'category'],
    ['cp:contentStatus', 'contentStatus'],
    ['cp:revision', 'revision'],
    ['cp:version', 'version'],
  ] as const) {
    const value = read(tag);
    if (value.length > 0) extras[key] = value;
  }
  const template = read('cp:template');
  if (template.length > 0) extras.template = template;
  if (Object.keys(extras).length > 0) metadata.extra = extras;
  return metadata as Partial<DocumentMetadata>;
};

export const ingestDocx = async (
  data: Uint8Array<ArrayBufferLike>,
  fileName: string,
): Promise<DocxStructure> => {
  const diagnostics: IngestDiagnostic[] = [];
  const zip = await JSZip.loadAsync(data);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    return {
      paragraphs: [],
      chapters: [],
      metadata: { title: fileName.replace(/\.docx$/i, '') },
      diagnostics: [{
        level: 'error',
        code: 'docx-structure',
        message: 'This file is not a Word document package: word/document.xml is missing.',
      }],
    };
  }

  const stylesFile = zip.file('word/styles.xml');
  const styleOutline = stylesFile ? readStyles(await stylesFile.async('string')) : new Map<string, number>();

  const coreFile = zip.file('docProps/core.xml');
  const parsedProperties = coreFile ? readCoreProperties(await coreFile.async('string')) : {};
  const metadata: Partial<DocumentMetadata> = {
    ...parsedProperties,
    title: parsedProperties.title || fileName.replace(/\.docx$/i, ''),
  };

  const xml = await documentFile.async('string');
  let parsed: OrderedNode[];
  try {
    parsed = parser.parse(xml) as OrderedNode[];
  } catch (error) {
    diagnostics.push({
      level: 'error',
      code: 'docx-xml',
      message: 'The document body XML could not be parsed.',
      detail: error instanceof Error ? error.message : String(error),
    });
    return { paragraphs: [], chapters: [], metadata, diagnostics };
  }

  const bodyNodes = findDescendants(parsed, 'w:body');
  const body = bodyNodes[0] ? childrenOf(bodyNodes[0]) : parsed;
  const paragraphs: RawParagraph[] = [];
  const chapters: RawChapter[] = [];

  const emit = (kind: RawParagraph['kind'], text: string, level = 0) => {
    const normalized = normalizeParagraphText(text);
    if (normalized.length === 0) return;
    if (kind === 'heading') chapters.push({ title: normalized, level, paragraphIndex: paragraphs.length });
    paragraphs.push({ kind, level, text: normalized });
  };

  const walkBody = (nodes: readonly OrderedNode[]) => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (tag === 'w:p') {
        const build = readParagraph(node, styleOutline);
        const headingLevel = resolveHeadingLevel(build, styleOutline);
        if (headingLevel > 0) {
          emit('heading', build.text, headingLevel);
        } else if (build.numbering) {
          emit('list-item', build.text, 1);
        } else {
          emit('body', build.text);
        }
        continue;
      }
      if (tag === 'w:tbl') {
        const rows = findChildren(childrenOf(node), 'w:tr');
        for (const row of rows) {
          const cells = findChildren(childrenOf(row), 'w:tc').map((cell) =>
            childrenOf(cell)
              .filter((child) => tagOf(child) === 'w:p')
              .map((paragraph) => readParagraph(paragraph, styleOutline).text)
              .join(' '),
          );
          const rendered = cells.map((cell) => normalizeParagraphText(cell)).filter((cell) => cell.length > 0);
          if (rendered.length > 0) emit('table', rendered.join(' | '));
        }
        continue;
      }
      if (tag === 'w:sdt' || tag === 'w:sectPr') {
        for (const child of childrenOf(node)) walkBody([child]);
        continue;
      }
    }
  };
  walkBody(body);

  for (const [file, kind] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
    const notesFile = zip.file(file);
    if (!notesFile) continue;
    try {
      const notesParsed = parser.parse(await notesFile.async('string')) as OrderedNode[];
      const noteElements = findDescendants(notesParsed, kind === 'footnote' ? 'w:footnote' : 'w:endnote');
      let noteNumber = 0;
      for (const noteElement of noteElements) {
        // Word writes separator and continuation-separator pseudo-notes into the
        // same part; their `w:type` marks them, and they carry no reader text.
        const noteType = attributesOf(noteElement)['type'] ?? '';
        if (noteType === 'separator' || noteType === 'continuationSeparator' || noteType === 'continuationNotice') continue;
        const noteParagraphs = findChildren(childrenOf(noteElement), 'w:p');
        for (const noteParagraph of noteParagraphs) {
          const build = readParagraph(noteParagraph, styleOutline);
          noteNumber += 1;
          const text = normalizeParagraphText(build.text);
          if (text.length === 0 || /^[-_\s]*$/.test(text)) continue;
          paragraphs.push({ kind, level: noteNumber, text });
        }
      }
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        code: 'docx-notes',
        message: `The ${kind} part could not be read.`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-docx',
      message: 'No readable paragraphs were found in this Word document.',
    });
  }

  return { paragraphs, chapters, metadata, diagnostics };
};
