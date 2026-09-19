import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { consumeFileInput } from '../../lib/file-input';
import { downloadBytes, downloadText } from '../../lib/download';
import { PagedTable } from '../../components/PagedTable';
import { cancelLongPressStub, scheduleLongPressStub, suppressNativeContextMenu } from './sheets-context-menu';
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
  upsertNamedRange,
} from './sheets-model';
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
import { mountUniverSheets, type UniverHost } from './sheets-univer';
import {
  emptyMeta,
  starterWorkbook,
  type ExportMeta,
  type MergeRange,
  type PortableWorkbook,
  type SheetPrefs,
} from './sheets-types';
import './sheets.css';

const WINDOW_ROWS = 24;
const WINDOW_COLS = 10;

interface Selection extends MergeRange {
  sheetId: string;
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
  const [library, setLibrary] = useState<StoredWorkbook[]>([]);
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [pivotAgg, setPivotAgg] = useState<PivotAgg>('sum');
  const [namedName, setNamedName] = useState('TaxRate');
  const [namedA1, setNamedA1] = useState('B1');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [filterText, setFilterText] = useState('');
  const longPress = useRef<number | null>(null);
  const univerHost = useRef<UniverHost | null>(null);
  const univerNode = useRef<HTMLDivElement | null>(null);
  const chartNode = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const computed = useMemo(() => evaluateWorkbook(book), [book]);
  const sheet = computed.sheets.find((item) => item.id === (selection.sheetId || computed.activeSheetId)) ?? computed.sheets[0];
  const sheetId = sheet?.id ?? computed.activeSheetId;

  useEffect(() => {
    setSelection((current) => ({ ...current, sheetId: current.sheetId || book.activeSheetId }));
  }, [book.activeSheetId]);

  useEffect(() => {
    writePrefsToLocalStorage(prefs);
  }, [prefs]);

  useEffect(() => {
    void listWorkbooks().then(setLibrary).catch(() => undefined);
  }, [book.id]);

  const commit = useCallback((next: PortableWorkbook, message: string) => {
    setHistory((stack) => [...stack.slice(-40), book]);
    setFuture([]);
    setBook(next);
    setStatus(message);
  }, [book]);

  const activeCell = getCell(computed, sheetId, selection.r1, selection.c1);
  useEffect(() => {
    setFormula(activeCell?.f ?? displayCell(activeCell));
    setNote(activeCell?.note ?? '');
    setLink(activeCell?.hyperlink ?? '');
  }, [activeCell, selection.r1, selection.c1, sheetId]);

  const visibleRows = useMemo(() => {
    if (!sheet) return [];
    const rows: number[] = [];
    for (let row = scroll.row; rows.length < WINDOW_ROWS && row < sheet.rowCount; row += 1) {
      if (sheet.hiddenRows.includes(row)) continue;
      if (filterText && row > 0) {
        const hay = Array.from({ length: sheet.columnCount }, (_, col) => displayCell(sheet.cells[`${row},${col}`])).join(' ').toLocaleLowerCase();
        if (!hay.includes(filterText.toLocaleLowerCase())) continue;
      }
      rows.push(row);
    }
    return rows;
  }, [sheet, scroll.row, filterText]);

  const visibleCols = useMemo(() => {
    if (!sheet) return [];
    const cols: number[] = [];
    for (let col = scroll.col; cols.length < WINDOW_COLS && col < sheet.columnCount; col += 1) {
      if (!sheet.hiddenCols.includes(col)) cols.push(col);
    }
    return cols;
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
    if (engine !== 'univer' || !univerNode.current) return;
    let cancelled = false;
    void mountUniverSheets(univerNode.current, book).then((host) => {
      if (cancelled) {
        host.dispose();
        return;
      }
      univerHost.current = host;
      setStatus('Univer sheets-core 0.25.1 is driving the live grid and engine-formula.');
    }).catch((error: unknown) => {
      setEngine('fallback');
      setStatus(error instanceof Error ? `Univer unavailable, using local grid: ${error.message}` : 'Univer unavailable, using local grid.');
    });
    return () => {
      cancelled = true;
      univerHost.current?.dispose();
      univerHost.current = null;
    };
  }, [engine, book.id]);

  const applyFormula = () => {
    const value = formula.trim();
    commit(setCell(book, sheetId, selection.r1, selection.c1, value.startsWith('=') ? { f: value, v: null } : { f: null, v: value === '' ? null : Number.isFinite(Number(value)) && value !== '' ? Number(value) : value }), 'Cell updated.');
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
    const text = collectRange(computed, sheet.id, selection).map((item) => displayCell(item.cell)).join('\t');
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    setStatus('Copied the current selection locally.');
  };

  const pasteSelection = async () => {
    if (!navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    const rows = text.split(/\r?\n/);
    let next = book;
    rows.forEach((line, r) => {
      line.split('\t').forEach((value, c) => {
        next = setCell(next, sheetId, selection.r1 + r, selection.c1 + c, value.startsWith('=') ? { f: value } : { v: value });
      });
    });
    commit(next, 'Pasted into the selection.');
  };

  const findReplace = (doReplace: boolean) => {
    if (!find) return;
    let next = book;
    let hits = 0;
    const target = book.sheets.find((item) => item.id === sheetId);
    if (!target) return;
    for (const [key, cell] of Object.entries(target.cells)) {
      const hay = `${cell.v ?? ''} ${cell.f ?? ''}`;
      if (!hay.toLocaleLowerCase().includes(find.toLocaleLowerCase())) continue;
      hits += 1;
      if (doReplace && typeof cell.v === 'string') {
        const [row, col] = key.split(',').map(Number);
        if (row !== undefined && col !== undefined) {
          next = setCell(next, sheetId, row, col, { v: cell.v.replaceAll(find, replace) });
        }
      }
    }
    if (doReplace) commit(next, `Replaced in ${hits} cell${hits === 1 ? '' : 's'}.`);
    else setStatus(`Found ${hits} cell${hits === 1 ? '' : 's'}.`);
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

  const onPointerDown = (row: number, col: number) => {
    setSelection({ sheetId, r1: row, c1: col, r2: row, c2: col });
    setBook((current) => ({ ...current, activeSheetId: sheetId }));
    scheduleLongPressStub(longPress);
  };

  const onPointerUp = () => {
    cancelLongPressStub(longPress);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const typing = event.target.closest('input, textarea, select');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist();
        return;
      }
      if (typing) return;
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') void copySelection();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
        void copySelection();
        commit(setCell(book, sheetId, selection.r1, selection.c1, { v: null, f: null }), 'Cut the active cell.');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') void pasteSelection();
      if (event.key === 'Enter') applyFormula();
      if (event.key === 'Delete') commit(setCell(book, sheetId, selection.r1, selection.c1, { v: null, f: null }), 'Cleared the active cell.');
      if (event.key === 'ArrowDown') setSelection((current) => ({ ...current, r1: current.r1 + 1, r2: current.r2 + 1 }));
      if (event.key === 'ArrowUp') setSelection((current) => ({ ...current, r1: Math.max(0, current.r1 - 1), r2: Math.max(0, current.r2 - 1) }));
      if (event.key === 'ArrowRight') setSelection((current) => ({ ...current, c1: current.c1 + 1, c2: current.c2 + 1 }));
      if (event.key === 'ArrowLeft') setSelection((current) => ({ ...current, c1: Math.max(0, current.c1 - 1), c2: Math.max(0, current.c2 - 1) }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const summary = progressSummary();

  return (
    <div className="workspace-body tsw-root" data-theme={prefs.theme} data-testid="tabular-sheet-workspace">
      <div className="workspace-header">
        <div>
          <h2>Tabular Sheet Workstation</h2>
          <p>Local multi-sheet workbook. Univer engine-formula when the live engine is mounted; otherwise the portable DAG evaluator.</p>
        </div>
        <p className="tsw-engine-note" role="status">{status}</p>
      </div>

      <div className="tsw-toolbar" role="toolbar" aria-label="Workbook actions">
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
        <button type="button" onClick={() => commit(freezePanes(book, sheetId, selection.r1, selection.c1), 'Froze panes at the active cell.')}>Freeze</button>
        <button type="button" onClick={() => commit(sortRange(book, sheetId, selection, selection.c1, 'asc'), 'Sorted the selection ascending.')}>Sort A–Z</button>
        <button type="button" onClick={() => commit(fillHandle(book, sheetId, { row: selection.r1, col: selection.c1 }, { row: selection.r2 + 3, col: selection.c1 }), 'Filled down from the active cell.')}>Fill down</button>
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

      <div className="tsw-formula">
        <label htmlFor="tsw-cell">Active</label>
        <output id="tsw-cell">{a1FromParts(selection.r1, selection.c1)}</output>
        <label className="tsw-formula-input" htmlFor="tsw-formula">Formula bar</label>
        <input id="tsw-formula" value={formula} onChange={(event) => setFormula(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyFormula(); }} />
        <button type="button" onClick={applyFormula}>Enter</button>
      </div>

      <div className="tsw-sheet-tabs" role="tablist" aria-label="Sheets">
        {computed.sheets.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-current={item.id === sheetId}
            onClick={() => {
              setBook((current) => ({ ...current, activeSheetId: item.id }));
              setSelection((current) => ({ ...current, sheetId: item.id }));
            }}
            onDoubleClick={() => {
              const name = window.prompt('Sheet name', item.name);
              if (name) commit(renameSheet(book, item.id, name), 'Renamed the sheet.');
            }}
          >
            {item.name}
          </button>
        ))}
      </div>

      {engine === 'univer' ? (
        <div ref={univerNode} className="tsw-univer-host" data-testid="univer-host" aria-label="Univer spreadsheet engine" />
      ) : (
        <div className="tsw-grid-wrap" onScroll={(event) => {
          const node = event.currentTarget;
          setScroll({
            row: Math.floor(node.scrollTop / 28),
            col: Math.floor(node.scrollLeft / 72),
          });
        }}>
          <table className="tsw-grid" style={{ zoom: `${prefs.zoom}%` }}>
            <caption className="visually-hidden">Virtualized local spreadsheet grid</caption>
            <thead>
              <tr>
                <th scope="col"> </th>
                {visibleCols.map((col) => <th key={col} scope="col">{a1FromParts(0, col).replace('1', '')}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row}>
                  <th scope="row">{row + 1}</th>
                  {visibleCols.map((col) => {
                    const cell = sheet?.cells[`${row},${col}`];
                    const selected = row >= selection.r1 && row <= selection.r2 && col >= selection.c1 && col <= selection.c2;
                    return (
                      <td
                        key={`${row},${col}`}
                        data-selected={selected}
                        data-note={Boolean(cell?.note)}
                        style={{
                          fontWeight: cell?.s?.bold ? 700 : undefined,
                          fontStyle: cell?.s?.italic ? 'italic' : undefined,
                          color: cell?.s?.color,
                          background: cell?.s?.fill,
                          textAlign: cell?.s?.align,
                          whiteSpace: cell?.s?.wrap ? 'normal' : 'nowrap',
                        }}
                        onPointerDown={() => onPointerDown(row, col)}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                        onDoubleClick={() => document.getElementById('tsw-formula')?.focus()}
                        onContextMenu={(event) => suppressNativeContextMenu(event)}
                      >
                        {cell?.hyperlink ? <a href={cell.hyperlink} target="_blank" rel="noreferrer">{displayCell(cell)}</a> : displayCell(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tsw-status" role="status">
        <output>Count {aggregates.count}</output>
        <output>Sum {aggregates.sum ?? '—'}</output>
        <output>Average {aggregates.average ?? '—'}</output>
        <output>Min {aggregates.min ?? '—'}</output>
        <output>Max {aggregates.max ?? '—'}</output>
      </div>

      <div className="tsw-panels">
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

        <section className="tsw-panel">
          <h3>Named ranges, notes, links</h3>
          <label htmlFor="tsw-name">Name</label>
          <input id="tsw-name" value={namedName} onChange={(event) => setNamedName(event.target.value)} />
          <label htmlFor="tsw-name-a1">A1</label>
          <input id="tsw-name-a1" value={namedA1} onChange={(event) => setNamedA1(event.target.value)} />
          <button type="button" onClick={() => commit(upsertNamedRange(book, namedName, sheetId, namedA1), 'Saved a named range.')}>Define name</button>
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
          <select id="tsw-chart-kind" value={chartKind} onChange={(event) => setChartKind(event.target.value as ChartKind)}>
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
          <h3>Stage 1 progress TODO</h3>
          <p>{summary.done} done · {summary.stubStage2} stub-stage2 · {summary.evidenceCut} evidence-cut. Ledger: src/tools/sheets/FEATURE_MATRIX.md</p>
          <ol className="tsw-progress">
            {FEATURE_PROGRESS.map((row) => (
              <li key={row.id}>
                <strong data-status={row.status}>{row.id}</strong>
                <span>{row.title} — {row.status}. {row.note}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

    </div>
  );
}
