// Document, markup & e-book engine (F15, F16, F18).
// Markdown compilation to HTML5/PDF/RTF/TXT/DOCX/EPUB, EPUB decompilation,
// and a deterministic RTF-to-structured-text parser.

import type { Root as MdastRoot, Content as MdastContent, PhrasingContent } from 'mdast';

export interface DocumentMetadata {
  title: string;
  author: string;
  language: string;
  date: string; // ISO
}

// ---------------------------------------------------------------------------
// Markdown parsing (remark + GFM)
// ---------------------------------------------------------------------------

export async function parseMarkdown(markdown: string): Promise<MdastRoot> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
  ]);
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastRoot;
}

function walk(node: { children?: unknown[] }, visit: (node: unknown) => void): void {
  visit(node);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) {
    for (const child of children) walk(child as { children?: unknown[] }, visit);
  }
}

// ---------------------------------------------------------------------------
// Markdown -> plain text
// ---------------------------------------------------------------------------

export async function markdownToText(markdown: string): Promise<string> {
  const tree = await parseMarkdown(markdown);
  const lines: string[] = [];
  let current = '';
  const flush = () => { lines.push(current.trimEnd()); current = ''; };
  const inline = (node: unknown): string => {
    const n = node as { type: string; value?: string; children?: unknown[]; url?: string };
    if (n.type === 'text' || n.type === 'inlineCode' || n.type === 'html') return n.value ?? '';
    if (n.type === 'break') return '\n';
    if (n.type === 'image') return n.url ?? '';
    if (n.type === 'link') return `${(n.children ?? []).map(inline).join('')} (${n.url ?? ''})`;
    return ((n.children ?? []) as unknown[]).map(inline).join('');
  };
  for (const block of tree.children) {
    const node = block as { type: string; children?: unknown[]; value?: string; depth?: number; ordered?: boolean };
    if (node.type === 'heading') {
      flush();
      lines.push(inline(node).toUpperCase());
      lines.push('');
    } else if (node.type === 'paragraph') {
      current += inline(node);
      flush();
      lines.push('');
    } else if (node.type === 'code') {
      flush();
      for (const codeLine of (node.value ?? '').split('\n')) lines.push(`    ${codeLine}`);
      lines.push('');
    } else if (node.type === 'blockquote') {
      flush();
      walk(node, (inner) => {
        const innerNode = inner as { type: string; value?: string };
        if (innerNode.type === 'text' && innerNode.value) current += innerNode.value;
      });
      flush();
      lines.push('');
    } else if (node.type === 'list') {
      flush();
      let index = 1;
      for (const item of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const marker = node.ordered ? `${index}.` : '-';
        const text = (item.children ?? [])
          .map((child) => {
            const childNode = child as { type: string };
            return childNode.type === 'paragraph' || childNode.type === 'listItem' ? inline(child) : '';
          })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        lines.push(`${marker} ${text}`);
        index += 1;
      }
      lines.push('');
    } else if (node.type === 'table') {
      flush();
      const rows = (node.children ?? []) as Array<{ children?: unknown[] }>;
      for (const row of rows) {
        const cells = (row.children ?? []).map((cell) => inline(cell).trim());
        lines.push(cells.join('\t'));
      }
      lines.push('');
    } else if (node.type === 'thematicBreak' || node.type === 'hr') {
      flush();
      lines.push('----------------------------------------');
      lines.push('');
    } else if (node.value) {
      lines.push(node.value);
    }
  }
  flush();
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ---------------------------------------------------------------------------
// Markdown -> standalone HTML5
// ---------------------------------------------------------------------------

export interface HtmlExportOptions {
  title: string;
  includeMathMl?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function markdownToHtml(markdown: string, options: HtmlExportOptions): Promise<string> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }, { default: remarkRehype }, { default: remarkMath }, { default: rehypeKatex }, { toHtml }] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('remark-math'),
    import('rehype-katex'),
    import('hast-util-to-html'),
  ]);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex, { output: 'mathml' });
  const hast = await processor.run(processor.parse(markdown));
  const body = toHtml(hast as never, { allowDangerousHtml: true });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title)}</title>`,
    '<style>',
    'body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; color: #1f2937; }',
    'pre { background: #f3f4f6; padding: 0.9rem; border-radius: 8px; overflow-x: auto; }',
    'code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }',
    'table { border-collapse: collapse; }',
    'th, td { border: 1px solid #d1d5db; padding: 0.4rem 0.7rem; }',
    'blockquote { border-left: 3px solid #d1d5db; margin-left: 0; padding-left: 1rem; color: #4b5563; }',
    'img { max-width: 100%; }',
    '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Markdown -> RTF (deterministic structured writer)
// ---------------------------------------------------------------------------

const rtfEscape = (value: string): string => {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\\' || char === '{' || char === '}') { out += `\\${char}`; continue; }
    if (code < 128) { out += char; continue; }
    if (code <= 0xffff) { out += `\\u${code > 32767 ? code - 65536 : code}?`; continue; }
    // Surrogate pair fallback for astral characters.
    out += '\\u63?';
  }
  return out;
};

export async function markdownToRtf(markdown: string, title: string): Promise<string> {
  const tree = await parseMarkdown(markdown);
  const parts: string[] = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\fswiss Helvetica;}{\\f1\\fmodern Courier;}}',
    '\\f0\\fs22',
    `{\\pard\\qc\\b\\fs32 ${rtfEscape(title)}\\par}`,
  ];

  const renderInline = (nodes: unknown[], open: string, close: string): string =>
    (nodes as Array<Record<string, unknown>>).map((node) => {
      const type = node.type as string;
      if (type === 'text') return rtfEscape(node.value as string);
      if (type === 'inlineCode') return `{\\f1 ${rtfEscape(node.value as string)}}`;
      if (type === 'break') return '\\line ';
      if (type === 'strong') return `{\\b ${renderInline(node.children as unknown[], open, close)}}`;
      if (type === 'emphasis') return `{\\i ${renderInline(node.children as unknown[], open, close)}}`;
      if (type === 'delete') return `{\\strike ${renderInline(node.children as unknown[], open, close)}}`;
      if (type === 'link') {
        const label = renderInline(node.children as unknown[], open, close);
        return `${label} ({\\i ${rtfEscape(node.url as string)}})`;
      }
      if (type === 'image') return `[${rtfEscape((node.url as string) ?? 'image')}]`;
      if (Array.isArray(node.children)) return renderInline(node.children as unknown[], open, close);
      return '';
    }).join('');

  for (const block of tree.children) {
    const node = block as { type: string; depth?: number; children?: unknown[]; value?: string; ordered?: boolean };
    if (node.type === 'heading') {
      const size = node.depth === 1 ? 32 : node.depth === 2 ? 28 : 24;
      parts.push(`{\\pard\\b\\fs${size} ${renderInline(node.children ?? [], '', '')}\\par}`);
    } else if (node.type === 'paragraph') {
      parts.push(`{\\pard ${renderInline(node.children ?? [], '', '')}\\par}`);
    } else if (node.type === 'code') {
      for (const line of (node.value ?? '').split('\n')) {
        parts.push(`{\\pard\\f1\\fs18 ${rtfEscape(line)}\\par}`);
      }
    } else if (node.type === 'list') {
      let index = 1;
      for (const item of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const marker = node.ordered ? `${index}.\\tab` : '\\bullet\\tab';
        const text = (item.children ?? [])
          .map((child) => ((child as { type: string }).type === 'paragraph' ? renderInline((child as { children?: unknown[] }).children ?? [], '', '') : ''))
          .join(' ');
        parts.push(`{\\pard\\fi-360\\li720 ${marker}${text}\\par}`);
        index += 1;
      }
    } else if (node.type === 'blockquote') {
      const text: string[] = [];
      walk(node, (inner) => {
        const innerNode = inner as { type: string; value?: string };
        if (innerNode.type === 'text' && innerNode.value) text.push(innerNode.value);
      });
      parts.push(`{\\pard\\li480\\i ${rtfEscape(text.join(' '))}\\par}`);
    } else if (node.type === 'table') {
      for (const row of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const cells = (row.children ?? []).map((cell) => renderInline((cell as { children?: unknown[] }).children ?? [], '', ''));
        parts.push(`{\\pard ${cells.join(' \\tab ')}\\par}`);
      }
    } else if (node.type === 'thematicBreak') {
      parts.push('{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}');
    }
  }
  parts.push('}');
  return `${parts.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Markdown -> PDF (pdf-lib flow layout)
// ---------------------------------------------------------------------------

const sanitizeWinAnsi = (value: string): string =>
  Array.from(value).map((char) => {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2022 || code === 0x2013 || code === 0x2014 || code === 0x2018 || code === 0x2019 || code === 0x201c || code === 0x201d || code === 0x2026 || code === 0x20ac) return char;
    if (code >= 0xa0 && code <= 0xff) return char;
    if (code < 128) return char;
    return '?';
  }).join('');

interface PdfLine {
  text: string;
  size: number;
  bold: boolean;
  mono: boolean;
  indent: number;
}

function wrapText(text: string, maxWidth: number, size: number, measure: (text: string, size: number) => number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (measure(word, size) <= maxWidth) {
        current = word;
      } else {
        // Hard-break overlong words.
        let chunk = '';
        for (const char of word) {
          if (measure(chunk + char, size) > maxWidth && chunk) { lines.push(chunk); chunk = char; }
          else chunk += char;
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function markdownToPdf(markdown: string, title: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('InMo Tools Transcode Workstation');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const tree = await parseMarkdown(markdown);
  const lines: PdfLine[] = [];
  const pushText = (text: string, size: number, boldFlag: boolean, monoFlag: boolean, indent: number, maxWidth: number, measure: (t: string, s: number) => number) => {
    for (const line of wrapText(text, maxWidth, size, measure)) {
      lines.push({ text: line, size, bold: boldFlag, mono: monoFlag, indent });
    }
  };

  const measureRegular = (text: string, size: number) => regular.widthOfTextAtSize(sanitizeWinAnsi(text), size);
  const measureMono = (text: string, size: number) => mono.widthOfTextAtSize(sanitizeWinAnsi(text), size);
  const bodyWidth = 612 - 108; // Letter minus 54pt margins

  const inlineText = (nodes: unknown[]): string =>
    (nodes as Array<Record<string, unknown>>).map((node) => {
      const type = node.type as string;
      if (type === 'text' || type === 'inlineCode') return node.value as string;
      if (type === 'break') return ' ';
      if (Array.isArray(node.children)) return inlineText(node.children as unknown[]);
      if (type === 'image') return `[image: ${node.url ?? ''}]`;
      if (type === 'link') return `${inlineText(node.children as unknown[])} (${node.url ?? ''})`;
      return '';
    }).join('');

  lines.push({ text: sanitizeWinAnsi(title), size: 20, bold: true, mono: false, indent: 0 });
  lines.push({ text: '', size: 11, bold: false, mono: false, indent: 0 });

  for (const block of tree.children) {
    const node = block as { type: string; depth?: number; children?: unknown[]; value?: string; ordered?: boolean };
    if (node.type === 'heading') {
      const size = node.depth === 1 ? 18 : node.depth === 2 ? 15 : 13;
      pushText(inlineText(node.children ?? []), size, true, false, 0, bodyWidth, measureRegular);
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    } else if (node.type === 'paragraph') {
      pushText(inlineText(node.children ?? []), 11, false, false, 0, bodyWidth, measureRegular);
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    } else if (node.type === 'code') {
      for (const codeLine of (node.value ?? '').split('\n')) {
        pushText(codeLine, 8.5, false, true, 18, bodyWidth - 18, measureMono);
      }
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    } else if (node.type === 'list') {
      let index = 1;
      for (const item of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const marker = node.ordered ? `${index}.  ` : '\u2022  ';
        const text = (item.children ?? [])
          .map((child) => ((child as { type: string }).type === 'paragraph' ? inlineText((child as { children?: unknown[] }).children ?? []) : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pushText(`${marker}${text}`, 11, false, false, 18, bodyWidth - 18, measureRegular);
        index += 1;
      }
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    } else if (node.type === 'blockquote') {
      const collected: string[] = [];
      walk(node, (inner) => {
        const innerNode = inner as { type: string; value?: string };
        if (innerNode.type === 'text' && innerNode.value) collected.push(innerNode.value);
      });
      pushText(collected.join(' '), 11, false, false, 24, bodyWidth - 24, measureRegular);
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    } else if (node.type === 'table') {
      for (const row of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const cells = (row.children ?? []).map((cell) => inlineText((cell as { children?: unknown[] }).children ?? []).trim());
        pushText(cells.join('   |   '), 10, false, true, 0, bodyWidth, measureMono);
      }
      lines.push({ text: '', size: 6, bold: false, mono: false, indent: 0 });
    }
  }

  let page = doc.addPage([612, 792]);
  let y = 792 - 54;
  for (const line of lines) {
    const leading = line.size * 1.35;
    if (y - leading < 54) {
      page = doc.addPage([612, 792]);
      y = 792 - 54;
    }
    if (line.text.length > 0) {
      const font = line.mono ? mono : line.bold ? bold : regular;
      page.drawText(sanitizeWinAnsi(line.text), { x: 54 + line.indent, y, size: line.size, font, color: rgb(0.12, 0.14, 0.18) });
    }
    y -= leading;
  }

  const bytes = await doc.save();
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Markdown -> DOCX
// ---------------------------------------------------------------------------

export async function markdownToDocx(markdown: string, title: string): Promise<Uint8Array> {
  const docx = await import('docx');
  const tree = await parseMarkdown(markdown);
  const children: InstanceType<typeof docx.Paragraph | typeof docx.Table>[] = [];

  const runsOf = (nodes: unknown[]): InstanceType<typeof docx.TextRun>[] => {
    const runs: InstanceType<typeof docx.TextRun>[] = [];
    const visit = (nodeList: unknown[], boldFlag: boolean, italicFlag: boolean) => {
      for (const raw of nodeList as Array<Record<string, unknown>>) {
        const type = raw.type as string;
        if (type === 'text') runs.push(new docx.TextRun({ text: raw.value as string, bold: boldFlag, italics: italicFlag }));
        else if (type === 'inlineCode') runs.push(new docx.TextRun({ text: raw.value as string, font: 'Courier New' }));
        else if (type === 'strong') visit(raw.children as unknown[], true, italicFlag);
        else if (type === 'emphasis') visit(raw.children as unknown[], boldFlag, true);
        else if (type === 'break') runs.push(new docx.TextRun({ text: '', break: 1 }));
        else if (type === 'link') {
          visit(raw.children as unknown[], boldFlag, italicFlag);
          runs.push(new docx.TextRun({ text: ` (${raw.url as string})`, italics: true }));
        } else if (Array.isArray(raw.children)) visit(raw.children as unknown[], boldFlag, italicFlag);
      }
    };
    visit(nodes, false, false);
    return runs.length > 0 ? runs : [new docx.TextRun('')];
  };

  children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: title, bold: true, size: 40 })], heading: docx.HeadingLevel.TITLE }));

  for (const block of tree.children) {
    const node = block as { type: string; depth?: number; children?: unknown[]; value?: string; ordered?: boolean };
    if (node.type === 'heading') {
      const heading = node.depth === 1 ? docx.HeadingLevel.HEADING_1 : node.depth === 2 ? docx.HeadingLevel.HEADING_2 : docx.HeadingLevel.HEADING_3;
      children.push(new docx.Paragraph({ children: runsOf(node.children ?? []), heading }));
    } else if (node.type === 'paragraph') {
      children.push(new docx.Paragraph({ children: runsOf(node.children ?? []) }));
    } else if (node.type === 'code') {
      for (const codeLine of (node.value ?? '').split('\n')) {
        children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: codeLine, font: 'Courier New', size: 18 })] }));
      }
    } else if (node.type === 'list') {
      let index = 1;
      for (const item of (node.children ?? []) as Array<{ children?: unknown[] }>) {
        const text = (item.children ?? [])
          .map((child) => ((child as { type: string }).type === 'paragraph' ? runsOf((child as { children?: unknown[] }).children ?? []) : []))
          .flat();
        children.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: node.ordered ? `${index}.  ` : '\u2022  ' }), ...text],
          indent: { left: 360 },
        }));
        index += 1;
      }
    } else if (node.type === 'blockquote') {
      const collected: string[] = [];
      walk(node, (inner) => {
        const innerNode = inner as { type: string; value?: string };
        if (innerNode.type === 'text' && innerNode.value) collected.push(innerNode.value);
      });
      children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: collected.join(' '), italics: true })], indent: { left: 480 } }));
    } else if (node.type === 'table') {
      const rows = (node.children ?? []) as Array<{ children?: unknown[] }>;
      children.push(new docx.Table({
        rows: rows.map((row) => new docx.TableRow({
          children: (row.children ?? []).map((cell) => new docx.TableCell({
            children: [new docx.Paragraph({ children: runsOf((cell as { children?: unknown[] }).children ?? []) })],
          })),
        })),
      }));
    }
  }

  const document = new docx.Document({
    creator: 'InMo Tools Transcode Workstation',
    title,
    sections: [{ children: children as never[] }],
  });
  const buffer = await docx.Packer.toArrayBuffer(document);
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// EPUB synthesis (F16)
// ---------------------------------------------------------------------------

interface EpubChapter {
  id: string;
  file: string;
  title: string;
  html: string;
}

async function chapterHtmlFromMarkdown(markdown: string): Promise<string> {
  const [{ unified }, { default: remarkParse }, { default: remarkGfm }, { default: remarkRehype }, { toHtml }] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('hast-util-to-html'),
  ]);
  const hast = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).run(unified().use(remarkParse).use(remarkGfm).parse(markdown));
  return toHtml(hast as never);
}

function splitMarkdownIntoChapters(markdown: string, fallbackTitle: string): Array<{ title: string; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const chapters: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (currentTitle !== null || body.some((line) => line.trim().length > 0)) {
      chapters.push({ title: currentTitle ?? fallbackTitle, body: body.join('\n').trim() });
    }
    body = [];
  };
  for (const line of lines) {
    const heading = /^#\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      currentTitle = heading[1].trim();
    } else {
      body.push(line);
    }
  }
  flush();
  if (chapters.length === 0) chapters.push({ title: fallbackTitle, body: markdown.trim() });
  return chapters;
}

function deterministicUuid(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-a${hex.slice(1, 4)}-${hex.repeat(3).slice(0, 12)}`;
}

export async function markdownToEpub(markdown: string, metadata: DocumentMetadata): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const chapters = splitMarkdownIntoChapters(markdown, metadata.title);
  const built: EpubChapter[] = [];
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const html = await chapterHtmlFromMarkdown(chapter.body.length > 0 ? chapter.body : `# ${chapter.title}`);
    built.push({
      id: `chapter-${index + 1}`,
      file: `chapter-${index + 1}.xhtml`,
      title: chapter.title,
      html: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">',
        '<head>',
        `<title>${escapeHtml(chapter.title)}</title>`,
        '<meta charset="utf-8"/>',
        '</head>',
        `<body>${html}</body>`,
        '</html>',
      ].join('\n'),
    });
  }

  const uuid = deterministicUuid(`${metadata.title}|${metadata.author}`);
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>',
    '</container>',
  ].join('\n'));

  const manifest = built.map((chapter) => `<item id="${chapter.id}" href="${chapter.file}" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = built.map((chapter) => `<itemref idref="${chapter.id}"/>`).join('\n');
  const oebps = zip.folder('OEBPS')!;
  oebps.file('content.opf', [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">',
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:identifier id="pub-id">${uuid}</dc:identifier>`,
    `<dc:title>${escapeHtml(metadata.title)}</dc:title>`,
    `<dc:creator>${escapeHtml(metadata.author)}</dc:creator>`,
    `<dc:language>${escapeHtml(metadata.language)}</dc:language>`,
    `<dc:date>${metadata.date.slice(0, 10)}</dc:date>`,
    '<meta property="dcterms:modified">' + metadata.date.replace(/\.\d{3}Z$/, 'Z') + '</meta>',
    '</metadata>',
    '<manifest>',
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    manifest,
    '</manifest>',
    `<spine>${spine}</spine>`,
    '</package>',
  ].join('\n'));

  oebps.file('nav.xhtml', [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">',
    '<head><title>Table of Contents</title><meta charset="utf-8"/></head>',
    '<body><nav epub:type="toc"><h1>Table of Contents</h1><ol>',
    ...built.map((chapter) => `<li><a href="${chapter.file}">${escapeHtml(chapter.title)}</a></li>`),
    '</ol></nav></body>',
    '</html>',
  ].join('\n'));

  oebps.file('toc.ncx', [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
    `<head><meta name="dtb:uid" content="${uuid}"/></head>`,
    `<docTitle><text>${escapeHtml(metadata.title)}</text></docTitle>`,
    '<navMap>',
    ...built.map((chapter, index) => [
      `<navPoint id="nav-${index + 1}" playOrder="${index + 1}">`,
      `<navLabel><text>${escapeHtml(chapter.title)}</text></navLabel>`,
      `<content src="${chapter.file}"/>`,
      '</navPoint>',
    ].join('\n')),
    '</navMap>',
    '</ncx>',
  ].join('\n'));

  for (const chapter of built) oebps.file(chapter.file, chapter.html);

  const buffer = await zip.generateAsync({ type: 'arraybuffer', mimeType: 'application/epub+zip' });
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// EPUB decompilation (F16)
// ---------------------------------------------------------------------------

export interface EpubExtraction {
  title: string;
  html: string;
  fileCount: number;
}

export async function decompileEpub(bytes: Uint8Array): Promise<EpubExtraction> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('Not a valid EPUB: META-INF/container.xml is missing.');
  const rootMatch = /full-path="([^"]+)"/.exec(container);
  if (!rootMatch) throw new Error('Not a valid EPUB: no rootfile declared.');
  const opfPath = rootMatch[1];
  const opfDir = opfPath.includes('/') ? `${opfPath.slice(0, opfPath.lastIndexOf('/'))}/` : '';
  const opf = await zip.file(opfPath)?.async('string');
  if (!opf) throw new Error('Not a valid EPUB: package document is missing.');

  const titleMatch = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Untitled';

  const hrefById = new Map<string, string>();
  for (const match of opf.matchAll(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/?>/g)) {
    hrefById.set(match[1], match[2]);
  }
  const spineOrder = [...opf.matchAll(/<itemref[^>]*idref="([^"]+)"[^>]*\/?>/g)].map((match) => match[1]);
  const ordered = spineOrder.length > 0 ? spineOrder : [...hrefById.keys()];

  const sections: string[] = [];
  for (const id of ordered) {
    const href = hrefById.get(id);
    if (!href) continue;
    const content = await zip.file(opfDir + href)?.async('string');
    if (!content) continue;
    const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(content);
    sections.push((bodyMatch ? bodyMatch[1] : content).trim());
  }

  return { title, html: sections.join('\n<hr/>\n'), fileCount: Object.keys(zip.files).length };
}

/** Strip HTML tags to plain text without requiring a DOM. */
export function htmlToPlainText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const blockSeparated = withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ');
  const text = blockSeparated.replace(/<[^>]+>/g, '');
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return `${decoded.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  const bodyOnly = /<body[^>]*>([\s\S]*?)<\/body>/i.test(html)
    ? (/<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html)
    : html;
  return service.turndown(bodyOnly);
}

// Re-export phrasing helper types for tests/consumers.
export type { MdastRoot, MdastContent, PhrasingContent };
