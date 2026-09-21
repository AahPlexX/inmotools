// Tabular & structured data transcoding engine (F01-F08).
// Pure functions over a common TableData model so every codec pair can be
// unit-tested without a DOM.

import Papa from 'papaparse';
import YAML from 'yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export type CellValue = string | number | boolean | null;

export interface TableData {
  columns: string[];
  rows: CellValue[][];
}

export interface SheetTable {
  name: string;
  table: TableData;
}

// ---------------------------------------------------------------------------
// Delimited text (F01)
// ---------------------------------------------------------------------------

export interface DelimitedParseOptions {
  delimiter?: string; // '' = auto-detect (papaparse)
  hasHeader?: boolean;
  /** Pre-decoded text; encoding is handled by the caller. */
}

export function parseDelimited(text: string, options: DelimitedParseOptions = {}): TableData {
  const hasHeader = options.hasHeader ?? true;
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter: options.delimiter && options.delimiter.length > 0 ? options.delimiter : undefined,
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  const records = result.data.filter((row) => row.length > 0 && !(row.length === 1 && row[0] === ''));
  if (records.length === 0) return { columns: [], rows: [] };
  const width = Math.max(...records.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? '');
  if (hasHeader) {
    const header = pad(records[0]).map((cell, index) => (cell === '' ? `column_${index + 1}` : cell));
    return { columns: header, rows: records.slice(1).map((row) => pad(row)) };
  }
  return {
    columns: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
    rows: records.map((row) => pad(row)),
  };
}

export type LineEnding = 'lf' | 'crlf';

export interface DelimitedEmitOptions {
  delimiter: string;
  includeHeader?: boolean;
  quoteAll?: boolean;
  lineEnding?: LineEnding;
}

export function toDelimited(table: TableData, options: DelimitedEmitOptions): string {
  const eol = options.lineEnding === 'crlf' ? '\r\n' : '\n';
  const delim = options.delimiter;
  const needsQuotes = (value: string) =>
    options.quoteAll || value.includes(delim) || value.includes('"') || value.includes('\n') || value.includes('\r');
  const cell = (value: CellValue): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'string' ? value : String(value);
    return needsQuotes(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [];
  if (options.includeHeader ?? true) lines.push(table.columns.map((column) => cell(column)).join(delim));
  for (const row of table.rows) {
    const cells: string[] = [];
    for (let i = 0; i < table.columns.length; i += 1) cells.push(cell(row[i] ?? null));
    lines.push(cells.join(delim));
  }
  return lines.join(eol) + (lines.length > 0 ? eol : '');
}

// ---------------------------------------------------------------------------
// JSON / NDJSON (F02)
// ---------------------------------------------------------------------------

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Flatten nested records into dot-path columns. Arrays become JSON strings. */
export function flattenRecords(records: Array<Record<string, JsonValue>>): TableData {
  const columns: string[] = [];
  const seen = new Set<string>();
  const pushColumn = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      columns.push(key);
    }
  };
  const walk = (prefix: string, value: JsonValue) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) pushColumn(prefix);
      for (const [key, child] of entries) walk(prefix ? `${prefix}.${key}` : key, child);
    } else {
      pushColumn(prefix);
    }
  };
  for (const record of records) walk('', record as JsonValue);

  const readPath = (record: Record<string, JsonValue>, path: string): JsonValue => {
    const parts = path.split('.');
    let current: JsonValue = record;
    for (const part of parts) {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined as unknown as JsonValue;
      current = (current as Record<string, JsonValue>)[part] ?? (undefined as unknown as JsonValue);
      if (current === undefined) return undefined as unknown as JsonValue;
    }
    return current;
  };

  const rows = records.map((record) =>
    columns.map((column) => {
      const value = readPath(record, column);
      if (value === undefined) return null;
      if (value === null) return null;
      if (typeof value === 'object') return JSON.stringify(value);
      return value as CellValue;
    }),
  );
  return { columns, rows };
}

/** Inverse of flattenRecords: rebuild nesting from dot-path columns. */
export function unflattenRecords(table: TableData): Array<Record<string, JsonValue>> {
  return table.rows.map((row) => {
    const record: Record<string, JsonValue> = {};
    table.columns.forEach((column, index) => {
      const raw = row[index];
      let value: JsonValue;
      if (raw === null || raw === undefined) value = null;
      else if (typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) {
        try { value = JSON.parse(raw) as JsonValue; } catch { value = raw; }
      } else value = raw;
      const parts = column.split('.');
      let target = record;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        const next = target[key];
        if (next === null || typeof next !== 'object' || Array.isArray(next)) {
          target[key] = {};
        }
        target = target[key] as Record<string, JsonValue>;
      }
      target[parts[parts.length - 1]] = value;
    });
    return record;
  });
}

export function tableFromRecords(records: Array<Record<string, JsonValue>>): TableData {
  return flattenRecords(records);
}

export function tableToRecords(table: TableData): Array<Record<string, JsonValue>> {
  return table.rows.map((row) => {
    const record: Record<string, JsonValue> = {};
    table.columns.forEach((column, index) => {
      record[column] = (row[index] ?? null) as JsonValue;
    });
    return record;
  });
}

export function parseJsonTable(text: string, flattenNested: boolean): TableData {
  const parsed = JSON.parse(text) as JsonValue;
  let records: Array<Record<string, JsonValue>>;
  if (Array.isArray(parsed)) {
    records = parsed.map((entry) =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, JsonValue>)
        : { value: entry },
    );
  } else if (parsed !== null && typeof parsed === 'object') {
    records = [parsed as Record<string, JsonValue>];
  } else {
    records = [{ value: parsed }];
  }
  return flattenNested ? flattenRecords(records) : flattenRecords(records);
}

export function parseNdjson(text: string): TableData {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = lines.map((line, index) => {
    try {
      const parsed = JSON.parse(line) as JsonValue;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, JsonValue>;
      return { value: parsed };
    } catch (error) {
      throw new Error(`Line ${index + 1} is not valid JSON: ${(error as Error).message}`);
    }
  });
  return flattenRecords(records);
}

export function toJson(table: TableData, shape: 'records' | 'values', pretty: boolean): string {
  const payload = shape === 'records' ? tableToRecords(table) : [table.columns, ...table.rows];
  return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
}

export function toNdjson(table: TableData): string {
  return tableToRecords(table).map((record) => JSON.stringify(record)).join('\n') + (table.rows.length > 0 ? '\n' : '');
}

// ---------------------------------------------------------------------------
// XML & Plist (F05)
// ---------------------------------------------------------------------------

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  parseTagValue: true,
  trimValues: true,
  cdataPropName: '__cdata',
  textNodeName: '#text',
});

const XML_BUILDER = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
  cdataPropName: '__cdata',
  textNodeName: '#text',
});

export function xmlToJson(text: string): JsonValue {
  const parsed = XML_PARSER.parse(text) as JsonValue;
  return parsed ?? null;
}

export function jsonToXml(value: JsonValue, rootName = 'root'): string {
  const body = XML_BUILDER.build({ [rootName]: value });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/** Records -> XML <rows><row>...</row></rows> document. */
export function tableToXml(table: TableData, rowTag = 'row', rootTag = 'rows'): string {
  const safeTag = (name: string) => name.replace(/[^\w.-]/g, '_') || 'column';
  const rows: Array<Record<string, JsonValue>> = table.rows.map((row) => {
    const record: Record<string, JsonValue> = {};
    table.columns.forEach((column, index) => {
      const value = row[index];
      record[safeTag(column)] = value === null ? null : typeof value === 'boolean' ? String(value) : value;
    });
    return record;
  });
  return jsonToXml({ [rowTag]: rows }, rootTag);
}

/** Extract a row array from a parsed XML document. Handles <root><row/>...</root> shapes. */
export function xmlToTable(value: JsonValue): TableData {
  const findRows = (node: JsonValue): Array<Record<string, JsonValue>> | null => {
    if (Array.isArray(node)) {
      if (node.every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))) {
        return node as Array<Record<string, JsonValue>>;
      }
      return null;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, JsonValue>).filter(([key]) => !key.startsWith('@_'));
      for (const [, child] of entries) {
        const rows = findRows(child);
        if (rows) return rows;
      }
      return null;
    }
    return null;
  };
  const rows = findRows(value);
  if (!rows) return flattenRecords([{ value }]);
  const normalized = rows.map((row) => {
    const record: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(row)) {
      if (key.startsWith('@_')) continue;
      record[key] = entry;
    }
    return record;
  });
  return flattenRecords(normalized);
}

type PlistValue = null | boolean | number | string | Date | PlistValue[] | { [key: string]: PlistValue };

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plistEmit(value: PlistValue, indent: number): string {
  const pad = '\t'.repeat(indent);
  if (value === null) return `${pad}<string></string>`;
  if (typeof value === 'boolean') return `${pad}<${value ? 'true' : 'false'}/>`;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${pad}<integer>${value}</integer>` : `${pad}<real>${value}</real>`;
  }
  if (typeof value === 'string') return `${pad}<string>${escapeXmlText(value)}</string>`;
  if (value instanceof Date) return `${pad}<date>${value.toISOString().replace(/\.\d{3}Z$/, 'Z')}</date>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<array/>`;
    return `${pad}<array>\n${value.map((entry) => plistEmit(entry, indent + 1)).join('\n')}\n${pad}</array>`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return `${pad}<dict/>`;
  const inner = entries
    .map(([key, entry]) => `${'\t'.repeat(indent + 1)}<key>${escapeXmlText(key)}</key>\n${plistEmit(entry, indent + 1)}`)
    .join('\n');
  return `${pad}<dict>\n${inner}\n${pad}</dict>`;
}

export function jsonToPlist(value: PlistValue): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    plistEmit(value, 0),
    '</plist>',
    '',
  ].join('\n');
}

function normalizePlistNode(node: JsonValue): PlistValue {
  if (node === null || node === undefined) return null;
  if (Array.isArray(node)) return node.map(normalizePlistNode);
  if (typeof node === 'object') {
    const record = node as Record<string, JsonValue>;
    const out: Record<string, PlistValue> = {};
    for (const [key, entry] of Object.entries(record)) out[key] = normalizePlistNode(entry);
    return out;
  }
  return node as PlistValue;
}

/** Convert an XML plist document into plain JSON values. */
export function plistToJson(text: string): PlistValue {
  const doc = new XMLParser({ ignoreAttributes: true, preserveOrder: true, trimValues: true }).parse(text);
  const findPlist = (nodes: JsonValue[]): JsonValue[] | null => {
    for (const node of nodes) {
      if (node !== null && typeof node === 'object' && ':@' in (node as object) === false) {
        const record = node as Record<string, JsonValue[]>;
        if (record.plist) return record.plist;
      }
    }
    return null;
  };
  const read = (nodes: JsonValue[]): JsonValue => {
    for (const node of nodes) {
      if (node === null || typeof node !== 'object') continue;
      const record = node as Record<string, unknown>;
      const tag = Object.keys(record).find((key) => key !== ':@');
      if (!tag) continue;
      const children = (record[tag] as JsonValue[]) ?? [];
      const textOf = (): string =>
        children
          .map((child) => ((child as Record<string, unknown>)?.['#text'] ?? ''))
          .join('')
          .trim();
      switch (tag) {
        case 'string': return textOf();
        case 'integer': return Number.parseInt(textOf(), 10);
        case 'real': return Number.parseFloat(textOf());
        case 'true': return true;
        case 'false': return false;
        case 'date': return new Date(textOf()).toISOString();
        case 'data': return textOf();
        case 'array': return children.map((child) => read([child]));
        case 'dict': {
          const out: Record<string, JsonValue> = {};
          let pendingKey: string | null = null;
          for (const child of children) {
            if (child === null || typeof child !== 'object') continue;
            const childRecord = child as Record<string, unknown>;
            const childTag = Object.keys(childRecord).find((key) => key !== ':@');
            if (!childTag) continue;
            const childChildren = (childRecord[childTag] as JsonValue[]) ?? [];
            if (childTag === 'key') {
              pendingKey = childChildren.map((grand) => ((grand as Record<string, unknown>)?.['#text'] ?? '')).join('').trim();
            } else if (pendingKey !== null) {
              out[pendingKey] = read([child]);
              pendingKey = null;
            }
          }
          return out;
        }
        default:
          break;
      }
    }
    // Multiple sibling values (array items).
    const values = nodes
      .map((node) => (node !== null && typeof node === 'object' ? read([node]) : null))
      .filter((entry) => entry !== null);
    return values.length === 1 ? values[0] : values;
  };
  const plistChildren = findPlist(doc as JsonValue[]);
  if (!plistChildren) throw new Error('No <plist> root element found.');
  const value = read(plistChildren);
  return normalizePlistNode(value);
}

export function tableToPlist(table: TableData): string {
  return jsonToPlist(normalizePlistNode(tableToRecords(table) as unknown as JsonValue));
}

// ---------------------------------------------------------------------------
// YAML & TOML (F06)
// ---------------------------------------------------------------------------

export function parseYamlValue(text: string): JsonValue {
  const parsed = YAML.parse(text) as JsonValue;
  return parsed ?? null;
}

export function emitYaml(value: JsonValue): string {
  return YAML.stringify(value);
}

export function parseTomlValue(text: string): JsonValue {
  return parseToml(text) as unknown as JsonValue;
}

export function emitToml(value: JsonValue): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TOML output requires a top-level object.');
  }
  return stringifyToml(value as unknown as Record<string, unknown>);
}

/** Convert a scalar-ish JSON document into a table when possible. */
export function documentToTable(value: JsonValue): TableData {
  if (Array.isArray(value) && value.every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))) {
    return flattenRecords(value as Array<Record<string, JsonValue>>);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, JsonValue>;
    const arrayChild = Object.values(record).find((entry) => Array.isArray(entry));
    if (arrayChild && (arrayChild as JsonValue[]).every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))) {
      return flattenRecords(arrayChild as Array<Record<string, JsonValue>>);
    }
    return flattenRecords([record]);
  }
  return { columns: ['value'], rows: [[value === null ? null : Array.isArray(value) ? JSON.stringify(value) : (value as CellValue)]] };
}

// ---------------------------------------------------------------------------
// SQL generation (F07)
// ---------------------------------------------------------------------------

export type SqlDialect = 'postgresql' | 'mysql' | 'sqlite' | 'snowflake';

export interface SqlOptions {
  dialect: SqlDialect;
  tableName: string;
  batchSize?: number;
  createTable?: boolean;
}

type SqlType = 'INTEGER' | 'REAL' | 'BOOLEAN' | 'TIMESTAMP' | 'TEXT';

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function inferSqlType(values: CellValue[]): SqlType {
  const present = values.filter((value) => value !== null && value !== '');
  if (present.length === 0) return 'TEXT';
  let canInt = true;
  let canReal = true;
  let canBool = true;
  let canTs = true;
  for (const value of present) {
    if (typeof value === 'boolean') {
      canInt = false; canReal = false; canTs = false;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) canInt = false;
      canBool = false; canTs = false;
      continue;
    }
    const text = String(value).trim();
    canBool = canBool && /^(true|false)$/i.test(text);
    if (canInt && !/^[+-]?\d+$/.test(text)) canInt = false;
    if (canReal && !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) canReal = false;
    if (canTs && !ISO_DATETIME.test(text)) canTs = false;
  }
  if (canBool) return 'BOOLEAN';
  if (canInt) return 'INTEGER';
  if (canReal) return 'REAL';
  if (canTs) return 'TIMESTAMP';
  return 'TEXT';
}

function quoteIdent(dialect: SqlDialect, name: string): string {
  if (dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlTypeFor(dialect: SqlDialect, type: SqlType): string {
  if (type === 'TIMESTAMP') {
    if (dialect === 'sqlite') return 'TEXT';
    if (dialect === 'mysql') return 'DATETIME';
    return 'TIMESTAMP';
  }
  if (type === 'REAL') return dialect === 'mysql' ? 'DOUBLE' : type === 'REAL' ? 'REAL' : 'REAL';
  if (type === 'BOOLEAN') return dialect === 'mysql' ? 'TINYINT(1)' : 'BOOLEAN';
  if (type === 'INTEGER') return dialect === 'snowflake' ? 'INTEGER' : 'INTEGER';
  return dialect === 'snowflake' ? 'VARCHAR' : 'TEXT';
}

function sqlLiteral(dialect: SqlDialect, value: CellValue, type: SqlType): string {
  if (value === null || value === '') return 'NULL';
  if (typeof value === 'boolean') return dialect === 'mysql' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE';
  if (type === 'INTEGER' || type === 'REAL') {
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (Number.isFinite(numeric)) return String(numeric);
  }
  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

export function toSql(table: TableData, options: SqlOptions): string {
  const batchSize = Math.max(1, options.batchSize ?? 500);
  const tableName = options.tableName.trim() || 'converted_data';
  const types = table.columns.map((_, index) => inferSqlType(table.rows.map((row) => row[index] ?? null)));
  const lines: string[] = [];
  const tableIdent = quoteIdent(options.dialect, tableName);
  if (options.createTable ?? true) {
    const columnDefs = table.columns
      .map((column, index) => `  ${quoteIdent(options.dialect, column)} ${sqlTypeFor(options.dialect, types[index])}`)
      .join(',\n');
    lines.push(`CREATE TABLE ${tableIdent} (\n${columnDefs}\n);`);
    lines.push('');
  }
  const columnList = table.columns.map((column) => quoteIdent(options.dialect, column)).join(', ');
  for (let start = 0; start < table.rows.length; start += batchSize) {
    const slice = table.rows.slice(start, start + batchSize);
    const values = slice
      .map((row) => `  (${table.columns.map((_, index) => sqlLiteral(options.dialect, row[index] ?? null, types[index])).join(', ')})`)
      .join(',\n');
    lines.push(`INSERT INTO ${tableIdent} (${columnList}) VALUES\n${values};`);
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Markdown & HTML tables (F08)
// ---------------------------------------------------------------------------

const mdEscape = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export function toMarkdownTable(table: TableData, style: 'pipe' | 'grid' = 'pipe'): string {
  const cells = table.columns.map((column) => mdEscape(String(column)));
  const body = table.rows.map((row) => table.columns.map((_, index) => mdEscape(row[index] === null || row[index] === undefined ? '' : String(row[index]))));
  if (style === 'pipe') {
    const lines = [
      `| ${cells.join(' | ')} |`,
      `| ${cells.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${row.join(' | ')} |`),
    ];
    return `${lines.join('\n')}\n`;
  }
  const widths = cells.map((header, index) => Math.max(header.length, 3, ...body.map((row) => (row[index] ?? '').length)));
  const rule = (char: string) => `+${widths.map((width) => char.repeat(width + 2)).join('+')}+`;
  const rowLine = (row: string[]) => `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  const lines = [rule('-'), rowLine(cells), rule('='), ...body.flatMap((row) => [rowLine(row), rule('-')])];
  return `${lines.join('\n')}\n`;
}

export function parseMarkdownTable(text: string): TableData {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const tableLines = lines.filter((line) => line.startsWith('|') || (line.includes('|') && !line.startsWith('#')));
  if (tableLines.length === 0) throw new Error('No Markdown table found.');
  const splitRow = (line: string): string[] => {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    const cells: string[] = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i += 1) {
      const char = trimmed[i];
      if (char === '\\' && trimmed[i + 1] === '|') { current += '|'; i += 1; continue; }
      if (char === '|') { cells.push(current.trim()); current = ''; continue; }
      current += char;
    }
    cells.push(current.trim());
    return cells.map((cell) => cell.replace(/<br\s*\/?>/gi, '\n'));
  };
  const isSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
  const headerIndex = tableLines.findIndex((line, index) => index + 1 < tableLines.length && isSeparator(tableLines[index + 1]));
  if (headerIndex === -1) {
    const rows = tableLines.map(splitRow);
    const width = Math.max(...rows.map((row) => row.length));
    return {
      columns: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
      rows: rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')),
    };
  }
  const columns = splitRow(tableLines[headerIndex]);
  const rows = tableLines.slice(headerIndex + 2).filter((line) => !isSeparator(line)).map(splitRow);
  return {
    columns,
    rows: rows.map((row) => Array.from({ length: columns.length }, (_, i) => row[i] ?? '')),
  };
}

export function toHtmlTable(table: TableData, caption?: string): string {
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = `<thead><tr>${table.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>`;
  const body = table.rows
    .map((row) => `<tr>${table.columns.map((_, index) => {
      const value = row[index];
      return `<td>${value === null || value === undefined ? '' : esc(String(value))}</td>`;
    }).join('')}</tr>`)
    .join('\n');
  const captionHtml = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${esc(caption ?? 'Converted table')}</title></head>\n<body>\n<table>${captionHtml}\n${head}\n<tbody>\n${body}\n</tbody>\n</table>\n</body>\n</html>\n`;
}

export function parseHtmlTable(html: string): TableData {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No <table> element found.');
  const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
  const rowsSource = bodyRows.length > 0 ? bodyRows : Array.from(table.querySelectorAll('tr')).slice(headerCells.length > 0 ? 1 : 0);
  const rows = rowsSource.map((row) => Array.from(row.querySelectorAll('td, th')).map((cell) => cell.textContent ?? ''));
  const width = Math.max(headerCells.length, ...rows.map((row) => row.length), 1);
  const columns = headerCells.length > 0
    ? Array.from({ length: width }, (_, i) => headerCells[i]?.textContent?.trim() || `column_${i + 1}`)
    : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  return { columns, rows: rows.map((row) => Array.from({ length: columns.length }, (_, i) => row[i] ?? '')) };
}

// ---------------------------------------------------------------------------
// XLSX (F04)
// ---------------------------------------------------------------------------

async function loadExcelJs(): Promise<{ Workbook: new () => import('exceljs').Workbook }> {
  const mod = (await import('exceljs')) as unknown as Record<string, unknown>;
  const candidate = (mod.default ?? mod) as { Workbook?: new () => import('exceljs').Workbook };
  const nested = (candidate as Record<string, unknown>).default as { Workbook?: new () => import('exceljs').Workbook } | undefined;
  const resolved = candidate.Workbook ? candidate : nested;
  if (!resolved?.Workbook) throw new Error('ExcelJS could not be loaded in this browser.');
  return resolved as { Workbook: new () => import('exceljs').Workbook };
}

export async function parseXlsx(bytes: Uint8Array): Promise<SheetTable[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.slice().buffer as ArrayBuffer);
  const sheets: SheetTable[] = [];
  workbook.eachSheet((worksheet) => {
    const columns: string[] = [];
    const rows: CellValue[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: CellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (values.length < colNumber - 1) values.push(null);
        const raw = cell.value as unknown;
        let value: CellValue;
        if (raw === null || raw === undefined) value = null;
        else if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string') value = raw;
        else if (raw instanceof Date) value = raw.toISOString();
        else if (typeof raw === 'object' && raw !== null && 'result' in (raw as Record<string, unknown>)) {
          const formula = raw as { result: unknown };
          value = typeof formula.result === 'number' || typeof formula.result === 'string' || typeof formula.result === 'boolean' ? formula.result : String(formula.result ?? '');
        } else if (typeof raw === 'object' && raw !== null && 'richText' in (raw as Record<string, unknown>)) {
          const rich = raw as { richText: Array<{ text: string }> };
          value = rich.richText.map((part) => part.text).join('');
        } else value = String(raw);
        values.push(value);
      });
      rows.push(values);
      if (rowNumber === 1) {
        values.forEach((value, index) => {
          columns[index] = value === null || value === '' ? `column_${index + 1}` : String(value);
        });
      }
    });
    if (rows.length === 0) {
      sheets.push({ name: worksheet.name, table: { columns: [], rows: [] } });
      return;
    }
    const width = Math.max(...rows.map((row) => row.length), columns.length);
    const header = Array.from({ length: width }, (_, i) => columns[i] ?? `column_${i + 1}`);
    sheets.push({
      name: worksheet.name,
      table: { columns: header, rows: rows.slice(1).map((row) => Array.from({ length: width }, (_, i) => row[i] ?? null)) },
    });
  });
  return sheets;
}

export async function emitXlsx(sheets: SheetTable[]): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InMo Tools Transcode Workstation';
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    let name = (sheet.name || 'Sheet').slice(0, 31).replace(/[\\/?*[\]:]/g, '_');
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name.slice(0, 28)}_${suffix}`)) suffix += 1;
      name = `${name.slice(0, 28)}_${suffix}`;
    }
    usedNames.add(name);
    const worksheet = workbook.addWorksheet(name);
    worksheet.addRow(sheet.table.columns);
    for (const row of sheet.table.rows) worksheet.addRow(sheet.table.columns.map((_, index) => row[index] ?? null));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Parquet (F03)
// ---------------------------------------------------------------------------

export async function parseParquet(bytes: Uint8Array): Promise<TableData> {
  const [{ parquetReadObjects }, { compressors }] = await Promise.all([import('hyparquet'), import('hyparquet-compressors')]);
  const copy = bytes.slice();
  const buffer = copy.buffer as ArrayBuffer;
  const file = {
    byteLength: copy.byteLength,
    slice: (start: number, end?: number) => buffer.slice(start, end ?? copy.byteLength),
  };
  const records = (await parquetReadObjects({ file, compressors })) as Array<Record<string, unknown>>;
  const normalized = records.map((record) => {
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) out[key] = null;
      else if (typeof value === 'bigint') out[key] = Number(value);
      else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') out[key] = value;
      else if (value instanceof Date) out[key] = value.toISOString();
      else out[key] = JSON.stringify(value) as JsonValue;
    }
    return out;
  });
  return flattenRecords(normalized);
}
