import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import JSZip from 'jszip';
import type { Root as MdastRoot, RootContent as MdastRootContent, PhrasingContent } from 'mdast';
import type { ExportAsset } from './export-assets';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface StandaloneHtmlOptions {
  readonly additionalCss?: string;
}

export const buildStandaloneMarkdownHtml = (
  title: string,
  bodyHtml: string,
  options: StandaloneHtmlOptions = {},
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1a1a1a; overflow-wrap: anywhere; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  pre { background: #f5f5f5; padding: 0.75rem; overflow: auto; max-width: 100%; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  img, svg { max-width: 100%; height: auto; }
  .katex-display { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
  .katex-error { color: #b3261e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
${options.additionalCss ?? ''}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

export const buildAstJson = (tree: unknown): string => JSON.stringify(tree, null, 2);

const phrasingPlainText = (nodes: readonly PhrasingContent[]): string => nodes.map((node) => {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'image') return node.alt?.trim() || 'Image';
  if (node.type === 'imageReference') return node.alt?.trim() || node.identifier;
  if (node.type === 'break') return '\n';
  if ('children' in node && Array.isArray(node.children)) return phrasingPlainText(node.children as PhrasingContent[]);
  return '';
}).join('');

const renderInlineRuns = (nodes: readonly PhrasingContent[], bold = false, italics = false): (TextRun | ExternalHyperlink)[] => {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(new TextRun({ text: node.value, bold, italics }));
    } else if (node.type === 'strong') {
      runs.push(...renderInlineRuns(node.children, true, italics));
    } else if (node.type === 'emphasis') {
      runs.push(...renderInlineRuns(node.children, bold, true));
    } else if (node.type === 'delete') {
      runs.push(new TextRun({ text: phrasingPlainText(node.children), strike: true, bold, italics }));
    } else if (node.type === 'inlineCode') {
      runs.push(new TextRun({ text: node.value, font: 'Courier New', bold, italics }));
    } else if (node.type === 'break') {
      runs.push(new TextRun({ text: '', break: 1 }));
    } else if (node.type === 'link') {
      runs.push(new ExternalHyperlink({
        children: [new TextRun({ text: phrasingPlainText(node.children) || node.url, style: 'Hyperlink', bold, italics })],
        link: node.url,
      }));
    } else if (node.type === 'linkReference') {
      runs.push(new TextRun({ text: `${phrasingPlainText(node.children)} [${node.identifier}]`, bold, italics }));
    } else if (node.type === 'image') {
      const label = node.alt?.trim() || 'Image';
      runs.push(new TextRun({ text: `[${label}] `, italics: true }));
      runs.push(new ExternalHyperlink({ children: [new TextRun({ text: node.url, style: 'Hyperlink' })], link: node.url }));
    } else if (node.type === 'imageReference') {
      runs.push(new TextRun({ text: `[${node.alt?.trim() || 'Image'}] [${node.identifier}]`, italics: true }));
    } else if ('children' in node && Array.isArray(node.children)) {
      runs.push(...renderInlineRuns(node.children as PhrasingContent[], bold, italics));
    } else if ('value' in node && typeof node.value === 'string') {
      runs.push(new TextRun({ text: node.value, bold, italics }));
    }
  }
  return runs;
};

export type MathImageResolver = (source: string) => Uint8Array | undefined;

const buildMathParagraph = (source: string, resolveImage?: MathImageResolver): Paragraph => {
  const image = resolveImage?.(source);
  if (image) {
    return new Paragraph({
      children: [new ImageRun({ data: image, transformation: { width: 200, height: 60 }, type: 'png' })],
      alignment: 'center',
    });
  }
  return new Paragraph({ children: [new TextRun({ text: source, italics: true, font: 'Cambria Math' })], alignment: 'center' });
};

interface DocxContext {
  readonly listLevel: number;
  readonly blockquoteDepth: number;
  readonly ordered: boolean;
}

const paragraphDecoration = (blockquoteDepth: number) => blockquoteDepth > 0 ? {
  indent: { left: 360 * blockquoteDepth },
  border: { left: { color: '888888', size: 8, style: BorderStyle.SINGLE, space: 8 } },
} : {};

const codeParagraph = (value: string, blockquoteDepth: number): Paragraph => {
  const lines = value.split('\n');
  const children = lines.flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ text: '', break: 1 })] : []),
    new TextRun({ text: line || ' ', font: 'Courier New' }),
  ]);
  return new Paragraph({ children, shading: { fill: 'F3F3F3' }, ...paragraphDecoration(blockquoteDepth) });
};

const nodeToDocxElements = (
  node: MdastRootContent,
  resolveImage?: MathImageResolver,
  context: DocxContext = { listLevel: 0, blockquoteDepth: 0, ordered: false },
): (Paragraph | Table)[] => {
  if (node.type === 'heading') {
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][node.depth - 1];
    return [new Paragraph({ heading: level, children: renderInlineRuns(node.children), ...paragraphDecoration(context.blockquoteDepth) })];
  }
  if (node.type === 'paragraph') {
    const listProps = context.listLevel > 0
      ? context.ordered
        ? { numbering: { reference: 'markdown-ordered', level: Math.min(context.listLevel - 1, 5) } }
        : { bullet: { level: Math.min(context.listLevel - 1, 5) } }
      : {};
    return [new Paragraph({ children: renderInlineRuns(node.children), ...listProps, ...paragraphDecoration(context.blockquoteDepth) })];
  }
  if (node.type === 'math') return [buildMathParagraph(node.value, resolveImage)];
  if (node.type === 'code') return [codeParagraph(node.value, context.blockquoteDepth)];
  if (node.type === 'blockquote') {
    return node.children.flatMap((child) => nodeToDocxElements(child, resolveImage, {
      ...context,
      blockquoteDepth: context.blockquoteDepth + 1,
    }));
  }
  if (node.type === 'list') {
    return node.children.flatMap((item) => item.children.flatMap((child) =>
      nodeToDocxElements(child, resolveImage, {
        ...context,
        listLevel: context.listLevel + 1,
        ordered: Boolean(node.ordered),
      }),
    ));
  }
  if (node.type === 'table') {
    const rows = node.children.map((row) => new TableRow({
      children: row.children.map((cell) => new TableCell({ children: [new Paragraph({ children: renderInlineRuns(cell.children) })] })),
    }));
    return [new Table({ rows })];
  }
  if (node.type === 'thematicBreak') return [new Paragraph({ text: '' })];
  return [];
};

export const buildDocxDocument = (tree: MdastRoot, resolveImage?: MathImageResolver): Document => {
  const children = tree.children.flatMap((node) => nodeToDocxElements(node, resolveImage));
  return new Document({
    numbering: {
      config: [{
        reference: 'markdown-ordered',
        levels: Array.from({ length: 6 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 + level * 360, hanging: 260 } } },
        })),
      }],
    },
    sections: [{ children: children.length ? children : [new Paragraph('')] }],
  });
};

export const renderDocxToBytes = async (tree: MdastRoot, resolveImage?: MathImageResolver): Promise<Uint8Array> => {
  const document = buildDocxDocument(tree, resolveImage);
  const buffer = await Packer.toArrayBuffer(document);
  return new Uint8Array(buffer);
};

export interface EpubMetadata {
  readonly title: string;
  readonly author: string;
  readonly identifier: string;
  readonly modified?: string;
}

const normalizeModified = (value?: string): string => {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid EPUB modification timestamp.');
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

const buildContainerXml = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const buildContentOpf = (metadata: EpubMetadata, assets: readonly ExportAsset[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(metadata.identifier)}</dc:identifier>
    <dc:title>${escapeHtml(metadata.title)}</dc:title>
    <dc:creator>${escapeHtml(metadata.author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${normalizeModified(metadata.modified)}</meta>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${assets.map((asset, index) => `    <item id="asset-${index + 1}" href="${escapeHtml(asset.path)}" media-type="${escapeHtml(asset.mediaType)}"/>`).join('\n')}
  </manifest>
  <spine toc="ncx"><itemref idref="chapter1"/></spine>
</package>`;

const buildNavXhtml = (metadata: EpubMetadata): string => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeHtml(metadata.title)}</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">${escapeHtml(metadata.title)}</a></li></ol></nav></body>
</html>`;

const buildTocNcx = (metadata: EpubMetadata): string => `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeHtml(metadata.identifier)}"/></head>
  <docTitle><text>${escapeHtml(metadata.title)}</text></docTitle>
  <navMap><navPoint id="chapter1" playOrder="1"><navLabel><text>${escapeHtml(metadata.title)}</text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap>
</ncx>`;

const XML_ENTITY_REPLACEMENTS: Record<string, string> = {
  nbsp: '&#160;', ensp: '&#8194;', emsp: '&#8195;', thinsp: '&#8201;', ndash: '&#8211;', mdash: '&#8212;', hellip: '&#8230;', copy: '&#169;', reg: '&#174;', trade: '&#8482;',
};

export const toXhtmlFragment = (html: string): string => {
  let output = html.replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => XML_ENTITY_REPLACEMENTS[name.toLowerCase()] ?? match);
  output = output.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\b[^>]*?)(\s*\/?)>/gi, (_match, tag: string, attrs: string) => {
    const normalized = attrs.replace(/\s(checked|disabled|required|multiple|selected|autofocus)(?=(?:\s|$))/gi, (_attr: string, name: string) => ` ${name}="${name}"`);
    return `<${tag}${normalized.trimEnd()} />`;
  });
  return output;
};

const buildChapterXhtml = (metadata: EpubMetadata, bodyHtml: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeHtml(metadata.title)}</title></head>
<body>
${toXhtmlFragment(bodyHtml)}
</body>
</html>`;

export const buildEpubArchive = async (
  metadata: EpubMetadata,
  bodyHtml: string,
  assets: readonly ExportAsset[] = [],
): Promise<Uint8Array> => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')?.file('container.xml', buildContainerXml());
  const oebps = zip.folder('OEBPS');
  oebps?.file('content.opf', buildContentOpf(metadata, assets));
  oebps?.file('nav.xhtml', buildNavXhtml(metadata));
  oebps?.file('toc.ncx', buildTocNcx(metadata));
  oebps?.file('chapter1.xhtml', buildChapterXhtml(metadata, bodyHtml));
  for (const asset of assets) oebps?.file(asset.path, asset.data);
  return zip.generateAsync({ type: 'uint8array' });
};
