import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import type { Root, RootContent } from 'hast';
import { parseMarkdownTree } from './parse-engine';
import { EMOJI_SHORTCODES } from './emoji-plugin';

const parser = unified().use(rehypeParse, { fragment: true }).use(rehypeSanitize, {
  ...defaultSchema,
  tagNames: ['div', 'span', 'p', 'br', 'a', 'i', 'em', 'b', 'strong', 'sup', 'sub'],
  strip: [...(defaultSchema.strip ?? []), 'style', 'iframe', 'object', 'embed', 'noscript'],
  attributes: { ...defaultSchema.attributes, div: [...(defaultSchema.attributes?.div ?? []), ['className', 'csl-entry', 'csl-left-margin', 'csl-right-inline']] },
});
const literalText = (text: string, punctuation: RegExp) => text.split(/(:[a-z0-9_+-]+:)/gi).map(part =>
  EMOJI_SHORTCODES[part.slice(1, -1).toLowerCase()] && /^:[a-z0-9_+-]+:$/i.test(part)
    ? `\`${part}\``
    : part.replace(punctuation, '\\$&'),
).join('').replace(/[\r\n\t]+/g, ' ');
const escapeText = (text: string) => literalText(text, /[\\`*_{}[\]()#+.!<>~^$|:-]/g);
const textOf = (node: RootContent): string => node.type === 'text' ? node.value : node.type === 'element' ? node.children.map(textOf).join('') : '';

export function plainCitationText(fragment: string): string {
  const text = /[<&]/.test(fragment)
    ? (parser.runSync(parser.parse(fragment)) as Root).children.map(textOf).join('')
    : fragment;
  return literalText(text, /[\\`*_\[\]<>~^$|]/g);
}

const inline = (node: RootContent): string => {
  if (node.type === 'text') return escapeText(node.value);
  if (node.type !== 'element') return '';
  const children = node.children.map(inline).join('');
  if (!children.trim()) return children;
  if (['i', 'em', 'b', 'strong'].includes(node.tagName)) {
    const delimiter = node.tagName === 'i' || node.tagName === 'em' ? '*' : '**';
    const [, before, content, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(children)!;
    return `${before}${delimiter}${content}${delimiter}${after}`;
  }
  if (node.tagName === 'sup' || node.tagName === 'sub') {
    const delimiter = node.tagName === 'sup' ? '^' : '~';
    return `${delimiter}${escapeText(textOf(node)).replace(/\s/g, '\\ ')}${delimiter}`;
  }
  if (node.tagName === 'a' && typeof node.properties.href === 'string') {
    try {
      const url = new URL(node.properties.href);
      if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        const href = url.href.replace(/[<>\\]/g, char => encodeURIComponent(char));
        return `[${children}](<${href}>)`;
      }
    } catch { /* An invalid address remains readable text. */ }
  }
  // CSL numeric labels and right-inline fields are separate divs.
  return node.tagName === 'div' || node.tagName === 'p' || node.tagName === 'br' ? `${children} ` : children;
};

export function prepareBibliography(htmlEntries: readonly string[]): { html: string[]; markdown: string } {
  const html: string[] = []; const entries: string[] = [];
  for (const fragment of htmlEntries) {
    const tree = parser.runSync(parser.parse(fragment)) as Root;
    const markdown = tree.children.map(inline).join('').trim();
    if (!markdown) continue;
    html.push(toHtml(tree));
    entries.push(markdown);
  }
  return { html, markdown: entries.length ? `## References\n\n${entries.join('\n\n')}\n` : '' };
}

/** The appendix must be a root section even if the authored final block is unfinished. */
export function appendReferencesMarkdown(source: string, references: string): string {
  if (!references) return source;
  const tree = parseMarkdownTree(source);
  const last = tree.children.at(-1);
  const start = last?.position?.start.offset;
  const end = last?.position?.end.offset;
  let prepared = source;
  if (start !== undefined && end !== undefined && last) {
    if (last.type === 'code') {
      const info = [last.lang, last.meta].filter(Boolean).join(' ');
      const character = info.includes('`') ? '~' : '`';
      const runs = last.value.match(character === '`' ? /`+/g : /~+/g) ?? [];
      const fence = character.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
      prepared = source.slice(0, start) + fence + info + '\n' + last.value + '\n' + fence + source.slice(end);
    } else if (last.type === 'math') {
      const runs = last.value.match(/\$+/g) ?? [];
      const fence = '$'.repeat(Math.max(2, ...runs.map(run => run.length + 1)));
      prepared = source.slice(0, start) + fence + (last.meta ?? '') + '\n' + last.value + '\n' + fence + source.slice(end);
    } else if (last.type === 'html') {
      // Raw source HTML is inert in the renderer. Omitting this final inert
      // block prevents its unfinished delimiter swallowing the appendix.
      prepared = source.slice(0, start) + source.slice(end);
    }
  }
  return prepared.replace(/\s*$/, '') + '\n\n' + references;
}
