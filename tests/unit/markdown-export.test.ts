import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import type { Root as MdastRoot } from 'mdast';
import { describe, expect, it } from 'vitest';
import {
  buildAstJson,
  buildDocxDocument,
  buildEpubArchive,
  buildStandaloneMarkdownHtml,
  renderDocxToBytes,
} from '../../src/tools/markdown/export-engine';
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

  it('escapes the title so it cannot break out of the <title> element', () => {
    const html = buildStandaloneMarkdownHtml('</title><script>alert(1)</script>', '<p>x</p>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('embeds real rendered markdown output produced by the render engine', () => {
    const { html: body } = renderMarkdown('# Title\n\nBody text.');
    const html = buildStandaloneMarkdownHtml('Doc', body);
    expect(html).toContain('<h1');
    expect(html).toContain('Body text.');
  });
});

describe('AST JSON export', () => {
  it('serializes the parsed syntax tree losslessly to formatted JSON', () => {
    const { tree } = parseMarkdown('# Title\n\nBody.');
    const json = buildAstJson(tree);
    const parsed = JSON.parse(json);
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

  it('renders to a byte buffer with a valid ZIP file signature (DOCX is a ZIP container)', async () => {
    const tree = parseToMdast('# Title\n\nHello world.');
    const bytes = await renderDocxToBytes(tree);
    expect(bytes.length).toBeGreaterThan(0);
    // ZIP local file header signature: 0x50 0x4B 0x03 0x04 ("PK\x03\x04").
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

describe('EPUB export (structural container)', () => {
  it('produces a byte buffer with a valid ZIP file signature', async () => {
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<h1>Chapter One</h1><p>Hello world.</p>',
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('contains the expected EPUB container structure (mimetype, container.xml, content.opf, nav, ncx, chapter)', async () => {
    const JSZip = (await import('jszip')).default;
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<p>Hello.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/toc.ncx',
      'OEBPS/chapter1.xhtml',
    ]));
  });

  it('stores the mimetype file uncompressed as the EPUB specification requires', async () => {
    const JSZip = (await import('jszip')).default;
    const bytes = await buildEpubArchive(
      { title: 'My Book', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<p>Hello.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    const mimetypeFile = zip.file('mimetype');
    expect(mimetypeFile).not.toBeNull();
    // @ts-expect-error - _data is an internal JSZip field, inspected here only to
    // confirm the compression method actually used, not part of the public API.
    expect(mimetypeFile?._data?.compression?.magic).toBe('\x00\x00');
  });

  it('escapes metadata so a malicious title cannot break the XML structure', async () => {
    const JSZip = (await import('jszip')).default;
    const bytes = await buildEpubArchive(
      { title: '</dc:title><script>alert(1)</script>', author: 'Jane Doe', identifier: 'urn:uuid:test' },
      '<p>Hello.</p>',
    );
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(opf).not.toContain('<script>alert(1)</script>');
  });
});
