/**
 * Rich Text Format ingestion.
 *
 * The reader is a group-aware scanner rather than a regex stripper, because RTF
 * semantics depend on scope: character properties revert when a group closes,
 * `\uN` characters consume a code-page fallback whose length is set by the
 * current `\ucN` count, and destinations marked with `\*` must be skipped
 * entirely. Getting those three rules wrong is what produces mojibake and
 * duplicated text in naive RTF conversion.
 */

import { normalizeParagraphText, type RawChapter, type RawParagraph } from './segmentation-engine';
import { decodeWindows1252 } from './encoding-engine';
import type { IngestDiagnostic } from './sightline-types';

export interface RtfStructure {
  readonly paragraphs: readonly RawParagraph[];
  readonly chapters: readonly RawChapter[];
  readonly info: Readonly<Record<string, string>>;
  readonly diagnostics: readonly IngestDiagnostic[];
}

interface RtfState {
  paragraph: string;
  infoStack: (string | null)[];
  noteStack: (RawParagraph['kind'] | null)[];
  noteKind: RawParagraph['kind'] | null;
  /** True when any bold run contributed to the paragraph being buffered. */
  boldBuffer: boolean;
  paragraphs: RawParagraph[];
  inTable: boolean;
  rowOpen: boolean;
  cells: string[];
  skipDepth: number;
  skipDestination: boolean;
  ucSkip: number;
  pastU: boolean;
  codePage: number;
  infoDestination: string | null;
  info: Record<string, string>;
  destinations: Set<string>;
  sawHeader: boolean;
  styleStack: { bold: boolean; italic: boolean }[];
  current: { bold: boolean; italic: boolean };
}

const INFO_KEYWORDS: Record<string, string> = {
  title: 'title',
  author: 'author',
  subject: 'subject',
  keywords: 'keywords',
  operator: 'operator',
  company: 'company',
  manager: 'manager',
  category: 'category',
  comment: 'comment',
  doccomm: 'documentComment',
  creatim: 'created',
  revtim: 'modified',
  vern: 'version',
  version: 'version',
};

/** Destinations whose content is metadata or layout, never body prose. */
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'listtable', 'listoverridetable', 'revtbl',
  'rsidtbl', 'generator', 'mmathPr', 'themedata', 'colorschememapping', 'latentstyles',
  'datastore', 'xmlnstbl', 'filetbl', 'objdata', 'pict', 'bkmkstart', 'bkmkend',
  'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'headerf', 'footerf',
  'falt', 'panose', 'fname', 'fontemb', 'fontfile', 'nonshppict', 'shpinst', 'shprslt',
  'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'upr',
]);

const CODE_PAGE_OVERRIDE: Record<number, string> = {
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
};

const decodeHexByte = (hex: string, codePage: number): string => {
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return '';
  if (codePage === 1252 || codePage === 0) return decodeWindows1252(new Uint8Array([value]));
  const label = CODE_PAGE_OVERRIDE[codePage];
  if (!label) return decodeWindows1252(new Uint8Array([value]));
  try {
    return new TextDecoder(label).decode(new Uint8Array([value]));
  } catch {
    return decodeWindows1252(new Uint8Array([value]));
  }
};

const CONTROL_WORD = /^\\([a-z]{1,32})(-?\d+)? ?/i;

export const ingestRtf = (source: string): RtfStructure => {
  const diagnostics: IngestDiagnostic[] = [];
  const state: RtfState = {
    paragraph: '',
    infoStack: [],
    noteStack: [],
    noteKind: null,
    boldBuffer: false,
    paragraphs: [],
    inTable: false,
    rowOpen: false,
    cells: [],
    skipDepth: 0,
    skipDestination: false,
    ucSkip: 1,
    pastU: false,
    codePage: 0,
    infoDestination: null,
    info: {},
    destinations: new Set(),
    sawHeader: false,
    styleStack: [],
    current: { bold: false, italic: false },
  };

  let index = 0;
  let skipCharacters = 0;

  const flushParagraph = (kind: RawParagraph['kind'] = 'body', level = 0) => {
    const text = normalizeParagraphText(state.paragraph);
    state.paragraph = '';
    if (text.length > 0) state.paragraphs.push({ kind, level, text });
    state.boldBuffer = false;
  };

  const appendCell = () => {
    const text = normalizeParagraphText(state.paragraph);
    state.paragraph = '';
    if (text.length > 0 || state.cells.length > 0) state.cells.push(text);
  };

  const flushRow = () => {
    if (state.cells.length > 0) {
      const row = state.cells.join(' | ');
      if (row.trim().length > 0) state.paragraphs.push({ kind: 'table', level: 0, text: row });
    }
    state.cells = [];
    state.rowOpen = false;
  };

  while (index < source.length) {
    const character = source[index]!;

    // Fallback bytes after a \uN control word are skipped before anything else,
    // except for braces which end the skippable run.
    if (skipCharacters > 0 && character !== '{' && character !== '}') {
      skipCharacters -= 1;
      index += 1;
      continue;
    }

    if (character === '{') {
      state.styleStack.push({ ...state.current });
      state.infoStack.push(state.infoDestination);
      state.noteStack.push(state.noteKind);
      // A nested group inside a skipped destination stays skipped.
      if (state.skipDepth > 0) state.skipDepth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      if (state.skipDepth > 0) {
        state.skipDepth -= 1;
        if (state.skipDepth === 0) state.skipDestination = false;
      }
      state.infoDestination = state.infoStack.pop() ?? null;
      // The group that just closed may have been a note destination, in which
      // case whatever it buffered becomes a note block rather than body text.
      const activeNote = state.noteKind;
      if (activeNote) flushParagraph(activeNote);
      state.noteKind = state.noteStack.pop() ?? null;
      const restored = state.styleStack.pop();
      if (restored) state.current = restored;
      if (state.inTable && state.rowOpen) flushRow();
      index += 1;
      continue;
    }

    if (character === '\\') {
      const next = source[index + 1];
      if (next === undefined) break;

      if (next === '*') {
        // Ignorable destination: skip to the matching close of this group.
        state.skipDestination = true;
        state.skipDepth += 1;
        index += 2;
        continue;
      }
      if (next === '\\' || next === '{' || next === '}' || next === '~' || next === '_' || next === '-') {
        if (state.skipDepth === 0) {
          const mapped = next === '~' ? '\u00a0' : next === '-' ? '\u00ad' : next;
          state.paragraph += mapped;
        }
        index += 2;
        continue;
      }
      if (next === "'" && /^[0-9a-f]{2}$/i.test(source.slice(index + 2, index + 4))) {
        if (state.skipDepth === 0) state.paragraph += decodeHexByte(source.slice(index + 2, index + 4), state.codePage);
        index += 4;
        continue;
      }
      const match = CONTROL_WORD.exec(source.slice(index));
      if (!match) {
        index += 1;
        continue;
      }
      const word = match[1]!.toLowerCase();
      const parameter = match[2] !== undefined ? Number.parseInt(match[2], 10) : undefined;
      index += match[0].length;

      state.destinations.add(word);
      const skipping = state.skipDepth > 0;

      if (!state.sawHeader && word === 'rtf') {
        state.sawHeader = true;
        continue;
      }
      if (word === 'ansicpg' && parameter !== undefined) {
        state.codePage = parameter;
        continue;
      }
      if (word === 'uc' && parameter !== undefined) {
        state.ucSkip = parameter;
        continue;
      }
      if (word === 'u' && parameter !== undefined) {
        const code = parameter < 0 ? parameter + 65536 : parameter;
        if (!skipping) {
          state.paragraph += String.fromCharCode(code);
          state.pastU = true;
          skipCharacters = state.ucSkip;
        }
        continue;
      }
      if (SKIP_DESTINATIONS.has(word)) {
        if (!skipping) {
          state.skipDestination = true;
          state.skipDepth += 1;
        }
        continue;
      }
      if (word === 'footnote' || word === 'endnote') {
        state.noteKind = word === 'footnote' ? 'footnote' : 'endnote';
        continue;
      }
      if (word === 'chftn' || word === 'chatn') {
        // Footnote and endnote reference markers carry no reader text.
        continue;
      }
      if (INFO_KEYWORDS[word]) {
        const key = INFO_KEYWORDS[word]!;
        const target = state.infoDestination ? state.info[state.infoDestination] ?? '' : '';
        void target;
        state.infoDestination = key;
        continue;
      }
      if (skipping) continue;

      switch (word) {
        case 'par':
        case 'line':
          if (state.inTable && state.rowOpen) {
            // \cell handles cell boundaries; a \par inside a cell is a line.
            state.paragraph += ' ';
          } else {
            // Block-level \par: a run of bold text is the writer's heading.
            flushParagraph(state.boldBuffer ? 'heading' : 'body', state.boldBuffer ? 3 : 0);
          }
          continue;
        case 'pard':
        case 'plain':
          state.current = { bold: false, italic: false };
          continue;
        case 'b':
          state.current.bold = parameter !== 0;
          continue;
        case 'i':
          state.current.italic = parameter !== 0;
          continue;
        case 'trowd':
          state.inTable = true;
          state.rowOpen = true;
          state.cells = [];
          continue;
        case 'cell':
          appendCell();
          continue;
        case 'row':
          flushRow();
          continue;
        case 'intbl':
          state.inTable = true;
          continue;
        case 'tab':
          state.paragraph += ' ';
          continue;
        case 'sect':
        case 'page':
          flushParagraph('body', 0);
          continue;
        case 'nestcell':
        case 'nestrow':
          continue;
        case 'bullet':
          state.paragraph += '\u2022 ';
          continue;
        case 'emdash':
          state.paragraph += '\u2014';
          continue;
        case 'endash':
          state.paragraph += '\u2013';
          continue;
        case 'emspace':
          state.paragraph += '\u2003';
          continue;
        case 'enspace':
          state.paragraph += '\u2002';
          continue;
        case 'qmspace':
          state.paragraph += '\u2005';
          continue;
        case 'lquote':
          state.paragraph += '\u2018';
          continue;
        case 'rquote':
          state.paragraph += '\u2019';
          continue;
        case 'ldblquote':
          state.paragraph += '\u201c';
          continue;
        case 'rdblquote':
          state.paragraph += '\u201d';
          continue;
        case 'chdate':
        case 'chtime':
          continue;
        default:
          // Control words that only change state and contribute no text are
          // intentionally ignored rather than guessed at.
          continue;
      }
    }

    if (state.skipDepth > 0) {
      index += 1;
      continue;
    }

    if (character === '\r' || character === '\n') {
      index += 1;
      continue;
    }

    if (state.infoDestination) {
      state.info[state.infoDestination] = `${state.info[state.infoDestination] ?? ''}${character}`;
      index += 1;
      continue;
    }

    state.pastU = false;
    if (state.current.bold) state.boldBuffer = true;
    state.paragraph += character;
    index += 1;
  }

  flushParagraph();
  const info: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.info)) {
    const trimmed = normalizeParagraphText(value);
    if (trimmed.length > 0) info[key] = trimmed;
  }

  const chapters: RawChapter[] = [];
  state.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraph.kind === 'heading') {
      chapters.push({ title: paragraph.text, level: paragraph.level || 2, paragraphIndex });
    }
  });

  if (state.paragraphs.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'empty-rtf',
      message: 'No readable text was found in this RTF document.',
    });
  } else if (!state.sawHeader) {
    diagnostics.push({
      level: 'warning',
      code: 'rtf-header',
      message: 'The RTF header control word was missing; the file may not be a valid RTF document.',
    });
  }

  return { paragraphs: state.paragraphs, chapters, info, diagnostics };
};
