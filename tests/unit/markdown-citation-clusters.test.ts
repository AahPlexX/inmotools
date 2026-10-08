import { describe, expect, it } from 'vitest';
import { extractCitekeys, formatCitations, parseCslJson, substituteInTextCitations } from '../../src/tools/markdown/citation-engine';
import { extractCitationMarkers } from '../../src/tools/markdown/citation-marker';
import { prepareDocument } from '../../src/tools/markdown/document-pipeline';
import type { CitationStyleId } from '../../src/tools/markdown/markdown-types';

const library = parseCslJson(JSON.stringify([
  { id: 'alpha', type: 'book', title: 'Alpha specimen', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
  { id: 'beta', type: 'book', title: 'Beta specimen', author: [{ family: 'Beta' }], issued: { 'date-parts': [[2025]] } },
  { id: 'alpha2', type: 'book', title: 'Another Alpha', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
  { id: 'Foo_bar.baz.', type: 'book', title: 'Punctuation key', author: [{ family: 'Braced' }], issued: { 'date-parts': [[2024]] } },
]));
const format = async (source: string, style: CitationStyleId = 'apa') => {
  const result = await formatCitations(library, extractCitekeys(source), style, source);
  return { result, text: substituteInTextCitations(source, result.inText, result.markerText) };
};

describe('MDW-R93 lossless citation clusters', () => {
  for (const style of ['apa', 'ieee', 'chicago-author-date', 'mla'] as const) {
    it(`${style} retains both prefixes, locators and suffixes in a compound cluster`, async () => {
      const { text } = await format('See [see @alpha, p. 14 discussion; compare @beta, chap. 2 concluding].', style);
      for (const token of ['see', '14', 'discussion', 'compare', '2', 'concluding']) expect(text).toContain(token);
      expect(text).not.toContain('@');
    });
    it(`${style} retains repeated-key locators independently`, async () => {
      const { text } = await format('First [@alpha, p. 14]. Second [@alpha, p. 27]. Again [@alpha, p. 14].', style);
      expect(text.match(/14/g)).toHaveLength(2);
      expect(text.match(/27/g)).toHaveLength(1);
    });
  }
  it('keeps distinct locators for the same key within one compound marker', async () => {
    const { text } = await format('[@alpha, p. 14; @alpha, p. 27]');
    expect(text).toContain('14'); expect(text).toContain('27');
  });
  it('uses one APA cluster and applies style sorting and same-author disambiguation', async () => {
    const { text } = await format('[@beta; @alpha; @alpha2]');
    expect(text).toBe('(Alpha, 2026a, 2026b; Beta, 2025)');
  });
  it('formats the confirmed annotation-loss reproduction as one APA cluster', async () => {
    const { text } = await format('See [see @alpha, p. 14; compare @beta, chap. 2].');
    expect(text).toBe('See (see Alpha, 2026, p. 14; compare Beta, 2025, Chapter 2).');
  });
  it('uses the bundled IEEE cluster delimiter instead of a key-only semicolon join', async () => {
    expect((await format('[@beta; @alpha]', 'ieee')).text).toBe('\\[1\\], \\[2\\]');
  });
  it('suppresses the author when requested while keeping its year and locator', async () => {
    const { text } = await format('Alpha says [-@alpha, p. 14].');
    expect(text).toBe('Alpha says (2026, p. 14).');
  });
  it('handles braced trailing punctuation keys without changing ordinary key boundaries', async () => {
    expect(extractCitekeys('[@Foo_bar.baz.; @{Foo_bar.baz.}; @Foo_bar--baz]')).toEqual(['Foo_bar.baz', 'Foo_bar.baz.', 'Foo_bar']);
    const { text } = await format('See [@{Foo_bar.baz.}, p. 14].');
    expect(text).toBe('See (Braced, 2024, p. 14).');
  });
  for (const [label, value] of [['pp.', '14-16'], ['chapter', '2'], ['§', '3'], ['paras.', '4'], ['', 'iv-vii'], ['p.', '14, 27']]) {
    it(`parses the common locator ${label} ${value} without consuming its suffix`, async () => {
      const source = `[@alpha, ${label} ${value} and discussion]`;
      const marker = extractCitationMarkers(source)[0];
      expect(marker.items?.[0].locator).toBe(value);
      expect(marker.items?.[0].suffix).toBe(' and discussion');
      expect((await format(source)).text.replaceAll('–', '-')).toContain(value);
    });
  }
  for (const source of ['[see @alpha, {pp. iv, vi-xi} with suffix]', '[see @alpha, p. 14 and *passim*]', '[@alpha{}, 99 years later]', '[see \\@beta and @alpha]']) {
    it(`preserves unsupported annotations and returns a visible-notice input: ${source}`, async () => {
      const { result, text } = await format(source);
      expect(text).toBe(source);
      expect(result.unsupported).toEqual([source]);
    });
  }
  it('uses the locale and CSL canonical sub-verbo locator label', async () => {
    expect(extractCitationMarkers('[@alpha, s.v. 14]')[0].items?.[0].label).toBe('sub-verbo');
    expect((await format('[@alpha, s.v. 14]')).text).toContain('14');
  });
  it('keeps ordinary suffix words out of the Roman-numeral locator', async () => {
    const marker = extractCitationMarkers('[@alpha, civil rights]')[0];
    expect(marker.items?.[0].locator).toBeUndefined();
    expect((await format('[@alpha, civil rights]')).text).toBe('(Alpha, 2026, civil rights)');
  });
  it('does not interpret escaped markers or escape-masked keys', () => {
    expect(extractCitekeys('\\[@alpha] [\\@alpha] [@beta]')).toEqual(['beta']);
  });
  it('keeps mixed unresolved clusters intact and never sends missing items to citeproc', async () => {
    const source = '[see @alpha, p. 14; @missing, chap. 2] and [@beta]';
    const { result, text } = await format(source);
    expect(text).toContain('[see @alpha, p. 14; @missing, chap. 2]');
    expect(text).toContain('(Beta, 2025)');
    expect(result.unresolved).toEqual(['missing']);
  });
  it('preserves metadata, code, math, link destinations and authored Windows line endings', async () => {
    const literal = '\r\n\r\n    [@beta, p. 3]\r\n\r\n``[@beta] ` inner``\r\n\r\n~~~~md\r\n[@beta]\r\n~~~~\r\n\r\n$[@beta]$\r\n\r\n[Link](https://example.invalid/[@beta])';
    const header = '---\r\ntitle: "[@beta]"\r\n---\r\n\r\n';
    const { text } = await format(header + 'See [@alpha, p. 14].' + literal);
    expect(text).toBe(header + 'See (Alpha, 2026, p. 14).' + literal);
  });
  it('prepares the same annotated cluster for formula, preview and export consumers', async () => {
    const source = '| A | B |\n| - | - |\n| 2 | =A2*3 |\n\n[see @alpha, p. 14; compare @beta, chap. 2]';
    const { result } = await format(source);
    const prepared = prepareDocument(source, result.inText, result.markerText);
    expect(prepared).toContain('| 2 | 6 |');
    expect(prepared).toContain('(see Alpha, 2026, p. 14; compare Beta, 2025, Chapter 2)');
  });
  it('preserves unsafe inline markup rather than interpreting it in citeproc', async () => {
    const source = '[@alpha, <script>alert(1)</script>]';
    expect((await format(source)).text).toBe(source);
  });
});
