// GitHub's five alert kinds plus the Workbench DANGER extension.
// Preserve escaped/entity-written markers by checking the original source.

import { visit } from 'unist-util-visit';
import type { Root, Blockquote, Paragraph, Text } from 'mdast';
import type { Plugin } from 'unified';

const ALERT_KINDS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'DANGER'] as const;
type AlertKind = (typeof ALERT_KINDS)[number];

const MARKER = new RegExp(`^\\[!(${ALERT_KINDS.join('|')})\\]\\s*`, 'i');

const titleCase = (kind: AlertKind): string => kind.charAt(0) + kind.slice(1).toLowerCase();

const remarkGithubAlerts: Plugin<[], Root> = () => (tree, file) => {
  const source = file.toString();
  visit(tree, 'blockquote', (node: Blockquote) => {
    const firstParagraph = node.children[0];
    if (!firstParagraph || firstParagraph.type !== 'paragraph') return;
    const firstText = (firstParagraph as Paragraph).children[0];
    if (!firstText || firstText.type !== 'text') return;

    const match = MARKER.exec((firstText as Text).value);
    if (!match) return;
    const offset = firstText.position?.start.offset;
    if (offset !== undefined && source && !source.startsWith(`[!${match[1]}]`, offset)) return;
    const kind = match[1].toUpperCase() as AlertKind;

    const remainder = (firstText as Text).value.slice(match[0].length);
    if (remainder) (firstText as Text).value = remainder;
    else (firstParagraph as Paragraph).children.shift();
    if ((firstParagraph as Paragraph).children.length === 0) node.children.shift();

    const titleNode: Paragraph = {
      type: 'paragraph',
      data: { hProperties: { className: ['markdown-alert-title'] } },
      children: [{ type: 'text', value: titleCase(kind) }],
    };
    node.children.unshift(titleNode);

    node.data = {
      ...node.data,
      hName: 'div',
      hProperties: { className: ['markdown-alert', `markdown-alert-${kind.toLowerCase()}`] },
    };
  });
};

export default remarkGithubAlerts;
