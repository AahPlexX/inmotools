import type { SlideSection } from './markdown-types';

// Splits a document into an ordered sequence of slide sections on `---`
// thematic-break boundaries. This is a small, self-contained pure function -
// there is no dependency on any third-party slide-deck framework, no
// speaker-notes syntax, and no presentation timer.
//
// A `---` line is only treated as a slide boundary when it appears on its
// own line with nothing else, matching CommonMark's thematic-break rule; a
// line that is part of a YAML frontmatter fence (the very first line of the
// document) is not treated as a slide boundary, since that would silently
// swallow frontmatter into "slide 1".

const THEMATIC_BREAK = /^-{3,}\s*$/;

// If the document opens with a --- frontmatter fence, returns the 1-indexed
// line number of its matching closing fence, so that neither the opening nor
// the closing fence line is ever treated as a slide boundary. Returns 0 when
// there is no opening frontmatter fence on line 1.
const findFrontmatterClosingLine = (lines: string[]): number => {
  if (lines[0]?.trim() !== '---') return 0;
  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  return closingIndex === -1 ? 0 : closingIndex + 2;
};

export const splitIntoSlides = (source: string): SlideSection[] => {
  const lines = source.split('\n');
  const frontmatterClosingLine = findFrontmatterClosingLine(lines);
  const slides: SlideSection[] = [];

  let currentLines: string[] = [];
  let currentStartLine = 1;

  const pushCurrent = () => {
    slides.push({
      index: slides.length,
      source: currentLines.join('\n'),
      startLine: currentStartLine,
    });
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const isWithinFrontmatterFence = lineNumber <= frontmatterClosingLine;
    if (!isWithinFrontmatterFence && THEMATIC_BREAK.test(line)) {
      pushCurrent();
      currentLines = [];
      currentStartLine = lineNumber + 1;
      return;
    }
    currentLines.push(line);
  });

  pushCurrent();

  return slides;
};
