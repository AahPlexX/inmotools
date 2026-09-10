import Papa from 'papaparse';
import type { DedupeRow } from './dedupe-engine';

export type DedupeTableDiagnostic = { kind: 'renamed-header' | 'extra-columns'; message: string };

const DANGEROUS_SPREADSHEET_PREFIX = /^[=+\-@\t\r\n＝＋－＠]/u;
const SIGNED_NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

export function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseCsvMatrix(text: string): unknown[][] {
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ',',
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
  });
  const fatal = parsed.errors.find((error) => error.type === 'Quotes' || error.code === 'MissingQuotes');
  if (fatal) throw new Error(`CSV parse failed: ${fatal.message}`);
  return parsed.data;
}

export function matrixToRows(matrix: unknown[][]): { headers: string[]; rows: DedupeRow[]; diagnostics: DedupeTableDiagnostic[] } {
  if (!matrix.length) return { headers: [], rows: [], diagnostics: [] };

  const diagnostics: DedupeTableDiagnostic[] = [];
  let widest = 0;
  for (const row of matrix) if (row.length > widest) widest = row.length;

  const rawHeaders = Array.from({ length: widest }, (_, index) => (
    index < matrix[0].length ? String(matrix[0][index] ?? '').trim() : `Column ${index + 1}`
  ));
  if (widest > matrix[0].length) {
    diagnostics.push({
      kind: 'extra-columns',
      message: `${widest - matrix[0].length} column${widest - matrix[0].length === 1 ? '' : 's'} appeared beyond the header row and were preserved with generated names.`,
    });
  }

  const used = new Set<string>();
  const headers = rawHeaders.map((raw, index) => {
    const base = raw || `Column ${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(normalizeHeaderKey(candidate))) candidate = `${base} ${suffix++}`;
    if (candidate !== base) {
      diagnostics.push({
        kind: 'renamed-header',
        message: `Header “${base}” was renamed to “${candidate}” so normalized column names remain unique.`,
      });
    }
    used.add(normalizeHeaderKey(candidate));
    return candidate;
  });

  const rows = matrix
    .slice(1)
    .filter((values) => values.some((value) => value !== null && value !== undefined && String(value).trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));

  return { headers, rows, diagnostics };
}

function spreadsheetSafeText(value: unknown): string {
  const text = String(value ?? '');
  if (SIGNED_NUMERIC_TEXT.test(text)) return text;
  return DANGEROUS_SPREADSHEET_PREFIX.test(text) ? `'${text}` : text;
}

export function rowsToCsv(rows: DedupeRow[], headers: string[]): string {
  return Papa.unparse(
    {
      fields: headers.map(spreadsheetSafeText),
      data: rows.map((row) => headers.map((header) => spreadsheetSafeText(row[header]))),
    },
    {
      delimiter: ',',
      newline: '\r\n',
      quotes: true,
      header: true,
    },
  );
}
