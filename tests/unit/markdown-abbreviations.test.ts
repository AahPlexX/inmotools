import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';
import { renderDocxToBytes, buildEpubArchive, buildStandaloneMarkdownHtml } from '../../src/tools/markdown/export-engine';
import { formatMarkdownSource } from '../../src/tools/markdown/format-engine';

describe('Markdown abbreviations', () => {
  const source = '*[HTML]: HyperText Markup Language\n*[W3C]: World Wide Web Consortium\nThe HTML specification belongs to W3C.';
  it('renders definitions before or after prose as semantic abbreviations', () => {
    const html = renderMarkdown(source).html;
    expect(html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
    expect(html).toContain('<abbr title="World Wide Web Consortium">W3C</abbr>');
    expect(html).not.toContain('*[HTML]');
    expect(renderMarkdown('HTML\n\n*[HTML]: Expansion').html).toContain('<abbr title="Expansion">HTML</abbr>');
  });
  it('keeps labels case-sensitive and excludes larger Unicode words', () => {
    const html = renderMarkdown('*[HTML]: Expansion\n\nHTML html HTML5 éHTML HTML界 (HTML),HTML.').html;
    expect(html.match(/<abbr\b/g)).toHaveLength(3);
    expect(html).toContain('html HTML5 éHTML HTML界');
  });
  it('prefers the longest full label and the first definition', () => {
    const html = renderMarkdown('*[Web]: First\n*[Web API]: Longer\n*[Web]: Second\n\nWeb API, Web.').html;
    expect(html).toContain('<abbr title="Longer">Web API</abbr>');
    expect(html).toContain('<abbr title="First">Web</abbr>');
    expect(html).not.toContain('Second');
  });
  it('supports empty expansions and labels that contain regexp punctuation', () => {
    const html = renderMarkdown('*[C++]: Language\n*[Empty]:\n\nC++ Empty').html;
    expect(html).toContain('<abbr title="Language">C++</abbr>');
    expect(html).toContain('<abbr>Empty</abbr>');
  });
  it('keeps definition-like code, math, escaped markers and script contents literal', () => {
    const html = renderMarkdown('*[HTML]: Expansion\n\n`HTML`\n\n```text\n*[Fake]: fake\nHTML\n```\n\n$HTML$\n\nx^HTML^\n\n\\*[Fake]: fake\n\nFake').html;
    expect(html).not.toContain('<abbr');
    expect(html).toContain('*[Fake]: fake');
  });
  it('does not interpret definitions embedded in ordinary prose', () => {
    const html = renderMarkdown('Prose *[HTML]: Expansion\n\nHTML').html;
    expect(html).not.toContain('<abbr');
  });
  it('exposes used expansions in a collapsible glossary without enabling raw HTML', () => {
    const html = renderMarkdown('*[HTML]: <img src=x> & "quoted"\n\nHTML HTML').html;
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Abbreviations');
    expect(html).toMatch(/<dd>(?:&#x3C;|&lt;)img src=x>/);
    expect(html).toContain('&#x22;quoted&#x22;');
    expect(html.match(/<dt>/g)).toHaveLength(1);
  });
  it('preserves definition grammar and meaning through auto-format', async () => {
    const result = await formatMarkdownSource(source, 10);
    expect(result.formatted).toContain('*[HTML]: HyperText Markup Language');
    expect(renderMarkdown(result.formatted).html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
  });
  it.each([
    '*[Empty]:\n\nEmpty',
    '*[Web API]: An API\n\nWeb API',
    '*[C++]: A **language**\n\nC++',
    '*[A\\]B]: Escaped label\n\nA]B',
    '> *[HTML]: Expansion\n>\n> HTML',
    'Before.\n*[HTML]: Expansion\nAfter HTML.',
  ])('auto-format retains abbreviation meaning for boundary case %s', async (text) => {
    const before = renderMarkdown(text).html;
    expect(before).toContain('<abbr');
    const { formatted } = await formatMarkdownSource(text, text.length);
    expect(renderMarkdown(formatted).html.replace(/ data-source-line="\d+"/g, '')).toBe(before.replace(/ data-source-line="\d+"/g, ''));
  });
  it('retains semantic markup in HTML and EPUB and readable labels in DOCX', async () => {
    const html = renderMarkdown(source).html;
    expect(buildStandaloneMarkdownHtml('Abbreviations', html)).toContain('<abbr');
    const epub = await JSZip.loadAsync(await buildEpubArchive({ title: 'Abbreviations', author: '', identifier: 'urn:uuid:abbr' }, html));
    expect(await epub.file('OEBPS/chapter1.xhtml')!.async('string')).toContain('<abbr');
    const docx = await JSZip.loadAsync(await renderDocxToBytes(parseMarkdown(source).tree));
    const document = await docx.file('word/document.xml')!.async('string');
    expect(document).toContain('HTML');
    expect(document).not.toContain('*[HTML]');
  });
});
