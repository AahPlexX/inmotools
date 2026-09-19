import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Element, ElementContent, Root as HastRoot, RootContent as HastRootContent, Text as HastText } from 'hast';
import type { RenderResult, ScrollAnchor } from './markdown-types';
import { highlightFencedCode, isDiagramLanguageTag } from './code-highlight-engine';

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
const isText = (node: HastRootContent): node is HastText => node.type === 'text';

const languageTagOf = (codeElement: Element): string | undefined => {
  const classNames = codeElement.properties?.className;
  const classList = Array.isArray(classNames) ? classNames.map(String) : typeof classNames === 'string' ? [classNames] : [];
  const languageClass = classList.find((name) => name.startsWith('language-'));
  return languageClass?.slice('language-'.length);
};

// Replaces a fenced code block's plain-text children with `tok-*`-classed
// spans wherever a grammar is registered for its language tag (see
// code-highlight-engine.ts). Diagram code blocks are left untouched: their
// `pre` is replaced wholesale by diagram-renderer.ts once Mermaid/Graphviz
// has rendered it, so highlighting their source text would be discarded
// work. Walks the whole tree, not just its root children - a fenced block
// can appear nested inside a list item or blockquote, unlike the
// root-only scope of the scroll-sync anchors below.
const highlightCodeBlocks = (node: HastRoot | HastRootContent): void => {
  if (!('children' in node)) return;
  for (const child of node.children) {
    if (
      isElement(child)
      && child.tagName === 'pre'
      && child.children.length === 1
      && isElement(child.children[0])
      && child.children[0].tagName === 'code'
    ) {
      const codeElement = child.children[0];
      const languageTag = languageTagOf(codeElement);
      if (languageTag && !isDiagramLanguageTag(languageTag)) {
        const raw = codeElement.children.filter(isText).map((text) => text.value).join('');
        const tokens = highlightFencedCode(raw, languageTag);
        if (tokens) {
          codeElement.children = tokens.map((token): ElementContent =>
            token.classes
              ? { type: 'element', tagName: 'span', properties: { className: token.classes.split(' ') }, children: [{ type: 'text', value: token.text }] }
              : { type: 'text', value: token.text },
          );
        }
      }
    }
    highlightCodeBlocks(child);
  }
};

export const renderMarkdown = (source: string): RenderResult => {
  const processor = createProcessor();
  const tree = processor.runSync(processor.parse(source)) as HastRoot;
  highlightCodeBlocks(tree);

  const anchors: ScrollAnchor[] = [];
  tree.children.forEach((node, index) => {
    if (!isElement(node) || !node.position) return;
    const nodeId = `node-${index}`;
    node.properties = { ...node.properties, dataSourceLine: String(node.position.start.line) };
    anchors.push({ sourceLine: node.position.start.line, nodeId });
  });

  return { html: toHtml(tree), anchors };
};
