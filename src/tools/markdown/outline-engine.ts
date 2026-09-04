import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root } from 'mdast';
import type { OutlineEntry } from './markdown-types';

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

// Concatenates the visible text of a heading's inline children. Inline code,
// emphasis, and links contribute their text; images contribute their alt
// text, which is the only text a reader would see in an outline.
const headingText = (node: unknown): string => {
  if (typeof node !== 'object' || node === null) return '';
  const candidate = node as { type?: string; value?: unknown; alt?: unknown; children?: unknown[] };
  if (candidate.type === 'text' || candidate.type === 'inlineCode') {
    return typeof candidate.value === 'string' ? candidate.value : '';
  }
  if (candidate.type === 'image') {
    return typeof candidate.alt === 'string' ? candidate.alt : '';
  }
  if (Array.isArray(candidate.children)) {
    return candidate.children.map((child) => headingText(child)).join('');
  }
  return '';
};

// GitHub-style slug: lowercased, non-word characters dropped, spaces to
// hyphens. Duplicate slugs get a numeric suffix so every outline entry has a
// unique id, matching the disambiguation behaviour readers expect from
// rendered markdown anchors.
const toSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

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
