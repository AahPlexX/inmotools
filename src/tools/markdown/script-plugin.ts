import type { Parent, Root, Text } from 'mdast';
import type { Data, Plugin } from 'unified';
import type { Tokenizer } from 'micromark-util-types';

interface Subscript extends Parent { type: 'subscript'; children: Text[] }
interface Superscript extends Parent { type: 'superscript'; children: Text[] }

declare module 'mdast' {
  interface PhrasingContentMap { subscript: Subscript; superscript: Superscript }
  interface RootContentMap { subscript: Subscript; superscript: Superscript }
}
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    workbenchSubscript: 'workbenchSubscript';
    workbenchSuperscript: 'workbenchSuperscript';
    workbenchScriptMarker: 'workbenchScriptMarker';
  }
}

type SyntaxExtension = NonNullable<Data['micromarkExtensions']>[number];
type FromMarkdownExtension = Exclude<NonNullable<Data['fromMarkdownExtensions']>[number], unknown[]>;

function tokenizer(marker: number, kind: 'workbenchSubscript' | 'workbenchSuperscript'): Tokenizer {
  return function (effects, ok, nok) {
    const thisPrevious = this.previous;
    let hasContent = false;
    return start;
    function start(code: number | null) {
      // Double marker runs belong to other syntax (notably strikethrough).
      if (code !== marker || thisPrevious === marker) return nok(code);
      effects.enter(kind);
      effects.enter('workbenchScriptMarker');
      effects.consume(code);
      effects.exit('workbenchScriptMarker');
      effects.enter('chunkString', { contentType: 'string' });
      return inside;
    }
    function inside(code: number | null) {
      if (code === null || code < 0 || code === 9 || code === 32) return nok(code);
      if (code === marker) {
        if (!hasContent) return nok(code);
        effects.exit('chunkString');
        effects.enter('workbenchScriptMarker');
        effects.consume(code);
        effects.exit('workbenchScriptMarker');
        effects.exit(kind);
        return after;
      }
      effects.consume(code);
      if (code === 92) return escape;
      hasContent = true;
      return inside;
    }
    function escape(code: number | null) {
      if (code === null || code < 0 || code === 9) return nok(code);
      effects.consume(code);
      hasContent = true;
      return inside;
    }
    function after(code: number | null) { return code === marker ? nok(code) : ok(code); }
  };
}

const syntax: SyntaxExtension = {
  text: {
    126: { name: 'workbenchSubscript', tokenize: tokenizer(126, 'workbenchSubscript') },
    94: { name: 'workbenchSuperscript', tokenize: tokenizer(94, 'workbenchSuperscript') },
  },
};

const fromMarkdown: FromMarkdownExtension = {
  enter: {
    workbenchSubscript(token) {
      this.enter({ type: 'subscript', children: [], data: { hName: 'sub' } }, token);
      this.buffer();
    },
    workbenchSuperscript(token) {
      this.enter({ type: 'superscript', children: [], data: { hName: 'sup' } }, token);
      this.buffer();
    },
  },
  exit: {
    workbenchSubscript(token) {
      const value = this.resume().replace(/\\ /g, ' ');
      const node = this.stack[this.stack.length - 1];
      if (node.type === 'subscript') node.children = [{ type: 'text', value }];
      this.exit(token);
    },
    workbenchSuperscript(token) {
      const value = this.resume().replace(/\\ /g, ' ');
      const node = this.stack[this.stack.length - 1];
      if (node.type === 'superscript') node.children = [{ type: 'text', value }];
      this.exit(token);
    },
  },
};

const remarkScripts: Plugin<[], Root> = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
};
export default remarkScripts;
