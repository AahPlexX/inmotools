// Deterministic RTF parsing engine (F18).
// Extracts readable text with inline bold/italic/underline/strikethrough and
// paragraph alignment from RTF control-word streams, skipping font/color/style
// tables and binary destinations. Output targets: TXT, HTML, Markdown.

export interface RtfRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

export interface RtfParagraph {
  runs: RtfRun[];
  align: 'left' | 'center' | 'right' | 'justify';
}

export interface RtfDocument {
  paragraphs: RtfParagraph[];
  skippedDestinations: string[];
}

// Windows-1252 specials for \'hh escapes.
const CP1252: Record<number, string> = {
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
  0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d', 0x91: '\u2018',
  0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02dc',
  0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178',
};

const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'themedata', 'datastore', 'latentstyles',
  'listtable', 'listoverridetable', 'generator', 'xmlnstbl', 'header', 'footer', 'headerl', 'headerr',
  'headerf', 'footerl', 'footerr', 'footerf', 'filetbl', 'revtbl', 'fldinst', 'object', 'shp', 'do',
  'mmathpr', 'colorschememapping', 'wgrffmtfilter', 'bkmkstart', 'bkmkend',
]);

interface GroupState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  skipping: boolean;
  extension: boolean;
}

export function parseRtf(source: string): RtfDocument {
  const text = source;
  const length = text.length;
  let i = 0;

  if (!/\{\\rtf/i.test(text.slice(0, 64))) throw new Error('Input is not an RTF document.');

  const paragraphs: RtfParagraph[] = [];
  const skipped: string[] = [];
  const stack: GroupState[] = [];
  let state: GroupState = { bold: false, italic: false, underline: false, strike: false, skipping: false, extension: false };
  let ucSkip = 1;

  let runs: RtfRun[] = [];
  let align: RtfParagraph['align'] = 'left';
  let pendingAlign: RtfParagraph['align'] | null = null;
  let buffer = '';

  const flushRun = () => {
    if (buffer.length === 0) return;
    const last = runs[runs.length - 1];
    if (last && last.bold === state.bold && last.italic === state.italic && last.underline === state.underline && last.strike === state.strike) {
      last.text += buffer;
    } else {
      runs.push({ text: buffer, bold: state.bold, italic: state.italic, underline: state.underline, strike: state.strike });
    }
    buffer = '';
  };

  const endParagraph = () => {
    flushRun();
    const hasContent = runs.some((run) => run.text.trim().length > 0);
    if (hasContent) paragraphs.push({ runs, align: pendingAlign ?? align });
    runs = [];
    pendingAlign = null;
  };

  const emit = (chars: string) => {
    if (state.skipping || chars.length === 0) return;
    buffer += chars;
  };

  const pushGroup = () => {
    stack.push(state);
    state = { ...state, extension: false };
  };

  const popGroup = () => {
    const previous = stack.pop();
    if (previous) state = previous;
  };

  const skipFallback = (count: number) => {
    for (let skippedCount = 0; skippedCount < count; skippedCount += 1) {
      if (i >= length) return;
      if (text[i] === '\\') {
        if (text[i + 1] === "'") { i += 4; continue; }
        // Consume a control word or control symbol.
        i += 1;
        while (i < length && /[a-zA-Z]/.test(text[i])) i += 1;
        if (i < length && /[-\d]/.test(text[i])) {
          i += 1;
          while (i < length && /\d/.test(text[i])) i += 1;
        }
        if (i < length && text[i] === ' ') i += 1;
        continue;
      }
      i += 1;
    }
  };

  const handleKeyword = (word: string, param: number | null) => {
    if (state.skipping) return;
    switch (word) {
      case 'par': case 'sect': endParagraph(); return;
      case 'pard': align = 'left'; return;
      case 'line': emit('\n'); return;
      case 'tab': emit('\t'); return;
      case 'emdash': emit('\u2014'); return;
      case 'endash': emit('\u2013'); return;
      case 'bullet': emit('\u2022'); return;
      case 'lquote': emit('\u2018'); return;
      case 'rquote': emit('\u2019'); return;
      case 'ldblquote': emit('\u201c'); return;
      case 'rdblquote': emit('\u201d'); return;
      case 'nonbreakingspace': emit('\u00a0'); return;
      case 'b': flushRun(); state = { ...state, bold: param !== 0 }; return;
      case 'i': flushRun(); state = { ...state, italic: param !== 0 }; return;
      case 'ul': flushRun(); state = { ...state, underline: param !== 0 }; return;
      case 'ulnone': flushRun(); state = { ...state, underline: false }; return;
      case 'strike': flushRun(); state = { ...state, strike: param !== 0 }; return;
      case 'qc': pendingAlign = 'center'; return;
      case 'ql': pendingAlign = 'left'; return;
      case 'qr': pendingAlign = 'right'; return;
      case 'qj': pendingAlign = 'justify'; return;
      case 'uc': ucSkip = param ?? 1; return;
      case 'u': {
        const value = param ?? 0;
        const code = value < 0 ? value + 65536 : value;
        emit(String.fromCharCode(code));
        skipFallback(ucSkip);
        return;
      }
      default:
        break;
    }
    // Destination keywords begin a skipped group.
    if (SKIP_DESTINATIONS.has(word.toLowerCase()) || state.extension) {
      state = { ...state, skipping: true };
      if (!skipped.includes(word)) skipped.push(word);
    }
  };

  while (i < length) {
    const char = text[i];
    if (char === '{') {
      pushGroup();
      i += 1;
      continue;
    }
    if (char === '}') {
      flushRun();
      popGroup();
      i += 1;
      continue;
    }
    if (char === '\\') {
      const next = text[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        emit(next);
        i += 2;
        continue;
      }
      if (next === '~') { emit('\u00a0'); i += 2; continue; }
      if (next === '-') { i += 2; continue; } // optional hyphen
      if (next === '_') { emit('\u2011'); i += 2; continue; }
      if (next === '*') { state = { ...state, extension: true }; i += 2; continue; }
      if (next === "'") {
        const byte = Number.parseInt(text.slice(i + 2, i + 4), 16);
        if (!Number.isNaN(byte)) {
          if (state.skipping) {
            i += 4;
          } else {
            emit(byte >= 0x80 && byte <= 0x9f ? CP1252[byte] ?? '?' : String.fromCharCode(byte));
            i += 4;
          }
        } else {
          i += 4;
        }
        continue;
      }
      if (next === '\n' || next === '\r') { endParagraph(); i += 2; continue; }
      if (next && /[a-zA-Z]/.test(next)) {
        let j = i + 1;
        let word = '';
        while (j < length && /[a-zA-Z]/.test(text[j])) { word += text[j]; j += 1; }
        let param: number | null = null;
        if (j < length && (text[j] === '-' || /\d/.test(text[j]))) {
          let numeric = '';
          if (text[j] === '-') { numeric = '-'; j += 1; }
          while (j < length && /\d/.test(text[j])) { numeric += text[j]; j += 1; }
          param = Number.parseInt(numeric, 10);
        }
        if (j < length && text[j] === ' ') j += 1; // delimiter space consumed
        i = j;
        handleKeyword(word, param);
        continue;
      }
      i += 2; // unknown control symbol
      continue;
    }
    if (char === '\r' || char === '\n') { i += 1; continue; }
    emit(char);
    i += 1;
  }
  endParagraph();

  return { paragraphs, skippedDestinations: skipped };
}

// ---------------------------------------------------------------------------
// Output emitters
// ---------------------------------------------------------------------------

export function rtfToText(document: RtfDocument): string {
  const paragraphs = document.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join(''));
  return `${paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

const escapeHtmlText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function rtfToHtml(document: RtfDocument, title: string): string {
  const body = document.paragraphs
    .map((paragraph) => {
      const content = paragraph.runs
        .map((run) => {
          let html = escapeHtmlText(run.text);
          html = html.replace(/ {2}/g, ' &nbsp;').replace(/\n/g, '<br>');
          if (run.bold) html = `<strong>${html}</strong>`;
          if (run.italic) html = `<em>${html}</em>`;
          if (run.underline) html = `<u>${html}</u>`;
          if (run.strike) html = `<s>${html}</s>`;
          return html;
        })
        .join('');
      const style = paragraph.align !== 'left' ? ` style="text-align: ${paragraph.align}"` : '';
      return `<p${style}>${content}</p>`;
    })
    .join('\n');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtmlText(title)}</title>`,
    '<style>body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; }</style>',
    '</head>',
    `<body>\n${body}\n</body>`,
    '</html>',
    '',
  ].join('\n');
}

export function rtfToMarkdown(document: RtfDocument): string {
  const paragraphs = document.paragraphs.map((paragraph) =>
    paragraph.runs
      .map((run) => {
        let text = run.text.replace(/\n/g, '  \n');
        if (!text.trim()) return text;
        if (run.bold) text = `**${text.trim()}**`;
        if (run.italic) text = `*${text.trim()}*`;
        if (run.strike) text = `~~${text.trim()}~~`;
        return text;
      })
      .join(''),
  );
  return `${paragraphs.join('\n\n').trim()}\n`;
}
