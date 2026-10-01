import { cellKey, parseCellKey, type PortableSheet, type PortableWorkbook, type SheetCell } from './sheets-types';

export type SpillScalar = string | number | boolean | null;
export type SpillMatrix = SpillScalar[][];

export function isSpillMatrix(value: unknown): value is SpillMatrix {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  return Array.isArray(value[0]);
}

export function spillOriginKey(row: number, col: number): string {
  return cellKey(row, col);
}

export function isBlankForSpill(cell: SheetCell | undefined, originKey: string): boolean {
  if (!cell) return true;
  if (cell.spillFrom === originKey) return true;
  if (cell.f) return false;
  if (cell.v !== null && cell.v !== undefined && cell.v !== '') return false;
  if (cell.note) return false;
  if (cell.hyperlink) return false;
  return true;
}

export function clearOriginSpill(sheet: PortableSheet, originKey: string): void {
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.spillFrom !== originKey) continue;
    const leftover: SheetCell = { ...cell };
    delete leftover.v;
    delete leftover.spillFrom;
    if (
      (leftover.v === null || leftover.v === undefined || leftover.v === '')
      && !leftover.f
      && !leftover.note
      && !leftover.hyperlink
      && !leftover.z
      && !leftover.s
    ) {
      delete sheet.cells[key];
    } else {
      sheet.cells[key] = leftover;
    }
  }
}

function mergeBlocksSpill(sheet: PortableSheet, row: number, col: number, originRow: number, originCol: number): boolean {
  return sheet.merges.some((merge) => {
    const inside = row >= merge.r1 && row <= merge.r2 && col >= merge.c1 && col <= merge.c2;
    if (!inside) return false;
    const originInside = originRow >= merge.r1 && originRow <= merge.r2 && originCol >= merge.c1 && originCol <= merge.c2;
    return !originInside;
  });
}

export function applySpill(
  book: PortableWorkbook,
  sheetId: string,
  originRow: number,
  originCol: number,
  matrix: SpillMatrix,
): { ok: true } | { ok: false; code: '#SPILL!' | '#CALC!'; message: string } {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return { ok: false, code: '#SPILL!', message: 'Missing sheet for spill.' };
  const originKey = spillOriginKey(originRow, originCol);
  const height = matrix.length;
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (height === 0 || width === 0) {
    clearOriginSpill(sheet, originKey);
    return { ok: false, code: '#CALC!', message: 'Spill produced no values.' };
  }
  clearOriginSpill(sheet, originKey);
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      if (r === 0 && c === 0) continue;
      const row = originRow + r;
      const col = originCol + c;
      const existing = sheet.cells[cellKey(row, col)];
      if (!isBlankForSpill(existing, originKey) || mergeBlocksSpill(sheet, row, col, originRow, originCol)) {
        return { ok: false, code: '#SPILL!', message: 'Spill needs empty neighboring cells.' };
      }
    }
  }
  sheet.rowCount = Math.max(sheet.rowCount, originRow + height + 4);
  sheet.columnCount = Math.max(sheet.columnCount, originCol + width + 2);
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const row = originRow + r;
      const col = originCol + c;
      const value = matrix[r]?.[c] ?? null;
      if (r === 0 && c === 0) continue;
      const key = cellKey(row, col);
      const current = sheet.cells[key] ?? {};
      sheet.cells[key] = { ...current, v: value, spillFrom: originKey };
    }
  }
  return { ok: true };
}

export function omitSpillCells(book: PortableWorkbook): PortableWorkbook {
  const next: PortableWorkbook = {
    ...book,
    sheets: book.sheets.map((sheet) => ({
      ...sheet,
      cells: { ...sheet.cells },
    })),
    namedRanges: [...book.namedRanges],
    validations: [...book.validations],
    conditionalFormats: [...book.conditionalFormats],
    comments: [...book.comments],
    pivots: [...(book.pivots ?? [])],
  };
  for (const sheet of next.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!cell.spillFrom) continue;
      delete sheet.cells[key];
    }
  }
  return next;
}

export function spillOriginFromCell(cell: SheetCell | undefined): { row: number; col: number } | null {
  if (!cell?.spillFrom) return null;
  return parseCellKey(cell.spillFrom);
}
