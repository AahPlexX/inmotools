import { rewriteRelative } from './sheets-formula';
import {
  cellKey,
  createSheet,
  cryptoRandomId,
  parseCellKey,
  type MergeRange,
  type PortableSheet,
  type PortableWorkbook,
  type SheetCell,
} from './sheets-types';

export function activeSheet(book: PortableWorkbook): PortableSheet {
  return book.sheets.find((sheet) => sheet.id === book.activeSheetId) ?? book.sheets[0] ?? createSheet('Sheet1');
}

export function cloneWorkbook(book: PortableWorkbook): PortableWorkbook {
  return structuredClone(book);
}

export function setCell(book: PortableWorkbook, sheetId: string, row: number, col: number, patch: Partial<SheetCell>): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.rowCount = Math.max(sheet.rowCount, row + 8);
  sheet.columnCount = Math.max(sheet.columnCount, col + 4);
  const key = cellKey(row, col);
  const current = sheet.cells[key] ?? {};
  const merged = { ...current, ...patch };
  if (
    (merged.v === null || merged.v === undefined || merged.v === '')
    && !merged.f
    && !merged.note
    && !merged.hyperlink
    && !merged.z
    && !merged.s
  ) {
    delete sheet.cells[key];
  } else {
    sheet.cells[key] = merged;
  }
  return next;
}

export function getCell(book: PortableWorkbook, sheetId: string, row: number, col: number): SheetCell | undefined {
  return book.sheets.find((sheet) => sheet.id === sheetId)?.cells[cellKey(row, col)];
}

export function addSheet(book: PortableWorkbook, name?: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  const used = new Set(next.sheets.map((sheet) => sheet.name.toLowerCase()));
  let label = name ?? `Sheet${next.sheets.length + 1}`;
  let suffix = 2;
  while (used.has(label.toLowerCase())) {
    label = `${name ?? 'Sheet'}${suffix}`;
    suffix += 1;
  }
  const sheet = createSheet(label);
  next.sheets.push(sheet);
  next.activeSheetId = sheet.id;
  return next;
}

export function renameSheet(book: PortableWorkbook, sheetId: string, name: string): PortableWorkbook {
  const trimmed = name.trim();
  if (!trimmed) return book;
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  if (next.sheets.some((item) => item.id !== sheetId && item.name.toLowerCase() === trimmed.toLowerCase())) return book;
  sheet.name = trimmed;
  return next;
}

export function removeSheet(book: PortableWorkbook, sheetId: string): PortableWorkbook {
  if (book.sheets.length <= 1) return book;
  const next = cloneWorkbook(book);
  next.sheets = next.sheets.filter((sheet) => sheet.id !== sheetId);
  if (next.activeSheetId === sheetId) next.activeSheetId = next.sheets[0]?.id ?? '';
  next.namedRanges = next.namedRanges.filter((range) => range.sheetId !== sheetId);
  next.validations = next.validations.filter((rule) => rule.sheetId !== sheetId);
  next.conditionalFormats = next.conditionalFormats.filter((rule) => rule.sheetId !== sheetId);
  next.comments = next.comments.filter((comment) => comment.sheetId !== sheetId);
  return next;
}

export function insertRows(book: PortableWorkbook, sheetId: string, at: number, count = 1): PortableWorkbook {
  return shiftAxis(book, sheetId, 'row', at, count);
}

export function deleteRows(book: PortableWorkbook, sheetId: string, at: number, count = 1): PortableWorkbook {
  return shiftAxis(book, sheetId, 'row', at, -count);
}

export function insertCols(book: PortableWorkbook, sheetId: string, at: number, count = 1): PortableWorkbook {
  return shiftAxis(book, sheetId, 'col', at, count);
}

export function deleteCols(book: PortableWorkbook, sheetId: string, at: number, count = 1): PortableWorkbook {
  return shiftAxis(book, sheetId, 'col', at, -count);
}

function shiftAxis(book: PortableWorkbook, sheetId: string, axis: 'row' | 'col', at: number, delta: number): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet || delta === 0) return book;
  const moved: Record<string, SheetCell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    const index = axis === 'row' ? parsed.row : parsed.col;
    if (delta < 0 && index >= at && index < at - delta) continue;
    const nextIndex = index >= at ? index + delta : index;
    if (nextIndex < 0) continue;
    const nextRow = axis === 'row' ? nextIndex : parsed.row;
    const nextCol = axis === 'col' ? nextIndex : parsed.col;
    moved[cellKey(nextRow, nextCol)] = cell;
  }
  sheet.cells = moved;
  if (axis === 'row') sheet.rowCount = Math.max(8, sheet.rowCount + delta);
  else sheet.columnCount = Math.max(4, sheet.columnCount + delta);
  sheet.merges = sheet.merges
    .map((merge) => shiftMerge(merge, axis, at, delta))
    .filter((merge): merge is MergeRange => merge !== null);
  return next;
}

function shiftMerge(merge: MergeRange, axis: 'row' | 'col', at: number, delta: number): MergeRange | null {
  const start = axis === 'row' ? merge.r1 : merge.c1;
  const end = axis === 'row' ? merge.r2 : merge.c2;
  if (delta < 0 && start >= at && end < at - delta) return null;
  const shiftStart = start >= at ? start + delta : start;
  const shiftEnd = end >= at ? end + delta : end;
  if (shiftStart < 0 || shiftEnd < shiftStart) return null;
  return axis === 'row'
    ? { ...merge, r1: shiftStart, r2: shiftEnd }
    : { ...merge, c1: shiftStart, c2: shiftEnd };
}

export function mergeCells(book: PortableWorkbook, sheetId: string, range: MergeRange): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.merges = [...sheet.merges.filter((item) => !overlaps(item, range)), normalizeMerge(range)];
  return next;
}

export function unmergeCells(book: PortableWorkbook, sheetId: string, range: MergeRange): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.merges = sheet.merges.filter((item) => !overlaps(item, range));
  return next;
}

function normalizeMerge(range: MergeRange): MergeRange {
  return {
    r1: Math.min(range.r1, range.r2),
    c1: Math.min(range.c1, range.c2),
    r2: Math.max(range.r1, range.r2),
    c2: Math.max(range.c1, range.c2),
  };
}

function overlaps(a: MergeRange, b: MergeRange): boolean {
  const left = normalizeMerge(a);
  const right = normalizeMerge(b);
  return left.r1 <= right.r2 && left.r2 >= right.r1 && left.c1 <= right.c2 && left.c2 >= right.c1;
}

export function freezePanes(book: PortableWorkbook, sheetId: string, row: number, col: number): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.freezeRow = Math.max(0, row);
  sheet.freezeCol = Math.max(0, col);
  return next;
}

export function resizeCol(book: PortableWorkbook, sheetId: string, col: number, width: number): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.columnWidths[String(col)] = Math.min(360, Math.max(28, width));
  return next;
}

export function resizeRow(book: PortableWorkbook, sheetId: string, row: number, height: number): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  sheet.rowHeights[String(row)] = Math.min(160, Math.max(18, height));
  return next;
}

export function fillHandle(book: PortableWorkbook, sheetId: string, from: { row: number; col: number }, to: { row: number; col: number }): PortableWorkbook {
  const source = getCell(book, sheetId, from.row, from.col);
  if (!source) return book;
  let next = book;
  const r1 = Math.min(from.row, to.row);
  const r2 = Math.max(from.row, to.row);
  const c1 = Math.min(from.col, to.col);
  const c2 = Math.max(from.col, to.col);
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) {
      if (row === from.row && col === from.col) continue;
      const dRow = row - from.row;
      const dCol = col - from.col;
      const patch: Partial<SheetCell> = { ...source };
      if (source.f) patch.f = rewriteRelative(source.f, dRow, dCol);
      else if (typeof source.v === 'number') patch.v = source.v + dRow + dCol;
      next = setCell(next, sheetId, row, col, patch);
    }
  }
  return next;
}

export function sortRange(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  keyCol: number,
  direction: 'asc' | 'desc',
): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const bounds = normalizeMerge(range);
  const rows: Array<Record<number, SheetCell | undefined>> = [];
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    const record: Record<number, SheetCell | undefined> = {};
    for (let col = bounds.c1; col <= bounds.c2; col += 1) record[col] = sheet.cells[cellKey(row, col)];
    rows.push(record);
  }
  rows.sort((left, right) => compareValues(left[keyCol]?.v ?? null, right[keyCol]?.v ?? null, direction));
  for (let offset = 0; offset < rows.length; offset += 1) {
    const row = bounds.r1 + offset;
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const key = cellKey(row, col);
      const cell = rows[offset]?.[col];
      if (cell) sheet.cells[key] = cell;
      else delete sheet.cells[key];
    }
  }
  return next;
}

function compareValues(left: SheetCell['v'], right: SheetCell['v'], direction: 'asc' | 'desc'): number {
  const a = left ?? '';
  const b = right ?? '';
  const bothNumber = typeof a === 'number' && typeof b === 'number';
  const cmp = bothNumber ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? cmp : -cmp;
}

export function applyFilter(sheet: PortableSheet, hiddenPredicate: (row: number) => boolean): PortableSheet {
  const hiddenRows = new Set(sheet.hiddenRows);
  for (let row = 0; row < sheet.rowCount; row += 1) {
    if (hiddenPredicate(row)) hiddenRows.add(row);
    else hiddenRows.delete(row);
  }
  return { ...sheet, hiddenRows: [...hiddenRows].sort((a, b) => a - b) };
}

export function collectRange(book: PortableWorkbook, sheetId: string, range: MergeRange): Array<{ row: number; col: number; cell?: SheetCell }> {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  const bounds = normalizeMerge(range);
  const out: Array<{ row: number; col: number; cell?: SheetCell }> = [];
  if (!sheet) return out;
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      out.push({ row, col, cell: sheet.cells[cellKey(row, col)] });
    }
  }
  return out;
}

export function upsertNamedRange(book: PortableWorkbook, name: string, sheetId: string, a1: string): PortableWorkbook {
  const trimmed = name.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) return book;
  const next = cloneWorkbook(book);
  next.namedRanges = [...next.namedRanges.filter((item) => item.name.toLowerCase() !== trimmed.toLowerCase()), { name: trimmed, sheetId, a1 }];
  return next;
}

export function addComment(book: PortableWorkbook, sheetId: string, a1: string, body: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  next.comments = [
    ...next.comments.filter((item) => !(item.sheetId === sheetId && item.a1 === a1)),
    { id: cryptoRandomId(), sheetId, a1, body, updatedAt: Date.now() },
  ];
  return next;
}
