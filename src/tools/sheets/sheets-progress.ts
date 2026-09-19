import type { FeatureStatus } from './sheets-types';

export const FEATURE_PROGRESS: FeatureStatus[] = [
  { id: 1, title: 'Multi-sheet workbook', status: 'done', note: 'Portable sheets + optional Univer host' },
  { id: 2, title: 'Formula bar', status: 'done', note: 'Workspace formula bar; Univer formulaBar when mounted' },
  { id: 3, title: 'AST/DAG via Univer engine-formula', status: 'stub-stage2', note: 'Portable DAG/evaluator is unit-covered. Stage 2 owns live Univer engine-formula as SSOT plus browser proof. Official: https://docs.univer.ai/guides/sheets/features/core/formula as-of 2026-09-19' },
  { id: 4, title: 'Relative / absolute refs', status: 'done', note: 'Parse and fill rewrite for $A$1 / A$1 / $A1 / A1' },
  { id: 5, title: 'Cross-sheet refs', status: 'done', note: 'Sheet2!A1 and quoted sheet names' },
  { id: 6, title: 'Named ranges', status: 'done', note: 'Portable named-range table' },
  { id: 7, title: 'Fill handle', status: 'done', note: 'Relative rewrite + numeric series' },
  { id: 8, title: 'Undo / redo', status: 'done', note: 'Portable command stack; Univer history when mounted' },
  { id: 9, title: 'Cut / copy / paste', status: 'done', note: 'Range clipboard in workspace' },
  { id: 10, title: 'Find / replace', status: 'done', note: 'Workspace find panel' },
  { id: 11, title: 'Number formats', status: 'stub-stage2', note: 'Portable z + exceljs numFmt stored. Stage 2 owns format picker UI.' },
  { id: 12, title: 'Cell styles', status: 'stub-stage2', note: 'Bold/italic/fill/align flags persist. Stage 2 owns full style chrome.' },
  { id: 13, title: 'Merge cells', status: 'done', note: 'Portable merges' },
  { id: 14, title: 'Freeze panes', status: 'done', note: 'Portable freeze + Univer freeze' },
  { id: 15, title: 'Row/col insert, delete, resize', status: 'done', note: 'Structural edits on portable model' },
  { id: 16, title: 'Sort', status: 'done', note: 'In-house range sort' },
  { id: 17, title: 'Filter', status: 'stub-stage2', note: 'Header-row text hide only. Stage 2 owns column autofilter UI.' },
  { id: 18, title: 'Data validation', status: 'stub-stage2', note: 'Portable rules stored. Stage 2 owns enforcement UI.' },
  { id: 19, title: 'Conditional formatting', status: 'stub-stage2', note: 'Portable rules + fallback paint. Stage 2 owns rule editor.' },
  { id: 20, title: 'Status-bar aggregates', status: 'done', note: 'Count/sum/avg/min/max' },
  { id: 21, title: 'Charts via chart.js@4.5.1', status: 'done', note: 'Reuse main pin from selection. Univer Charts path is Pro and unused.' },
  { id: 22, title: 'In-house pivot / group-by', status: 'done', note: 'Open substitute. Univer Pivot is Pro and unused.' },
  { id: 23, title: 'Keyboard shortcuts', status: 'done', note: 'Arrows, Enter, Delete, Ctrl+Z/Y/F/C/X/V/S' },
  { id: 24, title: 'Context menu + long-press', status: 'stub-stage2', note: 'Stage 1 reserves suppressNativeContextMenu + scheduleLongPressStub only. No live menu surface. Univer contextMenu is false.' },
  { id: 25, title: 'Virtualized grid', status: 'done', note: 'Windowed fallback; Univer canvas when mounted' },
  { id: 26, title: 'Zoom', status: 'done', note: '50–200% workspace zoom' },
  { id: 27, title: 'Wrap / overflow', status: 'stub-stage2', note: 'Wrap style flag persists. Stage 2 owns overflow chrome.' },
  { id: 28, title: 'Hyperlinks', status: 'done', note: 'Per-cell links' },
  { id: 29, title: 'Comments / notes', status: 'done', note: 'Portable notes; no Pro thread-comment' },
  { id: 30, title: 'IndexedDB persistence', status: 'done', note: 'Dexie scoped to this tool' },
  { id: 31, title: 'LocalStorage prefs', status: 'done', note: 'Zoom/theme/last id' },
  { id: 32, title: 'XLSX import SheetJS CE 0.20.3', status: 'done', note: 'Official CE tarball' },
  { id: 33, title: 'XLSX export exceljs 4.4.0', status: 'done', note: 'writeBuffer download' },
  { id: 34, title: 'CSV export', status: 'done', note: 'Formula-safe current sheet' },
  { id: 35, title: 'Export tags / meta', status: 'done', note: 'Title/author/tags/notes' },
  { id: 36, title: 'Portable bundle import/export', status: 'done', note: 'JSON and zip round-trip' },
];

export function progressSummary(rows: FeatureStatus[] = FEATURE_PROGRESS): {
  done: number;
  stubStage2: number;
  evidenceCut: number;
} {
  return {
    done: rows.filter((row) => row.status === 'done').length,
    stubStage2: rows.filter((row) => row.status === 'stub-stage2').length,
    evidenceCut: rows.filter((row) => row.status === 'evidence-cut').length,
  };
}
