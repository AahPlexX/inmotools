import { describe, expect, it } from 'vitest';
import {
  decompileEpub, htmlToMarkdown, htmlToPlainText, markdownToDocx, markdownToEpub, markdownToHtml,
  markdownToPdf, markdownToRtf, markdownToText,
} from '../../src/tools/transcode/documents-engine';
import { parseRtf, rtfToHtml, rtfToMarkdown, rtfToText } from '../../src/tools/transcode/rtf-engine';
import { extractTexSource, latexToHtml, latexToMathMl, latexToSvg } from '../../src/tools/transcode/math-engine';

const SAMPLE_MD = `# Heading One

A paragraph with **bold**, *italic*, and \`inline code\`.

- first item
- second item

\`\`\`js
const x = 1;
\`\`\`

| a | b |
| - | - |
| 1 | 2 |
`;

describe('markdown compilation (F15)', () => {
  it('flattens markdown to plain text preserving structure', async () => {
    const text = await markdownToText(SAMPLE_MD);
    expect(text).toContain('HEADING ONE');
    expect(text).toContain('A paragraph with bold, italic, and inline code.');
    expect(text).toContain('- first item');
    expect(text).toContain('    const x = 1;');
    expect(text).toContain('1\t2');
  });

  it('compiles standalone HTML5 with MathML math', async () => {
    const html = await markdownToHtml('# Title\n\nInline $x^2$ math.\n', { title: 'Doc' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Doc</title>');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<math');
  });

  it('renders RTF with bold/italic/code and unicode escapes', async () => {
    const rtf = await markdownToRtf('# T\n\nCafé **bold** and *italic*.\n', 'T');
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
    expect(rtf).toContain('\\b bold');
    expect(rtf).toContain('\\i italic');
    expect(rtf).toContain('Caf\\u233?');
  });

  it('produces a valid PDF header', async () => {
    const bytes = await markdownToPdf(SAMPLE_MD, 'Sample');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('produces a valid DOCX (ZIP) container', async () => {
    const bytes = await markdownToDocx(SAMPLE_MD, 'Sample');
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
});

describe('epub synthesis and decompilation (F16)', () => {
  const metadata = { title: 'Test Book', author: 'Ada', language: 'en', date: '2026-09-15T00:00:00.000Z' };

  it('builds a valid EPUB with deterministic structure and decomplies it', async () => {
    const bytes = await markdownToEpub('# Chapter One\n\nHello world.\n\n# Chapter Two\n\nSecond chapter.\n', metadata);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    const extraction = await decompileEpub(bytes);
    expect(extraction.title).toBe('Test Book');
    expect(extraction.html).toContain('Hello world.');
    expect(extraction.html).toContain('Second chapter.');
  });

  it('is deterministic: same input produces identical package identifiers', async () => {
    const a = await markdownToEpub('# A\n\nBody.\n', metadata);
    const b = await markdownToEpub('# A\n\nBody.\n', metadata);
    const textA = new TextDecoder().decode(a);
    const textB = new TextDecoder().decode(b);
    const uuidOf = (raw: string) => /urn:uuid:[0-9a-f-]+/.exec(raw)?.[0];
    expect(uuidOf(textA)).toBeTruthy();
    expect(uuidOf(textA)).toBe(uuidOf(textB));
  });
});

describe('rtf parser (F18)', () => {
  const RTF = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\fswiss Helvetica;}}',
    '{\\info{\\title Secret}}',
    '\\pard Hello {\\b bold text} and {\\i italic} caf\\u233?\\par',
    '{\\qc Centered line\\par}',
    'Hex caf\\\'e9 here.\\par',
    '}',
  ].join('\n');

  it('extracts paragraphs with inline formatting and skips tables', () => {
    const doc = parseRtf(RTF);
    expect(doc.skippedDestinations).toEqual(expect.arrayContaining(['fonttbl', 'info']));
    expect(doc.paragraphs).toHaveLength(3);
    const first = doc.paragraphs[0];
    const boldRun = first.runs.find((run) => run.bold);
    expect(boldRun?.text).toContain('bold text');
    expect(first.runs.some((run) => run.italic)).toBe(true);
    expect(rtfToText(doc)).toContain('caf\u00e9');
    expect(rtfToText(doc)).not.toContain('Secret');
    expect(doc.paragraphs[1].align).toBe('center');
  });

  it('emits markdown and html outputs', () => {
    const doc = parseRtf(RTF);
    const markdown = rtfToMarkdown(doc);
    expect(markdown).toContain('**bold text**');
    expect(markdown).toContain('*italic*');
    const html = rtfToHtml(doc, 'Converted');
    expect(html).toContain('<strong>bold text</strong>');
    expect(html).toContain('text-align: center');
    expect(html).toContain('caf\u00e9');
  });

  it('decodes \\u unicode escapes with fallback skipping', () => {
    const doc = parseRtf('{\\rtf1\\u8364?\\u8218? end}');
    expect(rtfToText(doc).trim()).toBe('\u20ac\u201a end');
  });

  it('rejects non-RTF input', () => {
    expect(() => parseRtf('plain text')).toThrow(/not an RTF/i);
  });
});

describe('latex math transcoding (F17)', () => {
  it('converts LaTeX to MathML', () => {
    const mathml = latexToMathMl({ tex: 'x^2 + y^2 = z^2', displayMode: true });
    expect(mathml).toContain('<?xml');
    expect(mathml).toContain('<math');
    expect(mathml).toContain('</math>');
  });

  it('renders SVG equations with foreignObject', () => {
    const svg = latexToSvg({ tex: 'e^{i\\pi}+1=0', displayMode: false });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });

  it('wraps rendered math in HTML', () => {
    const html = latexToHtml({ tex: '\\frac{1}{2}', displayMode: true }, 'Equation');
    expect(html).toContain('<title>Equation</title>');
    expect(html).toContain('katex');
  });

  it('extracts equation environments and dollar math from .tex sources', () => {
    expect(extractTexSource('\\begin{equation}a=b\\end{equation}').tex).toBe('a=b');
    expect(extractTexSource('text $$x+1$$ more')).toEqual({ tex: 'x+1', displayMode: true });
    expect(extractTexSource('inline $y$ here')).toEqual({ tex: 'y', displayMode: false });
    expect(extractTexSource('\\alpha').tex).toBe('\\alpha');
  });
});

describe('html helpers', () => {
  it('strips HTML to readable plain text', () => {
    const text = htmlToPlainText('<html><body><h1>Title</h1><p>One &amp; two</p><script>bad()</script></body></html>');
    expect(text).toContain('Title');
    expect(text).toContain('One & two');
    expect(text).not.toContain('bad()');
  });

  it('converts HTML to Markdown', async () => {
    const markdown = await htmlToMarkdown('<h1>Head</h1><p>Para <strong>strong</strong></p>');
    expect(markdown).toContain('# Head');
    expect(markdown).toContain('**strong**');
  });
});
