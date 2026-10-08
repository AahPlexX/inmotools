import YAML from 'yaml';
import type { CitationEntry, CitationLibrary } from './markdown-types';
import { extractCitekeys } from './citation-engine';
import { parseFrontmatter } from './frontmatter-engine';
import { substituteFormulaValues } from './table-formula-engine';

// Pandoc-compatible Markdown export (MDW-R82).
//
// The Workbench already writes citations in Pandoc's own syntax ([@key], [@a; @b], locators and
// prefixes inside the brackets), footnotes as [^id], and tables, definition lists and sub/superscripts in
// forms Pandoc reads. What Pandoc cannot do is evaluate table formulas or find the bibliography, so the
// export (1) replaces formula cells with their values and (2) embeds the cited entries in the YAML
// metadata `references` field, which Pandoc's Citations chapter documents as an alternative to a
// bibliography file. A CSL style cannot be embedded in metadata; Pandoc then uses its default style
// unless the user passes --csl.
//
// Existing YAML metadata is kept as written: the references are appended to that block, and nothing is
// added when the block already has its own `references` field (the author's entries win).

export interface PandocExport {
  readonly text: string;
  /** Cited keys whose entries were embedded, in order of first citation. */
  readonly embeddedKeys: readonly string[];
  /** Cited keys that are not in the bibliography; Pandoc will report these as missing. */
  readonly unresolvedKeys: readonly string[];
  /** True when the document's own YAML block already defines `references`, so nothing was embedded. */
  readonly keptExistingReferences: boolean;
}

const referencesBlock = (entries: readonly CitationEntry[]): string =>
  YAML.stringify({ references: entries }, { lineWidth: 0 }).trimEnd();

const YAML_BLOCK = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

export const buildPandocMarkdown = (source: string, library: CitationLibrary | null): PandocExport => {
  const prepared = substituteFormulaValues(source);
  const keys = extractCitekeys(prepared);
  const known = library ? keys.filter((key) => library.entries.has(key)) : [];
  const unresolvedKeys = keys.filter((key) => !known.includes(key));
  const none = { embeddedKeys: [] as string[], unresolvedKeys, keptExistingReferences: false };
  if (known.length === 0 || !library) return { text: prepared, ...none };

  const entries = known.map((key) => library.entries.get(key)!);
  const block = referencesBlock(entries);
  const frontmatter = parseFrontmatter(prepared);

  if (frontmatter.format === 'yaml') {
    if ('references' in frontmatter.data) return { text: prepared, ...none, keptExistingReferences: true };
    const match = YAML_BLOCK.exec(prepared);
    if (match) {
      const body = match[2]!.trimEnd();
      const text = `${match[1]}${body === '' ? '' : `${body}\n`}${block}${match[3]}${prepared.slice(match[0].length)}`;
      return { text, embeddedKeys: known, unresolvedKeys, keptExistingReferences: false };
    }
  }
  // No YAML block (or a TOML/JSON block Pandoc does not read as metadata): add a separate YAML block first.
  return { text: `---\n${block}\n---\n\n${prepared}`, embeddedKeys: known, unresolvedKeys, keptExistingReferences: false };
};
