---
tool: tabular-sheet-workstation
folder: src/tools/sheets
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-tabular-sheet-workstation-design.md
tracker: src/tools/sheets/TRACKER.md
updated: 2026-10-05
---

# Tabular Sheet Workstation — tracker

## Resume here

93 requirements: 58 verified, 9 implemented, 4 partial, 18 missing, 4 prohibited; TSW-R83 awaits physical testing by human. Next action: build the missing rows in the Open work order, starting with TSW-R72 (auto-save) and TSW-R38 (formula autocomplete). No blocker.

## Documents

- Spec: [2026-10-05-tabular-sheet-workstation-design.md](../../../docs/superpowers/specs/2026-10-05-tabular-sheet-workstation-design.md)
- Older ledgers (history): [FEATURE_MATRIX.md](FEATURE_MATRIX.md), [HANDOFF.md](HANDOFF.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/sheets-formula.test.ts`, `sheets-stage2.test.ts`, `sheets-parity.test.ts`, `sheets-persist.test.ts`, `sheets-wave-a.test.ts`, `sheets-wave-b.test.ts`, `sheets-wiring.test.ts`; browser tests: `tests/e2e/tabular-sheet-workstation.spec.ts`, `tests/e2e/accessibility.spec.ts`

## Requirement status

`unit` = `tests/unit/sheets-*.test.ts`; `e2e` = `tests/e2e/tabular-sheet-workstation.spec.ts` unless named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TSW-R01 | implemented | `addSheet`, `removeSheet` in `sheets-model.ts`; tab strip in `SheetsWorkspace.tsx` | No test adds or deletes a sheet |
| TSW-R02 | implemented | `renameSheet`; `tsw-rename-sheet`, tab double-click | |
| TSW-R03 | missing | — | No duplicate-sheet action |
| TSW-R04 | verified | unit "hides a sheet, colors a tab, and deletes a named range" | |
| TSW-R05 | verified | unit "hashes a local unlock PIN and treats the sheet as locked until verified" | |
| TSW-R06 | partial | unit "selects a bounded range, paints visible merges, and windows frozen rows" | Windowing is tested; no test at 100,000 cells; new sheets start at 80 × 26 |
| TSW-R07 | verified | e2e "selects a range, paints a merge, and writes column width" | |
| TSW-R08 | verified | unit "starts type-over into the selected-cell formula buffer and commits or cancels"; e2e "types into a clicked cell and moves the selection with ArrowUp" | |
| TSW-R09 | verified | e2e "spills FILTER into an empty neighbor and keeps a saved cell comment" | |
| TSW-R10 | implemented | `undo`, `redo` in `SheetsWorkspace.tsx`; Ctrl/Cmd+Z, Ctrl/Cmd+Y | |
| TSW-R11 | verified | unit "copies a range as TSV, clears the whole selection, and replaces case-insensitively", "pastes values, formats, and a transposed grid" | |
| TSW-R12 | verified | unit "pastes values, formats, and a transposed grid"; e2e "opens paste-special and clear-all from the click and long-press menu" | |
| TSW-R13 | verified | unit "clears contents while keeping style, and clear-all drops the cell" | |
| TSW-R14 | verified | unit "rewrites relative refs on fill and keeps absolute anchors" | |
| TSW-R15 | verified | unit "jumps to the data edge and formats a local date for Ctrl+;", "places AutoSum and keeps the locked Insert Function catalog, not an XLOOKUP-only slice" | |
| TSW-R16 | partial | `fillHandle` in `sheets-model.ts` | Numbers increase by 1 per cell; no step detection from two cells, no date, weekday or month series |
| TSW-R17 | verified | e2e "types into a clicked cell and moves the selection with ArrowUp"; unit "selects a bounded range, paints visible merges, and windows frozen rows" | |
| TSW-R18 | verified | e2e "opens the reserved context menu from right-click and long-press", "keeps the 320x740 context menu in-viewport and dismisses it after focus is blurred" | |
| TSW-R19 | implemented | Zoom input (50–200) in `SheetsWorkspace.tsx` | |
| TSW-R20 | verified | unit "goes to blanks, formulas, and constants, and parses an A1 jump"; e2e "exposes paste special, AutoSum, insert function, go to, and list picker" | |
| TSW-R21 | verified | unit "copies a range as TSV, clears the whole selection, and replaces case-insensitively" | |
| TSW-R22 | missing | — | `findReplaceInSheet` is always case-insensitive and escapes the pattern |
| TSW-R23 | verified | unit "evaluates arithmetic, ranges, named ranges, and cross-sheet refs" | |
| TSW-R24 | verified | unit "hides a sheet, colors a tab, and deletes a named range"; e2e "exposes paste special, AutoSum, insert function, go to, and list picker" | |
| TSW-R25 | verified | unit "writes column widths, shifts hidden rows on insert, and rejects unsafe hyperlinks" | |
| TSW-R26 | verified | e2e "spills FILTER into an empty neighbor and keeps a saved cell comment" | |
| TSW-R27 | implemented | Filter rows input (`tsw-filter`) in `SheetsWorkspace.tsx` | |
| TSW-R28 | verified | unit "converts A1 columns and absolute/relative refs" | |
| TSW-R29 | verified | unit "evaluates arithmetic, ranges, named ranges, and cross-sheet refs" | |
| TSW-R30 | verified | unit "builds a DAG and reports cycles" | |
| TSW-R31 | verified | unit "treats live Univer engine-formula as SSOT only when the host is mounted"; e2e "mounts Univer engine-formula as the live formula SSOT" | |
| TSW-R32 | verified | unit "evaluates Formula.js names through the portable DAG without replacing local SUM", "evaluates TEXTJOIN, COUNTIF, SUMIF, VLOOKUP, XLOOKUP, INDEX, and MATCH" | |
| TSW-R33 | missing | — | The tokenizer does not parse dotted names |
| TSW-R34 | verified | unit "spills FILTER, SORT, and UNIQUE into empty neighbors", "writes #SPILL! when a neighboring cell already has a value" | |
| TSW-R35 | verified | unit "pins Formula.js exactly and keeps the locked Insert Function names"; e2e "exposes paste special, AutoSum, insert function, go to, and list picker" | |
| TSW-R36 | verified | unit "places AutoSum and keeps the locked Insert Function catalog, not an XLOOKUP-only slice" | |
| TSW-R37 | verified | unit "describes formulas for a touch-safe tooltip and clamps the popup to the viewport"; e2e "opens formula help when the formula bar receives focus without an equals sign" | |
| TSW-R38 | missing | — | Formula help lists references only; no name suggestions or argument hints |
| TSW-R39 | verified | unit "aggregates a selection for the status bar" | |
| TSW-R40 | verified | unit "formats numbers through the picker catalog and writes z onto the selection" | |
| TSW-R41 | verified | unit "paints a color scale and writes a custom number pattern" | |
| TSW-R42 | missing | — | Time format wraps at 24 hours |
| TSW-R43 | missing | — | Typed `25%`, `$5` or dates stay text |
| TSW-R44 | verified | unit "applies full style chrome including wrap and overflow"; e2e "exposes Stage 2 formula SSOT, format, style, wrap, and tap-safe formula help" | |
| TSW-R45 | missing | — | `CellStyle` has no strikethrough or border fields |
| TSW-R46 | verified | e2e "selects a range, paints a merge, and writes column width" | |
| TSW-R47 | verified | unit "applies full style chrome including wrap and overflow" | |
| TSW-R48 | verified | e2e "selects a range, paints a merge, and writes column width" | |
| TSW-R49 | verified | unit "writes column widths, shifts hidden rows on insert, and rejects unsafe hyperlinks" | |
| TSW-R50 | missing | — | |
| TSW-R51 | verified | unit "evaluates conditional-format rules and paints matching cells"; e2e "enforces column autofilter, validation, and conditional-format editor hooks" | |
| TSW-R52 | verified | unit "paints a color scale and writes a custom number pattern" | |
| TSW-R53 | missing | — | |
| TSW-R54 | implemented | Theme select (`light`, `high-contrast`) and `.tsw-root[data-theme='high-contrast']` in `sheets.css` | unit "stores zoom and theme prefs in LocalStorage only" covers storage only |
| TSW-R55 | implemented | `sortRange` in `sheets-model.ts`; Sort A–Z / Z–A buttons | |
| TSW-R56 | missing | — | `sortRange` takes one key column |
| TSW-R57 | verified | unit "hides body rows from a column autofilter without dropping the header"; e2e "enforces column autofilter, validation, and conditional-format editor hooks" | |
| TSW-R58 | missing | — | Autofilter matches a plain substring |
| TSW-R59 | verified | unit "stores validation rules and blocks values that fail enforcement"; e2e "enforces column autofilter, validation, and conditional-format editor hooks" | |
| TSW-R60 | verified | unit "exposes list-validation choices and column/line/pie chart kinds" | |
| TSW-R61 | verified | unit "removes duplicate rows and splits text to columns" | |
| TSW-R62 | verified | unit "removes duplicate rows and splits text to columns" | |
| TSW-R63 | verified | unit "exposes list-validation choices and column/line/pie chart kinds" | |
| TSW-R64 | verified | unit "exposes list-validation choices and column/line/pie chart kinds" | |
| TSW-R65 | missing | — | |
| TSW-R66 | missing | — | |
| TSW-R67 | verified | unit "keeps the Stage 1 group-by helper and defaults new pivots onto a new sheet", "builds an in-house pivot without a Pro engine" | |
| TSW-R68 | verified | unit "creates a row-field SUM pivot on a new sheet and refreshes after source edits", "cross-tabulates a column field and supports COUNT, AVERAGE, MIN, and MAX", "writes onto a chosen destination range and refuses to overlap the source", "rebuilds value headers from the current agg when an existing pivot is refreshed"; e2e "refreshes an existing PivotTable after changing Sum to Count" | |
| TSW-R69 | verified | unit "looks up local pivot values with a GETPIVOTDATA subset", "recomputes GETPIVOTDATA after source formulas change without a server"; e2e "creates a local PivotTable on a new sheet and reads GETPIVOTDATA" | |
| TSW-R70 | verified | unit "round-trips a workbook through IndexedDB and rejects malformed rows" | |
| TSW-R71 | verified | unit "stores zoom and theme prefs in LocalStorage only" | |
| TSW-R72 | missing | — | Saving needs Save locally or Ctrl/Cmd+S; the last workbook is not reopened on load |
| TSW-R73 | verified | unit "imports CSV and XLSX and exports formula-safe CSV" | |
| TSW-R74 | implemented | `parseCsv` in `sheets-io.ts` handles quoted fields, doubled quotes and CRLF | unit "imports CSV and XLSX and exports formula-safe CSV" has no quoted field |
| TSW-R75 | missing | — | The file input does not accept `.tsv`; the parser splits on commas only |
| TSW-R76 | verified | unit "round-trips cell comments through XLSX and the portable bundle" | |
| TSW-R77 | verified | unit "imports CSV and XLSX and exports formula-safe CSV" | |
| TSW-R78 | missing | — | |
| TSW-R79 | missing | — | Export bundle writes the portable workbook, not header-keyed records |
| TSW-R80 | verified | unit "round-trips a tagged portable bundle" | |
| TSW-R81 | verified | unit "round-trips a tagged portable bundle", "round-trips cell comments through XLSX and the portable bundle" | |
| TSW-R82 | verified | unit "round-trips cell comments through XLSX and the portable bundle" | |
| TSW-R83 | implemented | `@media print` and `data-print-view` in `sheets.css`; `tsw-print` | [awaiting physical testing by human] Print to a printer and to PDF from Chrome and Firefox; expected: only the grid prints. unit "registers one catalog entry and a lazy sheets workspace" checks the print CSS exists |
| TSW-R84 | missing | — | |
| TSW-R85 | prohibited | — | Needs a server to relay edits between people (platform rule: no server) |
| TSW-R86 | prohibited | — | Needs user identity and a shared server store (platform rules: no accounts, no server) |
| TSW-R87 | prohibited | — | Cloud connectors need a server or provider accounts and keys (platform rules) |
| TSW-R88 | prohibited | — | VBA cannot run in a browser; Apps Script runs on Google's servers with an account (browser limit, platform rules) |
| TSW-R89 | verified | e2e "keeps parity chrome readable at <name>"; unit "keeps a device-agnostic portrait+landscape viewport matrix, not an iPhone 13-only proof" | |
| TSW-R90 | partial | e2e "keeps Stage 2 chrome readable at a 320 CSS-pixel portrait viewport", "keeps pivot chrome usable at 320 CSS px" | Tested from 320 to 1024 px; 1440, 1920 and 2560 px not tested |
| TSW-R91 | verified | e2e "has no serious or critical axe violations in the local grid"; `tests/e2e/accessibility.spec.ts` "has no serious or critical axe violations at <route>" | |
| TSW-R92 | partial | — | Site theme selector exists; the workspace fails `color-contrast` in dark (T-repository-dark-contrast-20261004-b7d2) |
| TSW-R93 | verified | unit "makes the overflowing feature-progress list keyboard-focusable" | |

## Open work

1. TSW-R72 auto-save and reopen the last workbook.
2. TSW-R38 formula autocomplete and argument hints; TSW-R33 dotted function names.
3. TSW-R43 value auto-detection; TSW-R42 duration format; TSW-R45 strikethrough and borders; TSW-R50 auto-fit.
4. TSW-R56 multi-column sort; TSW-R58 regex filters; TSW-R22 match case and regex find.
5. TSW-R53 data bars; TSW-R65 area and scatter charts; TSW-R66 sparklines.
6. TSW-R75 TSV import; TSW-R78 TSV export; TSW-R79 JSON records export; TSW-R84 page breaks.
7. TSW-R03 duplicate sheet; TSW-R16 series fill.
8. TSW-R92 dark-theme contrast; TSW-R90 widths 1440–2560; TSW-R06 100,000-cell test.
9. Tests for the implemented rows: TSW-R01, R02, R10, R19, R27, R54, R55, R74.

## Known limitations

- Browser memory bounds very large workbooks.
- Pivots are in-house: no Excel pivot caches, slicers, OLAP, date grouping or calculated fields; COUNT counts matching rows ([HANDOFF.md](HANDOFF.md)).
- The sheet PIN is a local edit lock, not file encryption.

## Verification evidence

- 2026-10-05, `expand/tabular-sheet-workstation` from `main` @ `6c991e75`: `pnpm tool:check tabular-sheet-workstation --base origin/main` 62/93, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.
