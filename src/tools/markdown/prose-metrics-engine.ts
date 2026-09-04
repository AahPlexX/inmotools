import type { ProseMetrics } from './markdown-types';

// Heuristic prose metrics computed over plain text extracted from a
// document (callers are expected to strip code blocks, math, and
// frontmatter before calling this - see stripNonProseSyntax below for the
// markdown-specific stripping this tool performs).
//
// These are explicitly labeled, both here and in the UI that consumes this
// engine, as rule-of-thumb estimates based on fixed heuristic constants, not
// validated readability-research instruments or facts about any individual
// reader.

const READING_WORDS_PER_MINUTE = 225;
const SPEAKING_WORDS_PER_MINUTE = 140;

const COMMON_SUFFIXES = ['es', 'ed', 'ing'];

const countSyllables = (word: string): number => {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return 0;

  let base = lower;
  for (const suffix of COMMON_SUFFIXES) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      base = base.slice(0, base.length - suffix.length);
      break;
    }
  }

  const groups = base.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (base.endsWith('e') && count > 1) count -= 1;
  return Math.max(count, 1);
};

const isProperNoun = (word: string, isSentenceStart: boolean): boolean => {
  const stripped = word.replace(/[^A-Za-z]/g, '');
  if (!stripped) return false;
  const isCapitalized = stripped[0] === stripped[0].toUpperCase() && stripped[0] !== stripped[0].toLowerCase();
  return isCapitalized && !isSentenceStart;
};

const WORD_PATTERN = /[A-Za-z][A-Za-z'-]*/g;
const SENTENCE_SPLIT_PATTERN = /[.!?]+(?:\s|$)/g;

export const stripNonProseSyntax = (source: string): string =>
  source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/^(---|\+\+\+)[\s\S]*?\1\s*$/m, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]/g, ' ');

export const computeProseMetrics = (source: string): ProseMetrics => {
  const text = stripNonProseSyntax(source);
  const characters = text.replace(/\s/g, '').length;

  const rawSentences = text.split(SENTENCE_SPLIT_PATTERN).map((part) => part.trim()).filter(Boolean);
  const sentences = Math.max(rawSentences.length, text.trim() ? 1 : 0);

  let words = 0;
  let complexWords = 0;

  for (const sentence of rawSentences.length ? rawSentences : [text]) {
    const matches = sentence.match(WORD_PATTERN) ?? [];
    matches.forEach((word, index) => {
      words += 1;
      const syllables = countSyllables(word);
      if (syllables >= 3 && !isProperNoun(word, index === 0)) complexWords += 1;
    });
  }

  const fogIndex = sentences > 0 && words > 0
    ? 0.4 * (words / sentences + 100 * (complexWords / words))
    : 0;

  return {
    words,
    sentences,
    characters,
    complexWords,
    readingMinutes: words / READING_WORDS_PER_MINUTE,
    speakingMinutes: words / SPEAKING_WORDS_PER_MINUTE,
    fogIndex,
  };
};
