import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { parseMarkdownTree } from '../../src/tools/markdown/parse-engine';
import { formatMarkdownSource } from '../../src/tools/markdown/format-engine';
import { buildOutline } from '../../src/tools/markdown/outline-engine';
import { buildStandaloneMarkdownHtml, buildEpubArchive, renderDocxToBytes } from '../../src/tools/markdown/export-engine';

const block = '<details>\n<summary>**More**</summary>\n\n## Inside\n\nTerm\n: H~2~O in HTML.\n\n- [ ] Nested task\n\n</details>';
describe('Markdown disclosure blocks', () => {
  it('renders a native disclosure with inline summary and rich positioned body', () => {
    const html = renderMarkdown(block).html;
    expect(html).toMatch(/<details\b[^>]*class="markdown-disclosure"/);
    expect(html).toMatch(/<summary\b[^>]*><strong\b[^>]*>More<\/strong><\/summary>/);
    expect(html).toContain('Inside');
    expect(html).toContain('<sub');
    expect(html).toContain('data-source-line="4"');
    expect(JSON.stringify(parseMarkdownTree(block))).toContain('"type":"workbenchDisclosure"');
  });
  it('supports boolean open presence, native groups and a default summary', () => {
    const html = renderMarkdown('<details open="false" name="group&amp;one">\n\nBody\n\n</details>').html;
    expect(html).toMatch(/<details\b[^>]*\bopen(?:\s|>)/);
    expect(html).toContain('name="user-content-group&#x26;one"');
    expect(html).toMatch(/<summary\b[^>]*>Details<\/summary>/);
  });
  it.each([
    '<details><summary>Outer</summary>\n\n<details><summary>Inner</summary>\n\nBody\n\n</details>\n\n</details>',
    '<details><summary>Outer</summary><details><summary>Inner</summary>Body</details></details>',
  ])('retains nested and compact wrappers: %s', (source) => {
    const html = renderMarkdown(source).html;
    expect(html.match(/<details\b/g)).toHaveLength(2);
    expect(html).toContain('Body');
  });
  it('keeps wrapper-looking code and math literal', () => {
    const html = renderMarkdown('```html\n' + block + '\n```\n\n$$\n<details>\n<summary>Literal</summary>\n</details>\n$$').html;
    expect(html).not.toMatch(/<details\b/);
  });
  it.each(['<details>\n<summary>Unclosed</summary>\n\nAfter', '</details>\n\nAfter', '<details onclick="alert(1)"><summary>Unsafe</summary>Body</details>'])('keeps rejected or unmatched wrappers inert and readable: %s', (source) => {
    const html = renderMarkdown(source).html;
    expect(html).not.toMatch(/<details\b/);
    expect(html).toContain('<pre');
    expect(html).not.toMatch(/<[^>]+\bonclick=/);
    expect(html).toContain(source.includes('After') ? 'After' : 'Unsafe');
  });
  it('retains literal closing tags inside a fenced body and expands abbreviations after body parsing', () => {
    const html = renderMarkdown('*[HTML]: Expansion\n\n<details>\n<summary>More</summary>\n```html\n</details>\n```\n\nHTML\n\n</details>').html;
    expect(html.match(/<details\b[^>]*class="markdown-disclosure"/g)).toHaveLength(1);
    expect(html).toContain('&#x3C;/details>');
    expect(html).toContain('<abbr title="Expansion">HTML</abbr>');
  });
  it('preserves source positions through quote/list prefixes and CRLF', () => {
    const html = renderMarkdown('> <details>\r\n> <summary>More</summary>\r\n>\r\n> ## Inside\r\n>\r\n> </details>').html;
    expect(html).toMatch(/<details\b/);
    expect(html).toContain('data-source-line="4"');
  });
  it('keeps outline ids consistent after duplicate headings inside a disclosure', () => {
    const source = block + '\n\n## Inside';
    const outline = buildOutline(source);
    const html = renderMarkdown(source).html;
    expect(outline.at(-1)?.id).toBe('inside-1');
    expect(html).toContain('user-content-inside-1');
  });
  it('resolves authored heading fragments to sanitized IDs for preview and standalone navigation', () => {
    const html = renderMarkdown('[Jump](#inside)\n\n' + block).html;
    expect(html).toContain('href="#user-content-inside"');
    expect(html).toContain('id="user-content-inside"');
  });
  it('preserves disclosure text and a body caret through auto-format while formatting surrounding text', async () => {
    const source = '* outside\n\n' + block + '\n\n* after';
    const cursor = source.indexOf('Inside');
    const result = await formatMarkdownSource(source, cursor);
    expect(result.formatted).toContain(block);
    expect(result.formatted).toContain('- outside');
    expect(result.formatted.slice(result.cursorOffset)).toMatch(/^Inside/);
  });
  it('preserves readable HTML, expanded valid XHTML and DOCX body content', async () => {
    const html = renderMarkdown(block).html;
    expect(buildStandaloneMarkdownHtml('Details', html)).toMatch(/<details\b/);
    const epub = await JSZip.loadAsync(await buildEpubArchive({title:'Details',author:'',identifier:'urn:uuid:details'}, html));
    const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
    expect(chapter).toMatch(/<details\b[^>]*open="open"/);
    const docx = await JSZip.loadAsync(await renderDocxToBytes(parseMarkdownTree(block)));
    const document = await docx.file('word/document.xml')!.async('string');
    expect(document).toContain('More');
    expect(document).toContain('Inside');
    expect(document).toContain('Nested task');
  });
  it('normalizes initially open and nested exclusive groups without losing bodies', () => {
    const source = '<details open name="same"><summary>Outer</summary><details open name="same"><summary>Nested</summary>Body</details></details>\n\n<details open name="same"><summary>Other</summary>Other body</details>';
    const html = renderMarkdown(source).html;
    expect(html.match(/name="user-content-same"/g)).toHaveLength(2);
    expect(html.match(/<details\b[^>]*\bopen(?:\s|>)/g)).toHaveLength(2);
    expect(html).toContain('Other body');
  });
  it('uses original summary positions and preserves missing/empty captions', () => {
    const html = renderMarkdown('\n\n<details>\n<summary>**Caption**</summary>\n\nBody\n\n</details>').html;
    expect(html).toMatch(/<summary data-source-line="4"><strong>Caption/);
    expect(renderMarkdown('<details><summary></summary></details>').html).toContain('Details');
    expect(renderMarkdown('<details></details>').html).toContain('Details');
  });
  it('keeps oversized nesting readable rather than producing unreachable content', () => {
    const source = '<details><summary>More</summary>'.repeat(65) + 'Deep body' + '</details>'.repeat(65);
    const html = renderMarkdown(source).html;
    expect(html).toContain('Deep body');
    expect(html).not.toMatch(/<details\b/);
  });
  it.each(['> ', '  '])('retains container prefixes and body caret when formatting %s', async prefix => {
    const wrapped = (prefix === '  ' ? '- Parent\n\n' : '') + block.split('\n').map(line => prefix + line).join('\n');
    const source = '---\ntitle: Details\n---\n\n* before\n\n' + wrapped + '\n\n* after';
    const result = await formatMarkdownSource(source, source.indexOf('Inside'));
    expect(result.formatted).toContain(wrapped);
    expect(result.formatted.slice(result.cursorOffset)).toMatch(/^Inside/);
  });
});
