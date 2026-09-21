import { describe, expect, it } from 'vitest';
import {
  a1FromParts,
  buildFormulaDag,
  columnIndex,
  columnLetters,
  evaluateFormula,
  evaluateWorkbook,
  extractRefs,
  parseA1Ref,
  rewriteRelative,
  selectionAggregates,
} from '../../src/tools/sheets/sheets-formula';
import { cellKey, starterWorkbook } from '../../src/tools/sheets/sheets-types';

describe('tabular sheet formula engine', () => {
  it('converts A1 columns and absolute/relative refs', () => {
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(25)).toBe('Z');
    expect(columnLetters(26)).toBe('AA');
    expect(columnIndex('AA')).toBe(26);
    expect(parseA1Ref('$B$3')).toEqual({ sheetName: null, col: 1, row: 2, colAbs: true, rowAbs: true });
    expect(parseA1Ref("='Other Sheet'!A1") === null).toBe(true);
    expect(parseA1Ref("'Other Sheet'!A1")).toMatchObject({ sheetName: 'Other Sheet', col: 0, row: 0 });
    expect(a1FromParts(1, 1, true, false, 'Sheet2')).toBe('Sheet2!$B2');
  });

  it('rewrites relative refs on fill and keeps absolute anchors', () => {
    expect(rewriteRelative('=A1+$B$1', 1, 0)).toBe('=A2+$B$1');
    expect(rewriteRelative('=Sheet2!B3', 0, 1)).toBe('=Sheet2!C3');
    expect(extractRefs("=SUM('Data Set'!$A$1:B2)")).toHaveLength(2);
  });

  it('evaluates arithmetic, ranges, named ranges, and cross-sheet refs', () => {
    const book = starterWorkbook();
    const computed = evaluateWorkbook(book);
    const sheet1 = computed.sheets[0];
    const total = sheet1?.cells[cellKey(3, 3)]?.v;
    expect(total).toBeCloseTo(22.08, 8);
    const other = sheet1?.cells[cellKey(4, 1)]?.v;
    expect(other).toBe(0.08);
    const direct = evaluateFormula('=SUM(B2:B3)*C2', book, book.sheets[0]!.id);
    expect(direct).toBe(15);
  });

  it('builds a DAG and reports cycles', () => {
    const book = starterWorkbook();
    const first = book.sheets[0]!;
    first.cells[cellKey(10, 0)] = { f: '=A12' };
    first.cells[cellKey(11, 0)] = { f: '=A11' };
    const dag = buildFormulaDag(book);
    expect(dag.nodes.length).toBeGreaterThan(3);
    expect(dag.cycles.length).toBeGreaterThan(0);
    const cycled = evaluateWorkbook(book);
    expect(cycled.sheets[0]?.cells[cellKey(10, 0)]?.v).toBe('#CYCLE!');
  });

  it('aggregates a selection for the status bar', () => {
    expect(selectionAggregates([1, 3, 5, null, ''])).toEqual({
      count: 3,
      sum: 9,
      average: 3,
      min: 1,
      max: 5,
    });
  });
});
