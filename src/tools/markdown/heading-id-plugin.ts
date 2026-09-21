// Feature (Markdown completion) — heading anchor ids.
//
// Without this, no heading in the rendered preview or any HTML/EPUB export
// had an `id`, so a link to `#some-heading` (including the one an inserted
// Table of Contents generates - see toc-engine.ts) went nowhere. Ids use the
// exact same GitHub-style slug + de-duplication as the Outline panel
// (heading-slug.ts), so a TOC built from `buildOutline()` always lands on
// the heading it names.

import { visit } from 'unist-util-visit';
import type { Root, Heading } from 'mdast';
import type { Plugin } from 'unified';
import { headingText, toSlug } from './heading-slug';

const remarkHeadingIds: Plugin<[], Root> = () => (tree) => {
  const seen = new Map<string, number>();
  visit(tree, 'heading', (node: Heading) => {
    const base = toSlug(headingText(node).trim()) || 'section';
    const priorCount = seen.get(base) ?? 0;
    seen.set(base, priorCount + 1);
    const id = priorCount === 0 ? base : `${base}-${priorCount}`;
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
  });
};

export default remarkHeadingIds;
