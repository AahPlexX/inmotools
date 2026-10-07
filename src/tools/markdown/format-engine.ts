import { formatWithCursor } from 'prettier/standalone';
import * as markdownPlugin from 'prettier/plugins/markdown';
import { parseFrontmatter, stripFrontmatter } from './frontmatter-engine';
import type { Nodes, Root } from 'mdast';
import type { ParserOptions } from 'prettier';
import { definitionListRanges } from './definition-list-ranges';
import { disclosureRanges } from './disclosure-ranges';

export async function formatMarkdownSource(source: string, cursorOffset: number) {
  const metadata = parseFrontmatter(source);
  const body = metadata.format === null ? source : stripFrontmatter(source);
  const prefix = source.slice(0, source.length - body.length);
  const cursor = Math.min(source.length, Math.max(0, cursorOffset));
  // Prettier expands single-tilde spans to double-tilde strike syntax. Retain
  // the original delimiters: single tildes also belong to authoring extensions.
  // A same-length unused character keeps formatWithCursor's offsets correct.
  let markerCode = 0xE000;
  const allocateMarker = () => {
    while (markerCode <= 0xF8FF && body.includes(String.fromCharCode(markerCode))) markerCode++;
    if (markerCode > 0xF8FF) throw new Error('No safe formatting marker available.');
    return String.fromCharCode(markerCode++);
  };
  const marker = allocateMarker();
  // Prettier does not parse the authoring extensions. Keep each block opaque,
  // including enclosing quotes/lists whose indentation must remain intact.
  const ranges = [...definitionListRanges(body), ...disclosureRanges(body)].sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const blocks = merged.map(range => ({
    ...range, marker: allocateMarker(), original: body.slice(range.start, range.end),
  }));
  let maskedBody = body;
  for (const block of [...blocks].reverse()) {
    maskedBody = maskedBody.slice(0, block.start) + block.original.replace(/[^\r\n]/g, block.marker) + maskedBody.slice(block.end);
  }
  const preservingPlugin = {
    ...markdownPlugin,
    parsers: { ...markdownPlugin.parsers, markdown: {
      ...markdownPlugin.parsers.markdown,
      async preprocess(text: string, options: ParserOptions): Promise<string> {
        // Use Prettier's own parser to locate the delimiters it would expand.
        const protectedOffsets = new Set<number>();
        const stack: Nodes[] = [await markdownPlugin.parsers.markdown.parse(text, options) as Root];
        while (stack.length) {
          const node = stack.pop()!;
          const from = node.position?.start.offset;
          const to = node.position?.end.offset;
          if (node.type === 'delete' && from !== undefined && to !== undefined && text[from + 1] !== '~') {
            protectedOffsets.add(from);
            protectedOffsets.add(to - 1);
          }
          if ('children' in node) for (const child of node.children) stack.push(child);
        }
        if (!protectedOffsets.size) return text;
        const chunks: string[] = [];
        let start = 0;
        for (const index of [...protectedOffsets].sort((a, b) => a - b)) {
          chunks.push(text.slice(start, index), marker);
          start = index + 1;
        }
        chunks.push(text.slice(start));
        return chunks.join('');
      },
    } },
  };
  const result = await formatWithCursor(maskedBody, {
    parser: 'markdown', plugins: [preservingPlugin],
    proseWrap: 'preserve', embeddedLanguageFormatting: 'off',
    cursorOffset: Math.max(0, cursor - prefix.length),
  });
  let formatted = result.formatted.replaceAll(marker, '~');
  let mappedCursor = result.cursorOffset;
  const bodyCursor = Math.max(0, cursor - prefix.length);
  for (const block of blocks) {
    const matches = [...formatted.matchAll(new RegExp(`${block.marker}+(?:\\s+${block.marker}+)*`, 'g'))];
    const match = matches[0];
    if (matches.length !== 1 || !match || match[0].split(block.marker).length - 1 !== block.original.replace(/[\r\n]/g, '').length) {
      throw new Error('Cannot safely preserve extended Markdown formatting.');
    }
    const start = match.index;
    const end = start + match[0].length;
    if (bodyCursor >= block.start && bodyCursor <= block.end) mappedCursor = start + bodyCursor - block.start;
    else if (mappedCursor >= end) mappedCursor += block.original.length - match[0].length;
    else if (mappedCursor > start) throw new Error('Cannot safely retain the formatting cursor.');
    formatted = formatted.slice(0, start) + block.original + formatted.slice(end);
  }
  return {
    formatted: prefix + formatted,
    cursorOffset: cursor < prefix.length ? cursor : prefix.length + mappedCursor,
  };
}
