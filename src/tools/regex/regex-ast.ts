import { RegExpParser } from '@eslint-community/regexpp';
import type { RegexExplanationNode, RegexFlavor } from './regex-types';

const labelGroup = (source: string) => {
  const named = /^\(\?<([^=!][^>]*)>/.exec(source);
  if (named) return `Named capture group <${named[1]}>`;
  if (source.startsWith('(?:')) return 'Non-capturing group';
  if (source.startsWith('(?=')) return 'Positive lookahead';
  if (source.startsWith('(?!')) return 'Negative lookahead';
  if (source.startsWith('(?<=')) return 'Positive lookbehind';
  if (source.startsWith('(?<!')) return 'Negative lookbehind';
  if (source.startsWith('(?>')) return 'Atomic group';
  if (source.startsWith('(?|')) return 'Branch-reset group';
  return 'Capture group';
};

const token = (pattern: string, start: number, end: number, kind: string, label: string): RegexExplanationNode => ({
  id: `${kind}-${start}-${end}`,
  kind,
  label,
  source: pattern.slice(start, end),
  start,
  end,
  children: [],
});

const tokenize = (pattern: string): RegexExplanationNode[] => {
  const nodes: RegexExplanationNode[] = [];
  let index = 0;
  while (index < pattern.length) {
    const start = index;
    const current = pattern[index]!;
    if (current === '\\') {
      index += 2;
      if (pattern[index - 1] === 'p' && pattern[index] === '{') {
        while (index < pattern.length && pattern[index] !== '}') index += 1;
        index += index < pattern.length ? 1 : 0;
      }
      nodes.push(token(pattern, start, Math.min(index, pattern.length), 'Escape', `Escape ${pattern.slice(start, Math.min(index, pattern.length))}`));
      continue;
    }
    if (current === '[') {
      index += 1;
      let escaped = false;
      while (index < pattern.length) {
        const char = pattern[index++]!;
        if (!escaped && char === ']') break;
        escaped = !escaped && char === '\\';
        if (char !== '\\') escaped = false;
      }
      nodes.push(token(pattern, start, index, 'CharacterClass', 'Character class'));
      continue;
    }
    if (current === '(') {
      const probes = ['(?<=', '(?<!', '(?<', '(?:', '(?=', '(?!', '(?>', '(?|'];
      const probe = probes.find((value) => pattern.startsWith(value, index)) ?? '(';
      if (probe === '(?<') {
        const close = pattern.indexOf('>', index + 3);
        index = close >= 0 ? close + 1 : index + 3;
      } else index += probe.length;
      nodes.push(token(pattern, start, index, 'Group', labelGroup(pattern.slice(start, index))));
      continue;
    }
    const quantifier = /^(?:\{\d+(?:,\d*)?\}|[+*?])\??\+?/.exec(pattern.slice(index));
    if (quantifier) {
      index += quantifier[0].length;
      nodes.push(token(pattern, start, index, 'Quantifier', `Quantifier ${quantifier[0]}`));
      continue;
    }
    if (current === '|') { index += 1; nodes.push(token(pattern, start, index, 'Alternation', 'Alternation')); continue; }
    if (current === '^' || current === '$') { index += 1; nodes.push(token(pattern, start, index, 'Assertion', current === '^' ? 'Start anchor' : 'End anchor')); continue; }
    if (current === ')') { index += 1; nodes.push(token(pattern, start, index, 'GroupEnd', 'End group')); continue; }
    let end = index + 1;
    while (end < pattern.length && !/[\\[(){}+*?|^$]/.test(pattern[end]!)) end += 1;
    index = end;
    nodes.push(token(pattern, start, end, 'Literal', `Literal ${JSON.stringify(pattern.slice(start, end))}`));
  }
  return nodes;
};

export const buildRegexExplanation = (pattern: string, flags: string, flavor: RegexFlavor): RegexExplanationNode => {
  if (flavor === 'ecmascript') {
    new RegExpParser().parsePattern(pattern, 0, pattern.length, { unicode: flags.includes('u'), unicodeSets: flags.includes('v') });
  }
  return { id: 'pattern-root', kind: 'Pattern', label: flavor === 'ecmascript' ? 'ECMAScript parsed pattern' : `${flavor} structural view`, source: pattern, start: 0, end: pattern.length, children: tokenize(pattern) };
};
