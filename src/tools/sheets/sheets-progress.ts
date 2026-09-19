import type { FeatureStatus } from './sheets-types';

export const FEATURE_PROGRESS: FeatureStatus[] = [
  { id: 1, title: 'Multi-sheet workbook', status: 'DONE', note: 'Portable sheets + Univer host' },
  { id: 2, title: 'Formula bar', status: 'DONE', note: 'Workspace formula bar; Univer formulaBar when mounted' },
  { id: 3, title: 'AST/DAG via Univer engine-formula', status: 'IN_PROGRESS', note: 'Live grid uses preset; portable DAG/evaluator covered by units' },
  { id: 4, title: 'Relative / absolute refs', status: 'DONE', note: 'Parse and fill rewrite' },
  { id: 5, title: 'Cross-sheet refs', status: 'DONE', note: 'Sheet2!A1 and quoted sheet names' },
  { id: 6, title: 'Named ranges', status: 'DONE', note: 'Portable named-range table' },
  { id: 7, title: 'Fill handle', status: 'DONE', note: 'Relative rewrite + numeric series' },
  { id: 8, title: 'Undo / redo', status: 'DONE', note: 'Portable command stack; Univer history when mounted' },
  { id: 9, title: 'Cut / copy / paste', status: 'DONE', note: 'Range clipboard in workspace' },
  { id: 10, title: 'Find / replace', status: 'DONE', note: 'Workspace find panel' },
  { id: 11, title: 'Number formats', status: 'IN_PROGRESS', note: 'Portable z + exceljs numFmt' },
  { id: 12, title: 'Cell styles', status: 'IN_PROGRESS', note: 'Bold/italic/fill/align/wrap' },
  { id: 13, title: 'Merge cells', status: 'DONE', note: 'Portable merges' },
  { id: 14, title: 'Freeze panes', status: 'DONE', note: 'Portable freeze + Univer freeze' },
  { id: 15, title: 'Row/col insert, delete, resize', status: 'DONE', note: 'Structural edits on portable model' },
  { id: 16, title: 'Sort', status: 'DONE', note: 'In-house range sort' },
  { id: 17, title: 'Filter', status: 'IN_PROGRESS', note: 'Header-row hide filter' },
  { id: 18, title: 'Data validation', status: 'IN_PROGRESS', note: 'Portable rules stored; UI list/number' },
  { id: 19, title: 'Conditional formatting', status: 'IN_PROGRESS', note: 'Portable rules + fallback paint' },
  { id: 20, title: 'Status-bar aggregates', status: 'DONE', note: 'Count/sum/avg/min/max' },
  { id: 21, title: 'Charts via chart.js@4.5.1', status: 'DONE', note: 'Reuse main pin from selection' },
  { id: 22, title: 'In-house pivot / group-by', status: 'DONE', note: 'Open substitute; no Pro pivot' },
  { id: 23, title: 'Keyboard shortcuts', status: 'DONE', note: 'Arrows, Enter, Delete, Ctrl+Z/Y/F/C/X/V' },
  { id: 24, title: 'Context menu + long-press', status: 'DONE', note: '500 ms pointer long-press' },
  { id: 25, title: 'Virtualized grid', status: 'DONE', note: 'Windowed fallback; Univer canvas when mounted' },
  { id: 26, title: 'Zoom', status: 'DONE', note: '50–200% workspace zoom' },
  { id: 27, title: 'Wrap / overflow', status: 'IN_PROGRESS', note: 'Wrap style flag' },
  { id: 28, title: 'Hyperlinks', status: 'DONE', note: 'Per-cell links' },
  { id: 29, title: 'Comments / notes', status: 'DONE', note: 'Portable notes; no Pro threads' },
  { id: 30, title: 'IndexedDB persistence', status: 'DONE', note: 'Dexie scoped to this tool' },
  { id: 31, title: 'LocalStorage prefs', status: 'DONE', note: 'Zoom/theme/last id' },
  { id: 32, title: 'XLSX import SheetJS CE 0.20.3', status: 'DONE', note: 'Official CE tarball' },
  { id: 33, title: 'XLSX export exceljs 4.4.0', status: 'DONE', note: 'writeBuffer download' },
  { id: 34, title: 'CSV export', status: 'DONE', note: 'Formula-safe current sheet' },
  { id: 35, title: 'Export tags / meta', status: 'DONE', note: 'Title/author/tags/notes' },
  { id: 36, title: 'Portable bundle import/export', status: 'DONE', note: 'JSON and zip round-trip' },
];

export function progressSummary(rows: FeatureStatus[] = FEATURE_PROGRESS): { done: number; inProgress: number; open: number } {
  return {
    done: rows.filter((row) => row.status === 'DONE').length,
    inProgress: rows.filter((row) => row.status === 'IN_PROGRESS').length,
    open: rows.filter((row) => row.status === 'OPEN').length,
  };
}
