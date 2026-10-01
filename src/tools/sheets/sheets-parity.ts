import { a1FromParts, parseA1Range } from './sheets-formula';
import { formulaJsFunctionNames } from './sheets-formula-js';
import { clearRange, normalizeRange, rangeToTsv } from './sheets-grid';
import { cloneWorkbook, collectRange, fillHandle, getCell, setCell } from './sheets-model';
import {
  cellKey,
  type CellPrimitive,
  type CellStyle,
  type MergeRange,
  type PortableSheet,
  type PortableWorkbook,
  type SheetCell,
  type SheetProtect,
} from './sheets-types';

export type PasteSpecialMode = 'values' | 'formats' | 'transpose' | 'all';
export type ClearMode = 'contents' | 'all';
export type GotoKind = 'blanks' | 'formulas' | 'constants';

export interface ClipboardCell {
  v?: CellPrimitive | null;
  f?: string | null;
  z?: string;
  s?: CellStyle;
  hyperlink?: string;
  note?: string;
}

export interface ParityClipboard {
  grid: ClipboardCell[][];
  tsv: string;
}

export interface FormulaCatalogItem {
  name: string;
  template: string;
  summary: string;
}

export const FEATURED_INSERT_FUNCTIONS: FormulaCatalogItem[] = [
  { name: 'SUM', template: '=SUM(', summary: 'Add numbers in a range.' },
  { name: 'AVERAGE', template: '=AVERAGE(', summary: 'Average numbers in a range.' },
  { name: 'IF', template: '=IF(', summary: 'Pick one result when a test is true, another when it is false.' },
  { name: 'VLOOKUP', template: '=VLOOKUP(', summary: 'Find a value in the first column of a range and return another column.' },
  { name: 'XLOOKUP', template: '=XLOOKUP(', summary: 'Exact lookup from one range into a matching return range.' },
  { name: 'INDEX', template: '=INDEX(', summary: 'Return the value at a row and column inside a range.' },
  { name: 'MATCH', template: '=MATCH(', summary: 'Return the 1-based position of a lookup value.' },
  { name: 'TEXTJOIN', template: '=TEXTJOIN(', summary: 'Join text with a delimiter.' },
  { name: 'COUNTIF', template: '=COUNTIF(', summary: 'Count cells that match a test.' },
  { name: 'SUMIF', template: '=SUMIF(', summary: 'Sum cells that match a test.' },
  { name: 'INDEX-MATCH', template: '=INDEX(,MATCH(,,0))', summary: 'INDEX plus MATCH as a VLOOKUP stand-in.' },
  { name: 'FILTER', template: '=FILTER(', summary: 'Keep rows that match a test and spill into empty cells.' },
  { name: 'SORT', template: '=SORT(', summary: 'Sort a range and spill into empty cells.' },
  { name: 'UNIQUE', template: '=UNIQUE(', summary: 'Return distinct rows and spill into empty cells.' },
  { name: 'GETPIVOTDATA', template: '=GETPIVOTDATA(', summary: 'Return a value from a local PivotTable. Name the value field, then a cell inside the pivot, then optional field/item pairs.' },
  { name: 'LEFT', template: '=LEFT(', summary: 'Return characters from the start of a text value.' },
  { name: 'RIGHT', template: '=RIGHT(', summary: 'Return characters from the end of a text value.' },
  { name: 'MID', template: '=MID(', summary: 'Return characters from the middle of a text value.' },
  { name: 'LEN', template: '=LEN(', summary: 'Count characters in a text value.' },
  { name: 'UPPER', template: '=UPPER(', summary: 'Convert text to uppercase.' },
  { name: 'LOWER', template: '=LOWER(', summary: 'Convert text to lowercase.' },
  { name: 'TRIM', template: '=TRIM(', summary: 'Strip extra spaces from text.' },
  { name: 'IFERROR', template: '=IFERROR(', summary: 'Replace an error with another value.' },
  { name: 'ROUND', template: '=ROUND(', summary: 'Round a number to a given number of digits.' },
  { name: 'POWER', template: '=POWER(', summary: 'Raise a number to a power.' },
  { name: 'DATE', template: '=DATE(', summary: 'Build a date from year, month, and day.' },
  { name: 'YEAR', template: '=YEAR(', summary: 'Return the year of a date.' },
  { name: 'MONTH', template: '=MONTH(', summary: 'Return the month of a date.' },
  { name: 'DAY', template: '=DAY(', summary: 'Return the day of a date.' },
  { name: 'TODAY', template: '=TODAY(', summary: 'Return the current local date.' },
  { name: 'TEXT', template: '=TEXT(', summary: 'Format a number as text.' },
  { name: 'CONCAT', template: '=CONCAT(', summary: 'Join text values.' },
];

export const LOCKED_INSERT_FUNCTIONS = [
  'SUM',
  'AVERAGE',
  'IF',
  'VLOOKUP',
  'XLOOKUP',
  'INDEX-MATCH',
  'TEXTJOIN',
  'COUNTIF',
  'SUMIF',
] as const;

export function buildFormulaCatalog(featured: FormulaCatalogItem[], extraNames: string[]): FormulaCatalogItem[] {
  const seen = new Set<string>();
  const out: FormulaCatalogItem[] = [];
  for (const item of featured) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  for (const name of extraNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, template: `=${name}(`, summary: 'Excel-compatible function evaluated in this browser.' });
  }
  return out;
}

export const FORMULA_CATALOG = buildFormulaCatalog(FEATURED_INSERT_FUNCTIONS, formulaJsFunctionNames());

export function fillDownSelection(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
): PortableWorkbook {
  const bounds = normalizeRange(range);
  const from = { row: bounds.r1, col: bounds.c1 };
  const single = bounds.r1 === bounds.r2 && bounds.c1 === bounds.c2;
  const to = single ? { row: bounds.r1 + 3, col: bounds.c1 } : { row: bounds.r2, col: bounds.c2 };
  return fillHandle(book, sheetId, from, to);
}

export function parseTsvGrid(text: string): ClipboardCell[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split('\t').map((value) => (
    value.startsWith('=') ? { f: value, v: null } : { v: coercePastedValue(value), f: null }
  )));
}

export function coercePastedValue(value: string): CellPrimitive | null {
  if (value === '') return null;
  if (value === 'TRUE') return true;
  if (value === 'FALSE') return false;
  if (value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}

export function snapshotRange(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  label: (cell: SheetCell | undefined) => string,
): ParityClipboard {
  const bounds = normalizeRange(range);
  const grid: ClipboardCell[][] = [];
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    const line: ClipboardCell[] = [];
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const cell = getCell(book, sheetId, row, col);
      line.push(cell ? { v: cell.v ?? null, f: cell.f ?? null, z: cell.z, s: cell.s, hyperlink: cell.hyperlink, note: cell.note } : {});
    }
    grid.push(line);
  }
  return { grid, tsv: rangeToTsv(book, sheetId, bounds, label) };
}

export function transposeGrid(grid: ClipboardCell[][]): ClipboardCell[][] {
  const height = grid.length;
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const next: ClipboardCell[][] = [];
  for (let col = 0; col < width; col += 1) {
    const line: ClipboardCell[] = [];
    for (let row = 0; row < height; row += 1) line.push(grid[row]?.[col] ?? {});
    next.push(line);
  }
  return next;
}

export function pasteSpecial(
  book: PortableWorkbook,
  sheetId: string,
  origin: { row: number; col: number },
  source: ParityClipboard | string,
  mode: PasteSpecialMode,
): PortableWorkbook {
  const grid = typeof source === 'string' ? parseTsvGrid(source) : source.grid;
  const body = mode === 'transpose' ? transposeGrid(grid) : grid;
  let next = book;
  body.forEach((line, r) => {
    line.forEach((cell, c) => {
      const row = origin.row + r;
      const col = origin.col + c;
      if (mode === 'formats') {
        next = setCell(next, sheetId, row, col, { z: cell.z, s: cell.s });
        return;
      }
      if (mode === 'values') {
        next = setCell(next, sheetId, row, col, { v: cell.v ?? null, f: null });
        return;
      }
      next = setCell(next, sheetId, row, col, {
        v: cell.v ?? null,
        f: cell.f ?? null,
        z: cell.z,
        s: cell.s,
        hyperlink: cell.hyperlink,
        note: cell.note,
      });
    });
  });
  return next;
}

export function clearRangeMode(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  mode: ClearMode,
): PortableWorkbook {
  if (mode === 'contents') return clearRange(book, sheetId, range);
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const bounds = normalizeRange(range);
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      delete sheet.cells[cellKey(row, col)];
    }
  }
  return next;
}

export function removeDuplicates(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  keyCols?: number[],
): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const bounds = normalizeRange(range);
  const columns = keyCols && keyCols.length
    ? keyCols
    : Array.from({ length: bounds.c2 - bounds.c1 + 1 }, (_, index) => bounds.c1 + index);
  const rows: Array<Record<number, SheetCell | undefined>> = [];
  const seen = new Set<string>();
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    const record: Record<number, SheetCell | undefined> = {};
    for (let col = bounds.c1; col <= bounds.c2; col += 1) record[col] = sheet.cells[cellKey(row, col)];
    const signature = columns.map((col) => String(record[col]?.v ?? record[col]?.f ?? '')).join('\u0001');
    if (seen.has(signature)) continue;
    seen.add(signature);
    rows.push(record);
  }
  for (let offset = 0; offset <= bounds.r2 - bounds.r1; offset += 1) {
    const row = bounds.r1 + offset;
    const record = rows[offset];
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const key = cellKey(row, col);
      if (record?.[col]) sheet.cells[key] = record[col]!;
      else delete sheet.cells[key];
    }
  }
  return next;
}

export function textToColumns(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  delimiter: string,
): PortableWorkbook {
  const splitOn = delimiter || ',';
  let next = book;
  const bounds = normalizeRange(range);
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const cell = getCell(next, sheetId, row, col);
      const text = String(cell?.v ?? '');
      if (!text.includes(splitOn)) continue;
      const parts = text.split(splitOn);
      parts.forEach((part, index) => {
        next = setCell(next, sheetId, row, col + index, { v: coercePastedValue(part.trim()), f: null });
      });
    }
  }
  return next;
}

export function gotoSpecial(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange | null,
  kind: GotoKind,
): Array<{ row: number; col: number }> {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return [];
  const bounds = range
    ? normalizeRange(range)
    : { r1: 0, c1: 0, r2: sheet.rowCount - 1, c2: sheet.columnCount - 1 };
  const hits: Array<{ row: number; col: number }> = [];
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const cell = sheet.cells[cellKey(row, col)];
      const blank = !cell || ((cell.v === null || cell.v === undefined || cell.v === '') && !cell.f);
      if (kind === 'blanks' && blank) hits.push({ row, col });
      if (kind === 'formulas' && Boolean(cell?.f)) hits.push({ row, col });
      if (kind === 'constants' && cell && !cell.f && cell.v !== null && cell.v !== undefined && cell.v !== '') {
        hits.push({ row, col });
      }
    }
  }
  return hits;
}

export function parseGotoA1(a1: string): { row: number; col: number } | null {
  const range = parseA1Range(a1);
  if (!range) return null;
  return { row: range.r1, col: range.c1 };
}

export function setSheetHidden(book: PortableWorkbook, sheetId: string, hidden: boolean): PortableWorkbook {
  if (hidden && book.sheets.filter((sheet) => sheet.id !== sheetId && !sheet.hidden).length === 0) return book;
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.hidden = hidden;
  if (hidden && next.activeSheetId === sheetId) {
    next.activeSheetId = next.sheets.find((item) => !item.hidden)?.id ?? next.activeSheetId;
  }
  return next;
}

export function setSheetTabColor(book: PortableWorkbook, sheetId: string, tabColor: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.tabColor = tabColor;
  return next;
}

export function visibleSheets(book: PortableWorkbook): PortableSheet[] {
  return book.sheets.filter((sheet) => !sheet.hidden);
}

export function hiddenSheets(book: PortableWorkbook): PortableSheet[] {
  return book.sheets.filter((sheet) => Boolean(sheet.hidden));
}

export function deleteNamedRange(book: PortableWorkbook, name: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  next.namedRanges = next.namedRanges.filter((item) => item.name.toLowerCase() !== name.trim().toLowerCase());
  return next;
}

export function namedRangeBounds(a1: string): MergeRange | null {
  return parseA1Range(a1);
}

function isFilled(cell: SheetCell | undefined): boolean {
  if (!cell) return false;
  if (cell.f) return true;
  return cell.v !== null && cell.v !== undefined && cell.v !== '';
}

function isNumericFilled(cell: SheetCell | undefined): boolean {
  if (!cell || cell.f) return false;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return true;
  return typeof cell.v === 'string' && cell.v.trim() !== '' && Number.isFinite(Number(cell.v));
}

export function autoSumPlacement(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
): { formula: string; row: number; col: number } | null {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return null;
  const bounds = normalizeRange(range);
  const single = bounds.r1 === bounds.r2 && bounds.c1 === bounds.c2;
  if (single) {
    let top = bounds.r1 - 1;
    while (top >= 0 && isNumericFilled(sheet.cells[cellKey(top, bounds.c1)])) {
      top -= 1;
    }
    const start = top + 1;
    if (start >= bounds.r1) return null;
    return {
      formula: `=SUM(${a1FromParts(start, bounds.c1)}:${a1FromParts(bounds.r1 - 1, bounds.c1)})`,
      row: bounds.r1,
      col: bounds.c1,
    };
  }
  const wide = bounds.c2 > bounds.c1 && bounds.r2 === bounds.r1;
  if (wide) {
    return {
      formula: `=SUM(${a1FromParts(bounds.r1, bounds.c1)}:${a1FromParts(bounds.r2, bounds.c2)})`,
      row: bounds.r1,
      col: bounds.c2 + 1,
    };
  }
  return {
    formula: `=SUM(${a1FromParts(bounds.r1, bounds.c1)}:${a1FromParts(bounds.r2, bounds.c2)})`,
    row: bounds.r2 + 1,
    col: bounds.c1,
  };
}

export function insertFunctionTemplate(name: string): string {
  const match = FORMULA_CATALOG.find((item) => item.name === name);
  return match?.template ?? `=${name}(`;
}

export function jumpToDataEdge(
  book: PortableWorkbook,
  sheetId: string,
  from: { row: number; col: number },
  dRow: number,
  dCol: number,
): { row: number; col: number } {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet || (dRow === 0 && dCol === 0)) return from;
  const maxR = Math.max(0, sheet.rowCount - 1);
  const maxC = Math.max(0, sheet.columnCount - 1);
  const filledAt = (row: number, col: number) => isFilled(sheet.cells[cellKey(row, col)]);
  const inBounds = (row: number, col: number) => row >= 0 && col >= 0 && row <= maxR && col <= maxC;
  let row = from.row;
  let col = from.col;
  const nextRow = row + dRow;
  const nextCol = col + dCol;
  if (!inBounds(nextRow, nextCol)) return from;
  if (filledAt(row, col) && filledAt(nextRow, nextCol)) {
    while (inBounds(row + dRow, col + dCol) && filledAt(row + dRow, col + dCol)) {
      row += dRow;
      col += dCol;
    }
    return { row, col };
  }
  row = nextRow;
  col = nextCol;
  while (inBounds(row, col) && !filledAt(row, col)) {
    row += dRow;
    col += dCol;
  }
  if (inBounds(row, col)) return { row, col };
  return {
    row: Math.min(maxR, Math.max(0, row - dRow)),
    col: Math.min(maxC, Math.max(0, col - dCol)),
  };
}

export function currentDateValue(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hexToRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '').trim();
  const full = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 220, g: 252, b: 231 };
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export function lerpColor(from: string, to: string, t: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const clamp = Math.min(1, Math.max(0, t));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * clamp);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(mix(start.r, end.r))}${toHex(mix(start.g, end.g))}${toHex(mix(start.b, end.b))}`;
}

export function colorScaleFill(
  value: number,
  min: number,
  max: number,
  from = '#f0fdf4',
  to = '#14532d',
): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  return lerpColor(from, to, t);
}

export function colorScaleRangeStats(
  book: PortableWorkbook,
  sheetId: string,
  a1: string,
): { min: number; max: number } | null {
  const range = parseA1Range(a1);
  if (!range) return null;
  const nums = collectRange(book, sheetId, range).flatMap((item) => {
    const value = item.cell?.v;
    if (typeof value === 'number' && Number.isFinite(value)) return [value];
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return [Number(value)];
    return [];
  });
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function listValidationChoices(argument: string): string[] {
  return argument.split(',').map((item) => item.trim()).filter(Boolean);
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

export async function hashUnlockPin(pin: string, salt: string): Promise<string> {
  const payload = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return bytesToHex(new Uint8Array(digest));
}

export async function createSheetProtect(pin: string): Promise<SheetProtect> {
  const salt = randomSalt();
  return { salt, hash: await hashUnlockPin(pin, salt) };
}

export async function verifySheetProtect(pin: string, protect: SheetProtect): Promise<boolean> {
  if (!pin || !protect.salt || !protect.hash) return false;
  const digest = await hashUnlockPin(pin, protect.salt);
  return digest === protect.hash;
}

export function setSheetProtect(book: PortableWorkbook, sheetId: string, protect: SheetProtect | null): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.protect = protect;
  return next;
}

export function sheetIsLocked(sheet: PortableSheet | undefined, unlockedIds: Iterable<string>): boolean {
  if (!sheet?.protect) return false;
  return !new Set(unlockedIds).has(sheet.id);
}

export const P16_PROOF_NOT_ACCEPTED = ['iPhone 13', 'mobile-chromium'] as const;

export const CLIENT_VIEWPORTS = [
  { name: '320-portrait', width: 320, height: 740, orientation: 'portrait' },
  { name: '360-portrait', width: 360, height: 800, orientation: 'portrait' },
  { name: '390-portrait', width: 390, height: 844, orientation: 'portrait' },
  { name: '412-portrait', width: 412, height: 915, orientation: 'portrait' },
  { name: '430-portrait', width: 430, height: 932, orientation: 'portrait' },
  { name: '768-portrait', width: 768, height: 1024, orientation: 'portrait' },
  { name: '740-landscape', width: 740, height: 320, orientation: 'landscape' },
  { name: '800-landscape', width: 800, height: 360, orientation: 'landscape' },
  { name: '844-landscape', width: 844, height: 390, orientation: 'landscape' },
  { name: '915-landscape', width: 915, height: 412, orientation: 'landscape' },
  { name: '932-landscape', width: 932, height: 430, orientation: 'landscape' },
  { name: '1024-landscape', width: 1024, height: 768, orientation: 'landscape' },
] as const;
