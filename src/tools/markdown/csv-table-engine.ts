import type { Root, RootContent, Table } from 'mdast';
import { buildTableFromRows } from './table-builder';

// CSV <-> Markdown pipe tables. CSV follows RFC 4180 (quoted fields, doubled quotes, line breaks inside
// quotes); the delimiter is a comma, or a semicolon or tab when the first row uses that instead.

export const MAX_CSV_ROWS = 5000;
export const MAX_CSV_COLUMNS = 100;

export class CsvTableError extends Error {}

const DELIMITERS = [',', ';', '\t'] as const;

const detectDelimiter = (text: string): string => {
  let inQuotes = false;
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === '\n' || char === '\r')) break;
    else if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ',';
  let bestCount = counts.get(',') ?? 0;
  for (const delimiter of DELIMITERS) {
    const count = counts.get(delimiter) ?? 0;
    if (count > bestCount) { best = delimiter; bestCount = count; }
  }
  return best;
};

export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  const endField = () => { row.push(field); field = ''; fieldStarted = false; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS) throw new CsvTableError(`Use at most ${MAX_CSV_ROWS} rows.`);
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else inQuotes = false;
      } else field += char;
    } else if (char === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      endRow();
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new CsvTableError('The CSV has a quote that is never closed.');
  if (fieldStarted || field !== '' || row.length > 0) endRow();
  return rows;
};

const escapeCell = (value: string): string =>
  value.trim().replace(/\r\n|\r|\n/g, '<br>').replace(/\|/g, '\\|');

export const csvToMarkdownTable = (csv: string): string => {
  const rows = parseCsv(csv);
  if (!rows.some((row) => row.some((cell) => cell.trim() !== ''))) throw new CsvTableError('Paste some CSV first.');
  const width = Math.max(...rows.map((row) => row.length));
  if (width > MAX_CSV_COLUMNS) throw new CsvTableError(`Use at most ${MAX_CSV_COLUMNS} columns.`);
  return buildTableFromRows(rows.map((row) =>
    Array.from({ length: width }, (_, column) => escapeCell(row[column] ?? ''))));
};

const quoteCsvField = (value: string): string =>
  /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const rowsToCsv = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.map(quoteCsvField).join(',')).join('\n');

const BLOCKQUOTE_PREFIX = /^\s*(?:>\s?)+/;
const DELIMITER_CELL = /^:?-+:?$/;

const splitTableRow = (line: string): string[] => {
  const text = line.replace(BLOCKQUOTE_PREFIX, '').trim();
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (char === '\\' && text[index + 1] === '|') { cell += '|'; index += 1; }
    else if (char === '|') { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && !text.endsWith('\\|') && cells.length > 0) cells.pop();
  return cells.map((value) => value.trim().replace(/<br\s*\/?>/gi, '\n'));
};

export const markdownTableToCsv = (tableSource: string): string => {
  const lines = tableSource.split(/\r\n|\r|\n/).filter((line) => line.replace(BLOCKQUOTE_PREFIX, '').trim() !== '');
  const rows = lines.map(splitTableRow);
  const second = rows[1];
  if (second && second.length > 0 && second.every((cell) => DELIMITER_CELL.test(cell))) rows.splice(1, 1);
  if (rows.length === 0) throw new CsvTableError('That is not a Markdown table.');
  return rowsToCsv(rows);
};

export interface TableAtCursor {
  readonly startLine: number;
  readonly endLine: number;
  readonly source: string;
}

const findTables = (nodes: readonly RootContent[], found: Table[]): void => {
  for (const node of nodes) {
    if (node.type === 'table') found.push(node);
    else if ('children' in node) findTables(node.children as RootContent[], found);
  }
};

// The table containing a 1-based document line. `lineOffset` is the number of frontmatter lines the
// tree's positions do not count.
export const findTableAtLine = (tree: Root, source: string, line: number, lineOffset = 0): TableAtCursor | null => {
  const tables: Table[] = [];
  findTables(tree.children, tables);
  const lines = source.split(/\r\n|\r|\n/);
  for (const table of tables) {
    const start = (table.position?.start.line ?? 0) + lineOffset;
    const end = (table.position?.end.line ?? 0) + lineOffset;
    if (start > 0 && line >= start && line <= end) {
      return { startLine: start, endLine: end, source: lines.slice(start - 1, end).join('\n') };
    }
  }
  return null;
};
