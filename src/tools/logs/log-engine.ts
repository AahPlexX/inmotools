import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';

export interface StructuredLogs {
  columns: string[];
  rows: Array<Record<string, string>>;
  unmatched: string[];
  kinds: Record<string, ColumnKind>;
  rowLineNumbers?: number[];
  unmatchedLineNumbers?: number[];
  skippedEmptyMatches?: number;
}

export interface LogPatternFlags {
  readonly ignoreCase?: boolean;
  readonly multiline?: boolean;
  readonly dotAll?: boolean;
}

export const buildPatternFlags = (flags: LogPatternFlags = {}): string =>
  `${flags.ignoreCase ? 'i' : ''}${flags.multiline ? 'm' : ''}${flags.dotAll ? 's' : ''}`;

// Parse the pattern with the same ECMAScript grammar used by the regex engine,
// instead of trying to rediscover named-group syntax with a source-text scan.
// This matters for escaped IdentifierName syntax such as (?<\u0061>...), where
// the semantic group name is "a", not the six source characters "\\u0061".
export function extractGroupNames(pattern: string): string[] {
  const parser = new RegExpParser();
  for (const unicode of [true, false]) {
    try {
      const ast = parser.parsePattern(pattern, 0, pattern.length, unicode);
      const names: string[] = [];
      visitRegExpAST(ast, {
        onCapturingGroupEnter(node) {
          if (node.name && !names.includes(node.name)) names.push(node.name);
        },
      });
      return names;
    } catch {
      // Try the other Unicode grammar before treating the draft as invalid.
    }
  }
  return [];
}

export type LogScanMode = 'line' | 'document';

export function structureLogLines(
  input: string,
  pattern: string,
  flags: LogPatternFlags = {},
  mode: LogScanMode = 'line',
): StructuredLogs {
  return mode === 'document'
    ? structureWholeDocument(input, pattern, flags)
    : structureEachLine(input, pattern, flags);
}

function structureEachLine(input: string, pattern: string, flags: LogPatternFlags): StructuredLogs {
  const regex = new RegExp(pattern, buildPatternFlags(flags));
  const rows: Array<Record<string, string>> = [];
  const unmatched: string[] = [];
  const rowLineNumbers: number[] = [];
  const unmatchedLineNumbers: number[] = [];
  let discovered = extractGroupNames(pattern);

  input.split(/\r?\n/).forEach((line, index) => {
    if (!line) return;
    const match = regex.exec(line);
    if (!match) {
      unmatched.push(line);
      unmatchedLineNumbers.push(index + 1);
      return;
    }
    const groups = match.groups ?? {};
    if (discovered.length === 0) discovered = Object.keys(groups);
    rows.push(Object.fromEntries(discovered.map((column) => [column, groups[column] ?? ''])));
    rowLineNumbers.push(index + 1);
  });
  return { columns: discovered, rows, unmatched, kinds: inferColumnKinds(rows, discovered), rowLineNumbers, unmatchedLineNumbers };
}

function buildLineStarts(input: string): number[] {
  const starts = [0];
  for (let index = 0; index < input.length; index += 1) if (input[index] === '\n') starts.push(index + 1);
  return starts;
}
function lineNumberAt(starts: number[], offset: number): number {
  let low = 0; let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1; else high = middle;
  }
  return Math.max(1, low);
}

function structureWholeDocument(input: string, pattern: string, flags: LogPatternFlags): StructuredLogs {
  const regex = new RegExp(pattern, `g${buildPatternFlags(flags)}`);
  const rows: Array<Record<string, string>> = [];
  const unmatched: string[] = [];
  const rowLineNumbers: number[] = [];
  const unmatchedLineNumbers: number[] = [];
  const lineStarts = buildLineStarts(input);
  let discovered = extractGroupNames(pattern);
  let cursor = 0;
  let skippedEmptyMatches = 0;

  for (const match of input.matchAll(regex)) {
    if (match[0].length === 0) {
      skippedEmptyMatches += 1;
      continue;
    }
    const start = match.index ?? 0;
    pushGap(unmatched, unmatchedLineNumbers, input.slice(cursor, start), lineNumberAt(lineStarts, cursor));
    cursor = start + match[0].length;

    const groups = match.groups ?? {};
    if (discovered.length === 0) discovered = Object.keys(groups);
    rows.push(Object.fromEntries(discovered.map((column) => [column, groups[column] ?? ''])));
    rowLineNumbers.push(lineNumberAt(lineStarts, start));
  }

  pushGap(unmatched, unmatchedLineNumbers, input.slice(cursor), lineNumberAt(lineStarts, cursor));
  return {
    columns: discovered,
    rows,
    unmatched,
    kinds: inferColumnKinds(rows, discovered),
    rowLineNumbers,
    unmatchedLineNumbers,
    skippedEmptyMatches,
  };
}

function pushGap(unmatched: string[], lineNumbers: number[], gap: string, startingLine: number): void {
  gap.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    unmatched.push(trimmed);
    lineNumbers.push(startingLine + index);
  });
}

export type ColumnKind = 'integer' | 'decimal' | 'timestamp' | 'text' | 'empty';

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d*\.\d+$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function inferColumnKind(values: string[]): ColumnKind {
  const present = values.filter((value) => value.trim() !== '');
  if (present.length === 0) return 'empty';
  if (present.every((value) => TIMESTAMP.test(value.trim()))) return 'timestamp';
  if (present.every((value) => INTEGER.test(value.trim()))) return 'integer';
  if (present.every((value) => INTEGER.test(value.trim()) || DECIMAL.test(value.trim()))) return 'decimal';
  return 'text';
}

export function inferColumnKinds(
  rows: Array<Record<string, string>>,
  columns: string[],
): Record<string, ColumnKind> {
  return Object.fromEntries(columns.map((column) => [
    column,
    inferColumnKind(rows.map((row) => row[column] ?? '')),
  ]));
}

function spreadsheetSafeText(value: unknown): string {
  const text = String(value ?? '');
  if (/^[=+@]/.test(text) || /^-(?!\d+(?:\.\d+)?$)/.test(text)) return `'${text}`;
  return text;
}
function csvCell(value: unknown): string {
  const text = spreadsheetSafeText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

export function rowsToMarkdown(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(' | ')} |`)].join('\n');
}
