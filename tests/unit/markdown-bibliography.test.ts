import { describe, expect, it } from 'vitest';
import { prepareBibliography, appendReferencesMarkdown, plainCitationText } from '../../src/tools/markdown/bibliography-engine';
import { parseMarkdownTree } from '../../src/tools/markdown/parse-engine';
import { renderMarkdown } from '../../src/tools/markdown/render-engine';
import { extractCitekeys, formatCitations, parseCslJson } from '../../src/tools/markdown/citation-engine';

describe('generated References', () => {
  it('decodes native entities and leaves citation characters literal in Markdown', () => {
    const source = plainCitationText('(A &#x26; B &lt;tag&gt; _name_, 2026)');
    expect(renderMarkdown(source).html).toContain('(A &#x26; B &#x3C;tag> _name_, 2026)');
    expect(plainCitationText('[1]')).toBe('\\[1\\]');
    expect(renderMarkdown('', prepareBibliography(['<div>A <i>title </i>after</div>']).markdown).html).toContain('A <em>title</em> after');
    const references = prepareBibliography(['<div><i>Literal :smile: title</i></div>']).markdown;
    expect(renderMarkdown('', references).html).toContain('Literal <code>:smile:</code> title');
    expect(renderMarkdown(appendReferencesMarkdown('Body', references)).html).not.toContain('😄');
  });
  it('updates earlier same-author/year citation output when the later cluster disambiguates it', async () => {
    const library = parseCslJson(JSON.stringify([
      { id: 'a', type: 'book', title: 'Alpha book', author: [{ family: 'Fixture', given: 'Test' }], issued: { 'date-parts': [[2026]] } },
      { id: 'b', type: 'book', title: 'Zulu book', author: [{ family: 'Fixture', given: 'Test' }], issued: { 'date-parts': [[2026]] } },
    ]));
    const formatted = await formatCitations(library, ['b', 'a'], 'apa');
    expect(formatted.inText.get('a')).toContain('2026a');
    expect(formatted.inText.get('b')).toContain('2026b');
    expect(formatted.bibliographyHtml).toHaveLength(2);
  });
  it('preserves semantic emphasis, decoded text, numeric labels and safe links without raw HTML', () => {
    const prepared = prepareBibliography(['<div class="csl-entry"><div class="csl-left-margin">[1]</div><div class="csl-right-inline">A &amp; B. <i>Book</i>. <a href="https://example.invalid/a(b)">Source</a>. <sup>2</sup></div></div>']);
    const html = renderMarkdown('', prepared.markdown).html;
    expect(html).toContain('<h2');
    expect(html).toContain('References');
    expect(html).toMatch(/\[1\] A (?:&amp;|&#x26;) B\. <em>Book<\/em>\./);
    expect(html).toContain('href="https://example.invalid/a(b)"');
    expect(html).toContain('<sup>2</sup>');
    expect(prepared.markdown).not.toContain('<div');
  });

  it('removes executable markup, unsafe links and inline handlers from both outputs', () => {
    const prepared = prepareBibliography(['<div class="csl-entry" onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">Readable</a> [@literal] <img src=x onerror="alert(1)"></div>']);
    for (const html of [...prepared.html, renderMarkdown('', prepared.markdown).html]) {
      expect(html).not.toMatch(/<script|onclick|onerror|javascript:/);
      expect(html).toContain('Readable');
    }
    expect(extractCitekeys(prepared.markdown)).toEqual([]);
  });

  it('omits an empty References section', () => {
    expect(prepareBibliography([])).toEqual({ html: [], markdown: '' });
    expect(prepareBibliography(['<script>inert</script>']).markdown).toBe('');
    expect(appendReferencesMarkdown('Unchanged', '')).toBe('Unchanged');
  });

  it('gives generated nodes no source positions or synchronization anchors', () => {
    const references = prepareBibliography(['<div>Fixture <i>Book</i></div>']).markdown;
    const source = '# References\n\nAuthored source.';
    const tree = parseMarkdownTree(source, references);
    expect(tree.children.slice(-2).map(node => node.type)).toEqual(['heading', 'paragraph']);
    const generated = JSON.stringify(tree.children.slice(-2));
    expect(generated).not.toContain('position');
    const rendered = renderMarkdown(source, references);
    expect(rendered.html).toContain('id="user-content-references-1"');
    expect(rendered.anchors).toEqual(renderMarkdown(source).anchors);
    expect(tree.children[0].position?.start.line).toBe(1);
  });

  it.each([
    'See prose.\n\n````md\n```\n[@literal]',
    'See prose.\n\n    [@literal]\n    ```',
    'See prose.\n\n<details>\n<summary>Unclosed</summary>\n\n[@literal]',
    'See prose.\n\n<script>\n[@literal]',
    'See prose.\n\n<!-- [@literal]',
    'See prose.\n\n$$$$\nx + $$',
    'See prose.\n\n> ```\n> [@literal]',
    'See prose.\n\n- Item\n\n  ```\n  [@literal]',
  ])('keeps References outside an unfinished final block: %s', source => {
    const references = prepareBibliography(['<div>Fixture entry</div>']).markdown;
    const rendered = renderMarkdown(source, references).html;
    const exportedSource = appendReferencesMarkdown(source, references);
    const exported = renderMarkdown(exportedSource).html;
    for (const html of [rendered, exported]) {
      expect(html).toContain('>References</h2>');
      expect(html).toMatch(/<p(?: [^>]*)?>Fixture entry<\/p>/);
    }
    const originalCode = parseMarkdownTree(source).children.find(node => node.type === 'code');
    if (originalCode) expect(parseMarkdownTree(exportedSource).children.find(node => node.type === 'code')).toMatchObject({ value: originalCode.value });
    expect(source).not.toContain('Fixture entry');
  });

  it.each(['apa', 'ieee', 'chicago-author-date', 'mla'] as const)('lists resolved keys once in %s, excludes uncited/unresolved items and retains native text', async style => {
    const library = parseCslJson(JSON.stringify([
      { id: 'a', type: 'book', title: 'First [bracket] & title', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
      { id: 'b', type: 'book', title: 'Second title', author: [{ family: 'Beta' }], issued: { 'date-parts': [[2025]] } },
      { id: 'uncited', type: 'book', title: 'Uncited title' },
    ]));
    const formatted = await formatCitations(library, ['b', 'a', 'b', 'missing'], style);
    const html = renderMarkdown('', formatted.bibliographyMarkdown).html.toLowerCase();
    expect(html.match(/first \[bracket\]/g)).toHaveLength(1);
    expect(html.match(/second title/g)).toHaveLength(1);
    expect(html).not.toContain('uncited title');
    expect(formatted.unresolved).toEqual(['missing']);
    if (style === 'ieee') expect(html.indexOf('second title')).toBeLessThan(html.indexOf('first [bracket]'));
    else expect(html.indexOf('first [bracket]')).toBeLessThan(html.indexOf('second title'));
  });
});
