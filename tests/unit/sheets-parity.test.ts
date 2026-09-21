import { describe, expect, it } from 'vitest';
import { applyConditionalFormatPaint, upsertConditionalFormat } from '../../src/tools/sheets/sheets-cf';
import { chartConfigFromSelection } from '../../src/tools/sheets/sheets-charts';
import { CONTEXT_MENU_ACTIONS } from '../../src/tools/sheets/sheets-context-menu';
import { applyNumberFormat, formatDisplay } from '../../src/tools/sheets/sheets-format';
import { evaluateFormula } from '../../src/tools/sheets/sheets-formula';
import {
  CLIENT_VIEWPORTS,
  P16_PROOF_NOT_ACCEPTED,
  FORMULA_CATALOG,
  LOCKED_INSERT_FUNCTIONS,
  autoSumPlacement,
  fillDownSelection,
  clearRangeMode,
  colorScaleFill,
  createSheetProtect,
  currentDateValue,
  deleteNamedRange,
  gotoSpecial,
  hiddenSheets,
  insertFunctionTemplate,
  jumpToDataEdge,
  listValidationChoices,
  parseGotoA1,
  parseTsvGrid,
  pasteSpecial,
  removeDuplicates,
  setSheetHidden,
  setSheetProtect,
  setSheetTabColor,
  sheetIsLocked,
  snapshotRange,
  textToColumns,
  transposeGrid,
  verifySheetProtect,
  visibleSheets,
} from '../../src/tools/sheets/sheets-parity';
import { cellKey, starterWorkbook } from '../../src/tools/sheets/sheets-types';
import { listValidationForCell, upsertValidation } from '../../src/tools/sheets/sheets-validation';

describe('tabular sheet parity slice', () => {
  it('pastes values, formats, and a transposed grid', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const clip = snapshotRange(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 1 }, (cell) => String(cell?.v ?? ''));
    expect(clip.tsv).toBe('Paper\t4\nInk\t2');
    const values = pasteSpecial(book, sheet.id, { row: 10, col: 0 }, clip, 'values');
    expect(values.sheets[0]?.cells[cellKey(10, 0)]?.v).toBe('Paper');
    expect(values.sheets[0]?.cells[cellKey(10, 0)]?.f).toBeNull();
    const styled = applyNumberFormat(book, sheet.id, { r1: 1, c1: 1, r2: 1, c2: 1 }, '$#,##0.00');
    const formatClip = snapshotRange(styled, sheet.id, { r1: 1, c1: 1, r2: 1, c2: 1 }, () => '');
    const formats = pasteSpecial(styled, sheet.id, { row: 11, col: 4 }, formatClip, 'formats');
    expect(formats.sheets[0]?.cells[cellKey(11, 4)]?.z).toBe('$#,##0.00');
    const transposed = pasteSpecial(book, sheet.id, { row: 20, col: 0 }, clip, 'transpose');
    expect(transposed.sheets[0]?.cells[cellKey(20, 0)]?.v).toBe('Paper');
    expect(transposed.sheets[0]?.cells[cellKey(20, 1)]?.v).toBe('Ink');
    expect(transposeGrid(parseTsvGrid('A\tB\n1\t2'))).toEqual([
      [{ v: 'A', f: null }, { v: 1, f: null }],
      [{ v: 'B', f: null }, { v: 2, f: null }],
    ]);
  });

  it('clears contents while keeping style, and clear-all drops the cell', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const styled = applyNumberFormat(book, sheet.id, { r1: 1, c1: 0, r2: 1, c2: 0 }, '@');
    const contents = clearRangeMode(styled, sheet.id, { r1: 1, c1: 0, r2: 1, c2: 0 }, 'contents');
    expect(contents.sheets[0]?.cells[cellKey(1, 0)]?.v).toBeNull();
    expect(contents.sheets[0]?.cells[cellKey(1, 0)]?.z).toBe('@');
    const all = clearRangeMode(styled, sheet.id, { r1: 1, c1: 0, r2: 1, c2: 0 }, 'all');
    expect(all.sheets[0]?.cells[cellKey(1, 0)]).toBeUndefined();
  });

  it('removes duplicate rows and splits text to columns', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    sheet.cells[cellKey(10, 0)] = { v: 'Ada' };
    sheet.cells[cellKey(10, 1)] = { v: 1 };
    sheet.cells[cellKey(11, 0)] = { v: 'Ada' };
    sheet.cells[cellKey(11, 1)] = { v: 1 };
    sheet.cells[cellKey(12, 0)] = { v: 'Bea' };
    sheet.cells[cellKey(12, 1)] = { v: 2 };
    const deduped = removeDuplicates(book, sheet.id, { r1: 10, c1: 0, r2: 12, c2: 1 });
    expect(deduped.sheets[0]?.cells[cellKey(10, 0)]?.v).toBe('Ada');
    expect(deduped.sheets[0]?.cells[cellKey(11, 0)]?.v).toBe('Bea');
    expect(deduped.sheets[0]?.cells[cellKey(12, 0)]).toBeUndefined();
    sheet.cells[cellKey(15, 0)] = { v: 'red,green,blue' };
    const split = textToColumns(book, sheet.id, { r1: 15, c1: 0, r2: 15, c2: 0 }, ',');
    expect(split.sheets[0]?.cells[cellKey(15, 0)]?.v).toBe('red');
    expect(split.sheets[0]?.cells[cellKey(15, 2)]?.v).toBe('blue');
  });

  it('goes to blanks, formulas, and constants, and parses an A1 jump', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const blanks = gotoSpecial(book, sheet.id, { r1: 1, c1: 3, r2: 2, c2: 4 }, 'blanks');
    expect(blanks.some((hit) => hit.row === 1 && hit.col === 4)).toBe(true);
    const formulas = gotoSpecial(book, sheet.id, { r1: 0, c1: 0, r2: 4, c2: 3 }, 'formulas');
    expect(formulas).toEqual(expect.arrayContaining([{ row: 1, col: 3 }, { row: 3, col: 3 }]));
    const constants = gotoSpecial(book, sheet.id, { r1: 1, c1: 0, r2: 1, c2: 1 }, 'constants');
    expect(constants).toEqual([{ row: 1, col: 0 }, { row: 1, col: 1 }]);
    expect(parseGotoA1('C4')).toEqual({ row: 3, col: 2 });
  });

  it('hides a sheet, colors a tab, and deletes a named range', () => {
    const book = starterWorkbook();
    const first = book.sheets[0]!;
    const second = book.sheets[1]!;
    const hidden = setSheetHidden(book, second.id, true);
    expect(visibleSheets(hidden).map((item) => item.id)).toEqual([first.id]);
    expect(hiddenSheets(hidden).map((item) => item.id)).toEqual([second.id]);
    expect(setSheetHidden(hidden, first.id, true)).toBe(hidden);
    const colored = setSheetTabColor(book, first.id, '#205bd6');
    expect(colored.sheets[0]?.tabColor).toBe('#205bd6');
    expect(deleteNamedRange(book, 'TaxRate').namedRanges).toEqual([]);
  });

  it('places AutoSum and keeps the locked Insert Function catalog, not an XLOOKUP-only slice', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const below = autoSumPlacement(book, sheet.id, { r1: 1, c1: 1, r2: 2, c2: 1 });
    expect(below).toEqual({ formula: '=SUM(B2:B3)', row: 3, col: 1 });
    const into = autoSumPlacement(book, sheet.id, { r1: 3, c1: 1, r2: 3, c2: 1 });
    expect(into?.formula).toBe('=SUM(B2:B3)');
    expect(insertFunctionTemplate('SUM')).toBe('=SUM(');
    expect(insertFunctionTemplate('INDEX-MATCH')).toContain('MATCH');
    expect(FORMULA_CATALOG.map((item) => item.name)).toEqual(expect.arrayContaining([...LOCKED_INSERT_FUNCTIONS]));
    expect(LOCKED_INSERT_FUNCTIONS).toEqual([
      'SUM', 'AVERAGE', 'IF', 'VLOOKUP', 'XLOOKUP', 'INDEX-MATCH', 'TEXTJOIN', 'COUNTIF', 'SUMIF',
    ]);
    expect(LOCKED_INSERT_FUNCTIONS).not.toEqual(['XLOOKUP']);
    const catalogNames = FORMULA_CATALOG.map((item) => item.name);
    expect(catalogNames).toEqual(expect.arrayContaining(['FILTER', 'SORT', 'UNIQUE', 'LEFT', 'POWER']));
    expect(catalogNames.indexOf('SUM')).toBeLessThan(catalogNames.indexOf('FILTER'));
    const filled = fillDownSelection(book, sheet.id, { r1: 1, c1: 1, r2: 4, c2: 1 });
    expect(filled.sheets[0]?.cells[cellKey(3, 1)]?.v).toBe(6);
  });

  it('jumps to the data edge and formats a local date for Ctrl+;', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    expect(jumpToDataEdge(book, sheet.id, { row: 1, col: 0 }, 1, 0)).toEqual({ row: 4, col: 0 });
    expect(jumpToDataEdge(book, sheet.id, { row: 10, col: 0 }, -1, 0)).toEqual({ row: 4, col: 0 });
    expect(currentDateValue(new Date('2026-09-20T12:00:00'))).toBe('2026-09-20');
  });

  it('paints a color scale and writes a custom number pattern', () => {
    expect(colorScaleFill(1, 1, 3, '#ffffff', '#000000')).toBe('#ffffff');
    expect(colorScaleFill(3, 1, 3, '#ffffff', '#000000')).toBe('#000000');
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const scaled = upsertConditionalFormat(book, {
      id: 'qty-scale',
      sheetId: sheet.id,
      a1: 'B2:B3',
      kind: 'color-scale',
      argument: '#f0fdf4,#14532d',
      fill: '#f0fdf4',
      color: '#14532d',
    });
    const paint = applyConditionalFormatPaint(scaled, sheet.id, 1, 1, scaled.sheets[0]!.cells[cellKey(1, 1)]!);
    expect(paint?.fill).toMatch(/^#[0-9a-f]{6}$/i);
    const custom = applyNumberFormat(book, sheet.id, { r1: 1, c1: 2, r2: 1, c2: 2 }, '0.0');
    expect(formatDisplay(custom.sheets[0]?.cells[cellKey(1, 2)]?.v, '0.0')).toBe('2.5');
  });

  it('exposes list-validation choices and column/line/pie chart kinds', () => {
    expect(listValidationChoices('2, 4, 6')).toEqual(['2', '4', '6']);
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const withRule = upsertValidation(book, {
      id: 'qty-list',
      sheetId: sheet.id,
      a1: 'B2',
      kind: 'list',
      argument: '2,4,6',
      message: 'Qty must be 2, 4, or 6.',
    });
    expect(listValidationForCell(withRule, sheet.id, 1, 1)).toEqual(['2', '4', '6']);
    expect(chartConfigFromSelection(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 1 }, 'column').type).toBe('bar');
    expect(chartConfigFromSelection(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 1 }, 'line').type).toBe('line');
    expect(chartConfigFromSelection(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 1 }, 'pie').type).toBe('pie');
  });

  it('hashes a local unlock PIN and treats the sheet as locked until verified', async () => {
    const protect = await createSheetProtect('2468');
    expect(protect.hash).toHaveLength(64);
    expect(protect.hash).not.toContain('2468');
    expect(await verifySheetProtect('2468', protect)).toBe(true);
    expect(await verifySheetProtect('0000', protect)).toBe(false);
    const starter = starterWorkbook();
    const book = setSheetProtect(starter, starter.sheets[0]!.id, protect);
    const sheetId = book.sheets[0]!.id;
    expect(sheetIsLocked(book.sheets[0], [])).toBe(true);
    expect(sheetIsLocked(book.sheets[0], [sheetId])).toBe(false);
  });

  it('keeps a device-agnostic portrait+landscape viewport matrix, not an iPhone 13-only proof', () => {
    expect(CLIENT_VIEWPORTS.map((item) => `${item.width}x${item.height}:${item.orientation}`)).toEqual([
      '320x740:portrait',
      '360x800:portrait',
      '390x844:portrait',
      '412x915:portrait',
      '430x932:portrait',
      '768x1024:portrait',
      '740x320:landscape',
      '800x360:landscape',
      '844x390:landscape',
      '915x412:landscape',
      '932x430:landscape',
      '1024x768:landscape',
    ]);
    expect(CLIENT_VIEWPORTS.filter((item) => item.orientation === 'portrait').length).toBeGreaterThanOrEqual(4);
    expect(CLIENT_VIEWPORTS.filter((item) => item.orientation === 'landscape').length).toBeGreaterThanOrEqual(4);
    expect(CLIENT_VIEWPORTS.map((item) => item.name).join(' ')).not.toMatch(/iphone/i);
    expect(P16_PROOF_NOT_ACCEPTED).toEqual(['iPhone 13', 'mobile-chromium']);
    expect(CONTEXT_MENU_ACTIONS.map((item) => item.id)).toEqual(expect.arrayContaining([
      'paste-values',
      'paste-formats',
      'paste-transpose',
      'clear',
      'clear-all',
    ]));
  });

  it('evaluates TEXTJOIN, COUNTIF, SUMIF, VLOOKUP, XLOOKUP, INDEX, and MATCH', () => {
    const book = starterWorkbook();
    const sheetId = book.sheets[0]!.id;
    expect(evaluateFormula('=TEXTJOIN(",",TRUE,A2:A3)', book, sheetId)).toBe('Paper,Ink');
    expect(evaluateFormula('=COUNTIF(B2:B3,">3")', book, sheetId)).toBe(1);
    expect(evaluateFormula('=SUMIF(A2:A3,"Paper",B2:B3)', book, sheetId)).toBe(4);
    expect(evaluateFormula('=VLOOKUP("Ink",A2:B3,2)', book, sheetId)).toBe(2);
    expect(evaluateFormula('=XLOOKUP("Paper",A2:A3,B2:B3)', book, sheetId)).toBe(4);
    expect(evaluateFormula('=INDEX(B2:B3,2)', book, sheetId)).toBe(2);
    expect(evaluateFormula('=MATCH("Ink",A2:A3)', book, sheetId)).toBe(2);
    expect(evaluateFormula('=INDEX(B2:B3,MATCH("Paper",A2:A3))', book, sheetId)).toBe(4);
  });
});
