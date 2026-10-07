import { createMarkdownParser } from './parse-engine';
import { defListHastHandlers } from 'remark-definition-list';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root as HastRoot, RootContent as HastRootContent } from 'hast';
import type { RenderResult, ScrollAnchor } from './markdown-types';
import remarkGithubAlerts from './github-alerts-plugin';
import remarkHeadingIds from './heading-id-plugin';
import remarkEmoji from './emoji-plugin';

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
    input: [...(defaultSchema.attributes?.input ?? []), 'type', 'disabled', 'checked'],
    details: [...(defaultSchema.attributes?.details ?? []), 'dataDisclosureDefaultOpen'],
    annotation: ['encoding'],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'input', 'abbr',
    'math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot',
    'mtable', 'mtr', 'mtd', 'mspace', 'mtext', 'mstyle', 'mpadded', 'menclose',
    'semantics', 'annotation',
  ],
};

const createProcessor = (generatedSection: string) =>
  createMarkdownParser(generatedSection)
    .use(remarkGithubAlerts)
    .use(remarkHeadingIds)
    .use(remarkEmoji)
    .use(remarkRehype, { handlers: defListHastHandlers })
    // rehype-katex never throws for a malformed expression: it renders a
    // `.katex-error` span in place of the broken expression instead, which is
    // exactly the "labeled error block instead of a blank preview" behavior
    // this tool requires. throwOnError is intentionally not passed here; the
    // rehype-katex Options type omits it because it is always false.
    .use(rehypeKatex)
    .use(rehypeSanitize, sanitizeSchema);

const isElement = (node: HastRootContent): node is Element => node.type === 'element';

export const renderMarkdown = (source: string, generatedSection = ''): RenderResult => {
  const processor = createProcessor(generatedSection);
  const tree = processor.runSync(processor.parse(source), source) as HastRoot;

  const anchors: ScrollAnchor[] = [];
  const seenLines = new Set<number>();
  const abbreviations = new Map<string, string>();
  const collectAbbreviations = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (node.tagName === 'dl') node.properties.className = ['markdown-definition-list'];
    if (node.tagName === 'abbr' && typeof node.properties.title === 'string' && node.properties.title) {
      const label = node.children.filter((child) => child.type === 'text').map((child) => child.value).join('');
      if (!abbreviations.has(label)) abbreviations.set(label, node.properties.title);
    }
    for (const child of node.children) collectAbbreviations(child);
  };
  tree.children.forEach(collectAbbreviations);
  const ids = new Set<string>();
  const collectIds = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    if (typeof node.properties.id === 'string') ids.add(node.properties.id);
    node.children.forEach(collectIds);
  };
  tree.children.forEach(collectIds);
  const resolveFragments = (node: HastRootContent): void => {
    if (!isElement(node)) return;
    const href = node.properties.href;
    if (node.tagName === 'a' && typeof href === 'string' && href.startsWith('#')) {
      try {
        const id = decodeURIComponent(href.slice(1));
        if (!ids.has(id) && ids.has(`user-content-${id}`)) node.properties.href = `#${encodeURIComponent(`user-content-${id}`)}`;
      } catch { /* Leave malformed authored fragments inert in the preview. */ }
    }
    node.children.forEach(resolveFragments);
  };
  tree.children.forEach(resolveFragments);
  if (abbreviations.size) {
    tree.children.push({ type: 'element', tagName: 'details', properties: { className: ['markdown-abbreviation-glossary'] }, children: [
      { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: `Abbreviations (${abbreviations.size})` }] },
      { type: 'element', tagName: 'dl', properties: {}, children: [...abbreviations].flatMap(([label, title]): Element[] => [
        { type: 'element', tagName: 'dt', properties: {}, children: [{ type: 'text', value: label }] },
        { type: 'element', tagName: 'dd', properties: {}, children: [{ type: 'text', value: title }] },
      ]) },
    ] });
  }
  const stamp = (node: HastRootContent, nodeId: string) => {
    if (!isElement(node)) return;
    const line = node.position?.start.line;
    if (line) {
      node.properties = { ...node.properties, dataSourceLine: String(line) };
      if (!seenLines.has(line)) {
        seenLines.add(line);
        anchors.push({ sourceLine: line, nodeId });
      }
    }
    node.children.forEach((child, index) => stamp(child, `${nodeId}-${index}`));
  };
  tree.children.forEach((node, index) => stamp(node, `node-${index}`));

  return { html: toHtml(tree), anchors };
};
