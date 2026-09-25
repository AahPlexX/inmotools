import { describe, expect, it } from 'vitest';
import { ingestPlainText, splitIntoParagraphs } from '../../src/tools/sightline/text-ingest';
import { ingestMarkdown } from '../../src/tools/sightline/markdown-ingest';

describe('plain-text ingestion', () => {
  it('treats blank-line separated runs as paragraphs', () => {
    const structure = ingestPlainText('First paragraph here.\n\nSecond paragraph here.');
    expect(structure.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'First paragraph here.',
      'Second paragraph here.',
    ]);
  });

  it('joins wrapped lines inside a paragraph', () => {
    const structure = ingestPlainText('A sentence that was\nwrapped by the writer.\n\nNext block.');
    expect(structure.paragraphs[0]!.text).toBe('A sentence that was wrapped by the writer.');
  });

  it('starts a new block at a bulleted line', () => {
    const structure = ingestPlainText('Intro line\n- first item\n- second item');
    expect(structure.paragraphs.map((paragraph) => paragraph.kind)).toEqual(['body', 'list-item', 'list-item']);
  });

  it('reads setext-style headings and their level', () => {
    const structure = ingestPlainText('Chapter One\n===========\n\nBody text.\n\nSection A\n---------\n\nMore body.');
    expect(structure.chapters.map((chapter) => [chapter.title, chapter.level])).toEqual([
      ['Chapter One', 1],
      ['Section A', 2],
    ]);
  });

  it('reads hash-prefixed headings', () => {
    const structure = ingestPlainText('# Title\n\nBody.\n\n### Deeper\n\nMore.');
    expect(structure.chapters.map((chapter) => [chapter.title, chapter.level])).toEqual([
      ['Title', 1],
      ['Deeper', 3],
    ]);
  });

  it('drops horizontal rules and page markers from the reading stream', () => {
    const structure = ingestPlainText('Text before.\n\n---\n\nPage 12\n\nText after.');
    expect(structure.paragraphs.map((paragraph) => paragraph.text)).toEqual(['Text before.', 'Text after.']);
  });

  it('reports an error for text with no readable content', () => {
    const structure = ingestPlainText('   \n\n  \t ');
    expect(structure.paragraphs).toHaveLength(0);
    expect(structure.diagnostics[0]!.code).toBe('empty-text');
  });

  it('keeps chapter paragraph indices aligned with the filtered paragraph list', () => {
    const structure = ingestPlainText('Intro paragraph.\n\nChapter Two\n===========\n\nBody of two.');
    const chapter = structure.chapters.find((entry) => entry.title === 'Chapter Two')!;
    expect(structure.paragraphs[chapter.paragraphIndex]!.text).toBe('Chapter Two');
  });

  it('splits blocks without losing content', () => {
    const blocks = splitIntoParagraphs('One.\n\n\nTwo.\n\nThree.');
    expect(blocks).toEqual(['One.', 'Two.', 'Three.']);
  });
});

describe('markdown ingestion', () => {
  const markdown = `---
title: Reading Notes
author: A. Researcher
tags: reading, speed, tools
description: Notes on paced reading.
---

# Findings

First paragraph with **emphasis** and \`inline code\`.

## Methods

- First item
- Second item with [a link](https://example.test)

> A quoted passage.

\`\`\`js
const hidden = true;
\`\`\`

| Metric | Value |
| --- | --- |
| Words | 1200 |

Footnote reference.[^1]

[^1]: The footnote body.
`;

  it('reads front matter into metadata fields', () => {
    const structure = ingestMarkdown(markdown);
    expect(structure.frontmatter.title).toBe('Reading Notes');
    expect(structure.frontmatter.author).toBe('A. Researcher');
    expect(structure.frontmatter.tags).toBe('reading, speed, tools');
    expect(structure.frontmatter.description).toBe('Notes on paced reading.');
  });

  it('builds a chapter outline from the heading hierarchy', () => {
    const structure = ingestMarkdown(markdown);
    expect(structure.chapters.map((chapter) => [chapter.title, chapter.level])).toEqual([
      ['Findings', 1],
      ['Methods', 2],
    ]);
  });

  it('keeps block kinds so code and tables can be excluded from prose', () => {
    const structure = ingestMarkdown(markdown);
    const kinds = structure.paragraphs.map((paragraph) => paragraph.kind);
    expect(kinds).toContain('heading');
    expect(kinds).toContain('list-item');
    expect(kinds).toContain('quote');
    expect(kinds).toContain('code');
    expect(kinds).toContain('table');
    expect(kinds).toContain('footnote');
  });

  it('renders inline emphasis and links as plain text', () => {
    const structure = ingestMarkdown(markdown);
    const first = structure.paragraphs.find((paragraph) => paragraph.text.startsWith('First paragraph'))!;
    expect(first.text).toBe('First paragraph with emphasis and inline code.');
  });

  it('renders table rows as pipe-separated cells', () => {
    const structure = ingestMarkdown(markdown);
    const table = structure.paragraphs.find((paragraph) => paragraph.kind === 'table')!;
    expect(table.text).toBe('Metric | Value; Words | 1200');
  });

  it('preserves nested list depth', () => {
    const structure = ingestMarkdown('- Top level\n  - Nested item\n');
    const top = structure.paragraphs.find((paragraph) => paragraph.text === 'Top level')!;
    const nested = structure.paragraphs.find((paragraph) => paragraph.text === 'Nested item')!;
    expect(top.level).toBe(1);
    expect(nested.level).toBe(2);
  });

  it('reports an error for Markdown with no blocks', () => {
    const structure = ingestMarkdown('   \n\n');
    expect(structure.paragraphs).toHaveLength(0);
    expect(structure.diagnostics[0]!.code).toBe('empty-markdown');
  });

  it('does not treat a hash inside a code fence as a heading', () => {
    const structure = ingestMarkdown('```\n# not a heading\n```\n');
    expect(structure.chapters).toHaveLength(0);
  });
});
