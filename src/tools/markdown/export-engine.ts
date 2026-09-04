import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import JSZip from 'jszip';
import type { Root as MdastRoot, RootContent as MdastRootContent, PhrasingContent } from 'mdast';

// Five export formats, each honestly scoped per this tool's own
// documentation:
//   - Markdown: plain passthrough of the source text.
//   - Standalone HTML: a single self-contained file, mirroring the existing
//     "export as one offline HTML file" pattern already shipped elsewhere
//     in this catalog (see src/tools/shader/shader-engine.ts's
//     buildStandaloneShaderHtml, which this function's structure follows).
//   - DOCX: generated via the docx package. Math renders as a rasterized
//     PNG image inside the document, not as an editable native Word
//     equation object - this is a deliberate, honestly labeled scope
//     boundary (see the PRD's Safety and truthfulness section), not an
//     oversight.
//   - EPUB: a hand-built, structurally correct OPF manifest + NCX/nav +
//     XHTML chapter, zipped with jszip. It has not been run through the
//     EPUBCheck reference validator (no reliable client-side build exists),
//     and must be labeled "structural EPUB," not "validated EPUB."
//   - AST JSON: a lossless JSON serialization of the parsed mdast tree.

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Standalone HTML export ---

export const buildStandaloneMarkdownHtml = (title: string, bodyHtml: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  pre { background: #f5f5f5; padding: 0.75rem; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  img { max-width: 100%; }
  .katex-error { color: #b3261e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

// --- AST JSON export ---

export const buildAstJson = (tree: unknown): string => JSON.stringify(tree, null, 2);

// --- DOCX export ---

const renderInlineTextRuns = (nodes: PhrasingContent[], bold = false, italics = false): TextRun[] => {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push(new TextRun({ text: node.value, bold, italics }));
    } else if (node.type === 'strong') {
      runs.push(...renderInlineTextRuns(node.children, true, italics));
    } else if (node.type === 'emphasis') {
      runs.push(...renderInlineTextRuns(node.children, bold, true));
    } else if (node.type === 'inlineCode') {
      runs.push(new TextRun({ text: node.value, font: 'Courier New' }));
    } else if ('children' in node && Array.isArray(node.children)) {
      runs.push(...renderInlineTextRuns(node.children as PhrasingContent[], bold, italics));
    } else if ('value' in node && typeof node.value === 'string') {
      runs.push(new TextRun({ text: node.value, bold, italics }));
    }
  }
  return runs;
};

// DOCX export does not implement OMML conversion from KaTeX output - that
// is an unsolved problem at this scope (see the PRD's Safety and
// truthfulness section). Math renders as a rasterized image instead of a
// native editable equation. Rasterization itself requires a canvas/DOM,
// which this pure, unit-testable function does not have access to, so the
// image bytes for each math node are injected by the caller (the browser
// workspace layer rasterizes KaTeX's rendered output via an offscreen
// canvas and passes the resulting PNG bytes in). When no image is supplied
// for a given source string - including in every unit test, which does not
// rasterize anything - this function falls back to an italic plain-text
// paragraph, so the export never fails outright for missing rasterization.
export type MathImageResolver = (source: string) => Uint8Array | undefined;

const buildMathParagraph = (source: string, resolveImage?: MathImageResolver): Paragraph => {
  const image = resolveImage?.(source);
  if (image) {
    return new Paragraph({
      children: [new ImageRun({ data: image, transformation: { width: 200, height: 60 }, type: 'png' })],
      alignment: 'center',
    });
  }
  return new Paragraph({
    children: [new TextRun({ text: source, italics: true, font: 'Cambria Math' })],
    alignment: 'center',
  });
};

const nodeToDocxElements = (node: MdastRootContent, resolveImage?: MathImageResolver): (Paragraph | Table)[] => {
  if (node.type === 'heading') {
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][node.depth - 1];
    return [new Paragraph({ heading: level, children: renderInlineTextRuns(node.children) })];
  }
  if (node.type === 'paragraph') {
    return [new Paragraph({ children: renderInlineTextRuns(node.children) })];
  }
  if (node.type === 'math') {
    return [buildMathParagraph(node.value, resolveImage)];
  }
  if (node.type === 'list') {
    return node.children.flatMap((item) =>
      item.children.flatMap((child) =>
        child.type === 'paragraph'
          ? [new Paragraph({ bullet: { level: 0 }, children: renderInlineTextRuns(child.children) })]
          : [],
      ),
    );
  }
  if (node.type === 'table') {
    const rows = node.children.map((row) =>
      new TableRow({
        children: row.children.map((cell) =>
          new TableCell({ children: [new Paragraph({ children: renderInlineTextRuns(cell.children) })] }),
        ),
      }),
    );
    return [new Table({ rows })];
  }
  if (node.type === 'thematicBreak') {
    return [new Paragraph({ text: '' })];
  }
  return [];
};

export const buildDocxDocument = (tree: MdastRoot, resolveImage?: MathImageResolver): Document => {
  const children = tree.children.flatMap((node) => nodeToDocxElements(node, resolveImage));
  return new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] });
};

export const renderDocxToBytes = async (tree: MdastRoot, resolveImage?: MathImageResolver): Promise<Uint8Array> => {
  const document = buildDocxDocument(tree, resolveImage);
  const buffer = await Packer.toArrayBuffer(document);
  return new Uint8Array(buffer);
};

// --- EPUB export (structural, not EPUBCheck-validated) ---

export interface EpubMetadata {
  readonly title: string;
  readonly author: string;
  readonly identifier: string;
}

const buildContainerXml = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const buildContentOpf = (metadata: EpubMetadata): string => `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(metadata.identifier)}</dc:identifier>
    <dc:title>${escapeHtml(metadata.title)}</dc:title>
    <dc:creator>${escapeHtml(metadata.author)}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`;

const buildNavXhtml = (metadata: EpubMetadata): string => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeHtml(metadata.title)}</title></head>
<body>
  <nav epub:type="toc"><ol><li><a href="chapter1.xhtml">${escapeHtml(metadata.title)}</a></li></ol></nav>
</body>
</html>`;

const buildTocNcx = (metadata: EpubMetadata): string => `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeHtml(metadata.identifier)}"/></head>
  <docTitle><text>${escapeHtml(metadata.title)}</text></docTitle>
  <navMap>
    <navPoint id="chapter1" playOrder="1">
      <navLabel><text>${escapeHtml(metadata.title)}</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

const buildChapterXhtml = (metadata: EpubMetadata, bodyHtml: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeHtml(metadata.title)}</title></head>
<body>
${bodyHtml}
</body>
</html>`;

export const buildEpubArchive = async (metadata: EpubMetadata, bodyHtml: string): Promise<Uint8Array> => {
  const zip = new JSZip();
  // The mimetype file must be the first entry and stored uncompressed, per
  // the EPUB container specification.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')?.file('container.xml', buildContainerXml());
  const oebps = zip.folder('OEBPS');
  oebps?.file('content.opf', buildContentOpf(metadata));
  oebps?.file('nav.xhtml', buildNavXhtml(metadata));
  oebps?.file('toc.ncx', buildTocNcx(metadata));
  oebps?.file('chapter1.xhtml', buildChapterXhtml(metadata, bodyHtml));
  const buffer = await zip.generateAsync({ type: 'uint8array' });
  return buffer;
};


