import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseCslJson } from '../../src/tools/markdown/citation-engine';
import { buildPandocMarkdown } from '../../src/tools/markdown/pandoc-export-engine';

const ids = ['alpha', 'beta', 'gamma', 'alpha.', 'alpha{beta}', 'alpha_', '_alpha', '-alpha', '漢字2026'];
const library = parseCslJson(JSON.stringify(ids.map(id => ({ id, type: 'book', title: `Source ${id}`, author: [{ family: id }], issued: { 'date-parts': [[2026]] } }))));
const keys = (source: string) => buildPandocMarkdown(source, library).embeddedKeys;

describe('MDW-R94 Pandoc author-in-text source embedding', () => {
  it('MDW-R94 embeds an author-only source and retains its exact annotated body', () => {
    const source = '@alpha [p. 14] discusses the claim.\r\n';
    const result = buildPandocMarkdown(source, library);
    expect(result.embeddedKeys).toEqual(['alpha']);
    expect(result.text.endsWith(`---\n\n${source}`)).toBe(true);
  });
  it('MDW-R94 deduplicates mixed author and bracketed sources in document order', () => {
    expect(keys('See @beta, [@alpha; @beta] and -@gamma.')).toEqual(['beta', 'alpha', 'gamma']);
  });
  it('MDW-R94 reports missing author keys without fabricating bibliography entries', () => {
    const result = buildPandocMarkdown('See @ghost and @alpha.', library);
    expect(result.embeddedKeys).toEqual(['alpha']);
    expect(result.unresolvedKeys).toEqual(['ghost']);
    expect(result.text).not.toContain('id: ghost');
  });
  it('MDW-R94 supports balanced non-whitespace braced and Unicode keys', () => {
    expect(keys('See @{alpha.}, @{alpha{beta}} and @漢字2026.')).toEqual(['alpha.', 'alpha{beta}', '漢字2026']);
  });
  it('MDW-R94 keeps literal words and email-looking brackets out of references', () => {
    expect(keys('Contact [name@alpha] and [name@alpha.org]. See word.@alpha and word..@beta.')).toEqual([]);
  });
  it('MDW-R94 respects native code, math, links, metadata and source escapes', () => {
    const source = '---\ntitle: "@beta"\n---\n\nSee @alpha. `@beta` $@gamma$ [@beta](https://example.org) <https://example.org/@gamma> \\@beta &#64;gamma.';
    expect(keys(source)).toEqual(['alpha']);
  });
  it('MDW-R94 honors closing emphasis boundaries while permitting a citation after native code', () => {
    expect(keys('See *word*@beta and **word**@gamma. Then `word`@alpha.')).toEqual(['alpha']);
  });
  it('MDW-R94 preserves key underscores and even-backslash author markers', () => {
    expect(keys('See _@alpha_ and \\\\@beta.')).toEqual(['alpha_', 'beta']);
  });
  it('MDW-R94 does not embed author references to example labels but keeps explicit bracket citations', () => {
    expect(keys('@alpha. Label\n\nSee @alpha and @beta and [@alpha].')).toEqual(['beta', 'alpha']);
    expect(keys('(@alpha) Label\n\nSee @alpha and @beta.')).toEqual(['beta']);
    expect(keys('# @alpha. Heading\n\nSee @beta.')).toEqual(['alpha', 'beta']);
  });
  it('MDW-R94 preserves authored bytes when there are only literal or excluded markers', () => {
    const source = 'Contact [name@alpha].\r\n\r\n`@beta`\r\n';
    expect(buildPandocMarkdown(source, library).text).toBe(source);
  });
  it('MDW-R94 keeps native disclosure caption boundaries consistent with ordinary prose', () => {
    expect(keys('<details>\n<summary>*word*@alpha and @beta</summary>\n\n@beta body.\n</details>')).toEqual(['beta']);
  });
  it('MDW-R94 recognizes authored references even when no imported source matches', () => {
    const source = '---\nreferences:\n- {id: own, type: book, title: Mine}\n---\n\n@own explains.\n';
    for (const newline of ['\n', '\r\n', '\r']) {
      const authored = source.replaceAll('\n', newline);
      for (const imported of [null, library]) {
        const result = buildPandocMarkdown(authored, imported);
        expect(result.keptExistingReferences).toBe(true);
        expect(result.embeddedKeys).toEqual([]);
        expect(result.text).toBe(authored);
      }
    }
  });
  it('MDW-R94 permits an author marker after an escaped period while rejecting a Unicode word boundary', () => {
    expect(keys('See word\\.@alpha and 𝒜@beta.')).toEqual(['alpha']);
  });
  it('MDW-R94 recognizes leading underscore and hyphen example labels without hiding explicit citations', () => {
    expect(keys('@_alpha. Label\n\nSee @_alpha.')).toEqual([]);
    expect(keys('@_alpha. Label\n\nSee @_alpha and [@{_alpha}].')).toEqual(['_alpha']);
    expect(keys('(@-alpha) Label\n\nSee @{-alpha}.')).toEqual([]);
  });
  it('MDW-R94 honors example numbering before deciding whether a list-item marker is a label', () => {
    expect(keys('(@alpha) First\n\n- @beta. Second\n\nSee @beta.')).toEqual(['beta']);
    expect(keys('(@) First\n\n- @beta. Second\n\nSee @beta.')).toEqual(['beta']);
    expect(keys('- 18446744073709551617@alpha. Label\n\nSee @alpha.')).toEqual([]);
  });
  it('MDW-R94 never embeds a partial key split by native literal syntax and identifies the limitation', () => {
    const source = 'See @alpha$beta$, @alpha<tag>word, @alpha~beta~ and @{alpha`code`}.';
    const result = buildPandocMarkdown(source, library);
    expect(result.embeddedKeys).toEqual([]);
    expect(result.text).toBe(source);
    expect(result.unsupportedCitationSyntax).toBe(true);
    expect(keys('See @alpha`word` and @alpha<!--comment-->.')).toEqual(['alpha']);
  });
  const pandoc = process.env.PANDOC;
  it.skipIf(!pandoc)('MDW-R94 real Pandoc resolves the author-only exported bibliography', () => {
    const source = '@alpha [p. 14] discusses the claim.\n';
    const { text } = buildPandocMarkdown(source, library);
    const result = execFileSync(pandoc!, ['-f', 'markdown', '-t', 'plain', '--citeproc'], { input: text, encoding: 'utf8' });
    expect(result).toContain('alpha (2026, 14)');
    expect(result).toContain('Source Alpha');
    expect(result).not.toContain('Source Beta');
  });
});
