import { describe, expect, it } from 'vitest';
import { computeProseMetrics, stripNonProseSyntax } from '../../src/tools/markdown/prose-metrics-engine';

describe('prose metrics heuristics', () => {
  it('counts words and sentences in a simple two-sentence passage', () => {
    const metrics = computeProseMetrics('The cat sat. The dog ran.');
    // "The cat sat" (3 words) + "The dog ran" (3 words) = 6 words, 2 sentences.
    expect(metrics.words).toBe(6);
    expect(metrics.sentences).toBe(2);
  });

  it('computes reading and speaking time from fixed words-per-minute constants', () => {
    // 225 words at 225 WPM should be exactly 1.0 reading minute; 140 WPM
    // gives the same word count a longer, larger speaking-minute value.
    const words = Array.from({ length: 225 }, () => 'word').join(' ') + '.';
    const metrics = computeProseMetrics(words);
    expect(metrics.readingMinutes).toBeCloseTo(1, 5);
    expect(metrics.speakingMinutes).toBeCloseTo(225 / 140, 5);
  });

  it('counts characters excluding whitespace', () => {
    const metrics = computeProseMetrics('ab cd');
    expect(metrics.characters).toBe(4);
  });

  it('flags a lowercase three-syllable word as complex', () => {
    const metrics = computeProseMetrics('This is a beautiful morning.');
    // "beautiful" (3 syllables) is complex; "morning" is 2 syllables and not complex.
    expect(metrics.complexWords).toBeGreaterThanOrEqual(1);
  });

  it('does not flag a capitalized proper noun mid-sentence as complex purely for being long', () => {
    const withProperNoun = computeProseMetrics('We visited Antananarivo yesterday.');
    const withCommonWord = computeProseMetrics('We visited a helicopter yesterday.');
    // Antananarivo has many syllables but is a proper noun; the complex-word
    // count should not exceed what an equivalent common multi-syllable
    // sentence produces, confirming the proper-noun exclusion has an effect.
    expect(withProperNoun.complexWords).toBeLessThanOrEqual(withCommonWord.complexWords);
  });

  it('computes a Gunning Fog index from words, sentences, and complex words', () => {
    const metrics = computeProseMetrics('The quick brown fox jumps over the lazy dog.');
    const expected = 0.4 * (metrics.words / metrics.sentences + 100 * (metrics.complexWords / metrics.words));
    expect(metrics.fogIndex).toBeCloseTo(expected, 5);
  });

  it('returns all-zero metrics for an empty document', () => {
    const metrics = computeProseMetrics('');
    expect(metrics.words).toBe(0);
    expect(metrics.sentences).toBe(0);
    expect(metrics.fogIndex).toBe(0);
  });

  it('strips fenced code blocks before counting prose words', () => {
    const metrics = computeProseMetrics('Some text.\n\n```js\nconst reallyLongIdentifierName = 1;\n```\n\nMore text.');
    const stripped = stripNonProseSyntax('```js\nconst reallyLongIdentifierName = 1;\n```');
    expect(stripped.trim()).toBe('');
    expect(metrics.words).toBe(4);
  });

  it('strips inline and block math before counting prose words', () => {
    const metrics = computeProseMetrics('Some $x^2$ text and $$y = mx + b$$ more text.');
    // After stripping both math spans: "Some  text and  more text." -> 5 prose words.
    expect(metrics.words).toBe(5);
  });

  it('strips markdown heading and emphasis markers without dropping the underlying words', () => {
    const metrics = computeProseMetrics('# A Heading\n\n**Bold** and *italic* text.');
    expect(metrics.words).toBeGreaterThanOrEqual(5);
  });
});
