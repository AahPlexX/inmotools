import type { FeatureStatus } from './sheets-types';

export const FEATURE_PROGRESS: FeatureStatus[] = [
  { id: 1, title: 'Multi-sheet workbook', status: 'done', note: 'Portable sheets + optional Univer host' },
  { id: 2, title: 'Formula bar', status: 'done', note: 'Workspace formula bar; Univer formulaBar when mounted' },
  { id: 3, title: 'AST/DAG via Univer engine-formula', status: 'done', note: 'Live Univer engine-formula is SSOT when the host is mounted (data-testid=tsw-formula-ssot, univer-host data-formula-ssot). Portable DAG remains the offline evaluator. Proof: tests/unit/sheets-stage2.test.ts + tests/e2e/tabular-sheet-workstation.spec.ts. Official: https://docs.univer.ai/guides/sheets/features/core as-of 2026-09-19' },
  { id: 4, title: 'Relative / absolute refs', status: 'done', note: 'Parse and fill rewrite for $A$1 / A$1 / $A1 / A1' },
  { id: 5, title: 'Cross-sheet refs', status: 'done', note: 'Sheet2!A1 and quoted sheet names' },
  { id: 6, title: 'Named ranges', status: 'done', note: 'Portable named-range table' },
  { id: 7, title: 'Fill handle', status: 'done', note: 'Relative rewrite + numeric series' },
  { id: 8, title: 'Undo / redo', status: 'done', note: 'Portable command stack; Univer history when mounted' },
  { id: 9, title: 'Cut / copy / paste', status: 'done', note: 'Range TSV clipboard; cut/clear the whole selection' },
  { id: 10, title: 'Find / replace', status: 'done', note: 'Case-insensitive find; replace updates values and formulas' },
  { id: 11, title: 'Number formats', status: 'done', note: 'Format picker writes portable z; formatDisplay paints the grid. Hook: data-testid=tsw-number-format. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 12, title: 'Cell styles', status: 'done', note: 'Full style chrome: bold/italic/underline/color/fill/align. Hook: data-testid=tsw-style-chrome. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 13, title: 'Merge cells', status: 'done', note: 'Portable merges paint colspan/rowspan on the local grid' },
  { id: 14, title: 'Freeze panes', status: 'done', note: 'Local grid pins frozen rows/cols; portable freeze + Univer freeze' },
  { id: 15, title: 'Row/col insert, delete, resize', status: 'done', note: 'Structural edits shift hidden/size maps; width/height chrome writes columnWidths/rowHeights' },
  { id: 16, title: 'Sort', status: 'done', note: 'In-house range sort' },
  { id: 17, title: 'Filter', status: 'done', note: 'Column autofilter UI writes hiddenRows + columnFilters. Hook: data-testid=tsw-autofilter. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 18, title: 'Data validation', status: 'done', note: 'Rule editor + Enter enforcement. Hook: data-testid=tsw-validation-editor. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 19, title: 'Conditional formatting', status: 'done', note: 'Rule editor + local-grid paint. Hook: data-testid=tsw-cf-editor. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 20, title: 'Status-bar aggregates', status: 'done', note: 'Count/sum/avg/min/max' },
  { id: 21, title: 'Charts via chart.js@4.5.1', status: 'done', note: 'OSS replacement: reuse chart.js@4.5.1 already on main. Not a Pro evidence-cut.' },
  { id: 22, title: 'In-house pivot / group-by', status: 'done', note: 'OSS replacement: in-house group-by aggregation. Not a Pro evidence-cut.' },
  { id: 23, title: 'Keyboard shortcuts', status: 'done', note: 'Arrows, Enter, Delete, Ctrl+Z/Y/F/C/X/V/S' },
  { id: 24, title: 'Context menu + long-press', status: 'done', note: 'Reserved hooks now open a real menu (data-testid=tsw-context-menu). Long-press 500ms + right-click. Univer contextMenu stays false. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 25, title: 'Virtualized grid', status: 'done', note: 'Windowed fallback; Univer canvas when mounted' },
  { id: 26, title: 'Zoom', status: 'done', note: '50–200% workspace zoom' },
  { id: 27, title: 'Wrap / overflow', status: 'done', note: 'Wrap toggle + overflow clip/ellipsis/overflow chrome. Hooks: data-testid=tsw-wrap and tsw-overflow. Evidence: sheets-stage2 unit + tabular-sheet-workstation.spec.ts' },
  { id: 28, title: 'Hyperlinks', status: 'done', note: 'Per-cell links' },
  { id: 29, title: 'Comments / notes', status: 'done', note: 'Portable notes; no Pro thread-comment' },
  { id: 30, title: 'IndexedDB persistence', status: 'done', note: 'Dexie scoped to this tool' },
  { id: 31, title: 'LocalStorage prefs', status: 'done', note: 'Zoom/theme/last id' },
  { id: 32, title: 'XLSX import SheetJS CE 0.20.3', status: 'done', note: 'Official CE tarball; formulas, merges, and safe hyperlinks' },
  { id: 33, title: 'XLSX export exceljs 4.4.0', status: 'done', note: 'writeBuffer download' },
  { id: 34, title: 'CSV export', status: 'done', note: 'Formula-safe current sheet' },
  { id: 35, title: 'Export tags / meta', status: 'done', note: 'Title/author/tags/notes' },
  { id: 36, title: 'Portable bundle import/export', status: 'done', note: 'JSON and zip round-trip' },
];

export function progressSummary(rows: FeatureStatus[] = FEATURE_PROGRESS): {
  done: number;
  stubStage2: number;
  inProgress: number;
} {
  return {
    done: rows.filter((row) => row.status === 'done').length,
    stubStage2: rows.filter((row) => row.status === 'stub-stage2').length,
    inProgress: rows.filter((row) => row.status === 'in-progress').length,
  };
}
