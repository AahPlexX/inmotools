import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { extractCitekeys, formatCitations, parseCslJson, substituteInTextCitations } from '../../src/tools/markdown/citation-engine';
import { extractCitationMarkers } from '../../src/tools/markdown/citation-marker';
import { prepareDocument } from '../../src/tools/markdown/document-pipeline';

const library = parseCslJson(JSON.stringify([
  { id: 'alpha', type: 'book', title: 'Alpha specimen', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
  { id: 'beta', type: 'book', title: 'Beta specimen', author: [{ family: 'Beta' }], issued: { 'date-parts': [[2025]] } },
]));
const literal = ['[name@alpha]', '[42@alpha]', '[𝒜@alpha]', '[word.@alpha]', '[*word*@alpha]', '[**word**@alpha]', '[name@alpha; @beta]', '[@alpha; name@beta]', '[see; @alpha]', '[\\@alpha; @beta]', '[name@alpha; compare @beta]'];
const format = async (source: string) => {
  const result = await formatCitations(library, extractCitekeys(source), 'apa', source);
  return { result, text: substituteInTextCitations(source, result.inText, result.markerText) };
};

describe('MDW-R95 native preview citation boundaries', () => {
  for (const source of literal) {
    it(`MDW-R95 preserves the literal or failed bracket cluster ${source} without references`, async () => {
      expect(extractCitekeys(source)).toEqual([]);
      const { result, text } = await format(source);
      expect(text).toBe(source);
      expect(result.bibliographyHtml).toEqual([]);
      expect(result.unresolved).toEqual([]);
      expect(result.unsupported).toEqual([]);
      expect(prepareDocument(source, result.inText, result.markerText)).toBe(source);
    });
  }
  for (const [source, prefix, suppressed] of [
    ['[name-@alpha]', 'name- ', false],
    ['[word.-@alpha]', 'word.- ', false],
    ['[name -@alpha]', 'name ', true],
    ['[-@alpha]', undefined, true],
    ['[see,@alpha]', 'see, ', false],
  ] as const) {
    it(`MDW-R95 distinguishes authored prefixes from suppression in ${source}`, async () => {
      const item = extractCitationMarkers(source)[0].items?.[0];
      expect(item?.id).toBe('alpha'); expect(item?.prefix).toBe(prefix);
      expect(Boolean(item?.['suppress-author'])).toBe(suppressed);
      const { text } = await format(source);
      expect(text.includes('Alpha')).toBe(!suppressed);
      expect(text).toContain('2026');
      if (prefix) expect(text).toContain(prefix.trim());
    });
  }
  for (const source of ['[word\\.@alpha]', '[\\-@alpha]', '[name\\-@alpha]', '[*word*-@alpha]', '[*word* -@alpha]']) {
    it(`MDW-R95 keeps the complex native boundary authored in ${source}`, async () => {
      expect(extractCitekeys(source)).toEqual(['alpha']);
      const { result, text } = await format(source);
      expect(text).toBe(source); expect(result.unsupported).toEqual([source]);
    });
  }
  it('MDW-R95 excludes a blocked email key from a genuine complex prefix', async () => {
    expect(extractCitekeys('[name@alpha @beta]')).toEqual(['beta']);
    expect((await format('[name@alpha @beta]')).text).toBe('[name@alpha @beta]');
  });
  it('MDW-R95 replaces only eligible markers in source order after literal and failed markers', async () => {
    const source = '[name@alpha] [@beta] [name@alpha; @beta] [@alpha, p. 14] [42@beta] [name -@alpha]';
    const { text } = await format(source);
    expect(text).toBe('[name@alpha] (Beta, 2025) [name@alpha; @beta] (Alpha, 2026, p. 14) [42@beta] (name 2026)');
  });
  it('MDW-R95 honors actual emphasis endpoints and disclosure caption offsets', () => {
    expect(extractCitekeys('[*word*@alpha] [*word*-@alpha] [**word**@beta] [@beta]')).toEqual(['alpha', 'beta']);
    expect(extractCitekeys('<details>\n<summary>[*word*@alpha] [@beta]</summary>\n\n[name@alpha]\n</details>')).toEqual(['beta']);
  });
  it('MDW-R95 preserves authored line endings and native literal exclusions', async () => {
    const source = '---\r\ntitle: "[@beta]"\r\n---\r\n\r\n[name@alpha] [@alpha, p. 14]\r\n\r\n`[@beta]` $[@beta]$ [@beta](https://example.org)\r\n';
    expect(extractCitekeys(source)).toEqual(['alpha']);
    expect((await format(source)).text).toBe(source.replace('[@alpha, p. 14]', '(Alpha, 2026, p. 14)'));
  });
  const pandoc = process.env.PANDOC;
  it.skipIf(!pandoc)('MDW-R95 corroborates native boundary and suppression modes with the official reader', () => {
    const read = (source: string) => {
      const document = JSON.parse(execFileSync(pandoc!, ['-f', 'markdown', '-t', 'json'], { input: source, encoding: 'utf8' }));
      const citations: { citationId: string; citationMode: { t: string } }[] = [];
      const visit = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(visit);
        else if (node && typeof node === 'object') {
          const record = node as { t?: string; c?: unknown[] };
          if (record.t === 'Cite') citations.push(...record.c![0] as typeof citations);
          Object.values(node).forEach(visit);
        }
      };
      visit(document); return citations;
    };
    for (const source of literal.slice(0, 6)) expect(read(source)).toEqual([]);
    for (const source of ['[name@alpha; @beta]', '[@alpha; name@beta]']) expect(read(source).every(cite => cite.citationMode.t === 'AuthorInText')).toBe(true);
    expect(read('[name-@alpha]')[0].citationMode.t).toBe('NormalCitation');
    expect(read('[name -@alpha]')[0].citationMode.t).toBe('SuppressAuthor');
  });
});
