import { describe, expect, it } from 'vitest';
import { ingestHtml } from '../../src/tools/sightline/html-ingest';
import { ingestRtf } from '../../src/tools/sightline/rtf-ingest';

const articleHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Fallback title</title>
  <meta property="og:title" content="A Study of Reading">
  <meta name="author" content="Dana Reader">
  <meta name="description" content="How paced presentation changes reading.">
</head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <header><h1>Site name</h1></header>
  <article class="post-content">
    <h2>Introduction</h2>
    <p>Reading is a skill that improves with practice, and pacing changes the task.</p>
    <p>Second paragraph of the study, long enough to score well against the boilerplate.</p>
    <blockquote>Quoted material from another source.</blockquote>
    <ul><li>First finding</li><li>Second finding</li></ul>
    <table><tr><th>Metric</th><th>Value</th></tr><tr><td>Words</td><td>400</td></tr></table>
    <figcaption>Figure 1. A caption.</figcaption>
  </article>
  <footer>Copyright notice that should not be read.</footer>
  <aside class="sidebar">Related links and promotions.</aside>
</body>
</html>`;

describe('HTML ingestion', () => {
  it('recovers the title, author, and description from meta tags', () => {
    const structure = ingestHtml(articleHtml);
    expect(structure.title).toBe('A Study of Reading');
    expect(structure.byline).toBe('Dana Reader');
    expect(structure.description).toBe('How paced presentation changes reading.');
  });

  it('strips navigation, header, footer, and sidebar boilerplate', () => {
    const structure = ingestHtml(articleHtml);
    const text = structure.paragraphs.map((paragraph) => paragraph.text).join(' ');
    expect(text).not.toContain('Home');
    expect(text).not.toContain('Site name');
    expect(text).not.toContain('Copyright');
    expect(text).not.toContain('Related links');
  });

  it('scores the article container and keeps its content in order', () => {
    const structure = ingestHtml(articleHtml);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'article-container')).toBe(true);
    expect(structure.paragraphs.map((paragraph) => paragraph.kind).slice(0, 4)).toEqual([
      'heading', 'body', 'body', 'quote',
    ]);
  });

  it('builds chapters from level 1 and 2 headings', () => {
    const structure = ingestHtml(articleHtml);
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['Introduction']);
  });

  it('renders tables and captions as their own block kinds', () => {
    const structure = ingestHtml(articleHtml);
    const table = structure.paragraphs.find((paragraph) => paragraph.kind === 'table')!;
    expect(table.text).toBe('Metric | Value; Words | 400');
    expect(structure.paragraphs.some((paragraph) => paragraph.kind === 'caption')).toBe(true);
  });

  it('falls back to reading the whole body when no article container stands out', () => {
    const structure = ingestHtml('<html><body><div><p>One short line.</p></div><nav><a href="/">x</a></nav></body></html>');
    expect(structure.paragraphs.map((paragraph) => paragraph.text)).toEqual(['One short line.']);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'article-heuristic')).toBe(true);
  });

  it('uses the title element when no social title is present', () => {
    const structure = ingestHtml('<html><head><title>Plain title</title></head><body><p>Body.</p></body></html>');
    expect(structure.title).toBe('Plain title');
  });

  it('reports an error when there is no readable text', () => {
    const structure = ingestHtml('<html><body><nav>menu</nav></body></html>');
    expect(structure.paragraphs).toHaveLength(0);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(true);
  });
});

describe('RTF ingestion', () => {
  it('reads paragraphs, headings, and document info', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0
{\info{\title Reading Machines}{\author Ada Lovelace}{\subject Pacing}}
\pard\b Chapter One\b0\par
This is the first paragraph.\par
Second paragraph here.\par
{\footnote a footnote body}
}`;
    const structure = ingestRtf(rtf);
    expect(structure.info.title).toBe('Reading Machines');
    expect(structure.info.author).toBe('Ada Lovelace');
    expect(structure.info.subject).toBe('Pacing');
    expect(structure.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Chapter One',
      'This is the first paragraph.',
      'Second paragraph here.',
      'a footnote body',
    ]);
    // Note bodies are tagged so the reader can exclude them from the prose stream.
    expect(structure.paragraphs.at(-1)!.kind).toBe('footnote');
    expect(structure.chapters.map((chapter) => chapter.title)).toEqual(['Chapter One']);
  });

  it('decodes \\uN escapes and skips the ANSI fallback that follows them', () => {
    const rtf = String.raw`{\rtf1\ansi\uc1 Na\u239?ve caf\'e9 and smart \u8220?quotes\u8221?.}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs[0]!.text).toBe('Na\u00efve caf\u00e9 and smart \u201cquotes\u201d.');
  });

  it('honours a changed \\uc skip count', () => {
    const rtf = String.raw`{\rtf1\ansi\uc0 Greek pi is \u960. Next.}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs[0]!.text).toBe('Greek pi is \u03c0. Next.');
  });

  it('decodes code-page hex escapes through the declared code page', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252 Euro \'80 sign.}`;
    expect(ingestRtf(rtf).paragraphs[0]!.text).toBe('Euro \u20ac sign.');
  });

  it('skips ignorable destinations entirely', () => {
    const rtf = String.raw`{\rtf1\ansi{\*\generator Riched20 10.0}{\*\customdata ignore me}Visible text.}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs[0]!.text).toBe('Visible text.');
  });

  it('does not emit font and colour table contents into the text', () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0\froman Times New Roman;}{\f1\fswiss Arial;}}{\colortbl;\red0\green0\blue0;}Real text here.\par}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs.map((paragraph) => paragraph.text)).toEqual(['Real text here.']);
  });

  it('renders simple tables as pipe-separated rows', () => {
    const rtf = String.raw`{\rtf1\ansi\trowd\cellx3000\cellx6000\intbl Alpha\cell Beta\cell\row\pard After the table.}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs[0]!.kind).toBe('table');
    expect(structure.paragraphs[0]!.text).toBe('Alpha | Beta');
    expect(structure.paragraphs.at(-1)!.text).toBe('After the table.');
  });

  it('maps RTF symbol control words to characters', () => {
    const rtf = String.raw`{\rtf1\ansi Quote \ldblquote high\rdblquote \endash dash \bullet bullet.}`;
    // In RTF the space after a control word is a delimiter, not text, so the
    // dash and the word that follows it are adjacent until text separates them.
    expect(ingestRtf(rtf).paragraphs[0]!.text).toBe('Quote \u201chigh\u201d\u2013dash \u2022 bullet.');
  });

  it('warns when the RTF header control word is absent', () => {
    const structure = ingestRtf('Some text with no header at all.');
    expect(structure.diagnostics.some((diagnostic) => diagnostic.code === 'rtf-header')).toBe(true);
  });

  it('reports an error for an RTF document with no text', () => {
    const structure = ingestRtf(String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}}`);
    expect(structure.paragraphs).toHaveLength(0);
    expect(structure.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(true);
  });

  it('does not leak binary picture data into the reading stream', () => {
    const rtf = String.raw`{\rtf1\ansi Before.{\pict\pngblip 89504e470d0a1a0a}After.}`;
    const structure = ingestRtf(rtf);
    expect(structure.paragraphs.map((paragraph) => paragraph.text).join(' ')).not.toContain('89504e47');
  });
});
