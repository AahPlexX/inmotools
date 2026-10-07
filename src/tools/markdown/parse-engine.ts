import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkScripts from './script-plugin';
import remarkDisclosures from './disclosure-plugin';
import remarkAbbreviations from './abbreviation-plugin';
import { remarkDefinitionList } from 'remark-definition-list';
import type { Root, RootContent } from 'mdast';
import { parseFrontmatter, stripFrontmatter } from './frontmatter-engine';
import type { ParsedDocument, SourceLineNode } from './markdown-types';

// Parses CommonMark + GFM + math syntax into an mdast syntax tree, then walks
// only the top-level (root) children to build the list of source-line
// anchors that render-engine.ts and scroll-sync.ts depend on. Going one level
// deep (root children only) is deliberate: it is enough to synchronize
// headings, paragraphs, tables, and code/diagram/math blocks with the
// preview, without the cost of tracking every inline node.

export const createMarkdownParser = () => unified().use(remarkParse).use(remarkGfm, { singleTilde: false }).use(remarkMath).use(remarkScripts).use(remarkDisclosures).use(remarkAbbreviations).use(remarkDefinitionList);

export const parseMarkdownTree = (source: string): Root => {
  const processor = createMarkdownParser();
  return processor.runSync(processor.parse(source), source) as Root;
};

const toSourceLineNode = (node: RootContent, index: number, lineOffset: number): SourceLineNode | null => {
  if (!node.position) return null;
  return {
    id: `node-${index}`,
    startLine: node.position.start.line + lineOffset,
    endLine: node.position.end.line + lineOffset,
  };
};

export const parseMarkdown = (source: string): ParsedDocument => {
  const frontmatter = parseFrontmatter(source);
  const body = frontmatter.format === null ? source : stripFrontmatter(source);
  const lineOffset = frontmatter.format === null ? 0 : frontmatter.bodyStartLine - 1;

  const tree = parseMarkdownTree(body);

  const nodes: SourceLineNode[] = [];
  tree.children.forEach((node, index) => {
    const anchor = toSourceLineNode(node, index, lineOffset);
    if (anchor) nodes.push(anchor);
  });

  return { tree, nodes, frontmatter };
};
