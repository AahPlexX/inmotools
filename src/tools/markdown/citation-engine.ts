import { Engine } from 'citeproc';
import type { CitationEntry, CitationLibrary, CitationResolution, CitationStyleId } from './markdown-types';

// Citation formatting via citeproc-js, driven by a defined set of bundled
// CSL style and locale XML files shipped as local static assets - never
// fetched at runtime, per this project's zero-network-fetch rule for tool
// engines. Adding a style later means bundling one more file at build time,
// not adding a network dependency.
//
// citeproc-js's own updateItems() throws internally when asked to resolve a
// citekey its retrieveItem callback cannot find (confirmed directly: an
// unresolved id makes the engine's internal JSON serialization throw
// "\"undefined\" is not valid JSON" rather than returning a clean error).
// This engine therefore always filters requested citekeys against its own
// parsed library map *before* ever calling into citeproc, and represents an
// unresolved citekey as its own inline placeholder rather than letting
// citeproc see it at all.

const STYLE_FILES: Record<CitationStyleId, () => Promise<{ default: string }>> = {
  apa: () => import('./csl-assets/styles/apa.csl?raw'),
  ieee: () => import('./csl-assets/styles/ieee.csl?raw'),
  'chicago-author-date': () => import('./csl-assets/styles/chicago-author-date.csl?raw'),
  mla: () => import('./csl-assets/styles/mla.csl?raw'),
  vancouver: () => Promise.reject(new Error(
    'The Vancouver style is not yet bundled: the CSL styles published for Vancouver are "dependent" '
    + 'styles requiring an additional independent-parent style file and multi-file resolution this tool '
    + 'does not yet implement. Choose APA, IEEE, Chicago (author-date), or MLA instead.',
  )),
};

// Every style currently bundled declares no explicit default-locale, so all
// of them resolve to en-US; this is the only locale file bundled today.
const LOCALE_FILES: Record<string, () => Promise<{ default: string }>> = {
  'en-US': () => import('./csl-assets/locales/locales-en-US.xml?raw'),
};

export const loadCitationStyle = async (style: CitationStyleId): Promise<string> => {
  const loader = STYLE_FILES[style];
  const module = await loader();
  return module.default;
};

const loadLocale = async (lang: string): Promise<string> => {
  const loader = LOCALE_FILES[lang] ?? LOCALE_FILES['en-US'];
  const module = await loader();
  return module.default;
};

// --- .bib (BibTeX) parsing ---
//
// A small, self-contained parser for the subset of BibTeX this tool needs:
// @type{citekey, field = {value}, field = "value", field = value, ...}
// No dependency is introduced for this - BibTeX's entry grammar is small
// and well understood enough to hand-roll, matching this repo's existing
// preference (see table-formula-engine.ts) for a small hand-written parser
// over a new dependency for a narrowly scoped grammar.

const BIBTEX_TYPE_TO_CSL: Record<string, string> = {
  article: 'article-journal',
  book: 'book',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  incollection: 'chapter',
  inbook: 'chapter',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  misc: 'document',
  online: 'webpage',
  unpublished: 'manuscript',
};

const stripOuterDelimiters = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed.slice(1, -1).trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).trim();
  return trimmed;
};

const parseBibtexAuthorField = (value: string): { family?: string; given?: string }[] =>
  value.split(/\s+and\s+/i).map((person) => {
    const trimmed = person.trim();
    if (trimmed.includes(',')) {
      const [family, given] = trimmed.split(',').map((part) => part.trim());
      return { family, given };
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { family: parts[0] };
    return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
  });

// Splits the body of one @type{...} entry into (key, value) field pairs,
// respecting brace nesting so a value like `{Title with {Nested} Braces}`
// is not split on an internal comma or equals sign.
const splitBibtexFields = (body: string): [string, string][] => {
  const fields: [string, string][] = [];
  let depth = 0;
  let current = '';
  const segments: string[] = [];
  for (const char of body) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      segments.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) segments.push(current);

  for (const segment of segments) {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = segment.slice(0, equalsIndex).trim().toLowerCase();
    const value = stripOuterDelimiters(segment.slice(equalsIndex + 1));
    if (key) fields.push([key, value]);
  }
  return fields;
};

export const parseBibtex = (source: string): CitationLibrary => {
  const entries = new Map<string, CitationEntry>();
  const entryPattern = /@(\w+)\s*\{\s*([^,}\s]+)\s*,/g;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(source))) {
    const [, rawType, citekey] = match;
    // Find this entry's matching closing brace by tracking depth from the
    // opening brace already consumed by the match above.
    let depth = 1;
    let index = match.index + match[0].length;
    const bodyStart = index;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    const body = source.slice(bodyStart, index - 1);
    const fields = splitBibtexFields(body);
    const fieldMap = new Map(fields);

    const author = fieldMap.get('author');
    const year = fieldMap.get('year');

    entries.set(citekey, {
      id: citekey,
      type: BIBTEX_TYPE_TO_CSL[rawType.toLowerCase()] ?? 'document',
      title: fieldMap.get('title'),
      author: author ? parseBibtexAuthorField(author) : undefined,
      issued: year && /^\d+$/.test(year) ? { 'date-parts': [[Number(year)]] } : undefined,
      'container-title': fieldMap.get('journal') ?? fieldMap.get('booktitle'),
    });

    entryPattern.lastIndex = index;
  }

  return { entries };
};

// --- CSL-JSON parsing ---

export const parseCslJson = (source: string): CitationLibrary => {
  const parsed = JSON.parse(source);
  const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const entries = new Map<string, CitationEntry>();
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'id' in item) {
      const entry = item as CitationEntry;
      entries.set(String(entry.id), entry);
    }
  }
  return { entries };
};

// --- Citation resolution and formatting ---

export const resolveCitekeys = (library: CitationLibrary, citekeys: string[]): CitationResolution[] =>
  citekeys.map((citekey) => ({
    citekey,
    resolved: library.entries.has(citekey),
  }));

export interface FormattedCitations {
  readonly inText: Map<string, string>;
  readonly bibliographyHtml: string[];
  readonly unresolved: string[];
}

// --- In-text citation extraction and substitution ---
//
// A citation marker is Pandoc-style: [@citekey], optionally carrying a
// locator or prefix/suffix text inside the same brackets (e.g.
// [@smith2024, p. 14]). Multiple keys inside one bracket are separated by
// semicolons ([@a; @b]).

const CITATION_MARKER = /\[[^\]]*@[\w:.#$%&\-+?<>~/]+[^\]]*\]/g;
const CITEKEY_IN_MARKER = /@([\w:.#$%&\-+?<>~/]+)/g;

// Applies `replace` only to the regions of a document that are outside
// fenced code blocks and inline code spans. Without this, a document that
// *documents* citation syntax (showing [@key] inside a code fence) would
// have its own examples silently rewritten - the same class of corruption
// that would affect any source-level substitution pass.
export const mapOutsideCode = (source: string, replace: (segment: string) => string): string => {
  const codeRegion = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = codeRegion.exec(source))) {
    result += replace(source.slice(lastIndex, match.index)) + match[0];
    lastIndex = match.index + match[0].length;
  }
  return result + replace(source.slice(lastIndex));
};

// Every distinct citekey referenced by the document, in first-appearance
// order, ignoring markers inside code.
export const extractCitekeys = (source: string): string[] => {
  const keys = new Set<string>();
  mapOutsideCode(source, (segment) => {
    for (const marker of segment.matchAll(CITATION_MARKER)) {
      for (const key of marker[0].matchAll(CITEKEY_IN_MARKER)) keys.add(key[1]);
    }
    return segment;
  });
  return [...keys];
};

// citeproc renders in-text citations as an HTML fragment for some styles
// (italics, small-caps spans). Markdown rendering in this tool never allows
// raw HTML through, so any tags here would be escaped and shown literally
// to the reader. Reducing the fragment to its text content is therefore the
// honest transformation: it keeps the citation correct and readable rather
// than leaking visible markup into the document.
const toPlainText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

// Replaces each citation marker with its formatted in-text citation.
// A marker whose key could not be resolved against the library is left
// exactly as written, so an unresolved citation stays visible in the
// document instead of silently vanishing.
export const substituteInTextCitations = (
  source: string,
  inText: ReadonlyMap<string, string>,
): string => {
  if (inText.size === 0) return source;
  return mapOutsideCode(source, (segment) =>
    segment.replace(CITATION_MARKER, (marker) => {
      const keys = [...marker.matchAll(CITEKEY_IN_MARKER)].map((match) => match[1]);
      if (keys.length === 0) return marker;
      const rendered = keys.map((key) => inText.get(key));
      if (rendered.some((value) => value === undefined)) return marker;
      return toPlainText(rendered.join('; '));
    }),
  );
};

export const formatCitations = async (
  library: CitationLibrary,
  citekeys: string[],
  style: CitationStyleId,
): Promise<FormattedCitations> => {
  const resolutions = resolveCitekeys(library, citekeys);
  const resolvedKeys = resolutions.filter((r) => r.resolved).map((r) => r.citekey);
  const unresolved = resolutions.filter((r) => !r.resolved).map((r) => r.citekey);

  if (resolvedKeys.length === 0) {
    return { inText: new Map(), bibliographyHtml: [], unresolved };
  }

  const styleXml = await loadCitationStyle(style);
  const localeXml = await loadLocale('en-US');

  const sys = {
    retrieveLocale: () => localeXml,
    retrieveItem: (id: string) => library.entries.get(id),
  };

  const engine = new Engine(sys, styleXml);
  engine.updateItems(resolvedKeys);

  const inText = new Map<string, string>();
  resolvedKeys.forEach((citekey, index) => {
    const citation = {
      citationItems: [{ id: citekey }],
      properties: { noteIndex: index },
    };
    const [, clusters] = engine.processCitationCluster(citation, [], []);
    const rendered = clusters.find(([, , id]) => id !== undefined)?.[1] ?? clusters[0]?.[1] ?? '';
    inText.set(citekey, rendered);
  });

  const bibliography = engine.makeBibliography();
  const bibliographyHtml = bibliography ? bibliography[1] : [];

  return { inText, bibliographyHtml, unresolved };
};
