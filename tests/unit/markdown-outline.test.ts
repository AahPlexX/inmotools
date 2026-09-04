import { describe, expect, it } from 'vitest';
import { buildOutline } from '../../src/tools/markdown/outline-engine';

describe('document outline', () => {
  it('collects headings with their depth, text, and 1-indexed source line', () => {
    const outline = buildOutline('# Title\n\nIntro text.\n\n## Section one\n\n### Detail\n');
    expect(outline).toEqual([
      { depth: 1, text: 'Title', line: 1, id: 'title' },
      { depth: 2, text: 'Section one', line: 5, id: 'section-one' },
      { depth: 3, text: 'Detail', line: 7, id: 'detail' },
    ]);
  });

  it('returns an empty outline for a document with no headings', () => {
    expect(buildOutline('Just a paragraph.\n\nAnd another.')).toEqual([]);
  });

  it('ignores a # inside a fenced code block', () => {
    const outline = buildOutline('# Real heading\n\n```sh\n# not a heading\n```\n');
    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Real heading');
  });

  it('flattens inline markup in a heading down to its visible text', () => {
    const outline = buildOutline('## A **bold** and `code` heading\n');
    expect(outline[0].text).toBe('A bold and code heading');
  });

  it('uses an image heading alt text as the outline label', () => {
    const outline = buildOutline('# ![Logo alt](logo.png)\n');
    expect(outline[0].text).toBe('Logo alt');
  });

  it('disambiguates repeated heading slugs so every entry has a unique id', () => {
    const outline = buildOutline('# Notes\n\n## Notes\n\n### Notes\n');
    expect(outline.map((entry) => entry.id)).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  it('falls back to a stable id for a heading with no sluggable characters', () => {
    const outline = buildOutline('# ???\n');
    expect(outline[0].id).toBe('section');
  });

  it('does not treat a setext-style underline as a separate heading entry', () => {
    const outline = buildOutline('Title\n=====\n\nBody text.\n');
    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ depth: 1, text: 'Title', line: 1 });
  });
});
