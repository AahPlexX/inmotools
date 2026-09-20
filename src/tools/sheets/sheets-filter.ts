import { displayCell } from './sheets-formula';
import { cloneWorkbook } from './sheets-model';
import { cellKey, type ColumnFilterState, type PortableSheet, type PortableWorkbook } from './sheets-types';
import { formatDisplay } from './sheets-format';

export function cellFilterText(sheet: PortableSheet, row: number, col: number): string {
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return '';
  if (cell.z) return formatDisplay(cell.v, cell.z);
  return displayCell(cell);
}

export function distinctColumnValues(sheet: PortableSheet, col: number, headerRow: number): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (let row = headerRow + 1; row < sheet.rowCount; row += 1) {
    const text = cellFilterText(sheet, row, col).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values;
}

export function applyColumnAutofilter(
  book: PortableWorkbook,
  sheetId: string,
  headerRow: number,
  filters: Record<string | number, ColumnFilterState>,
): PortableWorkbook {
  const next = cloneWorkbook(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const normalized: Record<string, ColumnFilterState> = {};
  for (const [key, filter] of Object.entries(filters)) {
    normalized[String(key)] = {
      query: filter.query.trim(),
      hiddenValues: [...filter.hiddenValues],
    };
  }
  const hidden = new Set<number>();
  for (let row = 0; row < sheet.rowCount; row += 1) {
    if (row === headerRow) continue;
    if (row < headerRow) continue;
    const hide = Object.entries(normalized).some(([key, filter]) => {
      const col = Number(key);
      if (!Number.isInteger(col)) return false;
      const text = cellFilterText(sheet, row, col);
      if (filter.query && !text.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase())) return true;
      return filter.hiddenValues.includes(text);
    });
    if (hide) hidden.add(row);
  }
  sheet.filterHeaderRow = headerRow;
  sheet.columnFilters = normalized;
  sheet.hiddenRows = [...hidden].sort((a, b) => a - b);
  return next;
}
