import { parseMarkdownTree } from './parse-engine';
import type { Nodes } from 'mdast';

/** Keep owned HTML wrappers and their indentation opaque to Prettier. */
export function disclosureRanges(source: string) {
  if (!/<\/?(?:details|summary)\b/i.test(source)) return [];
  const ranges: { start: number; end: number }[] = [];
  const visit = (node: Nodes, container?: Nodes) => {
    const enclosing = container ?? (['blockquote', 'list', 'defList'].includes(node.type) ? node : undefined);
    if (node.type === 'workbenchDisclosure' || (node.type === 'code' && node.data?.disclosureFallback)) {
      const position = (enclosing ?? node).position;
      if (position?.start.offset !== undefined && position.end.offset !== undefined) ranges.push({ start: position.start.offset, end: position.end.offset });
      return;
    }
    if ('children' in node) node.children.forEach(child => visit(child, enclosing));
  };
  visit(parseMarkdownTree(source));
  return ranges;
}
