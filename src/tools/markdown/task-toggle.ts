import type { Nodes, Root } from 'mdast';
import { parseMarkdown } from './parse-engine';
import { stripFrontmatter } from './frontmatter-engine';

// Only a native parsed task may change. Replace its checkbox marker while
// leaving every source byte outside the marker untouched, including quotes
// and CRLF/lone-CR/mixed line endings.
export const toggleTaskListMarker = (source: string, line: number): string | null => {
  if (!Number.isInteger(line) || line < 1) return null;
  const parsed = parseMarkdown(source);
  const body = parsed.frontmatter.format === null ? source : stripFrontmatter(source);
  const prefixLength = source.length - body.length;
  const lineOffset = parsed.frontmatter.format === null ? 0 : parsed.frontmatter.bodyStartLine - 1;
  const stack: Nodes[] = [parsed.tree as Root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'listItem' && typeof node.checked === 'boolean' && node.position && node.position.start.line + lineOffset === line) {
      const offset = node.position.start.offset;
      const endOffset = node.position.end.offset;
      if (offset === undefined || endOffset === undefined) return null;
      const start = prefixLength + offset;
      const prefix = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t\r\n]|>)*\[/.exec(source.slice(start));
      if (!prefix) return null;
      const markerStart = start + prefix[0].length - 1;
      const markerEnd = source.indexOf(']', markerStart + 1);
      if (markerEnd < 0 || markerEnd >= prefixLength + endOffset) return null;
      const original = source.slice(markerStart, markerEnd + 1);
      if (!/^\[(?:[xX]|[ \t\r\n>]+)\]$/.test(original)) return null;
      return source.slice(0, markerStart) + (node.checked ? '[ ]' : '[x]') + source.slice(markerEnd + 1);
    }
    if ('children' in node) for (const child of [...node.children].reverse()) stack.push(child);
  }
  return null;
};
