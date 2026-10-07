import { parseMarkdownTree } from './parse-engine';
import type { OutlineEntry } from './markdown-types';
import { headingText, toSlug } from './heading-slug';
import type { Nodes } from 'mdast';

// Builds a document outline from the heading nodes of a parsed document.
//
// Headings are read from the mdast tree rather than by scanning for `#`
// characters with a regular expression, so a `#` inside a fenced code block
// or an indented code block is never mistaken for a heading - the parser has
// already decided what is and is not a heading.
//
// Root headings and disclosure sections are collected. All headings count
// toward duplicate IDs, including quote/list headings excluded from the outline.

export const buildOutline = (source: string): OutlineEntry[] => {
  const tree = parseMarkdownTree(source);
  const seen = new Map<string, number>();
  const entries: OutlineEntry[] = [];

  const visit = (node: Nodes, eligible: boolean) => {
    if (node.type === 'heading') {
    const text = headingText(node).trim();
    const base = toSlug(text) || 'section';
    const priorCount = seen.get(base) ?? 0;
    seen.set(base, priorCount + 1);
    if (eligible && node.position) entries.push({
      depth: node.depth,
      text,
      line: node.position.start.line,
      id: priorCount === 0 ? base : `${base}-${priorCount}`,
    });
    }
    if ('children' in node) node.children.forEach(child => visit(child, eligible && (node.type === 'root' || node.type === 'workbenchDisclosure')));
  };
  visit(tree, true);

  return entries;
};
