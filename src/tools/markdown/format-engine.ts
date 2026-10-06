import { formatWithCursor } from 'prettier/standalone';
import * as markdownPlugin from 'prettier/plugins/markdown';
import { parseFrontmatter, stripFrontmatter } from './frontmatter-engine';
import type { Nodes, Root } from 'mdast';
import type { ParserOptions } from 'prettier';

export async function formatMarkdownSource(source: string, cursorOffset: number) {
  const metadata = parseFrontmatter(source);
  const body = metadata.format === null ? source : stripFrontmatter(source);
  const prefix = source.slice(0, source.length - body.length);
  const cursor = Math.min(source.length, Math.max(0, cursorOffset));
  // Prettier expands single-tilde spans to double-tilde strike syntax. Retain
  // the original delimiters: single tildes also belong to authoring extensions.
  // A same-length unused character keeps formatWithCursor's offsets correct.
  let markerCode = 0xE000;
  while (body.includes(String.fromCharCode(markerCode)) && markerCode <= 0xF8FF) markerCode++;
  if (markerCode > 0xF8FF) throw new Error('No safe formatting marker available.');
  const marker = String.fromCharCode(markerCode);
  const preservingPlugin = {
    ...markdownPlugin,
    parsers: { ...markdownPlugin.parsers, markdown: {
      ...markdownPlugin.parsers.markdown,
      async preprocess(text: string, options: ParserOptions): Promise<string> {
        // Use Prettier's browser-safe parser. The preview parser resolves a
        // DOM-only character decoder in browser builds and cannot run here.
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
  const result = await formatWithCursor(body, {
    parser: 'markdown', plugins: [preservingPlugin],
    proseWrap: 'preserve', embeddedLanguageFormatting: 'off',
    cursorOffset: Math.max(0, cursor - prefix.length),
  });
  return {
    formatted: prefix + result.formatted.replaceAll(marker, '~'),
    cursorOffset: cursor < prefix.length ? cursor : prefix.length + result.cursorOffset,
  };
}
