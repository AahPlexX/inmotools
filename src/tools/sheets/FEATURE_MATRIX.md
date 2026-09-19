# Tabular Sheet Workstation — locked Stage 1 feature matrix

Suite path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Local-first only. Workbooks stay in this browser (IndexedDB / LocalStorage). No uploads, analytics, auth, or remote database.

## Stack pins (exact; never `^`)

| Package | Pin | Role | Evidence (as of 2026-09-19) |
| --- | --- | --- | --- |
| `@univerjs/presets` | `0.25.1` | `createUniver` / Facade host | npm dist-tag `latest` = `0.25.1`; Apache-2.0 OSS |
| `@univerjs/preset-sheets-core` | `0.25.1` | Sheets UI + `@univerjs/engine-formula` AST/DAG | npm dist-tag `latest` = `0.25.1`; docs.univer.ai preset mode |
| `exceljs` | `4.4.0` | XLSX export via `workbook.xlsx.writeBuffer()` | npm `exceljs@4.4.0` |
| `xlsx` (SheetJS CE) | `0.20.3` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | XLSX import | Official CE install path on cdn.sheetjs.com / docs.sheetjs.com |
| `chart.js` | `4.5.1` **reuse from main** | Charts from selection (feature 21) | Already declared on `origin/main`; do not duplicate |
| Pivot / group-by | in-house | Feature 22 open substitute | No `@univerjs-pro/*`, no HyperFormula (GPL) |

Banned: Univer Pro packages (`@univerjs-pro/*`), HyperFormula, remote persistence, telemetry.

`rxjs@7.8.2` is the documented peer of the Univer 0.25.1 presets (not a feature library). `protobufjs` postinstall is denied in `pnpm-workspace.yaml` (`allowBuilds.protobufjs: false`).

## Locked 1–36 checklist

Status values used below: `OPEN` (not started), `IN_PROGRESS` (Stage 1 slice), `DONE` (implemented and unit-covered). This file is the handoff ledger; the in-tool progress TODO must stay aligned.

| # | Feature | Stage 1 plan | Status |
| ---: | --- | --- | --- |
| 1 | Multi-sheet workbook | Univer core preset + portable snapshot model | DONE |
| 2 | Formula bar | Univer `formulaBar` in `UniverSheetsCorePreset` | DONE |
| 3 | AST/DAG via Univer `engine-formula` in preset | Live grid uses preset formula engine; portable DAG tests cover refs/cycles | IN_PROGRESS |
| 4 | Relative / absolute refs | `$A$1` / `A$1` / `$A1` / `A1` parse + fill rewrite | DONE |
| 5 | Cross-sheet refs | `Sheet2!B3` / `'Sheet Name'!A1` | DONE |
| 6 | Named ranges | Portable named-range table synced into snapshot | DONE |
| 7 | Fill handle | Univer fill + portable relative rewrite | DONE |
| 8 | Undo / redo | Univer history + portable command stack fallback | DONE |
| 9 | Cut / copy / paste | Univer clipboard + portable range copy | DONE |
| 10 | Find / replace | Workspace find panel (core preset has no dedicated find-replace pin) | DONE |
| 11 | Number formats | Univer numfmt + portable `z` formats | IN_PROGRESS |
| 12 | Cell styles | Font / fill / align / border in snapshot | IN_PROGRESS |
| 13 | Merge cells | Univer merge + portable merge ranges | DONE |
| 14 | Freeze panes | Univer freeze + portable freeze | DONE |
| 15 | Row / col insert, delete, resize | Univer + portable structural edits | DONE |
| 16 | Sort | In-house range sort on portable model | DONE |
| 17 | Filter | In-house header-row filter | IN_PROGRESS |
| 18 | Data validation | In-house lists / numbers / custom formula | IN_PROGRESS |
| 19 | Conditional formatting | In-house rules on portable model | IN_PROGRESS |
| 20 | Status-bar aggregates | Count / sum / average / min / max of selection | DONE |
| 21 | Charts via `chart.js@4.5.1` from selection | Reuse existing Chart.js; no second copy | DONE |
| 22 | In-house pivot / group-by aggregation | Open substitute; no Univer Pro pivot | DONE |
| 23 | Keyboard shortcuts | Univer + workspace accelerators | DONE |
| 24 | Context menu + long-press | Univer context menu + 500 ms touch long-press | DONE |
| 25 | Virtualized grid | Univer canvas grid; accessible fallback window | DONE |
| 26 | Zoom | Univer zoom + workspace control | DONE |
| 27 | Wrap / overflow | Univer wrap + portable wrap flag | IN_PROGRESS |
| 28 | Hyperlinks | Portable per-cell links | DONE |
| 29 | Comments / notes | Portable notes (no Pro thread-comment) | DONE |
| 30 | IndexedDB persistence | Dexie database scoped to this tool | DONE |
| 31 | LocalStorage prefs | Theme / zoom / last workbook id | DONE |
| 32 | XLSX import (SheetJS CE 0.20.3) | Official CE tarball only | DONE |
| 33 | XLSX export (`exceljs@4.4.0`) | Browser `writeBuffer` download | DONE |
| 34 | CSV export | Current sheet, formula-safe | DONE |
| 35 | Export with editable tags / meta | Title, author, tags, notes on every export | DONE |
| 36 | Portable workbook bundle import / export | Versioned JSON (and zip) round-trip | DONE |

## Stage 1 done-when

- Branch `feature/tabular-sheet-workstation` has unique commits (not identical to `origin/main`).
- Catalog entry + lazy workspace + multi-sheet grid + formulas + persist + working import/export path.
- `pnpm test:unit` and `pnpm build` pass, with focused formula/persist units.
- Draft PR `feature/tabular-sheet-workstation` → `main` only. Do not merge. Do not touch PR #33 / transcode.

## Handoff

Keep this matrix and the in-tool progress TODO in the same cycle. Move a row to `DONE` only with focused evidence. Newly discovered gaps stay listed here rather than disappearing.
