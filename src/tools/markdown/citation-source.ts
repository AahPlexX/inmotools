import type { Nodes, Root } from 'mdast';
import { createMarkdownParser, parseMarkdown } from './parse-engine';
import { stripFrontmatter } from './frontmatter-engine';
import type { ParsedDocument } from './markdown-types';

type Range = { start: number; end: number };
type ProseRange = Range & { emphasisEnds: ReadonlySet<number> };
const literals = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html', 'definition', 'image', 'imageReference', 'link', 'linkReference', 'subscript', 'superscript']);

/** Only authored, native prose is eligible; decoded/generated text is never source. */
export function mapCitationProse(source: string, replace: (text: string, range: Readonly<ProseRange>) => string, parsed?: ParsedDocument): string {
  if (!source.includes('@')) return source;
  const document = parsed ?? parseMarkdown(source);
  const bodyOffset = document.frontmatter.format === null ? 0 : source.length - stripFrontmatter(source).length;
  const ranges: Range[] = [];
  const emphasisEnds = new Set<number>();
  const collect = (root: Nodes, base: number, captions: boolean) => {
    const stack: Nodes[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (literals.has(node.type)) continue;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (node.type === 'text' && start !== undefined && end !== undefined) {
        ranges.push({ start: base + start, end: base + end });
      } else if (captions && node.type === 'workbenchSummary' && start !== undefined && end !== undefined) {
        const raw = source.slice(base + start, base + end);
        const opening = /^[ \t]*<summary[ \t]*>/i.exec(raw);
        const closing = /<\/summary[ \t]*>[ \t]*$/i.exec(raw);
        if (opening && closing) {
          const inner = raw.slice(opening[0].length, closing.index);
          // Caption child positions belong to a separate string and were
          // intentionally removed by the disclosure transform. Parse the
          // authored slice to get code/escape boundaries in its coordinates.
          collect(createMarkdownParser().parse(inner) as Root, base + start + opening[0].length, false);
        }
      } else if ('children' in node) {
        if (['emphasis', 'strong', 'delete'].includes(node.type) && start !== undefined && end !== undefined) {
          if (node.type !== 'delete') emphasisEnds.add(base + end);
          const first = node.children[0]?.position?.start.offset;
          const last = node.children.at(-1)?.position?.end.offset;
          if (first !== undefined && last !== undefined) {
            ranges.push({ start: base + start, end: base + first }, { start: base + last, end: base + end });
          }
        }
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i] as Nodes);
      }
    }
  };
  collect(document.tree as Root, bodyOffset, true);
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const contiguous: Range[] = [];
  for (const range of ranges) {
    const previous = contiguous.at(-1);
    if (previous?.end === range.start) previous.end = range.end;
    else contiguous.push({ ...range });
  }
  let result = ''; let cursor = 0;
  for (const { start, end } of contiguous) {
    if (start < cursor || end > source.length || start >= end) continue;
    result += source.slice(cursor, start) + replace(source.slice(start, end), { start, end, emphasisEnds });
    cursor = end;
  }
  return result + source.slice(cursor);
}

export function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}
