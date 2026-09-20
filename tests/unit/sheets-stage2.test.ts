import { describe, expect, it, vi } from 'vitest';
import { a1FromParts } from '../../src/tools/sheets/sheets-formula';
import {
  CONTEXT_MENU_ACTIONS,
  CONTEXT_MENU_OWNER,
  LONG_PRESS_MS,
  cancelLongPressStub,
  scheduleLongPressStub,
  suppressNativeContextMenu,
} from '../../src/tools/sheets/sheets-context-menu';
import { applyColumnAutofilter, distinctColumnValues } from '../../src/tools/sheets/sheets-filter';
import { NUMBER_FORMATS, applyNumberFormat, formatDisplay } from '../../src/tools/sheets/sheets-format';
import { applyConditionalFormatPaint, evaluateConditionalFormat, upsertConditionalFormat } from '../../src/tools/sheets/sheets-cf';
import { applyStyleToRange, overflowCss, wrapCss } from '../../src/tools/sheets/sheets-style';
import { clampPopupBox, describeFormula, resolveFormulaSsot } from '../../src/tools/sheets/sheets-chrome';
import { PORTABLE_FORMULA_SSOT, UNIVER_FORMULA_SSOT, readUniverCalculated } from '../../src/tools/sheets/sheets-univer';
import {
  enforceValidation,
  upsertValidation,
  validationsForCell,
} from '../../src/tools/sheets/sheets-validation';
import {
  applyResizeToSelection,
  clearRange,
  clampSelection,
  findReplaceInSheet,
  moveSelection,
  rangeToTsv,
  safeHyperlink,
  toArgb,
  visibleMergePaint,
  windowedIndices,
} from '../../src/tools/sheets/sheets-grid';
import { insertRows, mergeCells, resizeCol } from '../../src/tools/sheets/sheets-model';
import { cellKey, starterWorkbook } from '../../src/tools/sheets/sheets-types';

describe('tabular sheet stage 2 surfaces', () => {
  it('formats numbers through the picker catalog and writes z onto the selection', () => {
    expect(NUMBER_FORMATS.map((item) => item.z)).toEqual(expect.arrayContaining(['General', '#,##0.00', '0.00%', '$#,##0.00', 'yyyy-mm-dd', '@']));
    expect(formatDisplay(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatDisplay(0.25, '0.00%')).toBe('25.00%');
    expect(formatDisplay(12.5, '$#,##0.00')).toBe('$12.50');
    expect(formatDisplay('Ada', '@')).toBe('Ada');
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const next = applyNumberFormat(book, sheet.id, { r1: 1, c1: 2, r2: 2, c2: 2 }, '$#,##0.00');
    expect(next.sheets[0]?.cells[cellKey(1, 2)]?.z).toBe('$#,##0.00');
    expect(formatDisplay(next.sheets[0]?.cells[cellKey(1, 2)]?.v, next.sheets[0]?.cells[cellKey(1, 2)]?.z)).toBe('$2.50');
  });

  it('applies full style chrome including wrap and overflow', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const next = applyStyleToRange(book, sheet.id, { r1: 1, c1: 0, r2: 1, c2: 0 }, {
      bold: true,
      italic: true,
      underline: true,
      align: 'center',
      fill: '#fff3bf',
      color: '#111827',
      wrap: true,
      overflow: 'ellipsis',
    });
    const style = next.sheets[0]?.cells[cellKey(1, 0)]?.s;
    expect(style).toMatchObject({ bold: true, italic: true, underline: true, align: 'center', wrap: true, overflow: 'ellipsis' });
    expect(wrapCss(style)).toMatchObject({ whiteSpace: 'normal' });
    expect(overflowCss({ overflow: 'ellipsis', wrap: false })).toMatchObject({ textOverflow: 'ellipsis', overflow: 'hidden' });
    expect(overflowCss({ overflow: 'overflow', wrap: false })).toMatchObject({ overflow: 'visible' });
  });

  it('hides body rows from a column autofilter without dropping the header', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    expect(distinctColumnValues(sheet, 0, 0)).toEqual(expect.arrayContaining(['Paper', 'Ink', 'Total']));
    const filtered = applyColumnAutofilter(book, sheet.id, 0, { 0: { query: 'paper', hiddenValues: [] } });
    expect(filtered.sheets[0]?.filterHeaderRow).toBe(0);
    expect(filtered.sheets[0]?.hiddenRows).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(filtered.sheets[0]?.hiddenRows).not.toContain(0);
    expect(filtered.sheets[0]?.hiddenRows).not.toContain(1);
    expect(filtered.sheets[0]?.columnFilters?.[0]?.query).toBe('paper');
  });

  it('stores validation rules and blocks values that fail enforcement', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const withRule = upsertValidation(book, {
      id: 'qty-list',
      sheetId: sheet.id,
      a1: 'B2:B3',
      kind: 'list',
      argument: '2,4,6',
      message: 'Qty must be 2, 4, or 6.',
    });
    expect(validationsForCell(withRule, sheet.id, 1, 1)).toHaveLength(1);
    expect(enforceValidation(withRule, sheet.id, 1, 1, 8).ok).toBe(false);
    expect(enforceValidation(withRule, sheet.id, 1, 1, 8).message).toMatch(/2, 4, or 6/);
    expect(enforceValidation(withRule, sheet.id, 1, 1, 4).ok).toBe(true);
    const numberRule = upsertValidation(book, {
      id: 'price-num',
      sheetId: sheet.id,
      a1: 'C2',
      kind: 'number',
      argument: '0..100',
      message: 'Price must stay between 0 and 100.',
    });
    expect(enforceValidation(numberRule, sheet.id, 1, 2, 2.5).ok).toBe(true);
    expect(enforceValidation(numberRule, sheet.id, 1, 2, 250).ok).toBe(false);
  });

  it('evaluates conditional-format rules and paints matching cells', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const withRule = upsertConditionalFormat(book, {
      id: 'high-qty',
      sheetId: sheet.id,
      a1: 'B2:B3',
      kind: 'gt',
      argument: '3',
      fill: '#dcfce7',
      color: '#14532d',
    });
    expect(evaluateConditionalFormat(withRule.conditionalFormats[0]!, 4)).toBe(true);
    expect(evaluateConditionalFormat(withRule.conditionalFormats[0]!, 2)).toBe(false);
    const paint = applyConditionalFormatPaint(withRule, sheet.id, 1, 1, withRule.sheets[0]!.cells[cellKey(1, 1)]!);
    expect(paint).toMatchObject({ fill: '#dcfce7', color: '#14532d' });
    expect(applyConditionalFormatPaint(withRule, sheet.id, 2, 1, withRule.sheets[0]!.cells[cellKey(2, 1)]!)).toBeNull();
  });

  it('opens the reserved long-press hook into a real context-menu action list', () => {
    expect(CONTEXT_MENU_OWNER).toBe('frontend-stage-2');
    expect(CONTEXT_MENU_ACTIONS.map((item) => item.id)).toEqual([
      'cut', 'copy', 'paste', 'paste-values', 'paste-formats', 'paste-transpose',
      'insert-row', 'insert-col', 'delete-row', 'delete-col', 'wrap', 'clear', 'clear-all',
    ]);
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    suppressNativeContextMenu(event);
    expect(event.prevented).toBe(true);
    const timer = { current: 1 as number | null };
    const opened = vi.fn();
    vi.useFakeTimers();
    scheduleLongPressStub(timer, opened);
    expect(timer.current).not.toBeNull();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(opened).toHaveBeenCalledTimes(1);
    cancelLongPressStub(timer);
    vi.useRealTimers();
  });

  it('describes formulas for a touch-safe tooltip and clamps the popup to the viewport', () => {
    const tip = describeFormula('=SUM(D2:D3)+TaxRate');
    expect(tip.summary).toMatch(/SUM/i);
    expect(tip.refs).toEqual(expect.arrayContaining(['D2', 'D3', 'TaxRate']));
    expect(tip.trigger).toBe('focus-or-tap');
    const box = clampPopupBox({ x: 900, y: 700, width: 220, height: 160 }, { width: 360, height: 640 });
    expect(box.left + box.width).toBeLessThanOrEqual(360);
    expect(box.top + box.height).toBeLessThanOrEqual(640);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it('treats live Univer engine-formula as SSOT only when the host is mounted', () => {
    expect(resolveFormulaSsot('fallback', false)).toBe(PORTABLE_FORMULA_SSOT);
    expect(resolveFormulaSsot('univer', false)).toBe(PORTABLE_FORMULA_SSOT);
    expect(resolveFormulaSsot('univer', true)).toBe(UNIVER_FORMULA_SSOT);
    expect(UNIVER_FORMULA_SSOT).toBe('univer-engine-formula');
    expect(readUniverCalculated({
      formulaSsot: UNIVER_FORMULA_SSOT,
      readCalculated(a1: string) {
        return a1 === 'D2' ? { a1, value: 10, formula: '=B2*C2' } : null;
      },
      save: () => null,
      dispose: () => undefined,
    }, 'D2')).toEqual({ a1: 'D2', value: 10, formula: '=B2*C2' });
    expect(a1FromParts(1, 3)).toBe('D2');
  });

  it('selects a bounded range, paints visible merges, and windows frozen rows', () => {
    expect(clampSelection({ r1: -2, c1: 90, r2: 3, c2: -1 }, 5, 4)).toEqual({ r1: 0, c1: 3, r2: 3, c2: 0 });
    expect(moveSelection({ r1: 0, c1: 0, r2: 0, c2: 0 }, 1, 0, 4, 4, false)).toEqual({ r1: 1, c1: 0, r2: 1, c2: 0 });
    expect(moveSelection({ r1: 1, c1: 1, r2: 1, c2: 1 }, 1, 1, 8, 8, true)).toEqual({ r1: 1, c1: 1, r2: 2, c2: 2 });
    expect(moveSelection({ r1: 0, c1: 0, r2: 0, c2: 0 }, -1, -1, 4, 4, false)).toEqual({ r1: 0, c1: 0, r2: 0, c2: 0 });
    expect(visibleMergePaint([{ r1: 1, c1: 0, r2: 2, c2: 0 }], 1, 0, [1, 2], [0, 1])).toEqual({ kind: 'anchor', rowSpan: 2, colSpan: 1 });
    expect(visibleMergePaint([{ r1: 1, c1: 0, r2: 2, c2: 0 }], 2, 0, [1, 2], [0, 1])).toEqual({ kind: 'skip' });
    expect(windowedIndices(10, 4, 3, [5], 2)).toEqual([0, 1, 4, 6, 7]);
  });

  it('copies a range as TSV, clears the whole selection, and replaces case-insensitively', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const tsv = rangeToTsv(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 1 }, (cell) => String(cell?.v ?? ''));
    expect(tsv).toBe('Paper\t4\nInk\t2');
    const cleared = clearRange(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 0 });
    expect(cleared.sheets[0]?.cells[cellKey(1, 0)]).toBeUndefined();
    expect(cleared.sheets[0]?.cells[cellKey(2, 0)]).toBeUndefined();
    expect(cleared.sheets[0]?.cells[cellKey(1, 1)]?.v).toBe(4);
    const replaced = findReplaceInSheet(book, sheet.id, 'paper', 'Card', true);
    expect(replaced.hits).toBeGreaterThan(0);
    expect(replaced.next.sheets[0]?.cells[cellKey(1, 0)]?.v).toBe('Card');
  });

  it('writes column widths, shifts hidden rows on insert, and rejects unsafe hyperlinks', () => {
    const book = starterWorkbook();
    const sheet = book.sheets[0]!;
    const sized = applyResizeToSelection(book, sheet.id, { r1: 0, c1: 1, r2: 0, c2: 1 }, 'col', 140);
    expect(sized.sheets[0]?.columnWidths['1']).toBe(140);
    expect(resizeCol(book, sheet.id, 2, 12).sheets[0]?.columnWidths['2']).toBe(28);
    const filtered = { ...book, sheets: book.sheets.map((item, index) => index === 0 ? { ...item, hiddenRows: [2] } : item) };
    const shifted = insertRows(filtered, sheet.id, 1);
    expect(shifted.sheets[0]?.hiddenRows).toEqual([3]);
    const merged = mergeCells(book, sheet.id, { r1: 1, c1: 0, r2: 2, c2: 0 });
    expect(merged.sheets[0]?.merges).toEqual([expect.objectContaining({ r1: 1, c1: 0, r2: 2, c2: 0 })]);
    expect(safeHyperlink('https://example.test/sheet')).toBe('https://example.test/sheet');
    expect(safeHyperlink('javascript:alert(1)')).toBeNull();
    expect(toArgb('#111827')).toBe('FF111827');
  });
});
