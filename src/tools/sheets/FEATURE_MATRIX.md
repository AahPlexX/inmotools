# Tabular Sheet Workstation — locked Stage 1 feature matrix

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
| 3 | AST/DAG via Univer `engine-formula` in preset | Portable DAG/evaluator unit-covered; live Univer formula SSOT + browser proof is Stage 2 | stub-stage2 |
| 4 | Relative / absolute refs | `$A$1` / `A$1` / `$A1` / `A1` parse + fill rewrite | done |
| 5 | Cross-sheet refs | `Sheet2!B3` / `'Sheet Name'!A1` | done |
| 6 | Named ranges | Portable named-range table synced into snapshot | done |
| 7 | Fill handle | Univer fill + portable relative rewrite | done |
| 8 | Undo / redo | Univer history + portable command stack fallback | done |
| 9 | Cut / copy / paste | Univer clipboard + portable range copy | done |
| 10 | Find / replace | Workspace find panel (core preset has no dedicated find-replace pin) | done |
| 11 | Number formats | Portable `z` + exceljs `numFmt`; format picker is Stage 2 | stub-stage2 |
| 12 | Cell styles | Font / fill / align flags persist; full style chrome is Stage 2 | stub-stage2 |
| 13 | Merge cells | Univer merge + portable merge ranges | done |
| 14 | Freeze panes | Univer freeze + portable freeze | done |
| 15 | Row / col insert, delete, resize | Univer + portable structural edits | done |
| 16 | Sort | In-house range sort on portable model | done |
| 17 | Filter | Header-row text hide only; column autofilter is Stage 2 | stub-stage2 |
| 18 | Data validation | Portable rules stored; enforcement UI is Stage 2 | stub-stage2 |
| 19 | Conditional formatting | Portable rules + fallback paint; rule editor is Stage 2 | stub-stage2 |
| 20 | Status-bar aggregates | Count / sum / average / min / max of selection | done |
| 21 | Charts via `chart.js@4.5.1` from selection | OSS replacement: reuse existing Chart.js on main. Not a Pro evidence-cut. | done |
| 22 | In-house pivot / group-by aggregation | OSS replacement: in-house group-by. Not a Pro evidence-cut. | done |
| 23 | Keyboard shortcuts | Univer + workspace accelerators | done |
| 24 | Context menu + long-press | stub-stage2 OK. Hooks only (`suppressNativeContextMenu`, `scheduleLongPressStub`). Univer `contextMenu: false`. | stub-stage2 |
| 25 | Virtualized grid | Univer canvas grid; accessible fallback window | done |
| 26 | Zoom | Univer zoom + workspace control | done |
| 27 | Wrap / overflow | Wrap style flag persists; overflow chrome is Stage 2 | stub-stage2 |
| 28 | Hyperlinks | Portable per-cell links | done |
| 29 | Comments / notes | Portable notes (no Pro thread-comment) | done |
| 30 | IndexedDB persistence | Dexie database scoped to this tool | done |
| 31 | LocalStorage prefs | Theme / zoom / last workbook id | done |
| 32 | XLSX import (SheetJS CE 0.20.3) | Official CE tarball only | done |
| 33 | XLSX export (`exceljs@4.4.0`) | Browser `writeBuffer` download | done |
| 34 | CSV export | Current sheet, formula-safe | done |
| 35 | Export with editable tags / meta | Title, author, tags, notes on every export | done |
| 36 | Portable workbook bundle import / export | Versioned JSON (and zip) round-trip | done |

No `1–36` row uses a fourth status. Features 21 and 22 are `done` OSS replacements.

## Stage 1 done-when

- Branch `feature/tabular-sheet-workstation` has unique commits (not identical to `origin/main`).
- Catalog entry + lazy workspace + multi-sheet grid + formulas + persist + working import/export path.
- `pnpm test:unit` and `pnpm build` pass, with focused formula/persist units.
- Draft PR `feature/tabular-sheet-workstation` → `main` only. Do not merge. Do not touch PR #33 / transcode.
- Stop commits after the draft PR is current with this ledger.

## Handoff

Keep this matrix, the in-tool progress TODO, and `.tasks/IN_PROGRESS.md` in the same cycle. Move a row to `done` only with focused evidence. Newly discovered gaps stay listed here rather than disappearing.
