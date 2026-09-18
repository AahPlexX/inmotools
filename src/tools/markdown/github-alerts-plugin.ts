// Feature (Markdown completion) — GitHub-style alert blockquotes.
//
// `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, and `> [!CAUTION]`
// are GitHub's own extension to blockquotes (not part of remark-gfm, which
// only covers tables/task-lists/strikethrough/autolinks/footnotes). Without
// this, the marker text rendered as inert, visible text inside a plain
// blockquote instead of a styled callout - exactly what a user who copies a
// README containing one would see break.
//
// This is a remark (mdast) plugin, not a rehype one, so it runs before
// remark-rehype: it rewrites the blockquote node's own `data.hName`/
// `data.hProperties` so remark-rehype emits a `<div class="markdown-alert
// markdown-alert-note">` in place of the default `<blockquote>`, and
// prepends a plain-text title paragraph naming the alert kind (no bundled
// SVG icons, since those would need their own sanitize-schema allowances
// for no real benefit here).

import { visit } from 'unist-util-visit';
import type { Root, Blockquote, Paragraph, Text } from 'mdast';
import type { Plugin } from 'unified';

const ALERT_KINDS = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
type AlertKind = (typeof ALERT_KINDS)[number];

const MARKER = new RegExp(`^\\[!(${ALERT_KINDS.join('|')})\\]\\s*`, 'i');

const titleCase = (kind: AlertKind): string => kind.charAt(0) + kind.slice(1).toLowerCase();

const remarkGithubAlerts: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'blockquote', (node: Blockquote) => {
    const firstParagraph = node.children[0];
    if (!firstParagraph || firstParagraph.type !== 'paragraph') return;
    const firstText = (firstParagraph as Paragraph).children[0];
    if (!firstText || firstText.type !== 'text') return;

    const match = MARKER.exec((firstText as Text).value);
    if (!match) return;
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
