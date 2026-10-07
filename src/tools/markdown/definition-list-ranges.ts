import { parse, postprocess, preprocess } from 'micromark';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { defList } from 'micromark-extension-definition-list';
import type { Token } from 'micromark-util-types';
import { scriptSyntax } from './script-plugin';
import { abbreviationSyntax } from './abbreviation-plugin';

/** Tokenize without the preview's DOM-dependent mdast character decoder. */
export function definitionListRanges(source: string) {
  const events = postprocess(parse({ extensions: [gfm({ singleTilde: false }), math(), scriptSyntax, abbreviationSyntax, defList] })
    .document().write(preprocess()(source, 'utf8', true)));
  const containers = new Set(['blockQuote', 'listOrdered', 'listUnordered', 'defList']);
  const stack: Token[] = [];
  const candidates: Token[] = [];
  for (const [kind, token] of events) {
    if (!containers.has(token.type)) continue;
    if (kind === 'enter') {
      stack.push(token);
      if (token.type === 'defList') candidates.push(stack[0]);
    } else {
      if (stack.pop() !== token) throw new Error('Cannot safely preserve definition-list containers.');
    }
  }
  const ranges = candidates.map(token => ({ start: token.start.offset, end: token.end.offset }))
    .sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
