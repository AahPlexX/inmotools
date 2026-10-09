import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { extractCitekeys, formatCitations, parseCslJson, substituteInTextCitations } from '../../src/tools/markdown/citation-engine';
import { extractCitationMarkers } from '../../src/tools/markdown/citation-marker';
import { prepareDocument } from '../../src/tools/markdown/document-pipeline';
import { parseFrontmatter } from '../../src/tools/markdown/frontmatter-engine';
import { buildPandocMarkdown } from '../../src/tools/markdown/pandoc-export-engine';
import { extractPandocCitationKeys } from '../../src/tools/markdown/pandoc-citation-source';

// Released-reader corpus; CR input normalization is outside the source-preserving contract.
const spaces = [0x9, 0xa, 0xb, 0xc, 0xd, 0x20, 0xa0, 0x1680, ...Array.from({ length: 11 }, (_, i) => 0x2000 + i), 0x202f, 0x205f, 0x3000];
const nonSpaces = [0x85, 0x2028, 0x2029, 0xfeff];
const entry = (id: string) => ({ id, type: 'book', title: 'Key specimen', author: [{ family: 'KeyAuthor' }], issued: { 'date-parts': [[2026]] } });
const code = (point: number) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
const references = (text: string) => (parseFrontmatter(text).data.references as { id: string }[]).map(reference => reference.id);

describe('MDW-R96 native braced citation key spaces', () => {
  for (const point of spaces) {
    it(`MDW-R96 keeps a braced ${code(point)} key literal without false preview references`, async () => {
      const id = `alpha${String.fromCodePoint(point)}beta`;
      const source = `Claim [@{${id}}].`;
      const library = parseCslJson(JSON.stringify([entry(id)]));
      expect(extractCitekeys(source)).toEqual([]);
      expect(extractCitationMarkers(source)).toEqual([]);
      const result = await formatCitations(library, extractCitekeys(source), 'apa', source);
      expect(result.bibliographyHtml).toEqual([]);
      expect(result.unresolved).toEqual([]); expect(result.unsupported).toEqual([]);
      expect(substituteInTextCitations(source, result.inText, result.markerText)).toBe(source);
      expect(prepareDocument(source, result.inText, result.markerText)).toBe(source);
      const download = buildPandocMarkdown(source, library);
      expect(download.text).toBe(source);
      expect(download.embeddedKeys).toEqual([]); expect(download.unresolvedKeys).toEqual([]);
    });
  }
  for (const point of nonSpaces) {
    it(`MDW-R96 resolves a valid ${code(point)} key in preview and embeds the exact Pandoc reference`, async () => {
      const id = `alpha${String.fromCodePoint(point)}beta`;
      const source = `Claim [@{${id}}, p. 14].\r\n`;
      const library = parseCslJson(JSON.stringify([entry(id)]));
      expect(extractCitekeys(source)).toEqual([id]);
      const result = await formatCitations(library, extractCitekeys(source), 'apa', source);
      expect(substituteInTextCitations(source, result.inText, result.markerText)).toBe('Claim (KeyAuthor, 2026, p. 14).\r\n');
      expect(result.bibliographyHtml.join('')).toContain('Key specimen');
      const download = buildPandocMarkdown(source, library);
      expect(download.embeddedKeys).toEqual([id]); expect(download.unresolvedKeys).toEqual([]);
      expect(references(download.text)).toEqual([id]);
      expect(download.text.endsWith(source)).toBe(true);
    });
  }
  it('MDW-R96 keeps invalid braced clusters authored without promoting inner or later author keys', () => {
    for (const source of ['[@{alpha beta @gamma}]', '[@{alpha beta}; @gamma]', '[@{alpha beta; @gamma}]']) {
      expect(extractCitekeys(source)).toEqual([]);
    }
    expect(extractCitekeys('[@{alpha beta}] [@gamma]')).toEqual(['gamma']);
    // Native Pandoc can interpret gamma in these complex failed-brace sources;
    // preview retains them under its established bounded marker contract.
    expect(extractPandocCitationKeys('[@{alpha beta @gamma}]')).toEqual({ keys: ['gamma'], unsupported: false });
  });
  it('MDW-R96 retains source order suppression and native literal exclusions for valid Unicode keys', async () => {
    const first = 'alpha\uFEFFbeta'; const second = 'alpha\u2028beta';
    const source = `---\r\ntitle: "[@{alpha\u2029beta}]"\r\n---\r\n\r\n[-@{${first}}, p. 14; see @{${second}}] [@{${first}}]\r\n\r\n\`[@{alpha\u0085beta}]\` $[@{alpha\u0085beta}]$ [@{alpha\u0085beta}](https://example.org)\r\n`;
    const library = parseCslJson(JSON.stringify([entry(second), entry(first), entry('alpha\u0085beta')]));
    expect(extractCitekeys(source)).toEqual([first, second]);
    const markers = extractCitationMarkers(source);
    expect(markers[0].items?.[0]['suppress-author']).toBe(true);
    expect(markers[0].items?.[0].locator).toBe('14');
    const download = buildPandocMarkdown(source, library);
    expect(download.embeddedKeys).toEqual([first, second]);
    expect(references(download.text)).toEqual([first, second]);
    expect(download.text.endsWith(source.slice(source.indexOf('\r\n\r\n') + 4))).toBe(true);
    const own = '---\nreferences: []\n---\n\n[@{alpha\uFEFFbeta}]';
    expect(buildPandocMarkdown(own, library).text).toBe(own);
  });
  it('MDW-R96 preserves ordinary and punctuation braced keys after rejecting native spaces', async () => {
    const source = '[@{alpha.beta.}; see @gamma]';
    const library = parseCslJson(JSON.stringify([entry('alpha.beta.'), { ...entry('gamma'), author: [{ family: 'Gamma' }] }]));
    const result = await formatCitations(library, extractCitekeys(source), 'apa', source);
    expect(substituteInTextCitations(source, result.inText, result.markerText)).toBe('(see Gamma, 2026; KeyAuthor, 2026)');
    expect(buildPandocMarkdown(source, library).embeddedKeys).toEqual(['alpha.beta.', 'gamma']);
  });
  it('MDW-R96 serializes special IDs without changing imported records or unrelated reference fields', () => {
    const id = 'alpha\u0085beta';
    const record = { ...entry(id), title: 'A "quoted" title: # and \\ slash', note: 'First\nsecond line' };
    const library = parseCslJson(JSON.stringify([record, entry('ordinary')]));
    const before = JSON.stringify([...library.entries]);
    const download = buildPandocMarkdown(`[@{${id}}] [@ordinary]`, library);
    const parsed = parseFrontmatter(download.text).data.references as typeof record[];
    expect(parsed[0].id).toBe(id); expect(parsed[0].title).toBe(record.title); expect(parsed[0].note).toBe(record.note);
    expect(parsed[1].id).toBe('ordinary');
    expect(JSON.stringify([...library.entries])).toBe(before);
  });
  const pandoc = process.env.PANDOC;
  it.skipIf(!pandoc)('MDW-R96 corroborates spaces and exact non-space IDs with the official reader and actual citeproc conversion', () => {
    for (const point of [...spaces.filter(point => point !== 0xd), ...nonSpaces]) {
      const id = `alpha${String.fromCodePoint(point)}beta`; const source = `[@{${id}}]`;
      const output = execFileSync(pandoc!, ['-f', 'markdown', '-t', 'json'], { input: source, encoding: 'utf8' });
      const found: string[] = [];
      const visit = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(visit);
        else if (node && typeof node === 'object') {
          const record = node as { t?: string; c?: unknown[] };
          if (record.t === 'Cite') found.push(...(record.c![0] as { citationId: string }[]).map(cite => cite.citationId));
          Object.values(node).forEach(visit);
        }
      };
      visit(JSON.parse(output)); expect(found, code(point)).toEqual(nonSpaces.includes(point) ? [id] : []);
    }
    for (const point of nonSpaces) {
      const id = `alpha${String.fromCodePoint(point)}beta`; const source = `[@{${id}}, p. 14]`;
      const library = parseCslJson(JSON.stringify([entry(id)]));
      const exported = buildPandocMarkdown(source, library).text;
      const html = execFileSync(pandoc!, ['-f', 'markdown', '-t', 'html', '--citeproc'], { input: exported, encoding: 'utf8' });
      expect(html, code(point)).toContain('Key Specimen');
      expect(html, code(point)).toContain('class="csl-entry"');
      expect(html, code(point)).not.toContain('citeproc-not-found');
    }
  });
});
