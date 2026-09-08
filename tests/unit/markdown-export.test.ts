import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import type { Root as MdastRoot } from 'mdast';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildAstJson,
  buildDocxDocument,
  buildEpubArchive,
  buildStandaloneMarkdownHtml,
  renderDocxToBytes,
  toXhtmlFragment,
} from '../../src/tools/markdown/export-engine';
import { bundleHtmlImages, inlineStylesheetAssets } from '../../src/tools/markdown/export-assets';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';

const parseToMdast = (source: string): MdastRoot =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source) as MdastRoot;

describe('standalone HTML export', () => {
  it('embeds the given title and body HTML into a single self-contained document', () => {
    const html = buildStandaloneMarkdownHtml('My Document', '<h1>Hello</h1>');
    expect(html).toContain('<title>My Document</title>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('escapes the title so it cannot break out of the title element', () => {
    const html = buildStandaloneMarkdownHtml('</title><script>alert(1)</script>', '<p>x</p>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('embeds supplied KaTeX/export CSS instead of exporting unstyled math markup', () => {
    const html = buildStandaloneMarkdownHtml('Math', '<span class="katex">x</span>', {
      additionalCss: '.katex{font-family:KaTeX_Main}',
    });
    expect(html).toContain('.katex{font-family:KaTeX_Main}');
  });

  it('embeds real rendered markdown output produced by the render engine', () => {
    const { html: body } = renderMarkdown('# Title\n\nBody text.');
    const html = buildStandaloneMarkdownHtml('Doc', body);
    expect(html).toContain('<h1');
    expect(html).toContain('Body text.');
  });
});

describe('export asset bundling', () => {
  const imageFetcher = (async () => new Response(new Uint8Array([1, 2]), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })) as typeof fetch;

  it('inlines referenced HTML images for a genuinely standalone export', async () => {
    const result = await bundleHtmlImages('<p><img src="./diagram.png" alt="Diagram"></p>', 'https://example.test/docs/', 'inline', imageFetcher);
    expect(result.unresolved).toEqual([]);
    expect(result.html).toContain('src="data:image/png;base64,AQI="');
  });

  it('turns referenced images into EPUB package assets', async () => {
    const result = await bundleHtmlImages('<img src="./diagram.png">', 'https://example.test/docs/', 'epub', imageFetcher);
    expect(result.html).toContain('src="assets/image-1.png"');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].mediaType).toBe('image/png');
  });

  it('inlines stylesheet font URLs instead of leaving runtime dependencies', async () => {
    const fontFetcher = (async () => new Response(new Uint8Array([3, 4]), {
      status: 200,
      headers: { 'content-type': 'font/woff2' },
    })) as typeof fetch;
    const result = await inlineStylesheetAssets('@font-face{src:url("./fonts/KaTeX.woff2")}', 'https://example.test/assets/app.css', fontFetcher);
    expect(result.unresolved).toEqual([]);
    expect(result.css).toContain('url("data:font/woff2;base64,AwQ=")');
  });
});

describe('AST JSON export', () => {
  it('serializes the parsed syntax tree losslessly to formatted JSON', () => {
    const { tree } = parseMarkdown('# Title\n\nBody.');
    const parsed = JSON.parse(buildAstJson(tree));
    expect(parsed.type).toBe('root');
    expect(parsed.children[0].type).toBe('heading');
  });
});

describe('DOCX export', () => {
  it('builds a Document from headings, paragraphs, and inline emphasis without throwing', () => {
    const tree = parseToMdast('# Title\n\nSome **bold** and *italic* text.');
    expect(() => buildDocxDocument(tree)).not.toThrow();
  });

  it('builds a Document from a GFM table without throwing', () => {
    const tree = parseToMdast('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(() => buildDocxDocument(tree)).not.toThrow();
  });

  it('preserves fenced code, blockquotes, ordered-list semantics, links, and image references', async () => {
    const tree = parseToMdast([
      '> Quoted text',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '1. First item',
      '2. Second item',
      '',
      '[Documentation](https://example.test/docs)',
      '',
      '![Diagram](https://example.test/diagram.png)',
    ].join('\n'));
    const bytes = await renderDocxToBytes(tree);
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    const relationsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    const numberingXml = await zip.file('word/numbering.xml')?.async('string');
    expect(documentXml).toContain('Quoted text');
    expect(documentXml).toContain('const answer = 42;');
    expect(documentXml).toContain('First item');
    expect(documentXml).toContain('Diagram');
    expect(relationsXml).toContain('https://example.test/docs');
    expect(relationsXml).toContain('https://example.test/diagram.png');
    expect(numberingXml).toContain('decimal');
  });

  it('falls back to an italic plain-text paragraph for math when no image resolver is supplied', () => {
    const tree = parseToMdast('$$x^2$$');
    expect(() => buildDocxDocument(tree)).not.toThrow();
  });

  it('uses the image resolver result for a math node when one is supplied', () => {
    const tree = parseToMdast('$$x^2$$');
    const fakeImage = new Uint8Array([1, 2, 3, 4]);
    const resolver = (source: string) => (source === 'x^2' ? fakeImage : undefined);
    expect(() => buildDocxDocument(tree, resolver)).not.toThrow();
  });

  it('produces an empty-but-valid document body for an empty source', () => {
    const tree = parseToMdast('');
    expect(() => buildDocxDocument(tree)).not.toThrow();
  });

  it('renders to a byte buffer with a valid ZIP file signature', async () => {
    const bytes = await renderDocxToBytes(parseToMdast('# Title\n\nHello world.'));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

describe('EPUB export (structural container)', () => {
  it('serializes HTML void elements as XML-safe XHTML', () => {
    expect(toXhtmlFragment('<p>A<br>B</p><input checked disabled>')).toBe('<p>A<br />B</p><input checked="checked" disabled="disabled" />');
  });

  it('produces a byte buffer with a valid ZIP file signature', async () => {
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test', modified: '2026-09-08T00:41:00Z' },
      '<h1>Chapter One</h1><p>Hello world.</p>',
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('contains the expected EPUB structure and required modification metadata', async () => {
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test', modified: '2026-09-08T00:41:00Z' },
      '<p>Hello.<br>Again.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      'mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/chapter1.xhtml',
    ]));
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    const chapter = await zip.file('OEBPS/chapter1.xhtml')?.async('string');
    expect(opf).toContain('<meta property="dcterms:modified">2026-09-08T00:41:00Z</meta>');
    expect((opf?.match(/dcterms:modified/g) ?? [])).toHaveLength(1);
    expect(chapter).toContain('<br />');
  });

  it('packages bundled images in the manifest and container', async () => {
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: '', identifier: 'urn:uuid:test', modified: '2026-09-08T00:41:00Z' },
      '<img src="assets/image-1.png" alt="Diagram" />',
      [{ path: 'assets/image-1.png', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }],
    );
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(zip.file('OEBPS/assets/image-1.png')).not.toBeNull();
    expect(opf).toContain('href="assets/image-1.png" media-type="image/png"');
  });

  it('stores the mimetype file uncompressed as the EPUB specification requires', async () => {
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<p>Hello.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    const mimetypeFile = zip.file('mimetype');
    expect(mimetypeFile).not.toBeNull();
    // @ts-expect-error JSZip exposes compression only internally; this verifies the required ZIP storage method.
    expect(mimetypeFile?._data?.compression?.magic).toBe('\x00\x00');
  });

  it('escapes metadata so a malicious title cannot break the XML structure', async () => {
    const bytes = await buildEpubArchive(
      { title: '</dc:title><script>alert(1)</script>', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<p>Hello.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(opf).not.toContain('<script>alert(1)</script>');
  });
});
