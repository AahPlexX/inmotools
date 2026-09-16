import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  describeModel,
  detectFormat,
  extensionOf,
  ingestDocument,
  ingestPastedText,
  isBinaryFormat,
} from '../../src/tools/sightline/ingest-router';
import {
  FOCAL_ANCHOR_FRACTION,
  computeOrp,
  focalOffsetPx,
  selectAnchorIndex,
  splitOrp,
} from '../../src/tools/sightline/orp-engine';
import type { PdfExtraction } from '../../src/tools/sightline/sightline-types';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const pdfBytes = (): Uint8Array => bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

const zipWith = async (entries: Record<string, string>): Promise<Uint8Array> => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array' });
};

describe('format detection', () => {
  it('reads the extension regardless of case', () => {
    expect(extensionOf('Book.EPUB')).toBe('epub');
    expect(extensionOf('notes.markdown')).toBe('markdown');
    expect(extensionOf('no-extension')).toBe('');
  });

  it('detects formats from their leading bytes', () => {
    expect(detectFormat(pdfBytes(), 'unknown.bin').format).toBe('pdf');
    expect(detectFormat(bytes(String.raw`{\rtf1\ansi hello}`), 'unknown.bin').format).toBe('rtf');
    expect(detectFormat(bytes('<!doctype html><html><body><p>hi</p></body></html>'), 'unknown.bin').format).toBe('html');
  });

  it('distinguishes EPUB and DOCX archives by their internal parts', async () => {
    const epub = await zipWith({ mimetype: 'application/epub+zip', 'META-INF/container.xml': '<container/>' });
    const docx = await zipWith({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document/>' });
    expect(detectFormat(epub, 'unknown.bin').format).toBe('epub');
    expect(detectFormat(docx, 'unknown.bin').format).toBe('docx');
  });

  it('uses Markdown structure signals and front matter for plain bytes', () => {
    expect(detectFormat(bytes('---\ntitle: Notes\n---\n\n# Heading\n\nBody text.'), 'unknown.bin').format).toBe('markdown');
    expect(detectFormat(bytes('# Heading\n\n- item one\n- item two\n\n> quote'), 'unknown.bin').format).toBe('markdown');
  });

  it('falls back to plain text for ordinary prose', () => {
    const detection = detectFormat(bytes('Just a paragraph of ordinary prose with no markup at all.'), 'notes.bin');
    expect(detection.format).toBe('text');
    expect(detection.reason).toContain('single-byte ASCII');
  });

  it('trusts the extension over content when the bytes are ambiguous', () => {
    expect(detectFormat(bytes('plain words here'), 'chapter.rtf').format).toBe('rtf');
  });

  it('flags binary formats that need a parser', () => {
    expect(isBinaryFormat('pdf')).toBe(true);
    expect(isBinaryFormat('epub')).toBe(true);
    expect(isBinaryFormat('docx')).toBe(true);
    expect(isBinaryFormat('markdown')).toBe(false);
    expect(isBinaryFormat('text')).toBe(false);
  });
});

describe('ingest routing', () => {
  it('ingests plain text into a document model', async () => {
    const result = await ingestDocument(bytes('The first sentence. The second sentence.'), 'notes.txt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.format).toBe('text');
    expect(result.model.tokens.map((token) => token.text)).toEqual([
      'The', 'first', 'sentence.', 'The', 'second', 'sentence.',
    ]);
  });

  it('honours the prose-only option for Markdown code blocks', async () => {
    const source = '# Title\n\nReadable prose here.\n\n```js\nconst x = 1;\n```\n';
    const full = await ingestDocument(bytes(source), 'doc.md');
    const proseOnly = await ingestDocument(bytes(source), 'doc.md', { proseOnly: true });
    expect(full.ok && proseOnly.ok).toBe(true);
    if (!full.ok || !proseOnly.ok) return;
    expect(full.model.tokens.some((token) => token.text === 'const')).toBe(true);
    expect(proseOnly.model.tokens.some((token) => token.text === 'const')).toBe(false);
  });

  it('reports progress while a document is parsed', async () => {
    const stages: string[] = [];
    await ingestDocument(bytes('# Title\n\nBody text.'), 'doc.md', {}, {
      onProgress: (message) => stages.push(message),
    });
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.join(' ')).toContain('doc.md');
  });

  it('routes PDF bytes through the injected extractor', async () => {
    const extraction: PdfExtraction = {
      pages: [{
        pageNumber: 1,
        width: 612,
        height: 792,
        items: [{ str: 'Extracted PDF text.', x: 72, y: 700, width: 120, height: 12, fontName: 'Body' }],
      }],
      metadata: { Title: 'Injected' },
      outline: [],
    };
    let called = 0;
    const result = await ingestDocument(pdfBytes(), 'doc.pdf', {}, {
      pdf: {
        extract: async () => {
          called += 1;
          return extraction;
        },
      },
    });
    expect(called).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.format).toBe('pdf');
    expect(result.model.tokens.map((token) => token.text)).toEqual(['Extracted', 'PDF', 'text.']);
    expect(result.model.metadata.title).toBe('Injected');
  });

  it('returns a failure envelope when PDF support is unavailable', async () => {
    const result = await ingestDocument(pdfBytes(), 'doc.pdf');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('pdf-unavailable');
  });

  it('refuses binary or unrelated file types with a clear message', async () => {
    for (const name of ['sheet.xlsx', 'photo.jpg', 'archive.zip', 'track.mp3']) {
      const result = await ingestDocument(bytes('data'), name);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('unsupported-format');
      expect(result.message).toContain('Convert it to');
    }
  });

  it('still opens a text file whose extension is unknown', async () => {
    const result = await ingestDocument(bytes('Ordinary prose with no extension at all.'), 'notes');
    expect(result.ok).toBe(true);
  });

  it('reports recoverable failures from the readers as diagnostics', async () => {
    const result = await ingestDocument(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]), 'broken.zip');
    expect(result.ok).toBe(false);
  });

  it('ingests pasted text with a chosen format and title', async () => {
    const result = await ingestPastedText('# Pasted Title\n\nBody of the pasted note.', {
      label: 'Clipboard',
      format: 'markdown',
      title: 'Clipboard note',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.title).toBe('Clipboard note');
    expect(result.model.chapters[0]!.title).toBe('Pasted Title');
  });

  it('reports an empty paste instead of producing an empty document', async () => {
    const result = await ingestPastedText('   \n  ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('empty-input');
  });

  it('describes the model for the ingestion report', async () => {
    const result = await ingestDocument(bytes('# Title\n\nOne sentence here.'), 'doc.md');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = describeModel(result.model);
    expect(summary).toContain('4 words');
    expect(summary).toContain('sentences');
    expect(summary).toContain('section');
  });
});

describe('optimal recognition point anchoring', () => {
  it('walks the published break table outwards with word length', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((_, index) => computeOrp('a'.repeat(index + 1))))
      .toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
  });

  it('anchors inside the letters when the token carries punctuation', () => {
    // '"Reading"' — the core is "Reading" (7 letters), so the anchor is its
    // third character, index 3 in the raw token.
    expect(computeOrp('"Reading"')).toBe(3);
    expect(computeOrp('(reading)')).toBe(3);
  });

  it('treats digits as anchorable and punctuation-only tokens as unanchorable', () => {
    expect(computeOrp('42')).toBe(1);
    expect(computeOrp('\u2014')).toBe(0);
    expect(computeOrp('')).toBe(0);
  });

  it('never points past the end of the token', () => {
    for (const token of ['a', 'to', 'the', 'reading', 'extraordinary', '"quoted"']) {
      const orp = computeOrp(token);
      expect(orp).toBeGreaterThanOrEqual(0);
      expect(orp).toBeLessThan(token.length);
    }
  });

  it('splits a word into the part before, at, and after the anchor', () => {
    const split = splitOrp('reading', computeOrp('reading'));
    expect(split.before).toBe('re');
    expect(split.anchor).toBe('a');
    expect(split.after).toBe('ding');
    expect(split.before + split.anchor + split.after).toBe('reading');
  });

  it('holds the anchor left of the box centre and scales with the box', () => {
    expect(FOCAL_ANCHOR_FRACTION).toBeGreaterThan(0.3);
    expect(FOCAL_ANCHOR_FRACTION).toBeLessThan(0.45);
    expect(focalOffsetPx(0)).toBe(0);
    expect(focalOffsetPx(800)).toBe(Math.round(800 * FOCAL_ANCHOR_FRACTION));
    expect(focalOffsetPx(1600)).toBeGreaterThan(focalOffsetPx(800));
  });

  it('supports a proportional anchor mode for readers who prefer it', () => {
    // The table rule lands on the third letter of a seven-letter word, which is
    // within a percentage point of a 35% proportional anchor.
    expect(computeOrp('reading', { mode: 'ratio', ratio: 0.35 })).toBe(computeOrp('reading'));
    // A centre anchor and the table rule disagree, as they should.
    expect(computeOrp('reading', { mode: 'ratio', ratio: 0.5 })).toBe(4);
  });

  it('selects the anchor index of the longest word in a chunk', () => {
    expect(selectAnchorIndex(['a', 'reading', 'it'])).toBe(1);
    expect(selectAnchorIndex([])).toBe(0);
  });
});
