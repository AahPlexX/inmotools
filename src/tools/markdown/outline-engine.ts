import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root } from 'mdast';
import type { OutlineEntry } from './markdown-types';
import { headingText, toSlug } from './heading-slug';

// Builds a document outline from the heading nodes of a parsed document.
//
// Headings are read from the mdast tree rather than by scanning for `#`
// characters with a regular expression, so a `#` inside a fenced code block
// or an indented code block is never mistaken for a heading - the parser has
// already decided what is and is not a heading.
//
// Only root-level headings are collected, matching the same deliberate
// root-children-only scope documented in parse-engine.ts. A heading nested
// inside a blockquote or list item is not a document section for outline
// purposes.

const createProcessor = () => unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export const buildOutline = (source: string): OutlineEntry[] => {
  const tree = createProcessor().parse(source) as Root;
  const seen = new Map<string, number>();
  const entries: OutlineEntry[] = [];

  for (const node of tree.children) {
    if (node.type !== 'heading' || !node.position) continue;
    const text = headingText(node).trim();
    const base = toSlug(text) || 'section';
    const priorCount = seen.get(base) ?? 0;
    seen.set(base, priorCount + 1);
    entries.push({
      depth: node.depth,
      text,
      line: node.position.start.line,
      id: priorCount === 0 ? base : `${base}-${priorCount}`,
    });
  }

  return entries;
};
