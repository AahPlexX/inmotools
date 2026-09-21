import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateFormula, evaluateWorkbook } from '../../src/tools/sheets/sheets-formula';
import { FORMULA_CATALOG } from '../../src/tools/sheets/sheets-parity';
import {
  applyPivotOutputs,
  createPivotTable,
  PIVOT_PLACEMENT_DEFAULT,
  pivotSheet,
  refreshPivotTable,
} from '../../src/tools/sheets/sheets-pivot';
import { cellKey, createWorkbook } from '../../src/tools/sheets/sheets-types';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function dataBook() {
  const book = createWorkbook('Pivot source');
  const sheet = book.sheets[0]!;
  sheet.name = 'Data';
  const rows: Array<Array<string | number>> = [
    ['Region', 'Product', 'Amount', 'Status'],
    ['East', 'Paper', 10, 'ok'],
    ['East', 'Ink', 5, 'ok'],
    ['West', 'Paper', 20, 'ok'],
    ['West', 'Ink', 7, 'hold'],
  ];
  rows.forEach((line, row) => {
    line.forEach((value, col) => {
      sheet.cells[cellKey(row, col)] = { v: value };
    });
  });
  return book;
}

function cellValue(book: ReturnType<typeof dataBook>, sheetName: string, row: number, col: number) {
  return book.sheets.find((sheet) => sheet.name === sheetName)?.cells[cellKey(row, col)]?.v;
}

describe('tabular sheet wave B', () => {
  it('keeps the Stage 1 group-by helper and defaults new pivots onto a new sheet', () => {
    const book = dataBook();
    const grouped = pivotSheet(book.sheets[0]!, { headerRow: 0, groupCol: 0, valueCol: 2, agg: 'sum' });
    expect(grouped.rows).toEqual([
      { group: 'East', value: 15 },
      { group: 'West', value: 27 },
    ]);
    expect(PIVOT_PLACEMENT_DEFAULT).toBe('new-sheet');
  });

  it('creates a row-field SUM pivot on a new sheet and refreshes after source edits', () => {
    const source = dataBook();
    const created = createPivotTable(source, {
      sourceSheetId: source.sheets[0]!.id,
      sourceA1: 'A1:D5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [{ name: 'Status', col: 3, selected: ['ok'] }],
      placement: 'new-sheet',
    });
    expect(created.error).toBeUndefined();
    const book = created.book;
    expect(book.sheets.map((sheet) => sheet.name)).toContain('Pivot1');
    expect(cellValue(book, 'Pivot1', 0, 0)).toBe('Region');
    expect(cellValue(book, 'Pivot1', 0, 1)).toBe('Sum of Amount');
    expect(cellValue(book, 'Pivot1', 1, 0)).toBe('East');
    expect(cellValue(book, 'Pivot1', 1, 1)).toBe(15);
    expect(cellValue(book, 'Pivot1', 2, 0)).toBe('West');
    expect(cellValue(book, 'Pivot1', 2, 1)).toBe(20);
    expect(cellValue(book, 'Pivot1', 3, 0)).toBe('Grand Total');
    expect(cellValue(book, 'Pivot1', 3, 1)).toBe(35);

    const data = book.sheets.find((sheet) => sheet.name === 'Data')!;
    data.cells[cellKey(1, 2)] = { v: 40 };
    const refreshed = refreshPivotTable(book, created.pivot?.id);
    expect(refreshed.error).toBeUndefined();
    expect(cellValue(refreshed.book, 'Pivot1', 1, 1)).toBe(45);
    expect(cellValue(refreshed.book, 'Pivot1', 3, 1)).toBe(65);
  });

  it('cross-tabulates a column field and supports COUNT, AVERAGE, MIN, and MAX', () => {
    const source = dataBook();
    const created = createPivotTable(source, {
      sourceSheetId: source.sheets[0]!.id,
      sourceA1: 'A1:C5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [{ name: 'Product', col: 1 }],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [],
      placement: 'new-sheet',
    });
    const book = created.book;
    expect(cellValue(book, 'Pivot1', 0, 1)).toBe('Ink | Sum of Amount');
    expect(cellValue(book, 'Pivot1', 0, 2)).toBe('Paper | Sum of Amount');
    expect(cellValue(book, 'Pivot1', 1, 0)).toBe('East');
    expect(cellValue(book, 'Pivot1', 1, 1)).toBe(5);
    expect(cellValue(book, 'Pivot1', 1, 2)).toBe(10);
    expect(cellValue(book, 'Pivot1', 2, 1)).toBe(7);
    expect(cellValue(book, 'Pivot1', 2, 2)).toBe(20);
    expect(cellValue(book, 'Pivot1', 3, 3)).toBe(42);

    const aggs = (['count', 'avg', 'min', 'max'] as const).map((agg) => {
      const result = createPivotTable(source, {
        sourceSheetId: source.sheets[0]!.id,
        sourceA1: 'A1:C5',
        rows: [{ name: 'Region', col: 0 }],
        columns: [],
        values: [{ name: 'Amount', col: 2, agg }],
        filters: [],
        placement: 'new-sheet',
      });
      return [agg, cellValue(result.book, 'Pivot1', 1, 1), cellValue(result.book, 'Pivot1', 3, 1)];
    });
    expect(aggs).toEqual([
      ['count', 2, 4],
      ['avg', 7.5, 10.5],
      ['min', 5, 5],
      ['max', 10, 20],
    ]);
  });

  it('writes onto a chosen destination range and refuses to overlap the source', () => {
    const source = dataBook();
    const placed = createPivotTable(source, {
      sourceSheetId: source.sheets[0]!.id,
      sourceA1: 'A1:C5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [],
      placement: 'range',
      destSheetId: source.sheets[1]!.id,
      destA1: 'B2',
    });
    expect(placed.error).toBeUndefined();
    expect(placed.pivot?.placement).toBe('range');
    expect(placed.pivot?.destA1).toBe('B2');
    const dest = placed.book.sheets[1]!;
    expect(dest.cells[cellKey(1, 1)]?.v).toBe('Region');
    expect(dest.cells[cellKey(2, 2)]?.v).toBe(15);

    const overlap = createPivotTable(source, {
      sourceSheetId: source.sheets[0]!.id,
      sourceA1: 'A1:C5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [],
      placement: 'range',
      destSheetId: source.sheets[0]!.id,
      destA1: 'A1',
    });
    expect(overlap.error).toMatch(/overlap/i);
    expect(overlap.book.pivots).toHaveLength(0);
  });

  it('looks up local pivot values with a GETPIVOTDATA subset', () => {
    const source = dataBook();
    const created = createPivotTable(source, {
      sourceSheetId: source.sheets[0]!.id,
      sourceA1: 'A1:C5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [{ name: 'Product', col: 1 }],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [],
      placement: 'new-sheet',
    });
    const book = created.book;
    const dataId = book.sheets.find((sheet) => sheet.name === 'Data')!.id;
    expect(evaluateFormula('=GETPIVOTDATA("Amount",Pivot1!A1)', book, dataId)).toBe(42);
    expect(evaluateFormula('=GETPIVOTDATA("Sum of Amount",Pivot1!A1,"Region","East")', book, dataId)).toBe(15);
    expect(evaluateFormula('=GETPIVOTDATA("Amount",Pivot1!B2,"Region","West","Product","Paper")', book, dataId)).toBe(20);
    expect(evaluateFormula('=GETPIVOTDATA("Amount",Pivot1!A1,"Product","Ink")', book, dataId)).toBe(12);
    expect(evaluateFormula('=GETPIVOTDATA("Amount",Pivot1!A1,"Region","North")', book, dataId)).toMatchObject({ kind: 'error', code: '#REF!' });
    expect(evaluateFormula('=GETPIVOTDATA("Amount",Data!A1)', book, dataId)).toMatchObject({ kind: 'error', code: '#REF!' });
    expect(FORMULA_CATALOG.some((item) => item.name === 'GETPIVOTDATA')).toBe(true);
  });

  it('recomputes GETPIVOTDATA after source formulas change without a server', () => {
    const source = dataBook();
    const data = source.sheets[0]!;
    data.cells[cellKey(1, 2)] = { f: '=10+5', v: null };
    const created = createPivotTable(source, {
      sourceSheetId: data.id,
      sourceA1: 'A1:C5',
      rows: [{ name: 'Region', col: 0 }],
      columns: [],
      values: [{ name: 'Amount', col: 2, agg: 'sum' }],
      filters: [],
      placement: 'new-sheet',
    });
    const withLookup = created.book;
    const dataSheet = withLookup.sheets.find((sheet) => sheet.name === 'Data')!;
    dataSheet.cells[cellKey(6, 0)] = { f: '=GETPIVOTDATA("Amount",Pivot1!A1,"Region","East")', v: null };
    const first = evaluateWorkbook(withLookup);
    expect(first.sheets.find((sheet) => sheet.name === 'Data')?.cells[cellKey(6, 0)]?.v).toBe(20);

    const edited = first;
    const editedData = edited.sheets.find((sheet) => sheet.name === 'Data')!;
    editedData.cells[cellKey(1, 2)] = { f: '=40', v: null };
    const synced = applyPivotOutputs(edited, evaluateWorkbook(edited), [created.pivot!.id]);
    const second = evaluateWorkbook(synced);
    expect(second.sheets.find((sheet) => sheet.name === 'Data')?.cells[cellKey(6, 0)]?.v).toBe(45);
    expect(cellValue(second, 'Pivot1', 1, 1)).toBe(45);
  });

  it('records Wave B coverage in FEATURE_MATRIX and keeps pivot chrome tap-safe', () => {
    const matrix = read('src/tools/sheets/FEATURE_MATRIX.md');
    expect(matrix).toMatch(/### Wave B/);
    expect(matrix).toMatch(/\| WB1 \|/);
    expect(matrix).toMatch(/\| WB2 \|/);
    expect(matrix).toMatch(/GETPIVOTDATA subset/);
    expect(matrix).toMatch(/Banned engines/);
    const workspace = read('src/tools/sheets/SheetsWorkspace.tsx');
    expect(workspace).toContain('data-testid="tsw-pivot-chrome"');
    expect(workspace).toContain('data-testid="tsw-pivot-create"');
    expect(workspace).toContain('data-testid="tsw-pivot-refresh"');
    expect(workspace).not.toMatch(/onMouseEnter.*[Pp]ivot|[Pp]ivot.*onMouseEnter/);
    expect(read('src/tools/sheets/sheets.css')).toMatch(/\.tsw-pivot-chrome/);
    expect(read('src/tools/sheets/sheets-pivot.ts')).not.toMatch(/@univerjs-pro|hyperformula/i);
  });
});
