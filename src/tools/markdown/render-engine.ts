import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root as HastRoot, RootContent as HastRootContent } from 'hast';
import type { RenderResult, ScrollAnchor } from './markdown-types';

// Renders a markdown source string to sanitized HTML.
//
// Sanitization runs on every render, unconditionally, and remark-rehype is
// used without `allowDangerousHtml`, so raw inline HTML in the source (a
// documented CommonMark/GFM injection vector) never reaches the DOM. The
// sanitize schema extends the default GitHub-style schema only to allow the
// specific classes and attributes that KaTeX's own markup requires, following
// the officially documented pattern for combining rehype-sanitize with
// rehype-katex safely, plus one additional attribute this tool relies on for
// editor/preview scroll synchronization: `data-source-line`.

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // className and style are required for KaTeX's own generated markup
    // (`.katex`, `.katex-html`, per-glyph vertical-alignment styles) to
    // survive sanitization; dataSourceLine is this tool's own scroll-sync
    // attribute, added after sanitizing but declared here so it is never
    // accidentally stripped if tagging order ever changes.
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style', 'dataSourceLine'],
    annotation: ['encoding'],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot',
    'mtable', 'mtr', 'mtd', 'mspace', 'mtext', 'mstyle', 'mpadded', 'menclose',
    'semantics', 'annotation',
  ],
};

const createProcessor = () =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    // rehype-katex never throws for a malformed expression: it renders a
    // `.katex-error` span in place of the broken expression instead, which is
    // exactly the "labeled error block instead of a blank preview" behavior
    // this tool requires. throwOnError is intentionally not passed here; the
    // rehype-katex Options type omits it because it is always false.
    .use(rehypeKatex)
    .use(rehypeSanitize, sanitizeSchema);

const isElement = (node: HastRootContent): node is Element => node.type === 'element';

export const renderMarkdown = (source: string): RenderResult => {
  const processor = createProcessor();
  const tree = processor.runSync(processor.parse(source)) as HastRoot;

  const anchors: ScrollAnchor[] = [];
  tree.children.forEach((node, index) => {
    if (!isElement(node) || !node.position) return;
    const nodeId = `node-${index}`;
    node.properties = { ...node.properties, dataSourceLine: String(node.position.start.line) };
    anchors.push({ sourceLine: node.position.start.line, nodeId });
  });

  return { html: toHtml(tree), anchors };
};
