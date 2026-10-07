import type { Nodes, Root } from 'mdast';
import { syllable } from 'syllable';
import { parseMarkdown } from './parse-engine';
import type { ProseMetrics } from './markdown-types';

const READING_WORDS_PER_MINUTE = 225;
const SPEAKING_WORDS_PER_MINUTE = 140;
const BLOCKS = new Set(['paragraph', 'heading', 'tableCell', 'defListTerm', 'workbenchSummary']);
const EXCLUDED = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html', 'image', 'imageReference', 'definition', 'abbreviationDefinition', 'footnoteReference']);
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-‐‑][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;

/** Extract authored prose, reusing the workspace's native tree when supplied. */
export const stripNonProseSyntax = (source: string, tree: Root = parseMarkdown(source).tree as Root): string => {
  const pieces: string[] = [];
  const stack: (Nodes | string)[] = [tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (typeof node === 'string') { pieces.push(node); continue; }
    if (EXCLUDED.has(node.type)) { pieces.push(' '); continue; }
    if (node.type === 'workbenchSummary' && !node.data?.proseAuthored) continue;
    if ((node.type === 'link' || node.type === 'linkReference') && node.children.length === 1 && node.children[0].type === 'text' &&
      ((node.type === 'link' && (node.children[0].value === node.url || `mailto:${node.children[0].value}` === node.url)) || /^(?:https?:\/\/|www\.|mailto:)[^\s]+$/i.test(node.children[0].value))) {
      pieces.push(' '); continue;
    }
    if (node.type === 'text') { pieces.push(node.value.replace(/[\r\n]+/g, ' ')); continue; }
    if (node.type === 'break') { pieces.push(' '); continue; }
    if ('children' in node) {
      const block = BLOCKS.has(node.type);
      if (block) { pieces.push('\n'); stack.push('\n'); }
      for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index] as Nodes);
    }
  }
  return pieces.join('');
};

const isProperNoun = (word: string, sentenceStart: boolean): boolean =>
  !sentenceStart && /^[A-Z]/.test(word);

export const computeProseMetrics = (source: string, tree?: Root): ProseMetrics => {
  const text = stripNonProseSyntax(source, tree);
  const characters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  // Terminal punctuation may precede closing quotes; decimal dots remain inside a sentence.
  const parts = text.split(/\n+|[!?]+["'’”\])}]*(?=\s|$)|\.+["'’”\])}]*(?=\s|$)/u);
  let words = 0; let sentences = 0; let syllables = 0; let complexWords = 0;
  let supported = true;
  const syllableCounts = new Map<string, number>();
  for (const part of parts) {
    const matches = part.match(WORD_PATTERN) ?? [];
    if (!matches.length) continue;
    sentences++;
    for (let index = 0; index < matches.length; index++) {
      const word = matches[index];
      words++;
      const normalized = word.replaceAll('’', "'").replace(/[‐‑]/g, '-').toLowerCase();
      const english = normalized.length <= 128 && /^[a-z]+(?:['\-][a-z]+)*$/.test(normalized);
      supported &&= english;
      let count = 0;
      if (english) {
        count = syllableCounts.get(normalized) ?? syllable(normalized);
        syllableCounts.set(normalized, count);
      }
      syllables += count;
      if (count >= 3 && !isProperNoun(word, index === 0)) complexWords++;
    }
  }
  const available = supported && words > 0 && sentences > 0;
  return {
    words, sentences, characters, letters, syllables, complexWords,
    readingMinutes: words / READING_WORDS_PER_MINUTE,
    speakingMinutes: words / SPEAKING_WORDS_PER_MINUTE,
    fogIndex: sentences && words ? 0.4 * (words / sentences + 100 * complexWords / words) : 0,
    fleschKincaidGrade: available ? 0.39 * words / sentences + 11.8 * syllables / words - 15.59 : null,
    colemanLiauIndex: available ? 0.0588 * letters / words * 100 - 0.296 * sentences / words * 100 - 15.8 : null,
  };
};
