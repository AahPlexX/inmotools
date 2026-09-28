/**
 * Plain-text ingestion.
 *
 * Plain text carries no structure beyond line breaks and blank lines, so the
 * reader has to infer it: blank-line separated runs are paragraphs, indented or
 * separator-underlined lines are treated as headings, and stanza-like short
 * runs stay separate rather than being merged into one wall of text.
 */

import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import type { IngestDiagnostic } from './sightline-types';

export interface TextStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly diagnostics: readonly IngestDiagnostic[];
}

const SETEXT_UNDERLINE = /^[=~-]{3,}\s*$/;
const HEADING_LINE = /^(?:#{1,6}\s+(.+)|(.+)\n?)$/;
const BULLET_LINE = /^\s*(?:[-*\u2022\u25cf\u25aa\u2023\u2043]|\(?\d{1,3}[.)]|[a-z][.)])\s+/i;
const PAGE_MARKER = /^\s*(?:page\s+\d+|\f)\s*$/i;
const RULE_LINE = /^\s*(?:[-=_*]\s*){3,}$/;

export const splitIntoParagraphs = (text: string): string[] => {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n\n');
  const blocks = normalized.split(/\n{2,}/);
  const paragraphs: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    let buffer: string[] = [];
    const flush = () => {
      const joined = buffer.join(' ').trim();
      if (joined.length > 0) paragraphs.push(joined);
      buffer = [];
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        flush();
        continue;
      }
      // A wrapped line continues the current paragraph; a bullet starts a new one.
      if (BULLET_LINE.test(line) && buffer.length > 0) flush();
      buffer.push(trimmed);
    }
    flush();
  }
  return paragraphs.filter((paragraph) => paragraph.length > 0);
};

export const ingestPlainText = (text: string): TextStructure => {
  const diagnostics: IngestDiagnostic[] = [];
  const paragraphs: RawParagraph[] = [];
  const chapters: RawChapter[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  let buffer: string[] = [];
  const flush = (kind: RawParagraph['kind'] = 'body', level = 0) => {
    const joined = buffer.join(' ').trim();
    buffer = [];
    if (joined.length === 0) return;
    const paragraphIndex = paragraphs.length;
    if (kind === 'heading') {
      chapters.push({ title: joined, level, paragraphIndex });
    }
    paragraphs.push({ kind, level, text: joined });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flush();
      continue;
    }
    if (PAGE_MARKER.test(line)) {
      flush();
      continue;
    }
    if (RULE_LINE.test(trimmed)) {
      flush();
      continue;
    }
    // Setext-style heading: the following line is an underline of = or -.
    const next = lines[index + 1]?.trim() ?? '';
    if (SETEXT_UNDERLINE.test(next) && trimmed.length > 0 && trimmed.length <= 120) {
      flush();
      const level = next.startsWith('=') ? 1 : 2;
      const paragraphIndex = paragraphs.length;
      chapters.push({ title: trimmed, level, paragraphIndex });
      paragraphs.push({ kind: 'heading', level, text: trimmed });
      index += 1;
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flush();
      const match = HEADING_LINE.exec(trimmed);
      const title = (match?.[1] ?? trimmed.replace(/^#+\s*/, '')).trim();
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      if (title.length > 0) {
        const paragraphIndex = paragraphs.length;
        chapters.push({ title, level, paragraphIndex });
        paragraphs.push({ kind: 'heading', level, text: title });
      }
      continue;
    }
    if (BULLET_LINE.test(line)) {
      flush();
      paragraphs.push({ kind: 'list-item', level: 1, text: trimmed });
      continue;
    }
    // A colon-ended short line that is followed by indented content reads as a
    // heading in many generated reports and transcripts.
    if (trimmed.length <= 80 && /:$/.test(trimmed) && buffer.length === 0 && paragraphs.length > 0) {
      paragraphs.push({ kind: 'heading', level: 3, text: trimmed });
      continue;
    }
    buffer.push(trimmed);
  }
  flush();

  if (paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-text',
      message: 'The text contained no readable paragraphs.',
    });
  }
  const normalized = paragraphs.map((paragraph) => ({
    ...paragraph,
    text: normalizeParagraphText(paragraph.text),
  })).filter((paragraph) => paragraph.text.length > 0);

  // Chapter paragraph indices must survive the normalization filter.
  const indexMap = new Map<number, number>();
  let cursor = 0;
  paragraphs.forEach((paragraph, originalIndex) => {
    if (normalizeParagraphText(paragraph.text).length > 0) {
      indexMap.set(originalIndex, cursor);
      cursor += 1;
    }
  });
  const remappedChapters = chapters
    .map((chapter) => ({ ...chapter, paragraphIndex: indexMap.get(chapter.paragraphIndex) ?? 0 }))
    .filter((chapter) => indexMap.has(chapter.paragraphIndex) || chapter.paragraphIndex === 0);

  return { paragraphs: normalized, chapters: remappedChapters, diagnostics };
};
