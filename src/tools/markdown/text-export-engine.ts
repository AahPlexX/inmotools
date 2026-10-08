import type { Definition, Nodes, Root as MdastRoot } from 'mdast';

// Plain text export (MDW-R81): the document's words with every Markdown mark removed.
// The walker follows the same prepared syntax tree as the DOCX and AST exports, so a
// formula cell shows its computed value and a citation its formatted text.
//
// Conventions (recorded in the spec under "Intent not recorded"):
//   - blocks are separated by one blank line;
//   - an unordered item starts with the neutral bullet "•", an ordered item with its number
//     and a full stop, a task item with "[ ]" or "[x]";
//   - a blockquote and a definition description are indented four spaces;
//   - a link keeps its address in brackets after its text, unless the text already is the address;
//   - an image becomes its alternative text;
//   - a table row is one line with tab-separated cells;
//   - code, math and diagram source are kept exactly as written, without fences;
//   - metadata, inert HTML, link definitions and thematic breaks produce no text;
//   - footnote references become [1], [2] in the order they first appear and the notes follow the
//     document in that order; a note nothing refers to comes last.

type Node = Nodes | { type: string; [key: string]: unknown };
type Children = readonly Node[];

interface Context {
  readonly footnotes: ReadonlyMap<string, number>;
  readonly definitions: ReadonlyMap<string, Definition>;
}

const INDENT = '    ';
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]\s*/i;

const identifierKey = (identifier: string): string => identifier.trim().replace(/\s+/g, ' ').toUpperCase();

const childrenOf = (node: Node): Children => ('children' in node && Array.isArray(node.children) ? (node.children as Children) : []);

const valueOf = (node: Node): string | undefined => ('value' in node && typeof node.value === 'string' ? node.value : undefined);

const withAddress = (label: string, url: string): string => {
  const text = label.trim();
  const bare = url.replace(/^mailto:/i, '');
  if (!url) return text;
  if (!text) return bare;
  return text === url || text === bare ? text : `${text} (${url})`;
};

const inline = (nodes: Children, context: Context): string =>
  nodes.map((node): string => {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
      case 'inlineMath':
        return valueOf(node) ?? '';
      case 'break':
        return '\n';
      case 'html':
        return /^<br\s*\/?>$/i.test((valueOf(node) ?? '').trim()) ? '\n' : '';
      case 'link':
        return withAddress(inline(childrenOf(node), context), String(node.url ?? ''));
      case 'linkReference': {
        const label = inline(childrenOf(node), context);
        const definition = context.definitions.get(identifierKey(String(node.identifier ?? '')));
        return definition ? withAddress(label, definition.url) : label;
      }
      case 'image':
      case 'imageReference':
        return String(node.alt ?? '').trim();
      case 'footnoteReference': {
        const identifier = String(node.identifier ?? '');
        return `[${context.footnotes.get(identifierKey(identifier)) ?? identifier}]`;
      }
      default: {
        const children = childrenOf(node);
        return children.length > 0 ? inline(children, context) : valueOf(node) ?? '';
      }
    }
  }).join('');

const prefixLines = (text: string, first: string, rest: string): string =>
  text.split('\n').map((line, index) => (line === '' ? '' : `${index === 0 ? first : rest}${line}`)).join('\n');

const alertTitle = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();

// A blockquote opened with a GitHub-style alert marker reads as a labelled paragraph.
const withAlertTitle = (children: Children): Children => {
  const first = children[0];
  if (!first || first.type !== 'paragraph') return children;
  const lead = childrenOf(first)[0];
  const match = lead && lead.type === 'text' ? ALERT_MARKER.exec(valueOf(lead) ?? '') : null;
  if (!lead || !match) return children;
  const remainder = (valueOf(lead) ?? '').slice(match[0].length);
  const rest = [...childrenOf(first).slice(1)];
  if (remainder) rest.unshift({ type: 'text', value: remainder });
  const title: Node = { type: 'paragraph', children: [{ type: 'text', value: alertTitle(match[1]!) }] };
  return rest.length > 0 ? [title, { ...first, children: rest } as Node, ...children.slice(1)] : [title, ...children.slice(1)];
};

const blocks = (nodes: Children, context: Context, separator = '\n\n'): string =>
  nodes.map((node) => block(node, context)).filter((text) => text.trim() !== '').join(separator);

const listItem = (item: Node, marker: string, context: Context): string => {
  const checked = 'checked' in item ? item.checked : null;
  const task = checked === true ? '[x] ' : checked === false ? '[ ] ' : '';
  const body = blocks(childrenOf(item), context, 'spread' in item && item.spread === true ? '\n\n' : '\n');
  return prefixLines(`${task}${body}`, marker, ' '.repeat(marker.length));
};

const block = (node: Node, context: Context): string => {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'defListTerm':
    case 'workbenchSummary':
      return inline(childrenOf(node), context).trim();
    case 'code':
    case 'math':
      return valueOf(node) ?? '';
    case 'blockquote':
      return prefixLines(blocks(withAlertTitle(childrenOf(node)), context), INDENT, INDENT);
    case 'list': {
      const ordered = node.ordered === true;
      const start = typeof node.start === 'number' ? node.start : 1;
      return childrenOf(node).map((item, index) => listItem(item, ordered ? `${start + index}. ` : '• ', context)).join('\n');
    }
    case 'table':
      return childrenOf(node)
        .map((row) => childrenOf(row).map((cell) => inline(childrenOf(cell), context).replace(/\s*\n\s*/g, ' ').trim()).join('\t'))
        .join('\n');
    case 'defList':
      return childrenOf(node).map((child) => block(child, context)).filter(Boolean).join('\n');
    case 'defListDescription':
      return prefixLines(blocks(childrenOf(node), context), INDENT, INDENT);
    case 'thematicBreak':
    case 'html':
    case 'yaml':
    case 'toml':
    case 'definition':
    case 'footnoteDefinition':
      return '';
    default: {
      const children = childrenOf(node);
      return children.length > 0 ? blocks(children, context) : valueOf(node) ?? '';
    }
  }
};

const collect = (node: Node, definitions: Map<string, Definition>): void => {
  if (node.type === 'definition' && !definitions.has(identifierKey(String(node.identifier ?? '')))) {
    definitions.set(identifierKey(String(node.identifier ?? '')), node as Definition);
  }
  childrenOf(node).forEach((child) => collect(child, definitions));
};

const referencedNotes = (nodes: Children, defined: ReadonlyMap<string, Node>, order: string[]): void => {
  for (const node of nodes) {
    if (node.type === 'footnoteReference') {
      const key = identifierKey(String(node.identifier ?? ''));
      if (defined.has(key) && !order.includes(key)) order.push(key);
    }
    referencedNotes(childrenOf(node), defined, order);
  }
};

export const buildPlainText = (tree: MdastRoot): string => {
  const definitions = new Map<string, Definition>();
  collect(tree, definitions);
  const defined = new Map<string, Node>();
  for (const node of tree.children) {
    if (node.type === 'footnoteDefinition' && !defined.has(identifierKey(node.identifier))) defined.set(identifierKey(node.identifier), node);
  }
  const order: string[] = [];
  referencedNotes(tree.children.filter((node) => node.type !== 'footnoteDefinition'), defined, order);
  // A note can refer to another note, so keep reading notes in order until none is new.
  for (let index = 0; index < order.length; index += 1) referencedNotes(childrenOf(defined.get(order[index]!)!), defined, order);
  for (const key of defined.keys()) if (!order.includes(key)) order.push(key);
  const notes = order.map((key) => defined.get(key)!);
  const footnotes = new Map<string, number>();
  order.forEach((key, index) => footnotes.set(key, index + 1));
  const context: Context = { footnotes, definitions };

  const body = blocks(tree.children, context);
  const footnoteText = notes
    .map((note, index) => prefixLines(blocks(childrenOf(note), context, ' '), `[${index + 1}] `, ' '.repeat(String(index + 1).length + 3)))
    .filter((text) => text.trim() !== '')
    .join('\n');
  const text = [body, footnoteText].filter((part) => part !== '').join('\n\n');
  return text === '' ? '' : `${text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')}\n`;
};
