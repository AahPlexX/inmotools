import { describe, expect, it } from 'vitest';
import {
  BASELINE_READING_WPM,
  BASELINE_SPEAKING_WPM,
  computeReadability,
  countComplexWords,
  countLetters,
  countVowelGroups,
  describeGradeLevel,
  describeReadingEase,
  estimateSyllables,
  hasLetters,
} from '../../src/tools/sightline/syllable-engine';

const syllableCases: readonly [string, number][] = [
  ['cat', 1],
  ['table', 2],
  ['little', 2],
  ['mile', 1],
  ['style', 1],
  ['whale', 1],
  ['make', 1],
  ['worked', 1],
  ['wanted', 2],
  ['needed', 2],
  ['boxes', 2],
  ['makes', 1],
  ['pages', 2],
  ['faces', 2],
  ['houses', 2],
  ['these', 1],
  ['cities', 2],
  ['beautiful', 3],
  ['action', 2],
  ['nation', 2],
  ['million', 2],
  ['opinion', 3],
  ['are', 1],
  ['hundred', 2],
  ['business', 2],
  ['people', 2],
  ['running', 2],
  ['apples', 2],
  ['abilities', 4],
  ['cycle', 2],
  ['simple', 2],
  ['giggle', 2],
  ['extremely', 3],
  ['freed', 1],
  ['agreed', 2],
];

describe('syllable estimation', () => {
  it.each(syllableCases)('counts "%s" as %i syllable(s)', (word, expected) => {
    expect(estimateSyllables(word)).toBe(expected);
  });

  it('counts each part of a hyphenated compound', () => {
    expect(estimateSyllables('state-of-the-art')).toBe(4);
    expect(estimateSyllables('self-driving')).toBe(3);
  });

  it('returns zero for tokens with no letters', () => {
    expect(estimateSyllables('12,345')).toBe(0);
    expect(estimateSyllables('\u2014')).toBe(0);
  });

  it('never returns zero for a word with letters', () => {
    expect(estimateSyllables('a')).toBe(1);
    expect(estimateSyllables('e')).toBe(1);
  });

  it('counts vowel groups, treating y after a consonant as a vowel', () => {
    expect(countVowelGroups('rhythm')).toBe(1);
    expect(countVowelGroups('beyond')).toBe(2);
    expect(countVowelGroups('queue')).toBe(1);
  });

  it('distinguishes symbolic tokens from lettered ones', () => {
    expect(hasLetters('42')).toBe(false);
    expect(countLetters('p. 42')).toBe(1);
    expect(hasLetters('ii')).toBe(true);
  });
});

describe('complex-word counting', () => {
  it('counts three-syllable words by default', () => {
    expect(countComplexWords(['beautiful', 'morning', 'cat', 'educational'])).toBe(2);
  });

  it('honours a custom syllable threshold', () => {
    expect(countComplexWords(['beautiful', 'morning'], { minimumSyllables: 2 })).toBe(2);
  });

  it('excludes known proper nouns supplied by the caller', () => {
    const properNouns = new Set(['antananarivo']);
    expect(countComplexWords(['Antananarivo', 'helicopter'], { properNouns })).toBe(1);
  });

  it('ignores tokens without letters', () => {
    expect(countComplexWords(['42', '...', ''])).toBe(0);
  });
});

describe('readability metrics', () => {
  const input = {
    text: 'The cat sat on the mat. The dog ran away quickly.',
    words: 12,
    sentences: 2,
    syllables: 15,
    complexWords: 0,
    characters: 48,
    charactersNoSpaces: 40,
    paragraphs: 1,
  };

  it('derives minutes from the published reading and speaking rates', () => {
    const metrics = computeReadability(input, 6);
    expect(metrics.readingMinutes).toBeCloseTo(12 / BASELINE_READING_WPM, 8);
    expect(metrics.speakingMinutes).toBeCloseTo(12 / BASELINE_SPEAKING_WPM, 8);
  });

  it('computes the Flesch reading ease formula exactly', () => {
    const metrics = computeReadability(input, 6);
    const expected = 206.835 - 1.015 * (12 / 2) - 84.6 * (15 / 12);
    expect(metrics.fleschReadingEase).toBeCloseTo(expected, 8);
  });

  it('computes the Flesch-Kincaid grade and Gunning fog formulas exactly', () => {
    const metrics = computeReadability(input, 8);
    expect(metrics.fleschKincaidGrade).toBeCloseTo(0.39 * (12 / 2) + 11.8 * (15 / 12) - 15.59, 8);
    expect(metrics.gunningFog).toBeCloseTo(0.4 * (12 / 2 + 100 * (0 / 12)), 8);
    expect(metrics.longestSentenceWords).toBe(8);
  });

  it('does not divide by zero for an empty document', () => {
    const metrics = computeReadability(
      { text: '', words: 0, sentences: 0, syllables: 0, complexWords: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0 },
      0,
    );
    expect(Number.isFinite(metrics.fleschReadingEase)).toBe(true);
    expect(Number.isFinite(metrics.fleschKincaidGrade)).toBe(true);
    expect(Number.isFinite(metrics.gunningFog)).toBe(true);
    expect(metrics.readingMinutes).toBe(0);
  });

  it('describes scores with the published band labels', () => {
    expect(describeReadingEase(95)).toBe('very easy');
    expect(describeReadingEase(70)).toBe('fairly easy');
    expect(describeReadingEase(45)).toBe('difficult');
    expect(describeGradeLevel(8.4)).toBe('grade 8');
    expect(describeGradeLevel(Number.NaN)).toBe('unknown');
  });
});
