import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseCslJson } from '../../src/tools/markdown/citation-engine';
import { parseFrontmatter } from '../../src/tools/markdown/frontmatter-engine';
import { buildPandocMarkdown } from '../../src/tools/markdown/pandoc-export-engine';

const library = parseCslJson(JSON.stringify([
  { id: 'smith2024', type: 'article-journal', title: 'A Title: with "quotes", a # and a colon', author: [{ family: 'Smith', given: 'A.' }], issued: { 'date-parts': [[2024]] }, 'container-title': 'Journal of Tests', volume: '3', page: '10-20' },
  { id: 'doe:2020', type: 'book', title: 'Another Book – Ünïcode\nsecond line', author: [{ family: 'Doe', given: 'J.' }], issued: { 'date-parts': [[2020]] }, publisher: 'Press' },
  { id: 'unused2019', type: 'book', title: 'Never Cited', author: [{ family: 'Nobody', given: 'N.' }], issued: { 'date-parts': [[2019]] } },
]));

const BODY = [
  '# Heading one',
  '',
  'Claim [@smith2024, p. 14; see @doe:2020] and [-@smith2024].',
  '',
  '## Heading two',
  '',
  '@smith2024 says more[^1].',
  '',
  '[^1]: A note.',
  '',
].join('\n');

const referencesOf = (text: string): { id: string; title?: string }[] => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return (YAML.parse(match![1]!) as { references: { id: string; title?: string }[] }).references;
};

describe('MDW-R82 Pandoc-compatible Markdown export', () => {
  it('MDW-R82 embeds only the cited, resolvable entries as YAML references in order of first citation', () => {
    const result = buildPandocMarkdown(BODY, library);
    expect(result.embeddedKeys).toEqual(['smith2024', 'doe:2020']);
    expect(result.unresolvedKeys).toEqual([]);
    expect(referencesOf(result.text).map((entry) => entry.id)).toEqual(['smith2024', 'doe:2020']);
    expect(result.text).not.toContain('unused2019');
  });

  it('MDW-R82 keeps headings, citations and footnotes exactly as written after the metadata block', () => {
    const result = buildPandocMarkdown(BODY, library);
    expect(result.text.endsWith(`---\n\n${BODY}`)).toBe(true);
  });

  it('MDW-R82 writes entry text so it survives a YAML round trip, including quotes, colons, hashes and line breaks', () => {
    const entries = referencesOf(buildPandocMarkdown(BODY, library).text);
    expect(entries[0]!.title).toBe('A Title: with "quotes", a # and a colon');
    expect(entries[1]!.title).toBe('Another Book – Ünïcode\nsecond line');
  });

  it('MDW-R82 reports cited keys that are not in the bibliography and leaves their markers as written', () => {
    const source = 'Known [@smith2024] and unknown [@ghost2000].\n';
    const result = buildPandocMarkdown(source, library);
    expect(result.embeddedKeys).toEqual(['smith2024']);
    expect(result.unresolvedKeys).toEqual(['ghost2000']);
    expect(result.text).toContain('Known [@smith2024] and unknown [@ghost2000].');
  });

  it('MDW-R82 appends references to an existing YAML block without changing the author\'s other metadata', () => {
    const source = ['---', 'title: My paper', 'tags: [a, b]', '---', '', BODY].join('\n');
    const result = buildPandocMarkdown(source, library);
    const frontmatter = parseFrontmatter(result.text);
    expect(frontmatter.format).toBe('yaml');
    expect(frontmatter.data.title).toBe('My paper');
    expect(frontmatter.data.tags).toEqual(['a', 'b']);
    expect(referencesOf(result.text).map((entry) => entry.id)).toEqual(['smith2024', 'doe:2020']);
    expect(result.text.startsWith('---\ntitle: My paper\ntags: [a, b]\nreferences:\n')).toBe(true);
    expect(result.text.endsWith(`---\n\n${BODY}`)).toBe(true);
  });

  it('MDW-R82 leaves the document alone when its own YAML block already has references', () => {
    const source = ['---', 'references:', '- {id: smith2024, type: book, title: Mine}', '---', '', 'Text [@smith2024].'].join('\n');
    const result = buildPandocMarkdown(source, library);
    expect(result.keptExistingReferences).toBe(true);
    expect(result.embeddedKeys).toEqual([]);
    expect(result.text).toBe(source);
  });

  it('MDW-R82 adds a separate YAML block before a TOML block that Pandoc does not read as metadata', () => {
    const source = ['+++', 'title = "Toml"', '+++', '', 'Text [@smith2024].', ''].join('\n');
    const result = buildPandocMarkdown(source, library);
    expect(result.text.startsWith('---\nreferences:\n')).toBe(true);
    expect(result.text.endsWith(`---\n\n${source}`)).toBe(true);
  });

  it('MDW-R82 replaces table formulas with their values because Pandoc cannot evaluate them', () => {
    const source = ['| A | B |', '| - | - |', '| 4 | =A2*2 |', ''].join('\n');
    expect(buildPandocMarkdown(source, library).text).toBe(['| A | B |', '| - | - |', '| 4 | 8 |', ''].join('\n'));
  });

  it('MDW-R82 returns a document without citations, or without a bibliography, unchanged apart from formulas', () => {
    expect(buildPandocMarkdown('# Plain\n\nNo citations.\n', library).text).toBe('# Plain\n\nNo citations.\n');
    const noLibrary = buildPandocMarkdown('Cites [@smith2024].\n', null);
    expect(noLibrary.text).toBe('Cites [@smith2024].\n');
    expect(noLibrary.unresolvedKeys).toEqual(['smith2024']);
  });

  it('MDW-R82 ignores citation-looking text inside code', () => {
    const source = 'Real [@smith2024] and `[@doe:2020]` in code.\n';
    expect(buildPandocMarkdown(source, library).embeddedKeys).toEqual(['smith2024']);
  });

  // The acceptance for this requirement is that pandoc converts the export to the same headings and
  // citations. It runs only where a pandoc binary is named in PANDOC (CI does not install one).
  const pandoc = process.env.PANDOC;
  it.skipIf(!pandoc)('MDW-R82 pandoc reads the export as the same headings and citations and resolves the bibliography', () => {
    const { text } = buildPandocMarkdown(BODY, library);
    type Inline = { t: string; c?: unknown };
    const ast = JSON.parse(execFileSync(pandoc!, ['-f', 'markdown', '-t', 'json'], { input: text, encoding: 'utf8' })) as { blocks: { t: string; c: unknown }[] };
    const words = (inlines: Inline[]): string => inlines.map((node) => (node.t === 'Str' ? String(node.c) : node.t === 'Space' ? ' ' : '')).join('');
    const headings = ast.blocks.filter((block) => block.t === 'Header').map((block) => words((block.c as [number, unknown, Inline[]])[2]));
    const cited: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record.citationId === 'string') cited.push(record.citationId);
        Object.values(record).forEach(walk);
      }
    };
    walk(ast.blocks);
    expect(headings).toEqual(['Heading one', 'Heading two']);
    expect(cited).toEqual(['smith2024', 'doe:2020', 'smith2024', 'smith2024']);

    const rendered = execFileSync(pandoc!, ['-f', 'markdown', '-t', 'plain', '--citeproc'], { input: text, encoding: 'utf8' });
    expect(rendered).toContain('Smith, A. 2024.');
    expect(rendered).toContain('Doe, J. 2020.');
    expect(rendered).not.toContain('Nobody');
  });
});
