import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Chart from 'chart.js/auto';
import { consumeFileInput } from '../../lib/file-input';
import { downloadBytes, downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import {
  CONTEXT_MENU_ACTIONS,
  cancelLongPressStub,
  scheduleLongPressStub,
  suppressNativeContextMenu,
  type ContextMenuActionId,
} from './sheets-context-menu';
import { a1FromParts, displayCell, evaluateWorkbook, selectionAggregates } from './sheets-formula';
import {
  addComment,
  addSheet,
  collectRange,
  deleteCols,
  deleteRows,
  fillHandle,
  freezePanes,
  getCell,
  insertCols,
  insertRows,
  mergeCells,
  removeSheet,
  renameSheet,
  setCell,
  sortRange,
  unmergeCells,
  upsertNamedRange,
} from './sheets-model';
import {
  applyResizeToSelection,
  clampSelection,
  findReplaceInSheet,
  frozenOffset,
  moveSelection,
  rangeToTsv,
  safeHyperlink,
  selectionA1,
  visibleMergePaint,
  windowedIndices,
} from './sheets-grid';
import {
  clearWorkbooks,
  listWorkbooks,
  loadWorkbook,
  readPrefsFromLocalStorage,
  saveWorkbook,
  writePrefsToLocalStorage,
  type StoredWorkbook,
} from './sheets-persist';
import {
  exportBundleZip,
  exportXlsx,
  filenameFor,
  importBundleZip,
  importCsv,
  importXlsx,
  parseBundle,
  sheetToCsv,
  toBundle,
} from './sheets-io';
import { pivotSheet, type PivotAgg } from './sheets-pivot';
import { chartConfigFromSelection, type ChartKind } from './sheets-charts';
import { FEATURE_PROGRESS, progressSummary } from './sheets-progress';
import { mountUniverSheets, readUniverCalculated, type UniverHost } from './sheets-univer';
import { NUMBER_FORMATS, applyNumberFormat, formatDisplay } from './sheets-format';
import { applyStyleToRange, overflowCss, wrapCss } from './sheets-style';
import { applyColumnAutofilter, distinctColumnValues } from './sheets-filter';
import { enforceValidation, listValidationForCell, removeValidation, upsertValidation } from './sheets-validation';
import { applyConditionalFormatPaint, removeConditionalFormat, upsertConditionalFormat } from './sheets-cf';
import { clampPopupBox, describeFormula, resolveFormulaSsot } from './sheets-chrome';
import {
  FORMULA_CATALOG,
  autoSumPlacement,
  clearRangeMode,
  createSheetProtect,
  currentDateValue,
  deleteNamedRange,
  gotoSpecial,
  hiddenSheets,
  insertFunctionTemplate,
  jumpToDataEdge,
  namedRangeBounds,
  parseGotoA1,
  pasteSpecial,
  removeDuplicates,
  setSheetHidden,
  setSheetProtect,
  setSheetTabColor,
  sheetIsLocked,
  snapshotRange,
  textToColumns,
  verifySheetProtect,
  visibleSheets,
  type ClearMode,
  type GotoKind,
  type ParityClipboard,
  type PasteSpecialMode,
} from './sheets-parity';
import {
  emptyMeta,
  starterWorkbook,
  type ConditionalFormat,
  type ExportMeta,
  type MergeRange,
  type OverflowMode,
  type PortableWorkbook,
  type SheetPrefs,
  type ValidationRule,
} from './sheets-types';
import './sheets.css';

const WINDOW_ROWS = 24;
const WINDOW_COLS = 10;

interface Selection extends MergeRange {
  sheetId: string;
}

function cellLabel(cell: ReturnType<typeof getCell>): string {
  if (!cell) return '';
  if (cell.z && cell.v !== null && cell.v !== undefined) return formatDisplay(cell.v, cell.z);
  return displayCell(cell);
}

export default function SheetsWorkspace() {
  const [book, setBook] = useState<PortableWorkbook>(() => starterWorkbook());
  const [history, setHistory] = useState<PortableWorkbook[]>([]);
  const [future, setFuture] = useState<PortableWorkbook[]>([]);
  const [prefs, setPrefs] = useState<SheetPrefs>(() => readPrefsFromLocalStorage());
  const [meta, setMeta] = useState<ExportMeta>(() => emptyMeta());
  const [status, setStatus] = useState('Workbook stays in this browser. Nothing is uploaded.');
  const [formula, setFormula] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [selection, setSelection] = useState<Selection>({ sheetId: '', r1: 0, c1: 0, r2: 0, c2: 0 });
  const [scroll, setScroll] = useState({ row: 0, col: 0 });
  const [engine, setEngine] = useState<'fallback' | 'univer'>('fallback');
  const [univerReady, setUniverReady] = useState(false);
  const [univerProof, setUniverProof] = useState<{ a1: string; value: unknown; formula: string } | null>(null);
  const [library, setLibrary] = useState<StoredWorkbook[]>([]);
  const [chartKind, setChartKind] = useState<ChartKind>('column');
  const [pivotAgg, setPivotAgg] = useState<PivotAgg>('sum');
  const [namedName, setNamedName] = useState('TaxRate');
  const [namedA1, setNamedA1] = useState('B1');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [filterText, setFilterText] = useState('');
  const [formatZ, setFormatZ] = useState('General');
  const [overflowMode, setOverflowMode] = useState<OverflowMode>('ellipsis');
  const [filterCol, setFilterCol] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [formulaTipOpen, setFormulaTipOpen] = useState(false);
  const [validationStatus, setValidationStatus] = useState('');
  const [validationDraft, setValidationDraft] = useState<Omit<ValidationRule, 'id' | 'sheetId'>>({
    a1: 'B2:B3',
    kind: 'list',
    argument: '2,4,6',
    message: 'Qty must be 2, 4, or 6.',
  });
  const [cfDraft, setCfDraft] = useState<Omit<ConditionalFormat, 'id' | 'sheetId'>>({
    a1: 'B2:B3',
    kind: 'gt',
    argument: '3',
    fill: '#dcfce7',
    color: '#14532d',
  });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [tipPos, setTipPos] = useState({ left: 12, top: 220, width: 280 });
  const [customFormat, setCustomFormat] = useState('');
  const [gotoA1, setGotoA1] = useState('A1');
  const [splitDelimiter, setSplitDelimiter] = useState(',');
  const [pinDraft, setPinDraft] = useState('');
  const [unlockedSheetIds, setUnlockedSheetIds] = useState<string[]>([]);
  const [sheetMenu, setSheetMenu] = useState<{ x: number; y: number; sheetId: string } | null>(null);
  const [printView, setPrintView] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetLongPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parityClipboard = useRef<ParityClipboard | null>(null);
  const pointer = useRef({ x: 0, y: 0, dragging: false });
  const univerHost = useRef<UniverHost | null>(null);
  const univerNode = useRef<HTMLDivElement | null>(null);
  const chartNode = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const formulaBar = useRef<HTMLDivElement | null>(null);

  const computed = useMemo(() => evaluateWorkbook(book), [book]);
  const sheet = computed.sheets.find((item) => item.id === (selection.sheetId || computed.activeSheetId)) ?? computed.sheets[0];
  const sheetId = sheet?.id ?? computed.activeSheetId;
  const formulaSsot = resolveFormulaSsot(engine, univerReady);
  const formulaHelp = useMemo(() => describeFormula(formula), [formula]);

  useEffect(() => {
    setSelection((current) => ({ ...current, sheetId: current.sheetId || book.activeSheetId }));
  }, [book.activeSheetId]);

  useEffect(() => {
    writePrefsToLocalStorage(prefs);
  }, [prefs]);

  useEffect(() => {
    void listWorkbooks().then(setLibrary).catch(() => undefined);
  }, [book.id]);

  const commit = useCallback((next: PortableWorkbook, message: string, options?: { allowLocked?: boolean }) => {
    const current = book.sheets.find((item) => item.id === (selection.sheetId || book.activeSheetId));
    if (!options?.allowLocked && sheetIsLocked(current, unlockedSheetIds)) {
      setStatus('This sheet is locked. Enter the local PIN to edit.');
      return;
    }
    setHistory((stack) => [...stack.slice(-40), book]);
    setFuture([]);
    setBook(next);
    setStatus(message);
  }, [book, selection.sheetId, unlockedSheetIds]);

  const activeCell = getCell(computed, sheetId, selection.r1, selection.c1);
  useEffect(() => {
    setFormula(activeCell?.f ?? displayCell(activeCell));
    setNote(activeCell?.note ?? '');
    setLink(activeCell?.hyperlink ?? '');
    setFormatZ(activeCell?.z ?? 'General');
    setOverflowMode(activeCell?.s?.overflow ?? 'ellipsis');
  }, [activeCell, selection.r1, selection.c1, sheetId]);

  const visibleRows = useMemo(() => {
    if (!sheet) return [];
    const hidden = new Set(sheet.hiddenRows);
    const extraHidden: number[] = [];
    if (filterText) {
      const needle = filterText.toLocaleLowerCase();
      for (let row = 1; row < sheet.rowCount; row += 1) {
        const hay = Array.from({ length: sheet.columnCount }, (_, col) => cellLabel(sheet.cells[`${row},${col}`])).join(' ').toLocaleLowerCase();
        if (!hay.includes(needle)) extraHidden.push(row);
      }
    }
    return windowedIndices(sheet.rowCount, scroll.row, WINDOW_ROWS, [...hidden, ...extraHidden], sheet.freezeRow);
  }, [sheet, scroll.row, filterText]);

  const visibleCols = useMemo(() => {
    if (!sheet) return [];
    return windowedIndices(sheet.columnCount, scroll.col, WINDOW_COLS, sheet.hiddenCols, sheet.freezeCol);
  }, [sheet, scroll.col]);

  const aggregates = useMemo(() => {
    if (!sheet) return selectionAggregates([]);
    const values = collectRange(computed, sheet.id, selection).map((item) => item.cell?.v ?? null);
    return selectionAggregates(values);
  }, [computed, sheet, selection]);

  const pivot = useMemo(() => {
    if (!sheet) return null;
    return pivotSheet(sheet, { headerRow: 0, groupCol: 0, valueCol: 1, agg: pivotAgg });
  }, [sheet, pivotAgg]);

  useEffect(() => {
    if (!chartNode.current || !sheet) return;
    const config = chartConfigFromSelection(computed, sheet.id, selection, chartKind);
    chartRef.current?.destroy();
    chartRef.current = new Chart(chartNode.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [computed, sheet, selection, chartKind]);

  useEffect(() => {
    if (engine !== 'univer' || !univerNode.current) {
      setUniverReady(false);
      setUniverProof(null);
      return;
    }
    let cancelled = false;
    setUniverReady(false);
    void mountUniverSheets(univerNode.current, book).then((host) => {
      if (cancelled) {
        host.dispose();
        return;
      }
      univerHost.current = host;
      setUniverReady(true);
      setUniverProof(readUniverCalculated(host, 'D2'));
      setStatus('Univer sheets-core 0.25.1 engine-formula is the live formula SSOT.');
    }).catch((error: unknown) => {
      setEngine('fallback');
      setUniverReady(false);
      setUniverProof(null);
      setStatus(error instanceof Error ? `Univer unavailable, using local grid: ${error.message}` : 'Univer unavailable, using local grid.');
    });
    return () => {
      cancelled = true;
      univerHost.current?.dispose();
      univerHost.current = null;
    };
  }, [engine, book.id]);

  const openContextMenuAt = (x: number, y: number) => {
    const box = clampPopupBox({ x, y, width: 228, height: 360 }, { width: window.innerWidth, height: window.innerHeight });
    setContextMenu({ x: box.left, y: box.top });
  };

  const applyFormula = () => {
    const value = formula.trim();
    const raw = value.startsWith('=')
      ? value
      : value === ''
        ? null
        : Number.isFinite(Number(value)) && value !== ''
          ? Number(value)
          : value;
    const check = enforceValidation(book, sheetId, selection.r1, selection.c1, raw);
    if (!check.ok) {
      setValidationStatus(check.message);
      setStatus(check.message);
      return;
    }
    setValidationStatus('');
    commit(setCell(book, sheetId, selection.r1, selection.c1, value.startsWith('=') ? { f: value, v: null } : { f: null, v: raw }), 'Cell updated.');
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((stack) => stack.slice(0, -1));
    setFuture((stack) => [book, ...stack]);
    setBook(previous);
    setStatus('Undid last portable edit.');
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((stack) => stack.slice(1));
    setHistory((stack) => [...stack, book]);
    setBook(next);
    setStatus('Redid last portable edit.');
  };

  const copySelection = async () => {
    if (!sheet) return;
    const snapshot = snapshotRange(computed, sheet.id, selection, cellLabel);
    parityClipboard.current = snapshot;
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(snapshot.tsv);
    setStatus('Copied the current selection locally.');
  };

  const pasteSelection = async (mode: PasteSpecialMode = 'all') => {
    const snapshot = parityClipboard.current;
    if (snapshot) {
      commit(pasteSpecial(book, sheetId, { row: selection.r1, col: selection.c1 }, snapshot, mode), `Pasted ${mode} into the selection.`);
      return;
    }
    if (!navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    commit(pasteSpecial(book, sheetId, { row: selection.r1, col: selection.c1 }, text, mode), `Pasted ${mode} into the selection.`);
  };

  const findReplace = (doReplace: boolean) => {
    const result = findReplaceInSheet(book, sheetId, find, replace, doReplace);
    if (doReplace) commit(result.next, `Replaced in ${result.hits} cell${result.hits === 1 ? '' : 's'}.`);
    else setStatus(`Found ${result.hits} cell${result.hits === 1 ? '' : 's'}.`);
  };

  const clearActiveRange = (message: string, mode: ClearMode = 'contents') => {
    commit(clearRangeMode(book, sheetId, selection, mode), message);
  };

  const applyAutoSum = () => {
    const placed = autoSumPlacement(computed, sheetId, selection);
    if (!placed) {
      setStatus('AutoSum needs numbers above the active cell or a selected range.');
      return;
    }
    commit(setCell(book, sheetId, placed.row, placed.col, { f: placed.formula, v: null }), `Wrote ${placed.formula}.`);
    setSelection((current) => ({ ...current, r1: placed.row, c1: placed.col, r2: placed.row, c2: placed.col }));
    setFormula(placed.formula);
  };

  const jumpGoto = (kind?: GotoKind) => {
    if (kind) {
      const hits = gotoSpecial(computed, sheetId, selection, kind);
      const first = hits[0];
      if (!first) {
        setStatus(`No ${kind} in the selection.`);
        return;
      }
      setSelection((current) => ({ ...current, r1: first.row, c1: first.col, r2: first.row, c2: first.col }));
      setStatus(`Go to special: ${hits.length} ${kind}.`);
      return;
    }
    const cell = parseGotoA1(gotoA1);
    if (!cell) {
      setStatus('Go to needs an A1 address such as B4.');
      return;
    }
    setSelection((current) => ({ ...current, r1: cell.row, c1: cell.col, r2: cell.row, c2: cell.col }));
    setStatus(`Moved to ${gotoA1.toUpperCase()}.`);
  };

  const openSheetMenuAt = (sheetKey: string, x: number, y: number) => {
    const box = clampPopupBox({ x, y, width: 228, height: 280 }, { width: window.innerWidth, height: window.innerHeight });
    setSheetMenu({ x: box.left, y: box.top, sheetId: sheetKey });
  };

  const persist = async () => {
    try {
      const id = await saveWorkbook({ ...computed, name: meta.title || computed.name });
      setPrefs((current) => ({ ...current, lastWorkbookId: id }));
      setLibrary(await listWorkbooks());
      setStatus('Saved this workbook in IndexedDB on this device.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save locally.');
    }
  };

  const restore = async (id: string) => {
    const row = await loadWorkbook(id);
    if (!row) {
      setStatus('That local workbook is no longer available.');
      return;
    }
    commit(row.workbook, `Restored ${row.name} from IndexedDB.`);
    setPrefs((current) => ({ ...current, lastWorkbookId: id }));
  };

  const onImport = (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    void file.arrayBuffer().then(async (buffer) => {
      if (name.endsWith('.csv') || file.type.includes('csv')) {
        commit(importCsv(new TextDecoder().decode(buffer), file.name), `Imported ${file.name}.`);
        return;
      }
      if (name.endsWith('.json')) {
        const bundle = parseBundle(JSON.parse(new TextDecoder().decode(buffer)));
        if (!bundle) {
          setStatus('That file is not a Tabular Sheet Workstation bundle.');
          return;
        }
        setMeta(bundle.meta);
        commit(bundle.workbook, `Imported portable bundle ${file.name}.`);
        return;
      }
      if (name.endsWith('.zip') || name.endsWith('.tswb')) {
        const bundle = await importBundleZip(buffer);
        if (!bundle) {
          setStatus('That archive is not a portable workbook bundle.');
          return;
        }
        setMeta(bundle.meta);
        commit(bundle.workbook, `Imported portable bundle ${file.name}.`);
        return;
      }
      commit(importXlsx(buffer, file.name), `Imported ${file.name} with SheetJS CE 0.20.3.`);
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    });
  };

  const exportCurrent = async (kind: 'xlsx' | 'csv' | 'json' | 'zip') => {
    const current = { ...computed, name: meta.title || computed.name };
    if (kind === 'csv' && sheet) {
      downloadText(sheetToCsv(sheet), filenameFor(current, meta, 'csv'), 'text/csv;charset=utf-8');
      setStatus('Downloaded CSV for the active sheet.');
      return;
    }
    if (kind === 'json') {
      downloadText(JSON.stringify(toBundle(current, meta), null, 2), filenameFor(current, meta, 'json'), 'application/json');
      setStatus('Downloaded the portable JSON bundle.');
      return;
    }
    if (kind === 'zip') {
      downloadBytes(await exportBundleZip(current, meta), filenameFor(current, meta, 'tswb.zip'), 'application/zip');
      setStatus('Downloaded the portable zip bundle.');
      return;
    }
    const bytes = await exportXlsx(current, meta);
    downloadBytes(bytes, filenameFor(current, meta, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    setStatus('Downloaded XLSX via exceljs 4.4.0.');
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLTableCellElement>, row: number, col: number) => {
    pointer.current = { x: event.clientX, y: event.clientY, dragging: !event.shiftKey };
    if (typeof event.pointerId === 'number') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic Playwright pointerdown has no capturing pointer. */
      }
    }
    setSelection((current) => {
      if (event.shiftKey) {
        return { ...current, sheetId, r2: row, c2: col };
      }
      return { sheetId, r1: row, c1: col, r2: row, c2: col };
    });
    setBook((current) => ({ ...current, activeSheetId: sheetId }));
    const cell = sheet?.cells[`${row},${col}`];
    if (cell?.f) setFormulaTipOpen(true);
    scheduleLongPressStub(longPress, () => {
      pointer.current.dragging = false;
      openContextMenuAt(pointer.current.x, pointer.current.y);
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLTableElement>) => {
    if (!pointer.current.dragging) return;
    const moved = Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y);
    if (moved > 8) cancelLongPressStub(longPress);
    const target = (event.target as HTMLElement | null)?.closest('td[data-row][data-col]');
    if (!(target instanceof HTMLElement)) return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    setSelection((current) => ({ ...current, r2: row, c2: col }));
  };

  const onPointerUp = () => {
    pointer.current.dragging = false;
    cancelLongPressStub(longPress);
  };

  const runContextAction = (id: ContextMenuActionId) => {
    setContextMenu(null);
    if (id === 'cut') {
      void copySelection();
      clearActiveRange('Cut the current selection.');
      return;
    }
    if (id === 'copy') {
      void copySelection();
      return;
    }
    if (id === 'paste') {
      void pasteSelection('all');
      return;
    }
    if (id === 'paste-values') {
      void pasteSelection('values');
      return;
    }
    if (id === 'paste-formats') {
      void pasteSelection('formats');
      return;
    }
    if (id === 'paste-transpose') {
      void pasteSelection('transpose');
      return;
    }
    if (id === 'insert-row') {
      commit(insertRows(book, sheetId, selection.r1), 'Inserted a row.');
      return;
    }
    if (id === 'insert-col') {
      commit(insertCols(book, sheetId, selection.c1), 'Inserted a column.');
      return;
    }
    if (id === 'delete-row') {
      commit(deleteRows(book, sheetId, selection.r1), 'Deleted a row.');
      return;
    }
    if (id === 'delete-col') {
      commit(deleteCols(book, sheetId, selection.c1), 'Deleted a column.');
      return;
    }
    if (id === 'wrap') {
      commit(applyStyleToRange(book, sheetId, selection, { wrap: !activeCell?.s?.wrap }), 'Toggled wrap on the selection.');
      return;
    }
    if (id === 'clear-all') {
      clearActiveRange('Cleared values, formulas, notes, links, and style.', 'all');
      return;
    }
    clearActiveRange('Cleared values and formulas in the selection.');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const typing = event.target.closest('input, textarea, select');
      if (event.key === 'Escape') {
        setContextMenu(null);
        setSheetMenu(null);
        setFormulaTipOpen(false);
        setFilterCol(null);
        setInsertOpen(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist();
        return;
      }
      if (typing) return;
      if (event.key === 'F2') {
        event.preventDefault();
        document.getElementById('tsw-formula')?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.getElementById('tsw-find')?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ';') {
        event.preventDefault();
        const today = currentDateValue();
        commit(setCell(book, sheetId, selection.r1, selection.c1, { v: today, f: null }), `Inserted ${today}.`);
        setFormula(today);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') void copySelection();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
        void copySelection();
        clearActiveRange('Cut the current selection.');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') void pasteSelection('all');
      if (event.key === 'Enter') applyFormula();
      if (event.key === 'Delete') clearActiveRange('Cleared values and formulas in the selection.');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const dRow = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        const dCol = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (event.ctrlKey || event.metaKey) {
          const edge = jumpToDataEdge(computed, sheetId, { row: selection.r1, col: selection.c1 }, dRow, dCol);
          setSelection((current) => (
            event.shiftKey
              ? { ...current, sheetId, r2: edge.row, c2: edge.col }
              : { sheetId, r1: edge.row, c1: edge.col, r2: edge.row, c2: edge.col }
          ));
          return;
        }
        setSelection((current) => ({
          ...current,
          sheetId,
          ...moveSelection(current, dRow, dCol, sheet?.rowCount ?? 1, sheet?.columnCount ?? 1, event.shiftKey),
        }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!sheet) return;
    setSelection((current) => ({ ...current, ...clampSelection(current, sheet.rowCount, sheet.columnCount) }));
  }, [sheet?.rowCount, sheet?.columnCount]);

  useEffect(() => {
    if (!formulaTipOpen) return;
    const place = () => {
      const rect = formulaBar.current?.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const box = clampPopupBox(
        { x: rect?.left ?? 12, y: (rect?.bottom ?? 220) + 8, width: 280, height: 140 },
        viewport,
      );
      setTipPos({ left: box.left, top: box.top, width: box.width });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [formulaTipOpen]);

  const summary = progressSummary();
  const fillTarget = selection.r1 === selection.r2 && selection.c1 === selection.c2
    ? { row: selection.r1 + 3, col: selection.c1 }
    : { row: selection.r2, col: selection.c2 };
  const selectedColWidth = sheet?.columnWidths[String(selection.c1)] ?? 72;
  const selectedRowHeight = sheet?.rowHeights[String(selection.r1)] ?? 28;
  const listChoices = listValidationForCell(book, sheetId, selection.r1, selection.c1);
  const locked = sheetIsLocked(sheet, unlockedSheetIds);
  const tabs = visibleSheets(computed);
  const hiddenTabs = hiddenSheets(computed);

  return (
    <div
      className="workspace-body tsw-root"
      data-theme={prefs.theme}
      data-print-view={printView}
      data-sheet-locked={locked}
      data-testid="tabular-sheet-workspace"
    >
      <div className="workspace-header">
        <div>
          <h2>Tabular Sheet Workstation</h2>
          <p>Local multi-sheet workbook. Univer engine-formula is the live formula SSOT when mounted; otherwise the portable DAG evaluator. Drag, Shift+click, or long-press a cell. Formula help opens from tap or focus, not hover.</p>
        </div>
        <p className="tsw-engine-note" role="status">{status}</p>
      </div>

      <div className="tsw-toolbar tsw-chrome" role="toolbar" aria-label="Workbook actions">
        <button type="button" data-primary="true" onClick={() => void persist()}>Save locally</button>
        <button type="button" onClick={undo} disabled={history.length === 0}>Undo</button>
        <button type="button" onClick={redo} disabled={future.length === 0}>Redo</button>
        <button type="button" onClick={() => commit(addSheet(book), 'Added a sheet.')}>Add sheet</button>
        <button type="button" onClick={() => commit(removeSheet(book, sheetId), 'Removed the sheet.')}>Delete sheet</button>
        <button type="button" onClick={() => commit(insertRows(book, sheetId, selection.r1), 'Inserted a row.')}>Insert row</button>
        <button type="button" onClick={() => commit(deleteRows(book, sheetId, selection.r1), 'Deleted a row.')}>Delete row</button>
        <button type="button" onClick={() => commit(insertCols(book, sheetId, selection.c1), 'Inserted a column.')}>Insert column</button>
        <button type="button" onClick={() => commit(deleteCols(book, sheetId, selection.c1), 'Deleted a column.')}>Delete column</button>
        <button type="button" onClick={() => commit(mergeCells(book, sheetId, selection), 'Merged the selection.')}>Merge</button>
        <button type="button" onClick={() => commit(unmergeCells(book, sheetId, selection), 'Unmerged the selection.')}>Unmerge</button>
        <button type="button" onClick={() => commit(freezePanes(book, sheetId, selection.r1, selection.c1), 'Froze panes at the active cell.')}>Freeze</button>
        <button type="button" onClick={() => commit(sortRange(book, sheetId, selection, selection.c1, 'asc'), 'Sorted the selection ascending.')}>Sort A–Z</button>
        <button type="button" onClick={() => commit(sortRange(book, sheetId, selection, selection.c1, 'desc'), 'Sorted the selection descending.')}>Sort Z–A</button>
        <button type="button" onClick={() => commit(fillHandle(book, sheetId, { row: selection.r1, col: selection.c1 }, fillTarget), 'Filled the fill range.')}>Fill down</button>
        <button
          type="button"
          data-testid="tsw-rename-sheet"
          onClick={() => {
            setRenamingId(sheetId);
            setRenameDraft(sheet?.name ?? '');
          }}
        >
          Rename sheet
        </button>
        <label>
          Zoom
          <input type="number" min={50} max={200} value={prefs.zoom} onChange={(event) => setPrefs((current) => ({ ...current, zoom: Number(event.target.value) || 100 }))} />
        </label>
        <label>
          Theme
          <select value={prefs.theme} onChange={(event) => setPrefs((current) => ({ ...current, theme: event.target.value === 'high-contrast' ? 'high-contrast' : 'light' }))}>
            <option value="light">Light</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </label>
        <label>
          Engine
          <select value={engine} onChange={(event) => setEngine(event.target.value === 'univer' ? 'univer' : 'fallback')}>
            <option value="fallback">Local grid</option>
            <option value="univer">Univer 0.25.1</option>
          </select>
        </label>
        <label>
          Open file
          <input type="file" accept=".xlsx,.csv,.json,.zip,.tswb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json,application/zip" onChange={(event) => consumeFileInput(event.target, () => onImport(event.target.files?.[0]))} />
        </label>
        <button type="button" onClick={() => void exportCurrent('xlsx')}>Export XLSX</button>
        <button type="button" onClick={() => void exportCurrent('csv')}>Export CSV</button>
        <button type="button" onClick={() => void exportCurrent('json')}>Export bundle</button>
        <button type="button" onClick={() => void exportCurrent('zip')}>Export zip</button>
      </div>

      <div className="tsw-formula tsw-chrome" ref={formulaBar}>
        <label htmlFor="tsw-cell">Active</label>
        <output id="tsw-cell">{a1FromParts(selection.r1, selection.c1)}</output>
        <output data-testid="tsw-selection" aria-label="Selected range">{selectionA1(selection)}</output>
        <label className="tsw-formula-input" htmlFor="tsw-formula">Formula bar</label>
        <input
          id="tsw-formula"
          value={formula}
          onChange={(event) => setFormula(event.target.value)}
          onFocus={() => { if (formula.startsWith('=')) setFormulaTipOpen(true); }}
          onKeyDown={(event) => { if (event.key === 'Enter') applyFormula(); }}
        />
        <button type="button" onClick={applyFormula}>Enter</button>
        <button type="button" data-testid="tsw-autosum" onClick={applyAutoSum}>AutoSum</button>
        <button type="button" data-testid="tsw-insert-function" aria-expanded={insertOpen} onClick={() => setInsertOpen((open) => !open)}>Insert function</button>
        <button type="button" data-testid="tsw-formula-help" onClick={() => setFormulaTipOpen(true)}>Formula help</button>
        {listChoices.length ? (
          <label className="tsw-list-picker" htmlFor="tsw-list-picker">
            List
            <select
              id="tsw-list-picker"
              data-testid="tsw-list-picker"
              value={String(activeCell?.v ?? '')}
              onChange={(event) => {
                setFormula(event.target.value);
                const value = event.target.value;
                const check = enforceValidation(book, sheetId, selection.r1, selection.c1, value);
                if (!check.ok) {
                  setValidationStatus(check.message);
                  setStatus(check.message);
                  return;
                }
                commit(setCell(book, sheetId, selection.r1, selection.c1, { v: Number.isFinite(Number(value)) ? Number(value) : value, f: null }), 'Picked a list value.');
              }}
            >
              <option value="">Choose</option>
              {listChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
          </label>
        ) : null}
        <output data-testid="tsw-formula-ssot" data-ssot={formulaSsot} aria-label="Formula source of truth">{formulaSsot}</output>
        {univerProof ? <output data-testid="tsw-formula-proof">{univerProof.a1}={String(univerProof.value ?? '')}</output> : null}
      </div>

      <div className="tsw-style-chrome tsw-chrome" data-testid="tsw-style-chrome" role="toolbar" aria-label="Cell style chrome">
        <label htmlFor="tsw-number-format">Number format</label>
        <select
          id="tsw-number-format"
          data-testid="tsw-number-format"
          value={formatZ}
          onChange={(event) => {
            const z = event.target.value;
            setFormatZ(z);
            commit(applyNumberFormat(book, sheetId, selection, z), `Applied ${z} to the selection.`);
          }}
        >
          {NUMBER_FORMATS.map((item) => <option key={item.id} value={item.z}>{item.label}</option>)}
          {!NUMBER_FORMATS.some((item) => item.z === formatZ) ? <option value={formatZ}>Custom</option> : null}
        </select>
        <label htmlFor="tsw-custom-format">Custom pattern</label>
        <input
          id="tsw-custom-format"
          data-testid="tsw-custom-format"
          value={customFormat}
          placeholder="#,##0.0"
          onChange={(event) => setCustomFormat(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !customFormat.trim()) return;
            setFormatZ(customFormat.trim());
            commit(applyNumberFormat(book, sheetId, selection, customFormat.trim()), `Applied ${customFormat.trim()} to the selection.`);
          }}
        />
        <button
          type="button"
          data-testid="tsw-apply-custom-format"
          onClick={() => {
            if (!customFormat.trim()) return;
            setFormatZ(customFormat.trim());
            commit(applyNumberFormat(book, sheetId, selection, customFormat.trim()), `Applied ${customFormat.trim()} to the selection.`);
          }}
        >
          Apply pattern
        </button>
        <button type="button" aria-pressed={Boolean(activeCell?.s?.bold)} onClick={() => commit(applyStyleToRange(book, sheetId, selection, { bold: !activeCell?.s?.bold }), 'Toggled bold.')}>Bold</button>
        <button type="button" aria-pressed={Boolean(activeCell?.s?.italic)} onClick={() => commit(applyStyleToRange(book, sheetId, selection, { italic: !activeCell?.s?.italic }), 'Toggled italic.')}>Italic</button>
        <button type="button" aria-pressed={Boolean(activeCell?.s?.underline)} onClick={() => commit(applyStyleToRange(book, sheetId, selection, { underline: !activeCell?.s?.underline }), 'Toggled underline.')}>Underline</button>
        <label htmlFor="tsw-font-color">Font</label>
        <input id="tsw-font-color" type="color" value={activeCell?.s?.color ?? '#111827'} onChange={(event) => commit(applyStyleToRange(book, sheetId, selection, { color: event.target.value }), 'Applied font color.')} />
        <label htmlFor="tsw-fill-color">Fill</label>
        <input id="tsw-fill-color" type="color" value={activeCell?.s?.fill ?? '#ffffff'} onChange={(event) => commit(applyStyleToRange(book, sheetId, selection, { fill: event.target.value }), 'Applied fill color.')} />
        <label htmlFor="tsw-align">Align</label>
        <select
          id="tsw-align"
          value={activeCell?.s?.align ?? 'left'}
          onChange={(event) => commit(applyStyleToRange(book, sheetId, selection, { align: event.target.value as 'left' | 'center' | 'right' }), 'Applied alignment.')}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
        <button
          type="button"
          data-testid="tsw-wrap"
          aria-pressed={Boolean(activeCell?.s?.wrap)}
          onClick={() => commit(applyStyleToRange(book, sheetId, selection, { wrap: !activeCell?.s?.wrap }), 'Toggled wrap.')}
        >
          Wrap
        </button>
        <label htmlFor="tsw-overflow">Overflow</label>
        <select
          id="tsw-overflow"
          data-testid="tsw-overflow"
          value={overflowMode}
          onChange={(event) => {
            const overflow = event.target.value as OverflowMode;
            setOverflowMode(overflow);
            commit(applyStyleToRange(book, sheetId, selection, { overflow }), `Set overflow to ${overflow}.`);
          }}
        >
          <option value="ellipsis">Ellipsis</option>
          <option value="clip">Clip</option>
          <option value="overflow">Overflow</option>
        </select>
        <label htmlFor="tsw-col-width">Column width</label>
        <input
          id="tsw-col-width"
          data-testid="tsw-col-width"
          type="number"
          min={28}
          max={360}
          value={selectedColWidth}
          onChange={(event) => commit(applyResizeToSelection(book, sheetId, selection, 'col', Number(event.target.value) || 72), 'Resized selected columns.')}
        />
        <label htmlFor="tsw-row-height">Row height</label>
        <input
          id="tsw-row-height"
          data-testid="tsw-row-height"
          type="number"
          min={18}
          max={160}
          value={selectedRowHeight}
          onChange={(event) => commit(applyResizeToSelection(book, sheetId, selection, 'row', Number(event.target.value) || 28), 'Resized selected rows.')}
        />
      </div>

      <div className="tsw-parity-chrome tsw-chrome" data-testid="tsw-parity-chrome" role="toolbar" aria-label="Sheet parity actions">
        <button type="button" onClick={() => void pasteSelection('values')}>Paste values</button>
        <button type="button" onClick={() => void pasteSelection('formats')}>Paste formats</button>
        <button type="button" onClick={() => void pasteSelection('transpose')}>Paste transpose</button>
        <button type="button" onClick={() => clearActiveRange('Cleared values and formulas in the selection.')}>Clear contents</button>
        <button type="button" onClick={() => clearActiveRange('Cleared values, formulas, notes, links, and style.', 'all')}>Clear all</button>
        <button type="button" data-testid="tsw-remove-duplicates" onClick={() => commit(removeDuplicates(book, sheetId, selection), 'Removed duplicate rows in the selection.')}>Remove duplicates</button>
        <button
          type="button"
          data-testid="tsw-text-to-columns"
          onClick={() => commit(textToColumns(book, sheetId, selection, splitDelimiter), `Split on ${splitDelimiter || 'comma'}.`)}
        >
          Text to columns
        </button>
        <label htmlFor="tsw-split-delimiter">Delimiter</label>
        <input id="tsw-split-delimiter" data-testid="tsw-split-delimiter" value={splitDelimiter} onChange={(event) => setSplitDelimiter(event.target.value)} />
        <button type="button" data-testid="tsw-goto-blanks" onClick={() => jumpGoto('blanks')}>Go to blanks</button>
        <button type="button" data-testid="tsw-goto-formulas" onClick={() => jumpGoto('formulas')}>Go to formulas</button>
        <button type="button" data-testid="tsw-goto-constants" onClick={() => jumpGoto('constants')}>Go to constants</button>
        <button
          type="button"
          data-testid="tsw-print"
          onClick={() => {
            setPrintView(true);
            window.setTimeout(() => {
              window.print();
              setPrintView(false);
            }, 50);
          }}
        >
          Print
        </button>
      </div>

      <div className="tsw-sheet-tabs" role="tablist" aria-label="Sheets">
        {tabs.map((item) => (
          renamingId === item.id ? (
            <input
              key={item.id}
              aria-label={`Rename ${item.name}`}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => {
                if (renameDraft.trim()) commit(renameSheet(book, item.id, renameDraft), 'Renamed the sheet.');
                setRenamingId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
            />
          ) : (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-current={item.id === sheetId}
              data-tab-color={item.tabColor ?? ''}
              style={item.tabColor ? { boxShadow: `inset 0 -4px 0 ${item.tabColor}` } : undefined}
              onClick={() => {
                setBook((current) => ({ ...current, activeSheetId: item.id }));
                setSelection((current) => ({ ...current, sheetId: item.id }));
              }}
              onDoubleClick={() => {
                setRenamingId(item.id);
                setRenameDraft(item.name);
              }}
              onContextMenu={(event) => {
                suppressNativeContextMenu(event);
                openSheetMenuAt(item.id, event.clientX, event.clientY);
              }}
              onPointerDown={(event) => {
                sheetLongPress.current && cancelLongPressStub(sheetLongPress);
                scheduleLongPressStub(sheetLongPress, () => openSheetMenuAt(item.id, event.clientX, event.clientY));
              }}
              onPointerUp={() => cancelLongPressStub(sheetLongPress)}
              onPointerCancel={() => cancelLongPressStub(sheetLongPress)}
            >
              {item.name}
            </button>
          )
        ))}
        {hiddenTabs.length ? (
          <label htmlFor="tsw-unhide-sheet">
            Hidden sheets
            <select
              id="tsw-unhide-sheet"
              data-testid="tsw-unhide-sheet"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                commit(setSheetHidden(book, event.target.value, false), 'Unhid a sheet.', { allowLocked: true });
              }}
            >
              <option value="">Unhide…</option>
              {hiddenTabs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {engine === 'univer' ? (
        <div
          ref={univerNode}
          className="tsw-univer-host"
          data-testid="univer-host"
          data-formula-ssot={formulaSsot}
          aria-label="Univer spreadsheet engine"
        />
      ) : (
        <div
          className="tsw-grid-wrap"
          data-testid="tsw-grid-scroll"
          onScroll={(event) => {
            const node = event.currentTarget;
            setScroll({
              row: Math.floor(node.scrollTop / 28),
              col: Math.floor(node.scrollLeft / 72),
            });
          }}
        >
          <table
            className="tsw-grid"
            style={{ zoom: `${prefs.zoom}%` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <caption className="visually-hidden">Virtualized local spreadsheet grid</caption>
            <thead>
              <tr>
                <th scope="col"> </th>
                {visibleCols.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    data-frozen-col={Boolean(sheet && col < sheet.freezeCol)}
                    style={{
                      width: sheet?.columnWidths[String(col)],
                      minWidth: sheet?.columnWidths[String(col)] ?? undefined,
                      left: frozenOffset(col, sheet?.freezeCol ?? 0, 38, 72),
                    }}
                  >
                    <span>{a1FromParts(0, col).replace('1', '')}</span>
                    <button
                      type="button"
                      className="tsw-filter-btn"
                      aria-label={`Filter column ${a1FromParts(0, col).replace('1', '')}`}
                      aria-expanded={filterCol === col}
                      onClick={() => {
                        setFilterCol((current) => current === col ? null : col);
                        setFilterQuery(sheet?.columnFilters?.[String(col)]?.query ?? '');
                      }}
                    >
                      ▾
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row} data-frozen-row={Boolean(sheet && row < sheet.freezeRow)}>
                  <th
                    scope="row"
                    data-frozen-row={Boolean(sheet && row < sheet.freezeRow)}
                    style={{
                      height: sheet?.rowHeights[String(row)],
                      top: frozenOffset(row, sheet?.freezeRow ?? 0, 32, 28),
                    }}
                  >
                    {row + 1}
                  </th>
                  {visibleCols.map((col) => {
                    const paintKind = visibleMergePaint(sheet?.merges ?? [], row, col, visibleRows, visibleCols);
                    if (paintKind.kind === 'skip') return null;
                    const cell = sheet?.cells[`${row},${col}`];
                    const bounds = {
                      r1: Math.min(selection.r1, selection.r2),
                      c1: Math.min(selection.c1, selection.c2),
                      r2: Math.max(selection.r1, selection.r2),
                      c2: Math.max(selection.c1, selection.c2),
                    };
                    const selected = row >= bounds.r1 && row <= bounds.r2 && col >= bounds.c1 && col <= bounds.c2;
                    const paint = sheet ? applyConditionalFormatPaint(computed, sheet.id, row, col, cell) : null;
                    const href = safeHyperlink(cell?.hyperlink);
                    const style = {
                      fontWeight: cell?.s?.bold ? 700 : undefined,
                      fontStyle: cell?.s?.italic ? 'italic' : undefined,
                      textDecoration: cell?.s?.underline ? 'underline' : undefined,
                      color: paint?.color ?? cell?.s?.color,
                      background: paint?.fill ?? cell?.s?.fill,
                      textAlign: cell?.s?.align,
                      width: sheet?.columnWidths[String(col)],
                      height: sheet?.rowHeights[String(row)],
                      minWidth: sheet?.columnWidths[String(col)],
                      top: frozenOffset(row, sheet?.freezeRow ?? 0, 32, 28),
                      left: frozenOffset(col, sheet?.freezeCol ?? 0, 38, 72),
                      ...wrapCss(cell?.s),
                      ...overflowCss(cell?.s),
                    } as const;
                    return (
                      <td
                        key={`${row},${col}`}
                        data-row={row}
                        data-col={col}
                        data-selected={selected}
                        data-note={Boolean(cell?.note)}
                        data-wrap={Boolean(cell?.s?.wrap)}
                        data-overflow={cell?.s?.overflow ?? 'ellipsis'}
                        data-frozen-row={Boolean(sheet && row < sheet.freezeRow)}
                        data-frozen-col={Boolean(sheet && col < sheet.freezeCol)}
                        data-col-width={sheet?.columnWidths[String(col)] ?? ''}
                        data-row-height={sheet?.rowHeights[String(row)] ?? ''}
                        rowSpan={paintKind.kind === 'anchor' ? paintKind.rowSpan : undefined}
                        colSpan={paintKind.kind === 'anchor' ? paintKind.colSpan : undefined}
                        style={style}
                        onPointerDown={(event) => onPointerDown(event, row, col)}
                        onDoubleClick={() => document.getElementById('tsw-formula')?.focus()}
                        onContextMenu={(event) => {
                          suppressNativeContextMenu(event);
                          setSelection({ sheetId, r1: row, c1: col, r2: row, c2: col });
                          openContextMenuAt(event.clientX, event.clientY);
                        }}
                      >
                        {href ? <a href={href} target="_blank" rel="noreferrer">{cellLabel(cell)}</a> : cellLabel(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filterCol !== null && sheet ? (
        <div className="tsw-autofilter" data-testid="tsw-autofilter" role="dialog" aria-label="Column autofilter">
          <p>Filter {a1FromParts(0, filterCol).replace('1', '')}</p>
          <label htmlFor="tsw-autofilter-query">Contains</label>
          <input id="tsw-autofilter-query" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} />
          <ul>
            {distinctColumnValues(sheet, filterCol, sheet.filterHeaderRow ?? 0).map((value) => (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => {
                    commit(applyColumnAutofilter(book, sheetId, 0, {
                      ...(sheet.columnFilters ?? {}),
                      [filterCol]: { query: value, hiddenValues: [] },
                    }), `Filtered column to ${value}.`);
                    setFilterCol(null);
                  }}
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              commit(applyColumnAutofilter(book, sheetId, 0, {
                ...(sheet.columnFilters ?? {}),
                [filterCol]: { query: filterQuery, hiddenValues: [] },
              }), 'Applied column autofilter.');
              setFilterCol(null);
            }}
          >
            Apply filter
          </button>
          <button
            type="button"
            onClick={() => {
              const next = { ...(sheet.columnFilters ?? {}) };
              delete next[String(filterCol)];
              commit(applyColumnAutofilter(book, sheetId, 0, next), 'Cleared the column filter.');
              setFilterCol(null);
              setFilterQuery('');
            }}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      {contextMenu ? (
        <ul
          className="tsw-context"
          data-testid="tsw-context-menu"
          role="menu"
          aria-label="Cell context menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {CONTEXT_MENU_ACTIONS.map((action) => (
            <li key={action.id} role="none">
              <button type="button" role="menuitem" onClick={() => runContextAction(action.id)}>{action.label}</button>
            </li>
          ))}
        </ul>
      ) : null}

      {insertOpen ? (
        <aside className="tsw-insert-function" data-testid="tsw-insert-function-list" role="dialog" aria-label="Insert function">
          <p>Tap a function to put its template in the formula bar. Help stays tap or focus, never hover-only.</p>
          <ul>
            {FORMULA_CATALOG.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => {
                    setFormula(item.template);
                    setInsertOpen(false);
                    setFormulaTipOpen(true);
                    window.setTimeout(() => document.getElementById('tsw-formula')?.focus(), 0);
                  }}
                >
                  {item.name} — {item.summary}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setInsertOpen(false)}>Close function list</button>
        </aside>
      ) : null}

      {sheetMenu ? (
        <ul
          className="tsw-context"
          data-testid="tsw-sheet-tab-menu"
          role="menu"
          aria-label="Sheet tab menu"
          style={{ left: sheetMenu.x, top: sheetMenu.y }}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                commit(setSheetHidden(book, sheetMenu.sheetId, true), 'Hid the sheet.', { allowLocked: true });
                setSheetMenu(null);
              }}
            >
              Hide sheet
            </button>
          </li>
          <li role="none">
            <label htmlFor="tsw-tab-color">Tab color</label>
            <input
              id="tsw-tab-color"
              data-testid="tsw-tab-color"
              type="color"
              value={computed.sheets.find((item) => item.id === sheetMenu.sheetId)?.tabColor ?? '#205bd6'}
              onChange={(event) => {
                commit(setSheetTabColor(book, sheetMenu.sheetId, event.target.value), 'Set the sheet tab color.', { allowLocked: true });
              }}
            />
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={() => setSheetMenu(null)}>Close sheet menu</button>
          </li>
        </ul>
      ) : null}

      {formulaTipOpen ? (
        <aside
          className="tsw-formula-tooltip"
          data-testid="tsw-formula-tooltip"
          role="dialog"
          aria-label="Formula help"
          data-trigger={formulaHelp.trigger}
          style={{ left: tipPos.left, top: tipPos.top, width: tipPos.width }}
        >
          <p>{formulaHelp.summary}</p>
          {formulaHelp.refs.length ? <p>Refs: {formulaHelp.refs.join(', ')}</p> : null}
          <button type="button" onClick={() => setFormulaTipOpen(false)}>Close formula help</button>
        </aside>
      ) : null}

      <div className="tsw-status" role="status">
        <output>Count {aggregates.count}</output>
        <output>Sum {aggregates.sum ?? '—'}</output>
        <output>Average {aggregates.average ?? '—'}</output>
        <output>Min {aggregates.min ?? '—'}</output>
        <output>Max {aggregates.max ?? '—'}</output>
        {validationStatus ? <output data-testid="tsw-validation-status">{validationStatus}</output> : null}
      </div>

      <div className="tsw-panels">
        <section className="tsw-panel" data-testid="tsw-goto">
          <h3>Go to</h3>
          <label htmlFor="tsw-goto-a1">A1</label>
          <input id="tsw-goto-a1" data-testid="tsw-goto-a1" value={gotoA1} onChange={(event) => setGotoA1(event.target.value)} />
          <button type="button" data-testid="tsw-goto-apply" onClick={() => jumpGoto()}>Go to cell</button>
        </section>

        <section className="tsw-panel" data-testid="tsw-protect">
          <h3>Protect sheet</h3>
          <p>Local edit lock only. The PIN is hashed with SHA-256 and a random salt, then stored on this workbook in IndexedDB. It is not Excel file encryption; anyone with this browser profile can still export or delete the workbook.</p>
          <label htmlFor="tsw-protect-pin">Local PIN</label>
          <input id="tsw-protect-pin" data-testid="tsw-protect-pin" type="password" inputMode="numeric" autoComplete="off" value={pinDraft} onChange={(event) => setPinDraft(event.target.value)} />
          <button
            type="button"
            data-testid="tsw-protect-lock"
            onClick={() => {
              if (!pinDraft.trim()) {
                setStatus('Enter a local PIN first.');
                return;
              }
              void createSheetProtect(pinDraft).then((protect) => {
                commit(setSheetProtect(book, sheetId, protect), 'Locked this sheet with a local PIN.', { allowLocked: true });
                setUnlockedSheetIds((current) => current.filter((id) => id !== sheetId));
                setPinDraft('');
              }).catch(() => setStatus('Could not hash the local PIN in this browser.'));
            }}
          >
            Lock sheet
          </button>
          <button
            type="button"
            data-testid="tsw-protect-unlock"
            onClick={() => {
              if (!sheet?.protect) {
                setStatus('This sheet is not locked.');
                return;
              }
              void verifySheetProtect(pinDraft, sheet.protect).then((ok) => {
                if (!ok) {
                  setStatus('That PIN does not match the stored hash.');
                  return;
                }
                setUnlockedSheetIds((current) => current.includes(sheetId) ? current : [...current, sheetId]);
                setPinDraft('');
                setStatus('Sheet unlocked for this session.');
              });
            }}
          >
            Unlock sheet
          </button>
          <button
            type="button"
            data-testid="tsw-protect-clear"
            onClick={() => {
              if (sheetIsLocked(sheet, unlockedSheetIds)) {
                setStatus('Unlock the sheet before removing the lock.');
                return;
              }
              commit(setSheetProtect(book, sheetId, null), 'Removed the local sheet lock.');
            }}
          >
            Remove lock
          </button>
        </section>

        <section className="tsw-panel">
          <h3>Find / replace</h3>
          <label htmlFor="tsw-find">Find</label>
          <input id="tsw-find" value={find} onChange={(event) => setFind(event.target.value)} />
          <label htmlFor="tsw-replace">Replace</label>
          <input id="tsw-replace" value={replace} onChange={(event) => setReplace(event.target.value)} />
          <button type="button" onClick={() => findReplace(false)}>Find</button>
          <button type="button" onClick={() => findReplace(true)}>Replace</button>
          <label htmlFor="tsw-filter">Filter rows</label>
          <input id="tsw-filter" value={filterText} onChange={(event) => setFilterText(event.target.value)} />
        </section>

        <section className="tsw-panel" data-testid="tsw-validation-editor">
          <h3>Data validation</h3>
          <p>Rules stay on this workbook and block Enter when the active cell fails.</p>
          <label htmlFor="tsw-val-a1">Range</label>
          <input id="tsw-val-a1" value={validationDraft.a1} onChange={(event) => setValidationDraft((current) => ({ ...current, a1: event.target.value }))} />
          <label htmlFor="tsw-val-kind">Kind</label>
          <select id="tsw-val-kind" value={validationDraft.kind} onChange={(event) => setValidationDraft((current) => ({ ...current, kind: event.target.value as ValidationRule['kind'] }))}>
            <option value="list">List</option>
            <option value="number">Number</option>
            <option value="text-length">Text length</option>
            <option value="custom">Custom</option>
          </select>
          <label htmlFor="tsw-val-arg">Argument</label>
          <input id="tsw-val-arg" value={validationDraft.argument} onChange={(event) => setValidationDraft((current) => ({ ...current, argument: event.target.value }))} />
          <label htmlFor="tsw-val-msg">Message</label>
          <input id="tsw-val-msg" value={validationDraft.message} onChange={(event) => setValidationDraft((current) => ({ ...current, message: event.target.value }))} />
          <button
            type="button"
            onClick={() => commit(upsertValidation(book, { ...validationDraft, id: `val-${validationDraft.a1}`, sheetId }), 'Saved a validation rule.')}
          >
            Save validation
          </button>
          <ul>
            {book.validations.filter((rule) => rule.sheetId === sheetId).map((rule) => (
              <li key={rule.id}>
                {rule.a1} {rule.kind} {rule.argument}
                <button type="button" onClick={() => commit(removeValidation(book, rule.id), 'Removed a validation rule.')}>Remove</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="tsw-panel" data-testid="tsw-cf-editor">
          <h3>Conditional format</h3>
          <p>Rules paint the local grid. No Univer Pro conditional-format package.</p>
          <label htmlFor="tsw-cf-a1">Range</label>
          <input id="tsw-cf-a1" value={cfDraft.a1} onChange={(event) => setCfDraft((current) => ({ ...current, a1: event.target.value }))} />
          <label htmlFor="tsw-cf-kind">Kind</label>
          <select id="tsw-cf-kind" value={cfDraft.kind} onChange={(event) => setCfDraft((current) => ({ ...current, kind: event.target.value as ConditionalFormat['kind'] }))}>
            <option value="gt">Greater than</option>
            <option value="lt">Less than</option>
            <option value="eq">Equal</option>
            <option value="contains">Contains</option>
            <option value="color-scale">Color scale</option>
          </select>
          <label htmlFor="tsw-cf-arg">Argument</label>
          <input id="tsw-cf-arg" value={cfDraft.argument} onChange={(event) => setCfDraft((current) => ({ ...current, argument: event.target.value }))} />
          <label htmlFor="tsw-cf-fill">Fill</label>
          <input id="tsw-cf-fill" type="color" value={cfDraft.fill} onChange={(event) => setCfDraft((current) => ({ ...current, fill: event.target.value }))} />
          <label htmlFor="tsw-cf-color">Text</label>
          <input id="tsw-cf-color" type="color" value={cfDraft.color} onChange={(event) => setCfDraft((current) => ({ ...current, color: event.target.value }))} />
          <button
            type="button"
            onClick={() => commit(upsertConditionalFormat(book, { ...cfDraft, id: `cf-${cfDraft.a1}`, sheetId }), 'Saved a conditional format rule.')}
          >
            Save CF rule
          </button>
          <ul>
            {book.conditionalFormats.filter((rule) => rule.sheetId === sheetId).map((rule) => (
              <li key={rule.id}>
                {rule.a1} {rule.kind} {rule.argument}
                <button type="button" onClick={() => commit(removeConditionalFormat(book, rule.id), 'Removed a CF rule.')}>Remove</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="tsw-panel" data-testid="tsw-named-ranges">
          <h3>Named ranges, notes, links</h3>
          <label htmlFor="tsw-name">Name</label>
          <input id="tsw-name" value={namedName} onChange={(event) => setNamedName(event.target.value)} />
          <label htmlFor="tsw-name-a1">A1</label>
          <input id="tsw-name-a1" value={namedA1} onChange={(event) => setNamedA1(event.target.value)} />
          <button type="button" onClick={() => commit(upsertNamedRange(book, namedName, sheetId, namedA1), 'Saved a named range.')}>Define name</button>
          <ul className="tsw-named-range-list" data-testid="tsw-named-range-list">
            {book.namedRanges.map((range) => (
              <li key={range.name}>
                <button
                  type="button"
                  onClick={() => {
                    const bounds = namedRangeBounds(range.a1);
                    setBook((current) => ({ ...current, activeSheetId: range.sheetId }));
                    if (bounds) setSelection({ sheetId: range.sheetId, ...bounds });
                    setStatus(`Moved to ${range.name}.`);
                  }}
                >
                  {range.name} {range.a1}
                </button>
                <button type="button" onClick={() => commit(deleteNamedRange(book, range.name), `Deleted ${range.name}.`)}>Delete {range.name}</button>
              </li>
            ))}
          </ul>
          <label htmlFor="tsw-note">Comment / note</label>
          <textarea id="tsw-note" value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="button" onClick={() => commit(addComment(setCell(book, sheetId, selection.r1, selection.c1, { note }), sheetId, a1FromParts(selection.r1, selection.c1), note), 'Saved a local note.')}>Save note</button>
          <label htmlFor="tsw-link">Hyperlink</label>
          <input id="tsw-link" value={link} onChange={(event) => setLink(event.target.value)} />
          <button type="button" onClick={() => commit(setCell(book, sheetId, selection.r1, selection.c1, { hyperlink: link }), 'Saved a hyperlink.')}>Save link</button>
        </section>

        <section className="tsw-panel">
          <h3>Export tags and local library</h3>
          <label htmlFor="tsw-title">Title</label>
          <input id="tsw-title" value={meta.title} onChange={(event) => setMeta((current) => ({ ...current, title: event.target.value }))} />
          <label htmlFor="tsw-author">Author</label>
          <input id="tsw-author" value={meta.author} onChange={(event) => setMeta((current) => ({ ...current, author: event.target.value }))} />
          <label htmlFor="tsw-tags">Tags</label>
          <input id="tsw-tags" value={meta.tags.join(', ')} onChange={(event) => setMeta((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))} />
          <label htmlFor="tsw-notes">Notes</label>
          <textarea id="tsw-notes" value={meta.notes} onChange={(event) => setMeta((current) => ({ ...current, notes: event.target.value }))} />
          <label htmlFor="tsw-library">IndexedDB workbooks</label>
          <select id="tsw-library" value={prefs.lastWorkbookId ?? ''} onChange={(event) => void restore(event.target.value)}>
            <option value="">Choose a saved workbook</option>
            {library.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button type="button" onClick={() => void clearWorkbooks().then(() => { setLibrary([]); setStatus('Cleared local workbooks.'); })}>Clear library</button>
        </section>

        <section className="tsw-panel">
          <h3>Chart.js selection chart</h3>
          <p>Uses the existing chart.js@4.5.1 pin. No Univer Pro chart package.</p>
          <label htmlFor="tsw-chart-kind">Kind</label>
          <select id="tsw-chart-kind" data-testid="tsw-chart-kind" value={chartKind} onChange={(event) => setChartKind(event.target.value as ChartKind)}>
            <option value="column">Column</option>
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
          </select>
          <div className="tsw-chart"><canvas ref={chartNode} aria-label="Selection chart" /></div>
        </section>

        <section className="tsw-panel">
          <h3>In-house pivot</h3>
          <p>Group column A by values in column B on the header row. Open substitute for Univer Pro pivot.</p>
          <label htmlFor="tsw-pivot-agg">Aggregation</label>
          <select id="tsw-pivot-agg" value={pivotAgg} onChange={(event) => setPivotAgg(event.target.value as PivotAgg)}>
            <option value="sum">Sum</option>
            <option value="count">Count</option>
            <option value="avg">Average</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
          </select>
          {pivot ? (
            <PagedTable
              caption="Pivot result"
              columns={[{ key: 'group', label: pivot.groupHeader }, { key: 'value', label: pivot.valueHeader }]}
              rows={pivot.rows}
              renderCell={(row, key) => key === 'group' ? row.group : row.value}
              rowKey={(row) => row.group}
            />
          ) : null}
        </section>

        <section className="tsw-panel">
          <h3>Feature progress</h3>
          <p>{summary.done} done · {summary.stubStage2} stub-stage2 · {summary.inProgress} in-progress. Ledger: src/tools/sheets/FEATURE_MATRIX.md</p>
          <label htmlFor="tsw-show-progress">
            <input
              id="tsw-show-progress"
              type="checkbox"
              checked={prefs.showProgress}
              onChange={(event) => setPrefs((current) => ({ ...current, showProgress: event.target.checked }))}
            />
            Show feature list
          </label>
          {prefs.showProgress ? (
          <ol className="tsw-progress" tabIndex={0} aria-label="Feature progress">
            {FEATURE_PROGRESS.map((row) => (
              <li key={row.id}>
                <strong data-status={row.status}>{row.id}</strong>
                <span>{row.title} — {row.status}. {row.note}</span>
              </li>
            ))}
          </ol>
          ) : null}
        </section>
      </div>

    </div>
  );
}
