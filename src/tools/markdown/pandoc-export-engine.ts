import YAML, { type ScalarTag } from 'yaml';
import type { CitationEntry, CitationLibrary } from './markdown-types';
import { extractPandocCitationKeys } from './pandoc-citation-source';
import { parseFrontmatter } from './frontmatter-engine';
import { substituteFormulaValues } from './table-formula-engine';

// Pandoc-compatible Markdown export (MDW-R82).
//
// The Workbench already writes citations in Pandoc's own syntax ([@key], [@a; @b], locators and
// prefixes inside the brackets), footnotes as [^id], and tables, definition lists and sub/superscripts in
// forms Pandoc reads. What Pandoc cannot do is evaluate table formulas or find the bibliography, so the
// export (1) replaces formula cells with their values and (2) embeds the cited entries in the YAML
// metadata `references` field, which Pandoc's Citations chapter documents as an alternative to a
// bibliography file. The selected Workbench CSL stylesheet is not embedded; Pandoc selects an
// external stylesheet through --csl or csl/citation-style metadata.
//
// Existing YAML metadata is kept as written: the references are appended to that block, and nothing is
// added when the block already has its own `references` field (the author's entries win).

export interface PandocExport {
  readonly text: string;
  /** Cited keys whose entries were embedded, in order of first citation. */
  readonly embeddedKeys: readonly string[];
  /** Cited keys absent from the imported bibliography; authored references are not validated here. */
  readonly unresolvedKeys: readonly string[];
  /** True when the document's own YAML block already defines `references`, so nothing was embedded. */
  readonly keptExistingReferences: boolean;
  /** A key crossed a native literal boundary and could not be safely auto-embedded. */
  readonly unsupportedCitationSyntax: boolean;
}

const nativeIdTag: ScalarTag = {
  tag: 'tag:yaml.org,2002:str',
  format: 'PANDOC_CITATION_ID',
  default: true,
  identify: value => typeof value === 'string',
  resolve: value => value,
  stringify: item => JSON.stringify(item.value as string).replace(/[\u0085\u2028\u2029]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`),
};

const referencesBlock = (entries: readonly CitationEntry[]): string => {
  const references = entries.map(entry => {
    if (!/[\u0085\u2028\u2029]/u.test(entry.id)) return entry;
    // Escape these IDs inside quotes before the native YAML reader can fold
    // them or treat their characters as physical metadata line boundaries.
    const id = new YAML.Scalar(entry.id);
    id.format = nativeIdTag.format;
    return { ...entry, id };
  });
  return YAML.stringify({ references }, { lineWidth: 0, customTags: [nativeIdTag] }).trimEnd();
};

const YAML_BLOCK = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

export const buildPandocMarkdown = (source: string, library: CitationLibrary | null): PandocExport => {
  const prepared = substituteFormulaValues(source);
  const citationSource = extractPandocCitationKeys(prepared);
  const keys = citationSource.keys;
  const known = library ? keys.filter((key) => library.entries.has(key)) : [];
  const unresolvedKeys = keys.filter((key) => !known.includes(key));
  const none = { embeddedKeys: [] as string[], unresolvedKeys, keptExistingReferences: false, unsupportedCitationSyntax: citationSource.unsupported };
  const frontmatter = parseFrontmatter(prepared);
  if (frontmatter.format === 'yaml' && 'references' in frontmatter.data) {
    return { text: prepared, ...none, keptExistingReferences: true };
  }
  if (known.length === 0 || !library) return { text: prepared, ...none };

  const entries = known.map((key) => library.entries.get(key)!);
  const block = referencesBlock(entries);
  if (frontmatter.format === 'yaml') {
    const match = YAML_BLOCK.exec(prepared);
    if (match) {
      const body = match[2]!.trimEnd();
      const text = `${match[1]}${body === '' ? '' : `${body}\n`}${block}${match[3]}${prepared.slice(match[0].length)}`;
      return { text, ...none, embeddedKeys: known };
    }
  }
  // No YAML block (or a TOML/JSON block Pandoc does not read as metadata): add a separate YAML block first.
  return { text: `---\n${block}\n---\n\n${prepared}`, ...none, embeddedKeys: known };
};
