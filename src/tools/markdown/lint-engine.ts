import type { Root, Nodes } from 'mdast';
import type { ParsedDocument } from './markdown-types';
import { parseMarkdown } from './parse-engine';

export interface MarkdownStyleSuggestion {
  line: number;
  rule: 'heading-level' | 'list-marker' | 'trailing-space';
  message: string;
}

export const MAX_STYLE_SUGGESTIONS = 200;

// Suggestions describe style, not Markdown validity. Use the same syntax tree
// as the preview so fenced/indented code, math, HTML and hard breaks stay literal.
export function collectMarkdownStyleSuggestions(source: string, parsed: ParsedDocument = parseMarkdown(source)) {
  const lines = source.split(/\r\n|\r|\n/);
  const offset = parsed.frontmatter.format === null ? 0 : parsed.frontmatter.bodyStartLine - 1;
  const ignored = new Set<number>();
  const hardBreaks = new Set<number>();
  const byLine = new Map<number, MarkdownStyleSuggestion[]>();
  const add = (line: number, rule: MarkdownStyleSuggestion['rule'], message: string) => {
    const entry = { line, rule, message };
    byLine.set(line, [...(byLine.get(line) ?? []), entry]);
  };
  const marker = (node: Nodes) => {
    const position = node.position?.start;
    return position ? /^([-+*])(?:[ \t]|$)/.exec(lines[position.line + offset - 1]?.slice(position.column - 1) ?? '')?.[1] : undefined;
  };
  const stack: Nodes[] = [parsed.tree as Root];
  let headingDepth = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'math' || node.type === 'inlineMath' || node.type === 'html') {
      if (node.position) {
        for (let line = node.position.start.line; line <= node.position.end.line; line++) ignored.add(line + offset);
      }
      continue;
    }
    if (node.type === 'break' && node.position) hardBreaks.add(node.position.start.line + offset);
    if (node.type === 'heading') {
      if (headingDepth && node.depth > headingDepth + 1 && node.position) {
        add(node.position.start.line + offset, 'heading-level', `Heading level jumps from ${headingDepth} to ${node.depth}.`);
      }
      headingDepth = node.depth;
    }
    if ('children' in node) {
      // CommonMark separates bullet lists when their marker changes. Adjacent
      // unordered lists within one container are the only groups compared;
      // nesting, ordered lists and intervening blocks reset the comparison.
      let previousMarker: string | undefined;
      for (const child of node.children) {
        const currentMarker = child.type === 'list' && !child.ordered ? marker(child) : undefined;
        if (previousMarker && currentMarker && previousMarker !== currentMarker && child.position) {
          add(child.position.start.line + offset, 'list-marker', `List marker changes from ${previousMarker} to ${currentMarker}; use one marker for this group if intended.`);
        }
        previousMarker = currentMarker;
      }
      for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]);
    }
  }
  const suggestions: MarkdownStyleSuggestion[] = [];
  let total = 0;
  for (let index = offset; index < lines.length; index++) {
    const line = index + 1;
    if (!ignored.has(line) && !hardBreaks.has(line) && /[ \t]+$/.test(lines[index])) {
      add(line, 'trailing-space', 'Trailing whitespace is unnecessary here; two-space hard breaks are preserved.');
    }
    for (const suggestion of byLine.get(line) ?? []) {
      total++;
      if (suggestions.length < MAX_STYLE_SUGGESTIONS) suggestions.push(suggestion);
    }
  }
  return { suggestions, total };
}
