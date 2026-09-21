import {
  cellKey,
  createSheet,
  cryptoRandomId,
  workbookPivots,
  type CellPrimitive,
  type PivotAgg,
  type PivotField,
  type PivotFilter,
  type PivotPlacement,
  type PivotTableDef,
  type PivotValueField,
  type PortableSheet,
  type PortableWorkbook,
} from './sheets-types';

export type PivotLookupError = {
  kind: 'error';
  code: '#REF!' | '#DIV/0!';
  message: string;
};

export type { PivotAgg, PivotField, PivotFilter, PivotPlacement, PivotTableDef, PivotValueField };

export const PIVOT_PLACEMENT_DEFAULT: PivotPlacement = 'new-sheet';
export const PIVOT_VALUE_LIMIT = 5000;

export interface PivotSpec {
  headerRow: number;
  groupCol: number;
  valueCol: number;
  agg: PivotAgg;
}

export interface PivotRow {
  group: string;
  value: number;
}

export interface PivotResult {
  rows: PivotRow[];
  agg: PivotAgg;
  groupHeader: string;
  valueHeader: string;
}

export interface PivotLayoutCell {
  row: number;
  col: number;
  v: CellPrimitive | null;
  kind: 'header' | 'label' | 'value' | 'total';
}

export interface PivotLayout {
  cells: PivotLayoutCell[];
  rowCount: number;
  colCount: number;
}

export interface CreatePivotInput {
  sourceSheetId: string;
  sourceA1: string;
  rows: PivotField[];
  columns: PivotField[];
  values: PivotValueField[];
  filters: PivotFilter[];
  placement: PivotPlacement;
  destSheetId?: string;
  destA1?: string;
  autoRefresh?: boolean;
  name?: string;
  id?: string;
}

export interface PivotWriteResult {
  book: PortableWorkbook;
  pivot?: PivotTableDef;
  error?: string;
}

interface SourceCell {
  text: string;
  number: number | null;
  blank: boolean;
}

interface SourceTable {
  headers: PivotField[];
  rows: Array<Record<number, SourceCell>>;
}

const AGG_TITLE: Record<PivotAgg, string> = {
  sum: 'Sum',
  count: 'Count',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
};

function columnIndex(letters: string): number {
  let result = 0;
  for (const char of letters.toUpperCase()) {
    if (char < 'A' || char > 'Z') return -1;
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function a1Cell(row: number, col: number): string {
  return `${columnLetters(col)}${row + 1}`;
}

function parseA1Range(a1: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const match = /^\s*\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?\s*$/.exec(a1);
  if (!match || !match[1] || !match[2]) return null;
  const c1 = columnIndex(match[1]);
  const r1 = Number(match[2]) - 1;
  const c2 = match[3] ? columnIndex(match[3]) : c1;
  const r2 = match[4] ? Number(match[4]) - 1 : r1;
  if (c1 < 0 || c2 < 0 || r1 < 0 || r2 < 0) return null;
  return {
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.max(r1, r2),
    c2: Math.max(c1, c2),
  };
}

function cellText(sheet: PortableSheet, row: number, col: number): string {
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return '';
  if (cell.v === null || cell.v === undefined) return '';
  return String(cell.v);
}

function cellNumber(sheet: PortableSheet, row: number, col: number): number | null {
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return null;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
  if (typeof cell.v === 'string' && cell.v.trim() !== '' && Number.isFinite(Number(cell.v))) return Number(cell.v);
  return null;
}

function sourceCellFromSheet(sheet: PortableSheet, row: number, col: number): SourceCell {
  const text = cellText(sheet, row, col).trim();
  const number = cellNumber(sheet, row, col);
  return { text, number, blank: text === '' && number === null };
}

export function valueFieldHeader(field: PivotValueField): string {
  return `${AGG_TITLE[field.agg]} of ${field.name}`;
}

export function normalizeDataFieldName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/^(sum|count|average|avg|min|max)\s+of\s+/i, '');
}

function aggregate(values: number[], agg: PivotAgg, rowCount: number): number | null {
  if (agg === 'count') return rowCount;
  if (values.length === 0) {
    if (agg === 'sum') return 0;
    return null;
  }
  if (agg === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (agg === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  return Math.max(...values);
}

export function pivotSheet(sheet: PortableSheet, spec: PivotSpec): PivotResult {
  const groups = new Map<string, number[]>();
  for (let row = spec.headerRow + 1; row < sheet.rowCount; row += 1) {
    if (sheet.hiddenRows.includes(row)) continue;
    const label = cellText(sheet, row, spec.groupCol).trim();
    const value = cellNumber(sheet, row, spec.valueCol);
    if (!label && value === null) continue;
    const group = label || '(blank)';
    const bucket = groups.get(group) ?? [];
    if (spec.agg === 'count') bucket.push(1);
    else if (value !== null) bucket.push(value);
    groups.set(group, bucket);
  }
  const rows = [...groups.entries()].map(([group, values]) => ({
    group,
    value: aggregate(values, spec.agg, values.length) ?? 0,
  })).sort((left, right) => left.group.localeCompare(right.group));
  return {
    rows,
    agg: spec.agg,
    groupHeader: cellText(sheet, spec.headerRow, spec.groupCol) || `Column ${spec.groupCol + 1}`,
    valueHeader: cellText(sheet, spec.headerRow, spec.valueCol) || spec.agg,
  };
}

export function headersFromRange(sheet: PortableSheet, a1: string): PivotField[] {
  const range = parseA1Range(a1);
  if (!range) return [];
  const seen = new Map<string, number>();
  const headers: PivotField[] = [];
  for (let col = range.c1; col <= range.c2; col += 1) {
    const raw = cellText(sheet, range.r1, col).trim() || `Column ${col + 1}`;
    const count = (seen.get(raw.toLocaleLowerCase()) ?? 0) + 1;
    seen.set(raw.toLocaleLowerCase(), count);
    headers.push({ name: count === 1 ? raw : `${raw} ${count}`, col });
  }
  return headers;
}

function cloneBook(book: PortableWorkbook): PortableWorkbook {
  const next = structuredClone(book);
  if (!Array.isArray(next.pivots)) next.pivots = [];
  return next;
}

function uniqueSheetName(book: PortableWorkbook, base: string): string {
  const used = new Set(book.sheets.map((sheet) => sheet.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base}${suffix}`.toLowerCase())) suffix += 1;
  return `${base}${suffix}`;
}

function nextPivotSheetName(book: PortableWorkbook): string {
  let index = 1;
  const used = new Set(book.sheets.map((sheet) => sheet.name.toLowerCase()));
  while (used.has(`pivot${index}`)) index += 1;
  return `Pivot${index}`;
}

function nextPivotName(book: PortableWorkbook): string {
  let index = 1;
  const used = new Set(workbookPivots(book).map((pivot) => pivot.name.toLowerCase()));
  while (used.has(`pivot${index}`)) index += 1;
  return `Pivot${index}`;
}

function readSourceTable(book: PortableWorkbook, sourceSheetId: string, sourceA1: string): SourceTable | { error: string } {
  const sheet = book.sheets.find((item) => item.id === sourceSheetId);
  const range = parseA1Range(sourceA1);
  if (!sheet || !range) return { error: 'PivotTable source range is not a contiguous A1 range on one sheet.' };
  if (range.r2 < range.r1 + 1) return { error: 'PivotTable source needs a header row and at least one data row.' };
  const headers = headersFromRange(sheet, sourceA1);
  const rows: SourceTable['rows'] = [];
  for (let row = range.r1 + 1; row <= range.r2; row += 1) {
    if (sheet.hiddenRows.includes(row)) continue;
    const record: Record<number, SourceCell> = {};
    let empty = true;
    for (const header of headers) {
      const cell = sourceCellFromSheet(sheet, row, header.col);
      record[header.col] = cell;
      if (!cell.blank) empty = false;
    }
    if (!empty) rows.push(record);
  }
  return { headers, rows };
}

function labelOf(row: Record<number, SourceCell>, col: number): string {
  const cell = row[col];
  if (!cell || cell.blank) return '(blank)';
  return cell.text || String(cell.number ?? '(blank)');
}

function rowPassesFilters(row: Record<number, SourceCell>, filters: PivotFilter[]): boolean {
  return filters.every((filter) => {
    if (filter.selected.length === 0) return true;
    const wanted = new Set(filter.selected.map((item) => item.trim().toLocaleLowerCase()));
    return wanted.has(labelOf(row, filter.col).toLocaleLowerCase());
  });
}

function matchingRows(table: SourceTable, pivot: Pick<PivotTableDef, 'filters' | 'rows' | 'columns'>, pairs: Array<[string, string]>): SourceTable['rows'] | { error: PivotLookupError } {
  const known = new Map<string, number>();
  for (const field of [...pivot.rows, ...pivot.columns, ...pivot.filters]) {
    known.set(field.name.trim().toLocaleLowerCase(), field.col);
  }
  const constraints: Array<{ col: number; item: string }> = [];
  for (const [fieldName, item] of pairs) {
    const col = known.get(fieldName.trim().toLocaleLowerCase());
    if (col === undefined) {
      return { error: { kind: 'error', code: '#REF!', message: `GETPIVOTDATA field ${fieldName} is not in this PivotTable.` } };
    }
    constraints.push({ col, item: item.trim().toLocaleLowerCase() });
  }
  return table.rows.filter((row) => {
    if (!rowPassesFilters(row, pivot.filters)) return false;
    return constraints.every((constraint) => labelOf(row, constraint.col).toLocaleLowerCase() === constraint.item);
  });
}

function resolveValueField(pivot: Pick<PivotTableDef, 'values'>, dataField: string): PivotValueField | null {
  const raw = dataField.trim().toLocaleLowerCase();
  const stripped = normalizeDataFieldName(dataField);
  const byHeader = pivot.values.find((field) => valueFieldHeader(field).toLocaleLowerCase() === raw);
  if (byHeader) return byHeader;
  const byName = pivot.values.filter((field) => field.name.trim().toLocaleLowerCase() === stripped);
  if (byName.length === 1) return byName[0] ?? null;
  if (byName.length > 1) {
    return byName.find((field) => valueFieldHeader(field).toLocaleLowerCase() === raw) ?? byName[0] ?? null;
  }
  return null;
}

export function distinctFieldValues(book: PortableWorkbook, sourceSheetId: string, sourceA1: string, col: number): string[] {
  const table = readSourceTable(book, sourceSheetId, sourceA1);
  if ('error' in table) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of table.rows) {
    const label = labelOf(row, col);
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((left, right) => left.localeCompare(right));
}

export function buildPivotLayout(book: PortableWorkbook, pivot: PivotTableDef): PivotLayout | { error: string } {
  const table = readSourceTable(book, pivot.sourceSheetId, pivot.sourceA1);
  if ('error' in table) return table;
  if (pivot.values.length === 0) return { error: 'PivotTable needs at least one value field.' };
  const rows = table.rows.filter((row) => rowPassesFilters(row, pivot.filters));
  const rowKeys = uniqueKeyTuples(rows, pivot.rows);
  const colKeys = uniqueKeyTuples(rows, pivot.columns);
  const rowHeaderCount = Math.max(pivot.rows.length, 0);
  const valueCount = pivot.values.length;
  const colBlocks = pivot.columns.length > 0 ? [...colKeys, ['Grand Total']] : [[]];
  const colCount = rowHeaderCount + colBlocks.length * valueCount;
  const bodyRows = pivot.rows.length > 0 ? [...rowKeys, ['Grand Total']] : [[]];
  const rowCount = 1 + bodyRows.length;
  if (rowCount * colCount > PIVOT_VALUE_LIMIT) {
    return { error: `PivotTable output is larger than ${PIVOT_VALUE_LIMIT} cells.` };
  }
  const cells: PivotLayoutCell[] = [];
  for (let col = 0; col < rowHeaderCount; col += 1) {
    cells.push({ row: 0, col, v: pivot.rows[col]?.name ?? '', kind: 'header' });
  }
  colBlocks.forEach((tuple, block) => {
    pivot.values.forEach((field, offset) => {
      const title = pivot.columns.length > 0
        ? (tuple[0] === 'Grand Total' && tuple.length === 1
          ? `Grand Total | ${valueFieldHeader(field)}`
          : `${tuple.join(' | ')} | ${valueFieldHeader(field)}`)
        : valueFieldHeader(field);
      cells.push({ row: 0, col: rowHeaderCount + block * valueCount + offset, v: title, kind: 'header' });
    });
  });
  bodyRows.forEach((tuple, bodyIndex) => {
    const outRow = bodyIndex + 1;
    const isRowTotal = pivot.rows.length > 0 && tuple.length === 1 && tuple[0] === 'Grand Total';
    for (let col = 0; col < rowHeaderCount; col += 1) {
      const label = isRowTotal ? (col === 0 ? 'Grand Total' : '') : (tuple[col] ?? '');
      cells.push({ row: outRow, col, v: label, kind: isRowTotal ? 'total' : 'label' });
    }
    colBlocks.forEach((colTuple, block) => {
      const isColTotal = pivot.columns.length > 0 && colTuple.length === 1 && colTuple[0] === 'Grand Total';
      pivot.values.forEach((field, offset) => {
        const pairs: Array<[string, string]> = [];
        if (!isRowTotal) {
          pivot.rows.forEach((rowField, index) => {
            const item = tuple[index];
            if (item) pairs.push([rowField.name, item]);
          });
        }
        if (!isColTotal) {
          pivot.columns.forEach((colField, index) => {
            const item = colTuple[index];
            if (item) pairs.push([colField.name, item]);
          });
        }
        const matched = matchingRows(table, pivot, pairs);
        const value = Array.isArray(matched) && matched.length > 0
          ? aggregate(
            matched.flatMap((row) => {
              const num = row[field.col]?.number;
              return typeof num === 'number' ? [num] : [];
            }),
            field.agg,
            matched.length,
          )
          : null;
        cells.push({
          row: outRow,
          col: rowHeaderCount + block * valueCount + offset,
          v: value,
          kind: isRowTotal || isColTotal ? 'total' : 'value',
        });
      });
    });
  });
  return { cells, rowCount, colCount };
}

function uniqueKeyTuples(rows: SourceTable['rows'], fields: PivotField[]): string[][] {
  if (fields.length === 0) return [];
  const seen = new Set<string>();
  const tuples: string[][] = [];
  for (const row of rows) {
    const tuple = fields.map((field) => labelOf(row, field.col));
    const key = tuple.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    tuples.push(tuple);
  }
  return tuples.sort((left, right) => left.join('\u0000').localeCompare(right.join('\u0000')));
}

export function findPivotContaining(book: PortableWorkbook, sheetId: string, row: number, col: number): PivotTableDef | undefined {
  return workbookPivots(book).find((pivot) => {
    if (pivot.destSheetId !== sheetId) return false;
    const r2 = pivot.destRow + Math.max(pivot.outputRows, 1) - 1;
    const c2 = pivot.destCol + Math.max(pivot.outputCols, 1) - 1;
    return row >= pivot.destRow && row <= r2 && col >= pivot.destCol && col <= c2;
  });
}

export function pivotSourceCoords(book: PortableWorkbook, pivot: PivotTableDef): Array<{ sheetId: string; row: number; col: number }> {
  const range = parseA1Range(pivot.sourceA1);
  if (!range) return [];
  const area = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
  const coords: Array<{ sheetId: string; row: number; col: number }> = [];
  if (area > 20000) {
    coords.push({ sheetId: pivot.sourceSheetId, row: range.r1, col: range.c1 });
    coords.push({ sheetId: pivot.sourceSheetId, row: range.r2, col: range.c2 });
    return coords;
  }
  for (let row = range.r1; row <= range.r2; row += 1) {
    for (let col = range.c1; col <= range.c2; col += 1) {
      coords.push({ sheetId: pivot.sourceSheetId, row, col });
    }
  }
  return coords;
}

function layoutRectOverlapsSource(pivot: PivotTableDef, layout: PivotLayout): boolean {
  if (pivot.sourceSheetId !== pivot.destSheetId) return false;
  const source = parseA1Range(pivot.sourceA1);
  if (!source) return false;
  const r1 = pivot.destRow;
  const c1 = pivot.destCol;
  const r2 = pivot.destRow + layout.rowCount - 1;
  const c2 = pivot.destCol + layout.colCount - 1;
  return !(r2 < source.r1 || r1 > source.r2 || c2 < source.c1 || c1 > source.c2);
}

function clearRect(sheet: PortableSheet, row: number, col: number, rowCount: number, colCount: number): void {
  for (let r = row; r < row + rowCount; r += 1) {
    for (let c = col; c < col + colCount; c += 1) {
      delete sheet.cells[cellKey(r, c)];
    }
  }
}

function writeLayout(sheet: PortableSheet, originRow: number, originCol: number, layout: PivotLayout): void {
  sheet.rowCount = Math.max(sheet.rowCount, originRow + layout.rowCount + 4);
  sheet.columnCount = Math.max(sheet.columnCount, originCol + layout.colCount + 2);
  for (const cell of layout.cells) {
    const key = cellKey(originRow + cell.row, originCol + cell.col);
    if (cell.v === null || cell.v === undefined || cell.v === '') delete sheet.cells[key];
    else sheet.cells[key] = { v: cell.v };
  }
}

export function lookupGetPivotData(
  book: PortableWorkbook,
  pivot: PivotTableDef,
  dataField: string,
  pairs: Array<[string, string]>,
): number | PivotLookupError {
  const field = resolveValueField(pivot, dataField);
  if (!field) return { kind: 'error', code: '#REF!', message: `GETPIVOTDATA value field ${dataField} is not in this PivotTable.` };
  const table = readSourceTable(book, pivot.sourceSheetId, pivot.sourceA1);
  if ('error' in table) return { kind: 'error', code: '#REF!', message: table.error };
  const matched = matchingRows(table, pivot, pairs);
  if (!Array.isArray(matched)) return matched.error;
  if (matched.length === 0) return { kind: 'error', code: '#REF!', message: 'GETPIVOTDATA found no matching pivot item.' };
  const numbers = matched.flatMap((row) => {
    const num = row[field.col]?.number;
    return typeof num === 'number' ? [num] : [];
  });
  const value = aggregate(numbers, field.agg, matched.length);
  if (value === null) return { kind: 'error', code: field.agg === 'avg' ? '#DIV/0!' : '#REF!', message: 'GETPIVOTDATA has no numeric values for this item.' };
  return value;
}

export function applyPivotOutputs(book: PortableWorkbook, source: PortableWorkbook = book, ids?: string[]): PortableWorkbook {
  const next = cloneBook(book);
  const computed = source;
  for (const pivot of next.pivots) {
    if (ids && !ids.includes(pivot.id)) continue;
    if (!ids && !pivot.autoRefresh) continue;
    const layout = buildPivotLayout(computed, pivot);
    if ('error' in layout) continue;
    if (layoutRectOverlapsSource(pivot, layout)) continue;
    const sheet = next.sheets.find((item) => item.id === pivot.destSheetId);
    if (!sheet) continue;
    if (pivot.outputRows > 0 && pivot.outputCols > 0) {
      clearRect(sheet, pivot.destRow, pivot.destCol, pivot.outputRows, pivot.outputCols);
    }
    writeLayout(sheet, pivot.destRow, pivot.destCol, layout);
    pivot.outputRows = layout.rowCount;
    pivot.outputCols = layout.colCount;
  }
  return next;
}

export function createPivotTable(book: PortableWorkbook, input: CreatePivotInput, source: PortableWorkbook = book): PivotWriteResult {
  if (input.values.length === 0) return { book, error: 'PivotTable needs at least one value field.' };
  const sourceSheet = book.sheets.find((item) => item.id === input.sourceSheetId);
  if (!sourceSheet || !parseA1Range(input.sourceA1)) {
    return { book, error: 'PivotTable source range is not a contiguous A1 range on one sheet.' };
  }
  const next = cloneBook(book);
  let destSheetId = input.destSheetId ?? input.sourceSheetId;
  let destA1 = (input.destA1 ?? 'A1').trim() || 'A1';
  let placement = input.placement;
  if (placement !== 'range') {
    placement = 'new-sheet';
    const sheet = createSheet(uniqueSheetName(next, nextPivotSheetName(next)));
    next.sheets.push(sheet);
    next.activeSheetId = sheet.id;
    destSheetId = sheet.id;
    destA1 = 'A1';
  }
  const destSheet = next.sheets.find((item) => item.id === destSheetId);
  const destRange = parseA1Range(destA1);
  if (!destSheet || !destRange) return { book, error: 'PivotTable destination must be a cell A1 reference.' };
  const pivot: PivotTableDef = {
    id: input.id ?? cryptoRandomId(),
    name: input.name?.trim() || nextPivotName(next),
    sourceSheetId: input.sourceSheetId,
    sourceA1: input.sourceA1.trim().toUpperCase(),
    rows: input.rows.map((field) => ({ ...field })),
    columns: input.columns.map((field) => ({ ...field })),
    values: input.values.map((field) => ({ ...field })),
    filters: input.filters.map((field) => ({ ...field, selected: [...field.selected] })),
    placement,
    destSheetId,
    destA1: a1Cell(destRange.r1, destRange.c1),
    destRow: destRange.r1,
    destCol: destRange.c1,
    outputRows: 0,
    outputCols: 0,
    autoRefresh: input.autoRefresh !== false,
  };
  const layout = buildPivotLayout(source, pivot);
  if ('error' in layout) return { book, error: layout.error };
  if (layoutRectOverlapsSource(pivot, layout)) {
    return { book, error: 'PivotTable destination overlaps its source range.' };
  }
  writeLayout(destSheet, pivot.destRow, pivot.destCol, layout);
  pivot.outputRows = layout.rowCount;
  pivot.outputCols = layout.colCount;
  next.pivots = [...workbookPivots(next), pivot];
  return { book: next, pivot };
}

export function refreshPivotTable(book: PortableWorkbook, pivotId?: string, source: PortableWorkbook = book): PivotWriteResult {
  const ids = pivotId ? [pivotId] : workbookPivots(book).map((pivot) => pivot.id);
  if (ids.length === 0) return { book, error: 'Workbook has no local PivotTable to refresh.' };
  const missing = ids.find((id) => !workbookPivots(book).some((pivot) => pivot.id === id));
  if (missing) return { book, error: 'PivotTable was not found.' };
  const overlap = workbookPivots(book).some((pivot) => {
    if (!ids.includes(pivot.id)) return false;
    const layout = buildPivotLayout(source, pivot);
    return !('error' in layout) && layoutRectOverlapsSource(pivot, layout);
  });
  if (overlap) return { book, error: 'PivotTable destination overlaps its source range.' };
  return { book: applyPivotOutputs(book, source, ids) };
}
