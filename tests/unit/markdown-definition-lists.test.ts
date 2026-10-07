import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';
import { renderDocxToBytes, buildEpubArchive, buildStandaloneMarkdownHtml } from '../../src/tools/markdown/export-engine';
import { formatMarkdownSource } from '../../src/tools/markdown/format-engine';

describe('Markdown definition lists', () => {
  const source = 'Apple\n: A **fruit**.\n\nOrange\n: A citrus fruit.';
  it('renders terms and formatted definitions with source anchors', () => {
    const html = renderMarkdown(source).html;
    expect(html).toMatch(/<dl\b/);
    expect(html).toMatch(/<dt\b[^>]*>Apple<\/dt>/);
    expect(html).toMatch(/<strong\b[^>]*>fruit<\/strong>/);
    expect(html).toMatch(/<dd\b/);
    expect(html).toContain('data-source-line="1"');
  });
  it('exposes definition list nodes and positions in the AST', () => {
    const tree = JSON.stringify(parseMarkdown(source).tree);
    expect(tree).toContain('"type":"defList"');
    expect(tree).toContain('"type":"defListTerm"');
    expect(tree).toContain('"type":"defListDescription"');
    expect(tree).toContain('"offset":0');
  });
  it('supports multiple terms and definitions with continued content', () => {
    const html = renderMarkdown('Term one\nTerm two\n: First definition.\n: Second definition\n  continues here.').html;
    expect(html.match(/<dt\b/g)).toHaveLength(2);
    expect(html.match(/<dd\b/g)).toHaveLength(2);
    expect(html).toContain('continues here.');
  });
  it('retains nested block paragraphs, lists and code in definitions', () => {
    const html = renderMarkdown('Term\n\n:   First paragraph.\n\n    Another paragraph.\n\n    - Nested item\n\n    ```text\n    literal : definition\n    ```').html;
    expect(html).toMatch(/<dl\b/);
    expect(html).toContain('Another paragraph.');
    expect(html).toContain('Nested item');
    expect(html).toContain('<pre');
  });
  it('keeps code, escaped colons and unmatched colon lines outside definition lists', () => {
    const html = renderMarkdown(': Without a term.\n\n`Term : value`\n\n```text\nTerm\n: Value\n```\n\nTerm\n\\: Literal').html;
    expect(html).not.toMatch(/<dl\b/);
    expect(html).toContain(': Value');
    expect(html).toContain(': Without a term.');
  });
  it('keeps definition-like lines inside display math and indented code literal', () => {
    expect(renderMarkdown('$$\nTerm\n: Value\n$$').html).not.toMatch(/<dl\b/);
    const html = renderMarkdown('Term\n\n    : literal code').html;
    expect(html).not.toMatch(/<dl\b/);
    expect(html).toContain('<pre');
  });
  it('renders an empty definition without a parser exception or losing its term', () => {
    const html = renderMarkdown('Term\n:');
    expect(html.html).toContain('Term');
  });
  it('preserves a GFM single-column table row beginning with an unescaped colon', () => {
    const html = renderMarkdown('head\n| - |\nrow1\n: row2').html;
    expect(html).toMatch(/<td\b[^>]*>: row2<\/td>/);
    expect(html).not.toMatch(/<dl\b/);
  });
  it('preserves a colon as the first GFM table body row', () => {
    const html = renderMarkdown('head\n| - |\n: row').html;
    expect(html).toMatch(/<td\b[^>]*>: row<\/td>/);
    expect(html).not.toMatch(/<dl\b/);
  });
  it('allows an ordinary definition list after a completed GFM table', () => {
    const html = renderMarkdown('head\n| - |\nrow\n\nTerm\n: Description').html;
    expect(html).toMatch(/<table\b/);
    expect(html).toMatch(/<dt\b[^>]*>Term<\/dt>/);
    expect(html).toContain('Description');
  });
  it('keeps colon rows inside a table nested in a definition', () => {
    const html = renderMarkdown('Term\n\n:   head\n    | - |\n    row1\n    : row2').html;
    expect(html).toMatch(/<td\b[^>]*>: row2<\/td>/);
  });
  it('recognizes definition lists inside bullet and numbered items without crossing item boundaries', () => {
    for (const marker of ['- ', '1. ']) {
      const indent = ' '.repeat(marker.length);
      const html = renderMarkdown(`${marker}Term\n\n${indent}: Definition\n\n${marker}Plain item`).html;
      expect(html).toMatch(/<dt\b[^>]*>Term<\/dt>/);
      expect(html.match(/<dl\b/g)).toHaveLength(1);
      expect(html).toContain('Plain item');
    }
    expect(renderMarkdown('- Term\n- : Literal next item').html).not.toMatch(/<dl\b/);
  });
  it('retains multiple terms and continued descriptions inside a list item', () => {
    const html = renderMarkdown('- Term one\n  Term two\n\n  : First\n    continued.\n  : Second').html;
    expect(html.match(/<dt\b/g)).toHaveLength(2);
    expect(html.match(/<dd\b/g)).toHaveLength(2);
    expect(html).toContain('continued.');
  });
  it('preserves inline scripts and abbreviations inside definitions', () => {
    const html = renderMarkdown('*[HTML]: Expansion\n\nWater\n: H~2~O in HTML.').html;
    expect(html).toMatch(/<dd\b/);
    expect(html).toMatch(/<sub\b[^>]*>2<\/sub>/);
    expect(html).toContain('<abbr title="Expansion">HTML</abbr>');
  });
  it('auto-format preserves semantic list structure and nested content', async () => {
    const before = parseMarkdown(source).tree;
    const { formatted } = await formatMarkdownSource(source, source.indexOf('fruit'));
    const after = parseMarkdown(formatted).tree;
    const normalize = (tree: unknown) => JSON.stringify(tree, (key, value) => key === 'position' ? undefined : value);
    expect(normalize(after)).toBe(normalize(before));
    expect(renderMarkdown(formatted).html).toMatch(/<dl\b/);
  });
  it.each([
    'Term one\nTerm two\n: First definition.\n: Second definition\n  continues here.',
    'Term\n\n:   First paragraph.\n\n    Another paragraph.\n\n    - Nested item\n\n    ```text\n    literal : definition\n    ```',
    'Term\n\n:   head\n    | - |\n    row1\n    : row2',
  ])('auto-format preserves the parsed nested definition structure for %s', async (text) => {
    const { formatted } = await formatMarkdownSource(text, 0);
    const normalize = (tree: unknown) => JSON.stringify(tree, (key, value) => key === 'position' ? undefined : value);
    expect(normalize(parseMarkdown(formatted).tree)).toBe(normalize(parseMarkdown(text).tree));
  });
  it.each([
    '> Term\n>\n> :   head\n>     | - |\n>     : row',
    '- Term\n\n  :   head\n      | - |\n      : row',
    'Term\r\n\r\n:   A 😀 **definition** &amp; H~2~O.\r\n\r\n    - nested',
  ])('preserves native container text and a caret inside it: %s', async (block) => {
    const prefix = '* outside\n\n';
    const source = prefix + block + '\n\n* after';
    const cursor = source.indexOf('head') >= 0 ? source.indexOf('head') : source.indexOf('😀');
    const result = await formatMarkdownSource(source, cursor);
    expect(result.formatted).toContain(block);
    expect(result.formatted).toContain('- outside');
    expect(result.formatted).toContain('- after');
    expect(result.formatted.slice(result.cursorOffset, result.cursorOffset + 4)).toBe(source.slice(cursor, cursor + 4));
    expect(result.formatted).not.toMatch(/[\uE000-\uF8FF]/);
  });
  it('maps a caret after multiple definition blocks and preserves frontmatter and marker collisions', async () => {
    const prefix = '---\ntitle: Definitions\n---\n';
    const source = prefix + '\n* outside\n\nFirst\n: E000 literal \uE000.\n\n# Between\n\nSecond\n: Another definition.\n\n* after';
    const result = await formatMarkdownSource(source, source.indexOf('after'));
    expect(result.formatted.startsWith(prefix)).toBe(true);
    expect(result.formatted).toContain('E000 literal \uE000.');
    expect(result.formatted.slice(result.cursorOffset)).toMatch(/^after/);
  });
  it('preserves definition markup in HTML and EPUB and readable structure in DOCX', async () => {
    const html = renderMarkdown(source).html;
    expect(buildStandaloneMarkdownHtml('Definitions', html)).toMatch(/<dl\b/);
    const epub = await JSZip.loadAsync(await buildEpubArchive({ title: 'Definitions', author: '', identifier: 'urn:uuid:definitions' }, html));
    expect(await epub.file('OEBPS/chapter1.xhtml')!.async('string')).toMatch(/<dt\b[^>]*>Apple<\/dt>/);
    const docx = await JSZip.loadAsync(await renderDocxToBytes(parseMarkdown(source).tree));
    const document = await docx.file('word/document.xml')!.async('string');
    expect(document).toContain('Apple');
    expect(document).toContain('A ');
    expect(document).toContain('fruit');
    expect(document).not.toContain(': A');
  });
});
