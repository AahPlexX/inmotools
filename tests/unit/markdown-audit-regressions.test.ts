import JSZip from 'jszip';
import type { Root as MdastRoot } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { bundleStylesheetAssetsForEpub } from '../../src/tools/markdown/export-assets';
import { buildEpubArchive, buildStandaloneMarkdownHtml, renderDocxToBytes } from '../../src/tools/markdown/export-engine';

const parseToMdast = (source: string): MdastRoot =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source) as MdastRoot;

describe('Markdown audit regressions', () => {
  it('resolves reference links and images in DOCX without mutating the input AST', async () => {
    const tree = parseToMdast('[Docs][API]\n\n![Diagram][image]\n\n[api]: https://example.test/docs\n[image]: https://example.test/image.png');
    const before = JSON.stringify(tree);
    const zip = await JSZip.loadAsync(await renderDocxToBytes(tree));
    const relations = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relations).toContain('https://example.test/docs');
    expect(relations).toContain('https://example.test/image.png');
    expect(JSON.stringify(tree)).toBe(before);
  });

  it('contains exported tables in a keyboard-accessible scrolling region', () => {
    const html = buildStandaloneMarkdownHtml('Table', '<p>Before</p><table><tr><td>Data</td></tr></table><p>After</p>');
    expect(html).toContain('class="table-scroll" role="region" aria-label="Scrollable table" tabindex="0"><table>');
    expect(html).toContain('</table></div><p>After</p>');
    expect(html).toContain('.table-scroll { overflow: auto; max-width: 100%; }');
  });
  it('preserves DOCX footnote references and definitions', async () => {
    const bytes = await renderDocxToBytes(parseToMdast('Body with a note.[^audit]\n\n[^audit]: Footnote content survives export.'));
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    const footnotesXml = await zip.file('word/footnotes.xml')?.async('string');

    expect(documentXml).toContain('footnoteReference');
    expect(footnotesXml).toContain('Footnote content survives export.');
  });

  it('preserves an ordered-list start and numbers each logical list item only once', async () => {
    const tree = parseToMdast('3. First item paragraph\n\n   Continuation paragraph\n4. Second item');
    const bytes = await renderDocxToBytes(tree);
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml')?.async('string') ?? '';
    const numberingXml = await zip.file('word/numbering.xml')?.async('string') ?? '';

    expect(numberingXml).toContain('w:start w:val="3"');
    expect(documentXml.match(/<w:numPr>/g)).toHaveLength(2);
    expect(documentXml).toContain('Continuation paragraph');
  });

  it('declares SVG and MathML manifest properties when chapter XHTML contains them', async () => {
    const bytes = await buildEpubArchive(
      { title: 'Rich EPUB', author: '', identifier: 'urn:uuid:audit', modified: '2026-09-08T18:54:00Z' },
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1" /></svg><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
    );
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')?.async('string') ?? '';

    expect(opf).toMatch(/id="chapter1"[^>]*properties="[^"]*svg[^"]*"/);
    expect(opf).toMatch(/id="chapter1"[^>]*properties="[^"]*mathml[^"]*"/);
  });

  it('packages EPUB stylesheet dependencies and rewrites CSS URLs to local manifest resources', async () => {
    const fetcher = (async () => new Response(new Uint8Array([3, 4]), {
      status: 200,
      headers: { 'content-type': 'font/woff2' },
    })) as typeof fetch;
    const bundledCss = await bundleStylesheetAssetsForEpub(
      '@font-face{font-family:KaTeX_Main;src:url("./fonts/KaTeX_Main.woff2")} .katex{font-family:KaTeX_Main}',
      'https://example.test/assets/katex.css',
      fetcher,
    );
    expect(bundledCss.unresolved).toEqual([]);
    expect(bundledCss.css).toContain('url("../assets/style-1.woff2")');

    const bytes = await buildEpubArchive(
      { title: 'Math EPUB', author: '', identifier: 'urn:uuid:math', modified: '2026-09-08T18:54:00Z' },
      '<span class="katex">x</span>',
      bundledCss.assets,
      { stylesheetCss: bundledCss.css },
    );
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file('OEBPS/content.opf')?.async('string') ?? '';
    const chapter = await zip.file('OEBPS/chapter1.xhtml')?.async('string') ?? '';

    expect(zip.file('OEBPS/styles/markdown.css')).not.toBeNull();
    expect(zip.file('OEBPS/assets/style-1.woff2')).not.toBeNull();
    expect(opf).toContain('href="styles/markdown.css" media-type="text/css"');
    expect(opf).toContain('href="assets/style-1.woff2" media-type="font/woff2"');
    expect(chapter).toContain('<link rel="stylesheet" href="styles/markdown.css" />');
  });
});
