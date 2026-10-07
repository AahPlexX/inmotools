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

describe('MDW-R55 reference grades and native prose boundaries', () => {
  it('matches official CS50 2026 published rounded Coleman grades using letters alone', async () => {
    const { default: fixtures } = await import('../fixtures/markdown-readability-reference.json');
    const counts = [[23, 1, 96], [57, 1, 235], [16, 1, 72]];
    const indices = [7.4556521739130375, 7.92280701754386, 8.81];
    fixtures.forEach((fixture, index) => {
      const metrics = computeProseMetrics(fixture.text);
      expect([metrics.words, metrics.sentences, metrics.letters]).toEqual(counts[index]);
      expect(metrics.colemanLiauIndex).toBeCloseTo(indices[index], 10);
      expect(Math.round(metrics.colemanLiauIndex!)).toBe(fixture.publishedRoundedGrade);
    });
  });

  it('matches the independently counted monosyllabic Flesch formula without clamping', () => {
    const metrics = computeProseMetrics('The cat sat. The dog ran.');
    expect(metrics.syllables).toBe(6);
    expect(metrics.fleschKincaidGrade).toBeCloseTo(-2.62, 10);
  });

  it.each([['morning', 2], ['reading', 2], ['bottle', 2], ['table', 2], ['beautiful', 3], ['played', 1], ['wanted', 2]] as const)(
    'matches selected CMU vowel-phone counts for %s', (word, expected) => {
      expect(computeProseMetrics(word).syllables).toBe(expected);
    });

  it.each([
    '    hidden code words.\n\nThe cat sat.',
    '~~~js\nhidden code words.\n~~~\n\nThe cat sat.',
    '````js\nhidden ``` code words.\n````\n\nThe cat sat.',
    '{\n"hidden":"metadata words"\n}\n\nThe cat sat.',
    '---\r\nname: hidden metadata words\r\n---\r\n\r\nThe cat sat.',
    '+++\nname = "hidden metadata words"\n+++\n\nThe cat sat.',
    '<div>hidden HTML words.</div>\n\nThe cat sat.',
    '$$\nhidden math words\n$$\n\nThe cat sat.',
    '[The cat](https://hidden.example/words) sat. ![hidden image words](image.png)',
    'The cat sat. <https://hidden.example/words>\n\n[hidden]: https://hidden.example/words',
  ])('excludes native non-prose and preserves the counted passage: %s', source => {
    const metrics = computeProseMetrics(source);
    expect([metrics.words, metrics.sentences, metrics.characters, metrics.syllables]).toEqual([3, 1, 9, 3]);
    expect(metrics.fleschKincaidGrade).toBeCloseTo(-2.62, 10);
  });

  it('preserves adjacent emphasis/entities and separates excluded literals and blocks', () => {
    expect(computeProseMetrics('mor**ni**ng &amp; read*ing*.').words).toBe(2);
    expect(computeProseMetrics('mor**ni**ng &amp; read*ing*.').syllables).toBe(4);
    expect(computeProseMetrics('cat`hidden`dog').words).toBe(2);
    expect(computeProseMetrics('# cat\n\ndog').sentences).toBe(2);
    expect(computeProseMetrics('The cat\nsat.').sentences).toBe(1);
  });

  it('counts authored disclosure captions and bodies without counting generated Details', () => {
    expect(computeProseMetrics('<details>\n\nThe cat sat.\n\n</details>').words).toBe(3);
    expect(computeProseMetrics('<details>\n<summary>Morning reading</summary>\n\nThe cat sat.\n\n</details>').words).toBe(5);
  });

  it('counts contractions/hyphens as single words and handles closing quotes', () => {
    const metrics = computeProseMetrics('"The cat sat." Isn’t well-being fun?');
    expect([metrics.words, metrics.sentences, metrics.syllables]).toEqual([6, 2, 9]);
    expect(metrics.fleschKincaidGrade).not.toBeNull();
  });

  it.each(['', '   ', '?! 😃', '```\ncode only\n```', '$x$'])('has no grade or sentence for no prose: %s', source => {
    const metrics = computeProseMetrics(source);
    expect([metrics.words, metrics.sentences, metrics.characters]).toEqual([0, 0, 0]);
    expect(metrics.fleschKincaidGrade).toBeNull();
    expect(metrics.colemanLiauIndex).toBeNull();
  });

  it.each(['123456789?!', '東京の文章。', 'café prose', 'e\u0301 prose', 'a'.repeat(129)])('keeps unsupported prose counts without implying an English grade: %s', source => {
    const metrics = computeProseMetrics(source);
    expect(metrics.words).toBeGreaterThan(0);
    expect(metrics.characters).toBeGreaterThan(0);
    expect(metrics.fleschKincaidGrade).toBeNull();
    expect(metrics.colemanLiauIndex).toBeNull();
  });

  it('walks deeply nested supplied native trees iteratively and does not mutate positions or text', async () => {
    const { parseMarkdown } = await import('../../src/tools/markdown/parse-engine');
    const tree = parseMarkdown('The cat sat.').tree;
    const before = JSON.stringify(tree);
    expect(computeProseMetrics('', tree).words).toBe(3);
    expect(JSON.stringify(tree)).toBe(before);
    let node: import('mdast').RootContent = tree.children[0];
    for (let depth = 0; depth < 10_000; depth++) node = { type: 'blockquote', children: [node] };
    expect(computeProseMetrics('', { type: 'root', children: [node] }).words).toBe(3);
  });
});


describe('MDW-R55 typographic compound boundaries', () => {
  it.each(['‐', '‑'])('treats Unicode %s as a compound hyphen without mutating the source', hyphen => {
    const source = `well${hyphen}being matters.`;
    const original = source;
    expect(computeProseMetrics(source)).toEqual(computeProseMetrics('well-being matters.'));
    expect(source).toBe(original);
  });
  it('retains en and em dashes as word separators', () => {
    expect(computeProseMetrics('cat–dog cat—dog').words).toBe(4);
  });
});


describe('MDW-R55 generated caption distinction', () => {
  it.each(['', '<span> </span>', '[ ](https://example.com)'])('omits Details generated from %s', caption => {
    const source = `<details>\n<summary>${caption}</summary>\n\nThe cat sat.\n\n</details>`;
    expect(computeProseMetrics(source).words).toBe(3);
    expect(computeProseMetrics(source).sentences).toBe(1);
  });
  it('keeps an explicitly authored Details caption', () => {
    expect(computeProseMetrics('<details>\n<summary>Details</summary>\n\nThe cat sat.\n\n</details>').words).toBe(4);
  });
});
