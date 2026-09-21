import { describe, expect, it } from 'vitest';
import { addComment, setCell } from '../../src/tools/sheets/sheets-model';
import { evaluateFormula, evaluateWorkbook } from '../../src/tools/sheets/sheets-formula';
import { FORMULAJS_PACKAGE, FORMULAJS_VERSION, hasFormulaJsFunction } from '../../src/tools/sheets/sheets-formula-js';
import { exportBundleZip, exportXlsx, importBundleZip, importXlsxWorkbook, parseBundle, toBundle } from '../../src/tools/sheets/sheets-io';
import { FORMULA_CATALOG, LOCKED_INSERT_FUNCTIONS } from '../../src/tools/sheets/sheets-parity';
import { omitSpillCells } from '../../src/tools/sheets/sheets-spill';
import { cellKey, emptyMeta, starterWorkbook } from '../../src/tools/sheets/sheets-types';

describe('tabular sheet wave A', () => {
  it('pins Formula.js exactly and keeps the locked Insert Function names', () => {
    expect(FORMULAJS_PACKAGE).toBe('@formulajs/formulajs');
    expect(FORMULAJS_VERSION).toBe('4.6.1');
    expect(hasFormulaJsFunction('LEFT')).toBe(true);
    expect(hasFormulaJsFunction('FILTER')).toBe(false);
    expect(LOCKED_INSERT_FUNCTIONS).toEqual([
      'SUM', 'AVERAGE', 'IF', 'VLOOKUP', 'XLOOKUP', 'INDEX-MATCH', 'TEXTJOIN', 'COUNTIF', 'SUMIF',
    ]);
    expect(FORMULA_CATALOG.map((item) => item.name)).toEqual(expect.arrayContaining([
      ...LOCKED_INSERT_FUNCTIONS, 'FILTER', 'SORT', 'UNIQUE', 'LEFT', 'RIGHT', 'POWER',
    ]));
  });

  it('evaluates Formula.js names through the portable DAG without replacing local SUM', () => {
    const book = starterWorkbook();
    const sheetId = book.sheets[0]!.id;
    expect(evaluateFormula('=LEFT("Paper",3)', book, sheetId)).toBe('Pap');
    expect(evaluateFormula('=RIGHT(A2,2)', book, sheetId)).toBe('er');
    expect(evaluateFormula('=POWER(2,3)', book, sheetId)).toBe(8);
    expect(evaluateFormula('=SUM(B2:B3)', book, sheetId)).toBe(6);
    expect(evaluateFormula('=YEAR(TODAY())', book, sheetId)).toBe(new Date().getFullYear());
    const missing = evaluateFormula('=NOTAFUNCTION(1)', book, sheetId);
    expect(missing).toMatchObject({ kind: 'error', code: '#NAME?' });
  });

  it('spills FILTER, SORT, and UNIQUE into empty neighbors', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    sheet.cells[cellKey(10, 0)] = { v: 'Apple' };
    sheet.cells[cellKey(11, 0)] = { v: 'Banana' };
    sheet.cells[cellKey(12, 0)] = { v: 'Apple' };
    sheet.cells[cellKey(10, 1)] = { v: 1 };
    sheet.cells[cellKey(11, 1)] = { v: 4 };
    sheet.cells[cellKey(12, 1)] = { v: 2 };
    sheet.cells[cellKey(10, 3)] = { f: '=FILTER(A11:A13,B11:B13>=2)' };
    sheet.cells[cellKey(10, 4)] = { f: '=SORT(A11:A13)' };
    sheet.cells[cellKey(10, 5)] = { f: '=UNIQUE(A11:A13)' };
    const computed = evaluateWorkbook(book);
    expect(computed.sheets[0]?.cells[cellKey(10, 3)]?.v).toBe('Banana');
    expect(computed.sheets[0]?.cells[cellKey(11, 3)]?.v).toBe('Apple');
    expect(computed.sheets[0]?.cells[cellKey(11, 3)]?.spillFrom).toBe(cellKey(10, 3));
    expect(computed.sheets[0]?.cells[cellKey(10, 4)]?.v).toBe('Apple');
    expect(computed.sheets[0]?.cells[cellKey(11, 4)]?.v).toBe('Apple');
    expect(computed.sheets[0]?.cells[cellKey(12, 4)]?.v).toBe('Banana');
    expect(computed.sheets[0]?.cells[cellKey(10, 5)]?.v).toBe('Apple');
    expect(computed.sheets[0]?.cells[cellKey(11, 5)]?.v).toBe('Banana');
    expect(omitSpillCells(computed).sheets[0]?.cells[cellKey(11, 3)]).toBeUndefined();
  });

  it('writes #SPILL! when a neighboring cell already has a value', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    sheet.cells[cellKey(10, 0)] = { v: 'Apple' };
    sheet.cells[cellKey(11, 0)] = { v: 'Banana' };
    sheet.cells[cellKey(10, 1)] = { v: 5 };
    sheet.cells[cellKey(11, 1)] = { v: 6 };
    sheet.cells[cellKey(10, 3)] = { f: '=FILTER(A11:A12,B11:B12>=5)' };
    sheet.cells[cellKey(11, 3)] = { v: 'blocked' };
    const computed = evaluateWorkbook(book);
    expect(computed.sheets[0]?.cells[cellKey(10, 3)]?.v).toBe('#SPILL!');
    expect(computed.sheets[0]?.cells[cellKey(11, 3)]?.v).toBe('blocked');
  });

  it('round-trips cell comments through XLSX and the portable bundle', async () => {
    const starter = starterWorkbook();
    const sheet = starter.sheets[0]!;
    const withNote = addComment(
      setCell(starter, sheet.id, 1, 0, { note: 'Keep this note' }),
      sheet.id,
      'A2',
      'Keep this note',
    );
    const bytes = await exportXlsx(withNote);
    const copy = bytes.slice();
    const imported = await importXlsxWorkbook(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength), 'notes.xlsx');
    expect(imported.sheets[0]?.cells[cellKey(1, 0)]?.note).toBe('Keep this note');
    expect(imported.comments.some((item) => item.a1 === 'A2' && item.body === 'Keep this note')).toBe(true);

    const bundle = toBundle(withNote, { ...emptyMeta(), title: 'Notes', tags: ['local'] });
    const parsed = parseBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed?.workbook.sheets[0]?.cells[cellKey(1, 0)]?.note).toBe('Keep this note');
    expect(parsed?.workbook.comments.some((item) => item.body === 'Keep this note')).toBe(true);

    const zip = await exportBundleZip(withNote, emptyMeta());
    const zipCopy = zip.slice();
    const fromZip = await importBundleZip(zipCopy.buffer.slice(zipCopy.byteOffset, zipCopy.byteOffset + zipCopy.byteLength));
    expect(fromZip?.workbook.sheets[0]?.cells[cellKey(1, 0)]?.note).toBe('Keep this note');
  });
});
