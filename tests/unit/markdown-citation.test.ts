import { describe, expect, it } from 'vitest';
import {
  extractCitekeys,
  formatCitations,
  parseBibtex,
  parseCslJson,
  resolveCitekeys,
  substituteInTextCitations,
} from '../../src/tools/markdown/citation-engine';

const SAMPLE_BIB = `
@article{smith2024,
  author = {Smith, Jane},
  title = {A study of things},
  journal = {Journal of Things},
  year = {2024}
}

@book{doe2023,
  author = {Doe, John},
  title = {A book about stuff},
  year = {2023}
}
`;

describe('.bib parsing', () => {
  it('parses an @article entry into a CSL-shaped citation entry', () => {
    const library = parseBibtex(SAMPLE_BIB);
    const entry = library.entries.get('smith2024');
    expect(entry).toBeDefined();
    expect(entry?.type).toBe('article-journal');
    expect(entry?.title).toBe('A study of things');
    expect(entry?.author).toEqual([{ family: 'Smith', given: 'Jane' }]);
    expect(entry?.issued).toEqual({ 'date-parts': [[2024]] });
  });

  it('parses multiple entries from the same .bib source', () => {
    const library = parseBibtex(SAMPLE_BIB);
    expect(library.entries.size).toBe(2);
    expect(library.entries.has('doe2023')).toBe(true);
  });

  it('parses a "Family, Given" author name into family/given fields', () => {
    const library = parseBibtex(SAMPLE_BIB);
    expect(library.entries.get('doe2023')?.author).toEqual([{ family: 'Doe', given: 'John' }]);
  });

  it('does not split fields on a comma nested inside braces', () => {
    const library = parseBibtex('@article{key1,\n  title = {A, Title, With Commas},\n  year = {2020}\n}');
    expect(library.entries.get('key1')?.title).toBe('A, Title, With Commas');
  });

  it('returns an empty library for a source with no recognizable entries', () => {
    const library = parseBibtex('not a bib file at all');
    expect(library.entries.size).toBe(0);
  });
});

describe('CSL-JSON parsing', () => {
  it('parses a single CSL-JSON object', () => {
    const library = parseCslJson(JSON.stringify({ id: 'smith2024', type: 'article-journal', title: 'A study of things' }));
    expect(library.entries.get('smith2024')?.title).toBe('A study of things');
  });

  it('parses an array of CSL-JSON objects', () => {
    const library = parseCslJson(JSON.stringify([
      { id: 'a', type: 'book', title: 'First' },
      { id: 'b', type: 'book', title: 'Second' },
    ]));
    expect(library.entries.size).toBe(2);
  });
});

describe('citekey resolution', () => {
  it('marks a citekey present in the library as resolved', () => {
    const library = parseBibtex(SAMPLE_BIB);
    const resolutions = resolveCitekeys(library, ['smith2024']);
    expect(resolutions).toEqual([{ citekey: 'smith2024', resolved: true }]);
  });

  it('marks a citekey absent from the library as unresolved, without throwing', () => {
    const library = parseBibtex(SAMPLE_BIB);
    expect(() => resolveCitekeys(library, ['invalidkey'])).not.toThrow();
    const resolutions = resolveCitekeys(library, ['invalidkey']);
    expect(resolutions).toEqual([{ citekey: 'invalidkey', resolved: false }]);
  });
});

describe('citation formatting against the bundled CSL styles', () => {
  it('formats an APA in-text citation and bibliography entry for a resolved citekey', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    const result = await formatCitations(library, ['smith2024'], 'apa');
    expect(result.inText.get('smith2024')).toContain('Smith');
    expect(result.inText.get('smith2024')).toContain('2024');
    expect(result.bibliographyHtml.join('')).toContain('Journal of Things');
    expect(result.unresolved).toEqual([]);
  });

  it('formats an IEEE numeric in-text citation', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    const result = await formatCitations(library, ['smith2024'], 'ieee');
    expect(result.inText.get('smith2024')).toMatch(/\[\d+\]/);
  });

  it('formats a Chicago author-date in-text citation', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    const result = await formatCitations(library, ['doe2023'], 'chicago-author-date');
    expect(result.inText.get('doe2023')).toContain('Doe');
  });

  it('formats an MLA in-text citation', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    const result = await formatCitations(library, ['smith2024'], 'mla');
    expect(result.inText.get('smith2024')).toContain('Smith');
  });

  it('reports an unresolved citekey as a non-blocking, separate result without calling into citeproc for it', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    const result = await formatCitations(library, ['smith2024', 'invalidkey'], 'apa');
    expect(result.inText.has('smith2024')).toBe(true);
    expect(result.inText.has('invalidkey')).toBe(false);
    expect(result.unresolved).toEqual(['invalidkey']);
  });

  it('does not throw, and returns no formatted citations, when every requested citekey is unresolved', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    await expect(formatCitations(library, ['invalidkey'], 'apa')).resolves.toEqual({
      inText: new Map(),
      bibliographyHtml: [],
      unresolved: ['invalidkey'],
    });
  });

  it('rejects with an explanatory error for the not-yet-bundled Vancouver style', async () => {
    const library = parseBibtex(SAMPLE_BIB);
    await expect(formatCitations(library, ['smith2024'], 'vancouver')).rejects.toThrow(/not yet bundled/);
  });
});


describe('citekey extraction', () => {
  it('finds a single citekey', () => {
    expect(extractCitekeys('See [@smith2024] for details.')).toEqual(['smith2024']);
  });

  it('finds multiple keys inside one bracket', () => {
    expect(extractCitekeys('Compare [@smith2024; @doe2023].')).toEqual(['smith2024', 'doe2023']);
  });

  it('finds a key alongside a locator', () => {
    expect(extractCitekeys('See [@smith2024, p. 14].')).toEqual(['smith2024']);
  });

  it('deduplicates repeated keys but keeps first-appearance order', () => {
    expect(extractCitekeys('[@b] then [@a] then [@b]')).toEqual(['b', 'a']);
  });

  it('ignores markers inside a fenced code block', () => {
    expect(extractCitekeys('```\n[@notacitation]\n```\n')).toEqual([]);
  });

  it('ignores markers inside an inline code span', () => {
    expect(extractCitekeys('Write `[@example]` to cite.')).toEqual([]);
  });

  it('returns an empty list for a document with no citations', () => {
    expect(extractCitekeys('# Heading\n\nPlain prose.')).toEqual([]);
  });
});

describe('in-text citation substitution', () => {
  const inText = new Map([
    ['smith2024', '(Smith, 2024)'],
    ['doe2023', '(Doe, 2023)'],
  ]);

  it('replaces a resolved marker with its formatted citation', () => {
    expect(substituteInTextCitations('See [@smith2024].', inText)).toBe('See (Smith, 2024).');
  });

  it('replaces a marker carrying a locator, including the locator text', () => {
    expect(substituteInTextCitations('See [@smith2024, p. 14].', inText)).toBe('See (Smith, 2024).');
  });

  it('joins multiple keys from one bracket', () => {
    expect(substituteInTextCitations('[@smith2024; @doe2023]', inText)).toBe('(Smith, 2024); (Doe, 2023)');
  });

  it('leaves an unresolved marker exactly as written so it stays visible', () => {
    expect(substituteInTextCitations('See [@missing].', inText)).toBe('See [@missing].');
  });

  it('leaves a bracket alone when only some of its keys resolve', () => {
    expect(substituteInTextCitations('[@smith2024; @missing]', inText)).toBe('[@smith2024; @missing]');
  });

  it('never rewrites a marker inside a fenced code block', () => {
    const source = 'Real [@smith2024].\n\n```md\nExample: [@smith2024]\n```\n';
    const result = substituteInTextCitations(source, inText);
    expect(result).toContain('Real (Smith, 2024).');
    expect(result).toContain('Example: [@smith2024]');
  });

  it('never rewrites a marker inside an inline code span', () => {
    expect(substituteInTextCitations('Use `[@smith2024]` verbatim.', inText)).toBe('Use `[@smith2024]` verbatim.');
  });

  it('reduces an HTML citation fragment to plain text so no markup leaks into the document', () => {
    const html = new Map([['x', '(<i>Smith</i> &amp; Doe, 2024)']]);
    expect(substituteInTextCitations('[@x]', html)).toBe('(Smith & Doe, 2024)');
  });

  it('is a no-op when no citations were formatted', () => {
    expect(substituteInTextCitations('See [@smith2024].', new Map())).toBe('See [@smith2024].');
  });
});
