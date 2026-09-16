import { describe, expect, it } from 'vitest';
import {
  buildDocumentModel,
  chapterForToken,
  normalizeParagraphText,
  paragraphStartToken,
  sentenceIndexForToken,
  sentenceStartToken,
  splitSentences,
} from '../../src/tools/sightline/segmentation-engine';
import { computeOrp } from '../../src/tools/sightline/orp-engine';

const paragraph = (text: string, kind: 'body' | 'heading' = 'body', level = 0) => ({ kind, level, text }) as const;

const build = (texts: readonly { text: string; kind?: 'body' | 'heading'; level?: number }[]) =>
  buildDocumentModel({
    format: 'text',
    fileName: 'sample.txt',
    paragraphs: texts.map((entry) => ({
      kind: entry.kind ?? 'body',
      level: entry.level ?? 0,
      text: entry.text,
    })),
  });

describe('paragraph normalization', () => {
  it('collapses runs of spaces, tabs, and newlines into single spaces', () => {
    expect(normalizeParagraphText('a   b\tc\n  d')).toBe('a b c d');
  });

  it('removes zero-width characters and C0 control characters', () => {
    expect(normalizeParagraphText('read\u200bing\u0000well')).toBe('readingwell');
    expect(normalizeParagraphText('keep\u00a0hard space')).toBe('keep\u00a0hard space');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeParagraphText('  padded  ')).toBe('padded');
  });
});

describe('sentence splitting', () => {
  it('splits on terminal punctuation and keeps the terminator with the sentence', () => {
    expect(splitSentences('One. Two! Three?').map((span) => span.text)).toEqual(['One.', ' Two!', ' Three?']);
  });

  it('treats an ellipsis and stacked terminators as a single boundary', () => {
    expect(splitSentences('Really?! Yes.').map((span) => span.text)).toEqual(['Really?!', ' Yes.']);
  });

  it('does not split inside a decimal number', () => {
    expect(splitSentences('It cost 3.50 dollars. Then more.').length).toBe(2);
  });

  it('does not split after a known abbreviation', () => {
    const spans = splitSentences('Dr. Smith arrived. He was late.');
    expect(spans.map((span) => span.text)).toEqual(['Dr. Smith arrived.', ' He was late.']);
  });

  it('does not split inside dotted initialisms', () => {
    expect(splitSentences('The U.S. Senate voted. It passed.').length).toBe(2);
  });

  it('keeps closing quotation marks with the sentence that contains them', () => {
    expect(splitSentences('"Stop." Then silence.').map((span) => span.text)).toEqual(['"Stop."', ' Then silence.']);
  });

  it('records offsets that point back into the paragraph text', () => {
    const text = 'First one. Second one.';
    const spans = splitSentences(text);
    expect(text.slice(spans[1]!.start, spans[1]!.end)).toBe(' Second one.');
  });

  it('returns nothing for whitespace-only text', () => {
    expect(splitSentences('   \n  ')).toEqual([]);
  });
});

describe('document model construction', () => {
  it('produces tokens whose offsets reproduce the flattened text exactly', () => {
    const model = build([
      { text: 'The quick brown fox.' },
      { text: 'Second paragraph here.' },
    ]);
    for (const token of model.tokens) {
      expect(model.text.slice(token.start, token.end)).toBe(token.text);
    }
    expect(model.tokens.map((token) => token.text)).toEqual([
      'The', 'quick', 'brown', 'fox.', 'Second', 'paragraph', 'here.',
    ]);
  });

  it('records correct offsets when a sentence repeats an identical word', () => {
    const model = build([{ text: 'the cat the dog' }]);
    const secondThe = model.tokens[2]!;
    expect(secondThe.text).toBe('the');
    expect(model.text.slice(secondThe.start, secondThe.end)).toBe('the');
    expect(secondThe.start).toBe(model.text.indexOf('the', model.tokens[0]!.start + 1));
  });

  it('assigns break kinds for clause, sentence, paragraph, and chapter endings', () => {
    const model = build([
      { text: 'Before, during. After that, done.' },
      { text: 'Next paragraph.' },
    ]);
    const byIndex = (text: string) => model.tokens.find((token) => token.text === text)!;
    expect(byIndex('Before,').breakAfter).toBe('clause');
    expect(byIndex('during.').breakAfter).toBe('sentence');
    expect(byIndex('After').breakAfter).toBe('none');
    // The last token of a paragraph carries the paragraph break, which outranks
    // the sentence break for pacing, and the document's last token is promoted
    // to a chapter break.
    expect(byIndex('done.').breakAfter).toBe('paragraph');
    expect(byIndex('paragraph.').breakAfter).toBe('chapter');
  });

  it('links tokens to their sentence and paragraph indices', () => {
    const model = build([
      { text: 'One. Two.' },
      { text: 'Three.' },
    ]);
    expect(model.tokens.map((token) => token.text)).toEqual(['One.', 'Two.', 'Three.']);
    expect(model.tokens.map((token) => token.sentenceIndex)).toEqual([0, 1, 2]);
    expect(model.tokens.map((token) => token.paragraphIndex)).toEqual([0, 0, 1]);
    expect(sentenceIndexForToken(model, 2)).toBe(2);
    expect(sentenceStartToken(model, 1)).toBe(1);
    expect(sentenceStartToken(model, 2)).toBe(2);
    expect(paragraphStartToken(model, 2)).toBe(2);
    expect(paragraphStartToken(model, 0)).toBe(0);
  });

  it('computes an optimal recognition point for every token', () => {
    const model = build([{ text: 'Recognition starts here.' }]);
    for (const token of model.tokens) {
      expect(token.orp).toBe(computeOrp(token.text));
      expect(token.orp).toBeGreaterThanOrEqual(0);
      expect(token.orp).toBeLessThan(token.text.length);
    }
  });

  it('drops empty paragraphs and reports when nothing is left', () => {
    const model = build([{ text: '   ' }, { text: '' }]);
    expect(model.tokens).toHaveLength(0);
    expect(model.diagnostics.some((diagnostic) => diagnostic.code === 'no-text')).toBe(true);
  });

  it('filters code and table blocks in prose-only mode', () => {
    const proseOnly = buildDocumentModel({
      format: 'markdown',
      fileName: 'doc.md',
      proseOnly: true,
      paragraphs: [
        { kind: 'body', level: 0, text: 'Visible prose.' },
        { kind: 'code', level: 0, text: 'const hidden = true;' },
        { kind: 'table', level: 0, text: 'a | b' },
      ],
    });
    expect(proseOnly.tokens.map((token) => token.text)).toEqual(['Visible', 'prose.']);

    const withCode = buildDocumentModel({
      format: 'markdown',
      fileName: 'doc.md',
      paragraphs: [
        { kind: 'body', level: 0, text: 'Visible prose.' },
        { kind: 'code', level: 0, text: 'const hidden = true;' },
      ],
    });
    expect(withCode.tokens.length).toBeGreaterThan(2);
  });

  it('excludes footnote bodies unless notes are requested', () => {
    const withoutNotes = buildDocumentModel({
      format: 'docx',
      fileName: 'doc.docx',
      paragraphs: [
        { kind: 'body', level: 0, text: 'Body text.' },
        { kind: 'footnote', level: 1, text: 'A footnote body.' },
      ],
    });
    expect(withoutNotes.tokens.map((token) => token.text)).toEqual(['Body', 'text.']);

    const withNotes = buildDocumentModel({
      format: 'docx',
      fileName: 'doc.docx',
      includeNotes: true,
      paragraphs: [
        { kind: 'body', level: 0, text: 'Body text.' },
        { kind: 'footnote', level: 1, text: 'A footnote body.' },
      ],
    });
    expect(withNotes.tokens.some((token) => token.text === 'footnote')).toBe(true);
  });

  it('truncates at the token guard and says so', () => {
    const model = buildDocumentModel({
      format: 'text',
      fileName: 'big.txt',
      tokenLimit: 5,
      paragraphs: [{ kind: 'body', level: 0, text: 'one two three four five six seven eight' }],
    });
    expect(model.tokens).toHaveLength(5);
    expect(model.diagnostics.some((diagnostic) => diagnostic.code === 'token-limit')).toBe(true);
  });

  it('builds chapters from level 1 and 2 headings and keeps front matter separate', () => {
    const model = build([
      paragraph('Preface text.', 'body'),
      paragraph('Chapter One', 'heading', 1),
      paragraph('Body of one.', 'body'),
      paragraph('Section A', 'heading', 2),
      paragraph('Body of A.', 'body'),
      paragraph('Chapter Two', 'heading', 1),
      paragraph('Body of two.', 'body'),
    ]);
    expect(model.chapters.map((chapter) => chapter.title)).toEqual(['Front matter', 'Chapter One', 'Section A', 'Chapter Two']);
    expect(model.chapters[0]!.level).toBe(0);
    expect(chapterForToken(model, model.tokens.findIndex((token) => token.text === 'Body'))?.title).toBe('Chapter One');
    expect(chapterForToken(model, model.tokens.findIndex((token) => token.text === 'two.'))?.title).toBe('Chapter Two');
  });

  it('falls back to a single chapter when the document carries no structure', () => {
    const model = build([{ text: 'Just one flat paragraph.' }]);
    expect(model.chapters).toHaveLength(1);
    expect(model.chapters[0]!.title).toBe('Text');
  });

  it('uses explicitly supplied chapters when a reader already knows the structure', () => {
    const model = buildDocumentModel({
      format: 'epub',
      fileName: 'book.epub',
      paragraphs: [
        { kind: 'body', level: 0, text: 'First part.' },
        { kind: 'body', level: 0, text: 'Second part.' },
      ],
      chapters: [
        { title: 'Part One', level: 1, paragraphIndex: 0 },
        { title: 'Part Two', level: 1, paragraphIndex: 1 },
      ],
    });
    expect(model.chapters.map((chapter) => chapter.title)).toEqual(['Part One', 'Part Two']);
    expect(model.chapters[0]!.wordCount).toBe(2);
  });

  it('computes prose metrics over the whole document', () => {
    const model = build([
      { text: 'The cat sat on the mat.' },
      { text: 'The dog ran away quickly.' },
    ]);
    expect(model.metrics.words).toBe(11);
    expect(model.metrics.sentences).toBe(2);
    expect(model.metrics.paragraphs).toBe(2);
    expect(model.metrics.readingMinutes).toBeCloseTo(11 / 238, 8);
    expect(model.metrics.syllables).toBeGreaterThan(0);
  });

  it('marks symbolic tokens and keeps their trailing punctuation', () => {
    const model = build([{ text: 'Paid $3.50 (in full).' }]);
    const numeric = model.tokens.find((token) => token.text === '$3.50')!;
    expect(numeric.symbolic).toBe(true);
    expect(numeric.syllables).toBe(0);
    expect(numeric.letters).toBe(3);
    const parenthetical = model.tokens.find((token) => token.text === 'full).')!;
    expect(parenthetical.trailing).toBe(').');
  });

  it('records the ingest time and format on the model', () => {
    const model = buildDocumentModel({
      format: 'html',
      fileName: 'article.html',
      ingestMs: 42,
      encoding: 'utf-8',
      byteLength: 2048,
      paragraphs: [{ kind: 'body', level: 0, text: 'Text.' }],
    });
    expect(model.format).toBe('html');
    expect(model.ingestMs).toBe(42);
    expect(model.byteLength).toBe(2048);
  });
});
