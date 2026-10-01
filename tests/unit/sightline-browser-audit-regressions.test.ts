import { describe, expect, it, vi } from 'vitest';
import { buildDocumentModel, chapterForToken, normalizeParagraphText } from '../../src/tools/sightline/segmentation-engine';
import { computeOrp, coreSpan, selectAnchorIndex, splitOrp } from '../../src/tools/sightline/orp-engine';

const build = (patch: Partial<Parameters<typeof buildDocumentModel>[0]>) => buildDocumentModel({
  format: 'text', fileName: 'audit.txt', paragraphs: [], ...patch,
});

describe('Sightline browser-only audit regressions', () => {
  it('keeps every sentence range aligned with the flattened document text', () => {
    const model = build({ paragraphs: [
      { kind: 'body', text: 'First sentence. Second sentence! Third sentence?' },
      { kind: 'body', text: 'Another paragraph. One more sentence.' },
    ] });
    for (const sentence of model.sentences) {
      expect(model.text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
    for (const token of model.tokens) {
      expect(model.text.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it('remaps chapter starts after filtering code, notes, and empty paragraphs', () => {
    const model = build({ proseOnly: true, paragraphs: [
      { kind: 'code', text: 'const hidden = true;' },
      { kind: 'footnote', text: 'Excluded note.' },
      { kind: 'body', text: '   ' },
      { kind: 'heading', level: 1, text: 'First chapter' },
      { kind: 'body', text: 'First body.' },
      { kind: 'table', text: 'Hidden | table' },
      { kind: 'heading', level: 1, text: 'Second chapter' },
      { kind: 'body', text: 'Second body.' },
    ], chapters: [
      { title: 'First chapter', level: 1, paragraphIndex: 3 },
      { title: 'Second chapter', level: 1, paragraphIndex: 6 },
    ] });
    expect(model.chapters.map((chapter) => chapter.paragraphStart)).toEqual([0, 2]);
    expect(chapterForToken(model, 0)?.title).toBe('First chapter');
    const second = model.paragraphs[2]!.tokenStart;
    expect(chapterForToken(model, second)?.title).toBe('Second chapter');
    expect(model.chapters.map((chapter) => chapter.wordCount)).toEqual([4, 4]);
  });

  it('does not attach a completely filtered chapter to the following chapter', () => {
    const model = build({ proseOnly: true, paragraphs: [
      { kind: 'code', text: 'Excluded.' },
      { kind: 'body', text: 'Retained body.' },
    ], chapters: [
      { title: 'Excluded chapter', level: 1, paragraphIndex: 0 },
      { title: 'Retained chapter', level: 1, paragraphIndex: 1 },
    ] });
    expect(model.chapters.map((chapter) => chapter.title)).toEqual(['Retained chapter']);
  });

  it('preserves meaningful joining characters while removing existing noise characters', () => {
    const text = 'می\u200cروم 👩\u200d💻';
    expect(normalizeParagraphText(text)).toBe(text);
    expect(normalizeParagraphText('read\u200bing\ufeff\u0000')).toBe('reading');
  });

  it('preserves the existing ASCII anchor table', () => {
    expect(Array.from({ length: 15 }, (_, index) => computeOrp('a'.repeat(index + 1))))
      .toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
    expect(computeOrp('"Reading"')).toBe(3);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('falls back for a non-finite ratio: %s', (ratio) => {
    expect(computeOrp('reading', { mode: 'ratio', ratio })).toBe(2);
  });

  it('clamps finite ratios and handles empty tokens', () => {
    expect(computeOrp('reading', { mode: 'ratio', ratio: -1 })).toBe(0);
    expect(computeOrp('reading', { mode: 'ratio', ratio: 2 })).toBe(6);
    expect(computeOrp('')).toBe(0);
    expect(splitOrp('', Number.NaN)).toEqual({ before: '', anchor: '', after: '' });
  });

  it.each(['😀', 'e\u0301', '👩\u200d💻', '🇺🇸', '👍🏽'])('keeps a complete grapheme as the anchor: %s', (token) => {
    expect(splitOrp(token, 0)).toEqual({ before: '', anchor: token, after: '' });
    const interior = splitOrp(token, token.length - 1);
    expect(interior.anchor).toBe(token);
    expect(interior.before + interior.anchor + interior.after).toBe(token);
  });

  it('recognizes non-Latin word cores and keeps UTF-16 anchor indices', () => {
    expect(coreSpan('"العربية"')).toEqual({ start: 1, end: 7 });
    expect(selectAnchorIndex(['a', 'العربية', 'it'])).toBe(1);
    const token = '"e\u0301cole"';
    const parts = splitOrp(token, computeOrp(token));
    expect(parts.before + parts.anchor + parts.after).toBe(token);
    expect(parts.anchor).toBe('c');
  });

  it('works without Intl.Segmenter for code points and common joined sequences', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', { Segmenter: undefined });
    try {
      const fallback = await import('../../src/tools/sightline/orp-engine');
      for (const token of ['😀', 'e\u0301', '👩\u200d💻', '🇺🇸', '👍🏽']) {
        expect(fallback.splitOrp(token, 0).anchor).toBe(token);
      }
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
