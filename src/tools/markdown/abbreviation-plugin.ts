import type { Literal, Parent, Root, Text } from 'mdast';
import type { Data, Plugin } from 'unified';
import type { Tokenizer } from 'micromark-util-types';

interface AbbreviationDefinition extends Literal { type: 'abbreviationDefinition'; label: string; value: string }
interface Abbreviation extends Parent { type: 'abbreviation'; title: string; children: Text[] }
declare module 'mdast' {
  interface RootContentMap { abbreviationDefinition: AbbreviationDefinition; abbreviation: Abbreviation }
  interface PhrasingContentMap { abbreviation: Abbreviation }
}
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    workbenchAbbreviationDefinition: 'workbenchAbbreviationDefinition';
    workbenchAbbreviationLabel: 'workbenchAbbreviationLabel';
    workbenchAbbreviationTitle: 'workbenchAbbreviationTitle';
    workbenchAbbreviationMarker: 'workbenchAbbreviationMarker';
  }
}
type SyntaxExtension = NonNullable<Data['micromarkExtensions']>[number];
type FromMarkdownExtension = Exclude<NonNullable<Data['fromMarkdownExtensions']>[number], unknown[]>;

const tokenize: Tokenizer = function (effects, ok, nok) {
  let hasLabel = false;
  let hasTitleChunk = false;
  return start;
  function start(code: number | null) {
    if (code !== 42) return nok(code);
    effects.enter('workbenchAbbreviationDefinition');
    effects.enter('workbenchAbbreviationMarker');
    effects.consume(code);
    return bracket;
  }
  function bracket(code: number | null) {
    if (code !== 91) return nok(code);
    effects.consume(code);
    effects.exit('workbenchAbbreviationMarker');
    effects.enter('workbenchAbbreviationLabel');
    effects.enter('chunkString', { contentType: 'string' });
    return label;
  }
  function label(code: number | null) {
    if (code === null || code < 0 || code === 91) return nok(code);
    if (code === 93) {
      if (!hasLabel) return nok(code);
      effects.exit('chunkString');
      effects.exit('workbenchAbbreviationLabel');
      effects.enter('workbenchAbbreviationMarker');
      effects.consume(code);
      return colon;
    }
    effects.consume(code);
    if (code === 92) return escapedLabel;
    hasLabel = true;
    return label;
  }
  function escapedLabel(code: number | null) {
    if (code === null || code < 0) return nok(code);
    effects.consume(code);
    hasLabel = true;
    return label;
  }
  function colon(code: number | null) {
    if (code !== 58) return nok(code);
    effects.consume(code);
    effects.exit('workbenchAbbreviationMarker');
    return title;
  }
  function title(code: number | null) {
    if (code === null || code === -3 || code === -4 || code === -5) {
      if (hasTitleChunk) {
        effects.exit('chunkString');
        effects.exit('workbenchAbbreviationTitle');
      }
      effects.exit('workbenchAbbreviationDefinition');
      return ok(code);
    }
    if (!hasTitleChunk) {
      hasTitleChunk = true;
      effects.enter('workbenchAbbreviationTitle');
      effects.enter('chunkString', { contentType: 'string' });
    }
    effects.consume(code);
    return title;
  }
};

const syntax: SyntaxExtension = { flow: { 42: { name: 'workbenchAbbreviationDefinition', tokenize } } };
const fromMarkdown: FromMarkdownExtension = {
  enter: {
    workbenchAbbreviationDefinition(token) { this.enter({ type: 'abbreviationDefinition', label: '', value: '' }, token); },
    workbenchAbbreviationLabel() { this.buffer(); },
    workbenchAbbreviationTitle() { this.buffer(); },
  },
  exit: {
    workbenchAbbreviationLabel() {
      const value = this.resume();
      const node = this.stack[this.stack.length - 1];
      if (node.type === 'abbreviationDefinition') node.label = value;
    },
    workbenchAbbreviationTitle() {
      const value = this.resume().trim();
      const node = this.stack[this.stack.length - 1];
      if (node.type === 'abbreviationDefinition') node.value = value;
    },
    workbenchAbbreviationDefinition(token) { this.exit(token); },
  },
};

interface Trie { children: Map<string, Trie>; label?: string }
const boundary = (character: string | undefined) => character === undefined || /[\p{P}\p{Z}\s$+<=>^`|~]/u.test(character);

function applyAbbreviations(tree: Root) {
  const definitions = new Map<string, string>();
  function collect(node: Parent) {
    node.children = node.children.filter((child) => {
      if (child.type === 'abbreviationDefinition') {
        if (!definitions.has(child.label)) definitions.set(child.label, child.value);
        return false;
      }
      if ('children' in child) collect(child as Parent);
      return true;
    });
  }
  collect(tree);
  if (!definitions.size) return;
  const trie: Trie = { children: new Map() };
  for (const label of definitions.keys()) {
    let branch = trie;
    for (const character of label) {
      if (!branch.children.has(character)) branch.children.set(character, { children: new Map() });
      branch = branch.children.get(character)!;
    }
    branch.label = label;
  }
  function replace(node: Parent) {
    if (['abbreviation', 'subscript', 'superscript'].includes(node.type)) return;
    node.children = node.children.flatMap<Parent['children'][number]>((child) => {
      if ('children' in child) replace(child as Parent);
      if (child.type !== 'text') return [child];
      const characters = Array.from(child.value);
      const result: (Text | Abbreviation)[] = [];
      let start = 0;
      for (let index = 0; index < characters.length; index++) {
        if (!boundary(characters[index - 1])) continue;
        let branch = trie;
        let match: { label: string; end: number } | undefined;
        for (let end = index; end < characters.length; end++) {
          const next = branch.children.get(characters[end]);
          if (!next) break;
          branch = next;
          if (branch.label !== undefined && boundary(characters[end + 1])) match = { label: branch.label, end: end + 1 };
        }
        if (!match) continue;
        if (index > start) result.push({ type: 'text', value: characters.slice(start, index).join('') });
        const title = definitions.get(match.label)!;
        result.push({ type: 'abbreviation', title, children: [{ type: 'text', value: match.label }], data: { hName: 'abbr', hProperties: title ? { title } : {} } });
        index = match.end - 1;
        start = match.end;
      }
      if (!result.length) return [child];
      if (start < characters.length) result.push({ type: 'text', value: characters.slice(start).join('') });
      return result;
    });
  }
  replace(tree);
}

const remarkAbbreviations: Plugin<[], Root> = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
  return applyAbbreviations;
};
export default remarkAbbreviations;
