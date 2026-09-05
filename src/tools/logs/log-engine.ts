export interface StructuredLogs {
  columns: string[];
  rows: Array<Record<string, string>>;
  unmatched: string[];
  // Per-column shape of the values actually captured. Computed here so it runs
  // wherever structuring runs - which is a worker - rather than on the main
  // thread the move off-thread was meant to protect.
  kinds: Record<string, ColumnKind>;
  // Document mode only: zero-length matches are skipped, and reporting how many
  // keeps that silent behaviour visible.
  skippedEmptyMatches?: number;
}

export interface LogPatternFlags {
  readonly ignoreCase?: boolean;
  readonly multiline?: boolean;
  readonly dotAll?: boolean;
}

export const buildPatternFlags = (flags: LogPatternFlags = {}): string =>
  `${flags.ignoreCase ? 'i' : ''}${flags.multiline ? 'm' : ''}${flags.dotAll ? 's' : ''}`;

// Reads named capture group names directly out of the pattern source.
//
// Column discovery previously ran the pattern against an empty string to read
// `groups` off the result. That probe is both unreliable - a pattern that
// cannot match '' yields no names at all, leaving columns to be inferred from
// whichever line happened to match first - and needlessly risky, since it is
// one more execution of a pattern that may backtrack catastrophically. Reading
// the names statically is exact and cannot hang.
//
// `(?<=` and `(?<!` are lookbehind assertions, not capture groups, so the name
// must start with a word character.
// The scan walks the pattern rather than regex-matching it, because a flat
// match reads group syntax that is not group syntax. `[(?<x>)]` is a character
// class containing punctuation, and `\(?<x>` is an escaped parenthesis - both
// would contribute a phantom column that is empty in every row. Group names
// also accept any JavaScript identifier, so an ASCII-only name class silently
// drops `(?<é>…)`: the regex still captures it, but omitting the key discards
// that value from the table and from every export with no diagnostic anywhere.
export function extractGroupNames(pattern: string): string[] {
  const names: string[] = [];
  let index = 0;
  let inClass = false;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === '\\') { index += 2; continue; }
    if (inClass) { if (char === ']') inClass = false; index += 1; continue; }
    if (char === '[') { inClass = true; index += 1; continue; }

    if (pattern.startsWith('(?<', index)) {
      const after = pattern[index + 3];
      // `(?<=` and `(?<!` are lookbehind assertions, not capture groups.
      if (after !== '=' && after !== '!') {
        const end = pattern.indexOf('>', index + 3);
        if (end !== -1) {
          const name = pattern.slice(index + 3, end);
          if (isIdentifierName(name) && !names.includes(name)) names.push(name);
          index = end + 1;
          continue;
        }
      }
    }
    index += 1;
  }
  return names;
}

const IDENTIFIER_NAME = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u;
const isIdentifierName = (value: string): boolean => IDENTIFIER_NAME.test(value);

// How the pattern is applied to the input.
//
// 'line' tests each line independently, which is the right model for
// one-record-per-line logs and is the default. In that mode the `m` and `s`
// flags cannot do anything: a single line never contains a newline, so
// multiline anchors and dot-matches-newline have nothing to act on.
//
// 'document' runs the pattern across the whole text and treats every match as
// one record, which is the only way to parse a record that legitimately spans
// lines - a stack trace, or a pretty-printed JSON payload embedded in a log.
// That mode is where `m` and `s` become meaningful.
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
  let discovered = extractGroupNames(pattern);

  for (const line of input.split(/\r?\n/).filter(Boolean)) {
    const match = regex.exec(line);
    if (!match) { unmatched.push(line); continue; }
    const groups = match.groups ?? {};
    if (discovered.length === 0) discovered = Object.keys(groups);
    rows.push(Object.fromEntries(discovered.map((column) => [column, groups[column] ?? ''])));
  }
  return { columns: discovered, rows, unmatched, kinds: inferColumnKinds(rows, discovered) };
}

function structureWholeDocument(input: string, pattern: string, flags: LogPatternFlags): StructuredLogs {
  const regex = new RegExp(pattern, `g${buildPatternFlags(flags)}`);
  const rows: Array<Record<string, string>> = [];
  const unmatched: string[] = [];
  let discovered = extractGroupNames(pattern);
  let cursor = 0;
  let skippedEmptyMatches = 0;

  for (const match of input.matchAll(regex)) {
    // A zero-length match is skipped rather than rejected. Whether one occurs
    // is a property of the input as much as of the pattern - `^(?<line>.*)$`
    // with `m` is the obvious document-mode pattern and matches empty at every
    // blank line - so throwing would make the same pattern work on one log and
    // fail on another, discarding every valid row found so far. matchAll
    // advances past an empty match on its own, so skipping still prevents the
    // one-record-per-position outcome the guard exists for.
    if (match[0].length === 0) {
      skippedEmptyMatches += 1;
      continue;
    }
    const start = match.index ?? 0;
    pushGap(unmatched, input.slice(cursor, start));
    cursor = start + match[0].length;

    const groups = match.groups ?? {};
    if (discovered.length === 0) discovered = Object.keys(groups);
    rows.push(Object.fromEntries(discovered.map((column) => [column, groups[column] ?? ''])));
  }

  pushGap(unmatched, input.slice(cursor));
  return {
    columns: discovered,
    rows,
    unmatched,
    kinds: inferColumnKinds(rows, discovered),
    skippedEmptyMatches,
  };
}

// The text between two matches can span many lines. Recording it as one entry
// would make `unmatched.length` a count of gaps while the interface reports it
// as a count of lines, and would defeat any cap the caller applies per entry -
// a pattern matching nothing yields exactly one entry holding the whole input.
function pushGap(unmatched: string[], gap: string): void {
  for (const line of gap.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) unmatched.push(trimmed);
  }
}

// --- Column type inference ---
//
// Every capture group arrives as a string. Reporting the shape each column
// actually holds lets the reader spot a mis-scoped group (a "duration" column
// that came out as text) without scrolling the whole table. This is a
// description of the sampled values, not a schema: a column is only called
// numeric or a timestamp when every non-empty value in it parses that way.

export type ColumnKind = 'integer' | 'decimal' | 'timestamp' | 'text' | 'empty';

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d*\.\d+$/;
// ISO-8601-ish and the common `YYYY-MM-DD HH:MM:SS` log form.
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

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

export function rowsToMarkdown(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(' | ')} |`)].join('\n');
}
