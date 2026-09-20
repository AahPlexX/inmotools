# Tabular Sheet Workstation — locked Stage 1 / Stage 2 feature matrix

Suite id: `sheets`. Suite path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation` (same `*-workstation` pattern as `typing-workstation`). Persistence tool id: `inmotools-tabular-sheet-workstation`.
Local-first only. Workbooks stay in this browser (IndexedDB / LocalStorage). No uploads, analytics, auth, or remote database.

## Stack pins (exact; never `^`)

| Package | Pin | Role | Evidence (as of 2026-09-19) |
| --- | --- | --- | --- |
| `@univerjs/presets` | `0.25.1` | `createUniver` / Facade host | npm dist-tag `latest` = `0.25.1`; Apache-2.0 OSS |
| `@univerjs/preset-sheets-core` | `0.25.1` | Sheets UI + `@univerjs/engine-formula` AST/DAG | npm dist-tag `latest` = `0.25.1`; https://docs.univer.ai/guides/sheets/features/core |
| `exceljs` | `4.4.0` | XLSX export via `workbook.xlsx.writeBuffer()` | npm `exceljs@4.4.0` |
| `xlsx` (SheetJS CE) | `0.20.3` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | XLSX import | Official CE install path on cdn.sheetjs.com / docs.sheetjs.com |
| `chart.js` | `4.5.1` **reuse from main** | Feature 21 OSS replacement | Already declared on `origin/main`; do not duplicate |
| Pivot / group-by | in-house | Feature 22 OSS replacement | In-house aggregation; not a Pro feature |

Banned engines (not numbered-feature statuses): `@univerjs-pro/*`, `@univerjs/preset-sheets-advanced`, `@univerjs/preset-sheets-drawing`, HyperFormula, remote persistence, telemetry.

`rxjs@7.8.2` is the documented peer of the Univer 0.25.1 presets (not a feature library). `protobufjs` postinstall is denied in `pnpm-workspace.yaml` (`allowBuilds.protobufjs: false`).

## Ledger status vocabulary

Only these three values are valid on the 1–36 checklist and the in-tool progress TODO:

| Status | Meaning |
| --- | --- |
| `done` | Stage 1 path is implemented and has focused evidence. |
| `stub-stage2` | Hook, storage, or partial surface only. Frontend Stage 2 owns the remaining UI. |
| `in-progress` | Stage 1 slice started; remaining work is still on this branch. |

This file is the handoff ledger; `.tasks/IN_PROGRESS.md` TASK-022 and the in-tool progress TODO must stay aligned.

## Locked 1–36 checklist

| # | Feature | Notes | Status |
| ---: | --- | --- | --- |
| 1 | Multi-sheet workbook | Univer core preset + portable snapshot model | done |
| 2 | Formula bar | Univer `formulaBar` in `UniverSheetsCorePreset` | done |
| 3 | AST/DAG via Univer `engine-formula` in preset | Live Univer `engine-formula` is SSOT when the host is mounted (`data-testid=tsw-formula-ssot`, `univer-host[data-formula-ssot]`). Portable DAG remains the offline evaluator. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 4 | Relative / absolute refs | `$A$1` / `A$1` / `$A1` / `A1` parse + fill rewrite | done |
| 5 | Cross-sheet refs | `Sheet2!B3` / `'Sheet Name'!A1` | done |
| 6 | Named ranges | Portable named-range table synced into snapshot | done |
| 7 | Fill handle | Univer fill + portable relative rewrite | done |
| 8 | Undo / redo | Univer history + portable command stack fallback | done |
| 9 | Cut / copy / paste | Range TSV (rows as newlines); cut/clear the whole selection | done |
| 10 | Find / replace | Case-insensitive find; replace updates values and formulas | done |
| 11 | Number formats | Format picker writes portable `z`; `formatDisplay` paints the grid. Hook: `data-testid=tsw-number-format`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 12 | Cell styles | Full style chrome: bold / italic / underline / color / fill / align. Hook: `data-testid=tsw-style-chrome`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 13 | Merge cells | Portable merges paint `colspan`/`rowspan` on the local grid. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 14 | Freeze panes | Local grid pins frozen rows/cols; portable freeze + Univer freeze. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 15 | Row / col insert, delete, resize | Structural edits shift hidden/size maps and A1 metadata. Width/height chrome writes `columnWidths`/`rowHeights`. Hooks: `data-testid=tsw-col-width`, `data-testid=tsw-row-height`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 16 | Sort | In-house range sort on portable model | done |
| 17 | Filter | Column autofilter UI writes `hiddenRows` + `columnFilters`. Hook: `data-testid=tsw-autofilter`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 18 | Data validation | Rule editor + Enter enforcement. Hook: `data-testid=tsw-validation-editor`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 19 | Conditional formatting | Rule editor + local-grid paint. Hook: `data-testid=tsw-cf-editor`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 20 | Status-bar aggregates | Count / sum / average / min / max of selection | done |
| 21 | Charts via `chart.js@4.5.1` from selection | OSS replacement: reuse existing Chart.js on main. Not a Pro evidence-cut. | done |
| 22 | In-house pivot / group-by aggregation | OSS replacement: in-house group-by. Not a Pro evidence-cut. | done |
| 23 | Keyboard shortcuts | Univer + workspace accelerators | done |
| 24 | Context menu + long-press | Reserved hooks open a real menu (`data-testid=tsw-context-menu`). Long-press 500ms + right-click. Univer `contextMenu` stays false. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 25 | Virtualized grid | Univer canvas grid; accessible fallback window | done |
| 26 | Zoom | Univer zoom + workspace control | done |
| 27 | Wrap / overflow | Wrap toggle + overflow clip / ellipsis / overflow chrome. Hooks: `data-testid=tsw-wrap`, `data-testid=tsw-overflow`. Evidence: `tests/unit/sheets-stage2.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| 28 | Hyperlinks | Portable per-cell links | done |
| 29 | Comments / notes | Portable notes (no Pro thread-comment) | done |
| 30 | IndexedDB persistence | Dexie database scoped to this tool | done |
| 31 | LocalStorage prefs | Theme / zoom / last workbook id | done |
| 32 | XLSX import (SheetJS CE 0.20.3) | Official CE tarball; formulas, merges, and safe hyperlinks | done |
| 33 | XLSX export (`exceljs@4.4.0`) | Browser `writeBuffer` download | done |
| 34 | CSV export | Current sheet, formula-safe | done |
| 35 | Export with editable tags / meta | Title, author, tags, notes on every export | done |
| 36 | Portable workbook bundle import / export | Versioned JSON (and zip) round-trip | done |

No `1–36` row uses a fourth status. Features 21 and 22 are `done` OSS replacements.

## Stage 2 done-when

- Features 3, 11, 12, 17, 18, 19, 24, 27 move from `stub-stage2` to `done` only with focused evidence.
- Viewport / scroll chrome stays device-agnostic; formula help is tap/focus, never hover-only (`data-testid=tsw-formula-tooltip`).
- `pnpm test:unit` and `pnpm build` pass. Playwright hooks live in `tests/e2e/tabular-sheet-workstation.spec.ts`.
- Draft PR `feature/tabular-sheet-workstation` → `main` only. Do not merge. Do not touch PR #33 / transcode.

## Stage 1 done-when

- Branch `feature/tabular-sheet-workstation` has unique commits (not identical to `origin/main`).
- Catalog entry + lazy workspace + multi-sheet grid + formulas + persist + working import/export path.
- `pnpm test:unit` and `pnpm build` pass, with focused formula/persist units.
- Draft PR `feature/tabular-sheet-workstation` → `main` only. Do not merge. Do not touch PR #33 / transcode.
- Stop commits after the draft PR is current with this ledger.

## Gap ledger (Excel / Sheets parity beyond 1–36)

CoS product cut is locked as **P1–P16**. Do not shrink this slice to XLOOKUP-only. Historical G1–G14 map 1:1 onto P1–P14. Historical G15 (protect sheet) is an optional extra and is **not** CoS P15. Historical G16/G17 are CoS P15/P16.

Status values: `done` | `in-progress` | `excluded`.

### Implement now — CoS P1–P16 (local browser, no server)

| ID | Feature | Notes | Status |
| --- | --- | --- | --- |
| P1 | Paste special | Values / formats / transpose from the last copied snapshot or TSV. Hooks: context menu + `data-testid=tsw-parity-chrome`. Evidence: `tests/unit/sheets-parity.test.ts`, `tests/e2e/tabular-sheet-workstation.spec.ts` | done |
| P2 | Insert Function (full catalog) | Locked names: SUM, AVERAGE, IF, VLOOKUP, XLOOKUP, INDEX-MATCH, TEXTJOIN, COUNTIF, SUMIF. INDEX and MATCH stay in the picker as the INDEX-MATCH building blocks. Hook: `data-testid=tsw-insert-function`. Constant: `LOCKED_INSERT_FUNCTIONS`. Not an XLOOKUP-only slice. FILTER / SORT / UNIQUE formulas are excluded (X5). | done |
| P3 | AutoSum | Writes `=SUM(...)` below a column, right of a row, or into a cell with numbers above. Hook: `data-testid=tsw-autosum` | done |
| P4 | Named range manager | List, go to, define, delete. Hook: `data-testid=tsw-named-ranges` | done |
| P5 | Go to / Go to special | A1 jump plus blanks / formulas / constants. Hooks: `tsw-goto`, `tsw-goto-blanks` | done |
| P6 | Sheet hide / unhide + tab color | Hidden tabs leave the tablist; unhide select + long-press/right-click tab menu. | done |
| P7 | Clear contents vs clear all | Contents keeps style/notes; all deletes the cell. Context menu + parity chrome. | done |
| P8 | Remove duplicates | Packs unique rows in the selection. Hook: `tsw-remove-duplicates` | done |
| P9 | Text to columns | Delimiter split across columns. Hook: `tsw-text-to-columns` | done |
| P10 | Custom number format | Pattern field + Apply. Hook: `tsw-custom-format` | done |
| P11 | CF color scales | `color-scale` kind interpolates fill from the rule range min/max. | done |
| P12 | Validation list picker | Select appears on list-validated cells. Hook: `tsw-list-picker` | done |
| P13 | Charts column + line + pie | Chart.js only; `column` maps to `bar`. Hook: `tsw-chart-kind` | done |
| P14 | Print CSS / print view | `@media print` plus `data-print-view` chrome hide. Hook: `tsw-print` | done |
| P15 | Keyboard + fill | F2 edits the formula bar; Ctrl/Cmd+Arrow jumps to the data edge; Ctrl/Cmd+; inserts the local date; Ctrl/Cmd+D and Fill down (`data-testid=tsw-fill-down`) run `fillDownSelection`. Protect sheet is not this row. | done |
| P16 | Client harden | No hover-only actions. Long-press + click menus. Formula help is tap/focus only. Anti-slop catalog/sheets copy only. Device-agnostic CSS + Playwright loop at 320/360/390/412/430 portrait and 740×360 landscape. Not an iPhone-13-only proof. | done |

### Optional extra (not a substitute for P15 / P16)

| ID | Feature | Notes | Status |
| --- | --- | --- | --- |
| PX | Protect sheet (local PIN) | SHA-256 + salt stored on the workbook in IndexedDB. Session unlock only. Not Excel file encryption. Hook: `tsw-protect`. Kept from the original brief; CoS 16 does not number it. | done |

### Explicitly excluded

| ID | Feature | Why excluded |
| --- | --- | --- |
| X1 | Univer Pro / HyperFormula / `@univerjs/preset-sheets-advanced` / `@univerjs/preset-sheets-drawing` | Banned engines. Portable DAG + optional Univer OSS sheets-core 0.25.1 only. Pro pivots/drawing stay out. |
| X2 | Realtime collaboration, auth, remote DB | Local-first GitHub Pages. Workbooks stay in this browser. |
| X3 | VBA / Apps Script / macros | No script host, no server. Formulas and chrome actions only. |
| X4 | Remote / cloud Power Query / cloud connectors | Would leave the browser. CSV/XLSX/bundle import is the local substitute. |
| X5 | FILTER / SORT / UNIQUE *formulas* | Portable engine is scalar (no spill arrays; HyperFormula is banned). Use Autofilter, Sort, and Remove duplicates. |
| X6 | Excel workbook encryption / IRM / password-to-open | A hashed PIN is a local edit lock. It can be stripped from the portable JSON, so it is not file crypto. |
| X7 | PivotTables as Excel caches / slicers / GETPIVOTDATA | In-house group-by remains the OSS substitute (feature 22). Not Univer Pro pivots. |
| X8 | Drawing / images / sparklines / Pro charts | Chart.js column/line/pie from the selection only. |
| X9 | Real-time multiplayer + comments threads | Portable notes only. No Pro thread-comment. |
| X10 | Solver / Goal Seek / Data Tables / Power Pivot | Heavy analysis add-ins; not in the local OSS stack. |

## Handoff

Resume file: `src/tools/sheets/HANDOFF.md` (tip SHA, verify commands, fixed vs deferred findings). Keep this matrix, the in-tool progress TODO, and `.tasks/IN_PROGRESS.md` in the same cycle. Move a row to `done` only with focused evidence. Newly discovered gaps stay listed here rather than disappearing.
