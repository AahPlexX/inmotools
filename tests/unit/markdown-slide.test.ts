import { describe, expect, it } from 'vitest';
import { splitIntoSlides } from '../../src/tools/markdown/slide-engine';

describe('slide splitter', () => {
  it('returns a single slide for a document with no thematic breaks', () => {
    const slides = splitIntoSlides('# Only slide\n\nSome text.');
    expect(slides).toHaveLength(1);
    expect(slides[0].source).toBe('# Only slide\n\nSome text.');
  });

  it('splits a document into multiple slides on --- boundaries', () => {
    const slides = splitIntoSlides('# Slide one\n\n---\n\n# Slide two\n\n---\n\n# Slide three');
    expect(slides).toHaveLength(3);
    expect(slides[0].source).toContain('Slide one');
    expect(slides[1].source).toContain('Slide two');
    expect(slides[2].source).toContain('Slide three');
  });

  it('assigns increasing indices to each slide in order', () => {
    const slides = splitIntoSlides('one\n---\ntwo\n---\nthree');
    expect(slides.map((slide) => slide.index)).toEqual([0, 1, 2]);
  });

  it('does not treat a --- on the very first line as a slide boundary', () => {
    // This protects a YAML frontmatter fence from being silently swallowed
    // into an empty first slide.
    const slides = splitIntoSlides('---\ntitle: Report\n---\n\n# Body');
    expect(slides).toHaveLength(1);
    expect(slides[0].source).toContain('title: Report');
  });

  it('does not treat a horizontal rule with only one or two dashes as a slide boundary', () => {
    const slides = splitIntoSlides('one\n--\ntwo\n-\nthree');
    expect(slides).toHaveLength(1);
  });

  it('records the correct starting source line for each slide', () => {
    const slides = splitIntoSlides('a\nb\n---\nc\nd');
    expect(slides[0].startLine).toBe(1);
    expect(slides[1].startLine).toBe(4);
  });

  it('returns a single, empty slide for an empty document', () => {
    const slides = splitIntoSlides('');
    expect(slides).toHaveLength(1);
    expect(slides[0].source).toBe('');
  });
});
