import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';
import { buildEpubArchive, buildStandaloneMarkdownHtml, renderDocxToBytes } from '../../src/tools/markdown/export-engine';
import { formatMarkdownSource } from '../../src/tools/markdown/format-engine';
import { buildOutline } from '../../src/tools/markdown/outline-engine';
import { HEADING_ID_PREFIX } from '../../src/tools/markdown/heading-slug';

describe('Markdown subscript and superscript', () => {
  const source = 'H~2~O and x^2^';
  it('renders chemical subscripts and mathematical superscripts', () => {
    const html = renderMarkdown(source).html;
    expect(html).toMatch(/<sub\b[^>]*>2<\/sub>/);
    expect(html).toMatch(/<sup\b[^>]*>2<\/sup>/);
    expect(html).not.toContain('<del');
  });
  it('exposes script nodes and positions in the document AST', () => {
    const tree = JSON.stringify(parseMarkdown(source).tree);
    expect(tree).toContain('"type":"subscript"');
    expect(tree).toContain('"type":"superscript"');
    expect(tree).toContain('"offset":1');
  });
  it('keeps double-tilde strikethrough separate from subscript', () => {
    const html = renderMarkdown('~~deleted~~ and H~2~O').html;
    expect(html).toMatch(/<del\b[^>]*>deleted<\/del>/);
    expect(html).toMatch(/<sub\b[^>]*>2<\/sub>/);
  });
  it('keeps script heading text and IDs consistent between outline and preview', () => {
    const heading = '# H~2~O and x^2^';
    const outline = buildOutline(heading);
    expect(outline[0].text).toBe('H2O and x2');
    expect(renderMarkdown(heading).html).toContain(`id="${HEADING_ID_PREFIX}${outline[0].id}"`);
  });
  it('preserves escaped closing markers and backslashes without accepting unescaped spaces', () => {
    const source = String.raw`P~a\~b~ x^a\^b^ P~a\\\ cat~ P~a\\ cat~`;
    const tree = parseMarkdown(source).tree.children[0];
    if (tree.type !== 'paragraph') throw new Error('Expected a paragraph');
    const scripts = tree.children.filter((node) => node.type === 'subscript' || node.type === 'superscript');
    expect(scripts.map((node) => node.children[0].value)).toEqual(['a~b', 'a^b', String.raw`a\ cat`]);
  });
  it.each(['~two words~', '^two words^', '~two\nwords~', '^two\nwords^', '^^twice^^', '^', '~'])('keeps invalid or unmatched script syntax literal: %s', (literal) => {
    const html = renderMarkdown(literal).html;
    expect(html).not.toMatch(/<(sub|sup)\b/);
    expect(html).toContain(literal);
  });
  it('keeps escaped and entity-written delimiters literal', () => {
    const html = renderMarkdown('H\\~2\\~O x\\^2\\^ and H&#126;2&#126;O x&#94;2&#94;').html;
    expect(html).not.toMatch(/<(sub|sup)\b/);
    expect(html).toContain('H~2~O');
    expect(html).toContain('x^2^');
  });
  it('allows backslash-escaped spaces and decodes character references inside scripts', () => {
    const html = renderMarkdown('P~a\\ cat~ and H~&#50;~O x^&amp;^').html;
    expect(html).toMatch(/<sub\b[^>]*>a cat<\/sub>/);
    expect(html).toMatch(/<sub\b[^>]*>2<\/sub>/);
    expect(html).toMatch(/<sup\b[^>]*>(?:&amp;|&#x26;|&#38;)<\/sup>/);
  });
  it('preserves code and math literals', () => {
    const html = renderMarkdown('`H~2~O x^2^`\n\n```text\nH~2~O x^2^\n```\n\n$x^2$').html;
    expect(html).not.toMatch(/<(sub|sup)\b/);
    expect(html).toContain('H~2~O x^2^');
    expect(html).toContain('katex');
  });
  it('renders script contents as inert literal text', () => {
    const html = renderMarkdown('x^<img>^').html;
    const paragraph = parseMarkdown('x^<img>^').tree.children[0];
    if (paragraph.type !== 'paragraph') throw new Error('Expected a script paragraph');
    const script = paragraph.children.find((node) => node.type === 'superscript');
    expect(script?.children.map((node) => node.value).join('')).toBe('<img>');
    expect(html).toMatch(/<sup\b/);
    expect(html).not.toContain('<img');
  });
  it('auto-format preserves the meaning of both script forms', async () => {
    const formatted = await formatMarkdownSource(source, 0);
    const html = renderMarkdown(formatted.formatted).html;
    expect(html).toMatch(/<sub\b[^>]*>2<\/sub>/);
    expect(html).toMatch(/<sup\b[^>]*>2<\/sup>/);
  });
  it('preserves script markup in standalone HTML and EPUB', async () => {
    const body = renderMarkdown(source).html;
    expect(buildStandaloneMarkdownHtml('Scripts', body)).toMatch(/<sub\b[^>]*>2<\/sub>/);
    const zip = await JSZip.loadAsync(await buildEpubArchive({ title: 'Scripts', author: '', identifier: 'urn:uuid:scripts' }, body));
    expect(await zip.file('OEBPS/chapter1.xhtml')?.async('string')).toMatch(/<sup\b[^>]*>2<\/sup>/);
  });
  it('preserves script formatting in DOCX runs', async () => {
    const zip = await JSZip.loadAsync(await renderDocxToBytes(parseMarkdown(source).tree));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('w:val="subscript"');
    expect(document).toContain('w:val="superscript"');
  });
});
