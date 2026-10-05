---
tool: tabular-sheet-workstation
folder: src/tools/sheets
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-tabular-sheet-workstation-design.md
tracker: src/tools/sheets/TRACKER.md
updated: 2026-10-05
---

# Tabular Sheet Workstation — spec

As built at `947272db` (last code change under `src/tools/sheets/`). Requirement prefix: `TSW`. Status of each requirement: [TRACKER.md](../../../src/tools/sheets/TRACKER.md). History: [FEATURE_MATRIX.md](../../../src/tools/sheets/FEATURE_MATRIX.md) (features 1–36, P1–P16, WA1–WA3, WB1–WB2, PX, X1–X10) and [HANDOFF.md](../../../src/tools/sheets/HANDOFF.md). Former IDs from FEATURE_MATRIX are given as "(formerly …)".

## Purpose

Edit multi-sheet spreadsheets with formulas, formatting, data tools, charts and pivot tables entirely in the browser, for analysts, finance and operations staff and students who need a workbook without uploading it anywhere.

## Scope

In scope:
- Multi-sheet workbooks on a local grid (portable model and formula DAG) or on the Univer 0.25.1 open-source sheets core.
- Formulas (local catalog plus Formula.js 4.6.1), spill functions, pivots, charts, formatting, validation, data tools.
- Import of XLSX, CSV and portable bundles; export of XLSX, CSV and portable JSON/zip bundles; local storage in IndexedDB and LocalStorage.

Out of scope:
- Real-time collaboration, shared comment threads, cloud data connectors and server-run macros: they need a server or accounts (TSW-R85–R88, `prohibited`).

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and workbooks stay in this browser (IndexedDB, LocalStorage); network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Libraries as pinned in `package.json`: `@univerjs/presets` and `@univerjs/preset-sheets-core` 0.25.1, `exceljs` 4.4.0, `xlsx` (SheetJS CE) 0.20.3 from cdn.sheetjs.com, `chart.js` 4.5.1, `@formulajs/formulajs` 4.6.1. Pivot code is in-house.
- Not used (licence terms): `@univerjs-pro/*`, `@univerjs/preset-sheets-advanced`, `@univerjs/preset-sheets-drawing` (commercial licence) and HyperFormula (GPL-3.0 or commercial licence) (formerly X1).
- Storage: IndexedDB database `inmotools-tabular-sheet-workstation`; portable bundle schema version 1. Names, storage keys and formats are not changed.
- Responsive proof uses CSS-width viewports (`CLIENT_VIEWPORTS`), not one device profile (formerly P16).

## Requirements

### Workbook and sheets

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R01 | A workbook holds several sheets; sheets can be added, deleted and switched from the tab strip (formerly 1) | Add sheet adds a tab; Delete sheet removes the active one; clicking a tab shows its cells |
| TSW-R02 | A sheet can be renamed by double-clicking its tab or with Rename sheet; Enter keeps the name, Escape cancels | Tab shows the new name after Enter; Escape leaves it unchanged |
| TSW-R03 | A sheet can be duplicated with its cells, formats and sizes into a new tab | Duplicate gives a new tab with identical cells |
| TSW-R04 | Sheets can be hidden and unhidden and given a tab colour from the tab menu (right-click or long-press) (formerly P6) | Hidden tab leaves the tab strip and appears in Unhide; tab colour is painted |
| TSW-R05 | A sheet can be locked with a local PIN, hashed with SHA-256 and a random salt; edits are refused until it is unlocked; the lock is an edit lock, not file encryption (formerly PX) | Wrong PIN keeps the sheet locked; right PIN unlocks |

### Grid and editing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R06 | The grid renders only the visible window of rows and columns plus frozen ones, so sheets with 100,000 or more populated cells stay usable (formerly 25) | Windowed indices skip hidden rows; a 100,000-cell sheet scrolls and edits without stalling |
| TSW-R07 | A range is selected by drag, Shift+click or long-press; the selected range is shown as A1 text | Shift+click from A2 to A3 shows `A2:A3` |
| TSW-R08 | Typing on a selected cell starts editing it in place; Enter commits, Escape cancels, Backspace deletes a character | Typing 10 then Enter writes 10 into the cell |
| TSW-R09 | A formula bar shows and edits the active cell's value or formula; Enter or the Enter button commits (formerly 2) | A formula typed in the bar is evaluated into the cell |
| TSW-R10 | Undo and redo step through workbook edits, from the toolbar and Ctrl/Cmd+Z, Ctrl/Cmd+Y (formerly 8) | Undo restores the previous value; Redo reapplies it |
| TSW-R11 | Cut, copy and paste work on whole ranges as tab-separated text; cut and clear act on the whole selection; pasted tab-delimited text fills a grid (formerly 9) | Copying A2:B3 gives `Paper\t4\nInk\t2`; pasting TSV fills rows and columns |
| TSW-R12 | Paste special pastes values only, formats only, or the copied range transposed (formerly P1) | Values paste drops the formula; transpose swaps rows and columns |
| TSW-R13 | Clear contents keeps style and notes; Clear all deletes the cell (formerly P7) | After Clear contents the format remains; after Clear all the cell is empty |
| TSW-R14 | The fill handle copies a cell over a range, rewriting relative references and keeping absolute ones (formerly 7) | `=A1+$B$1` filled down one row becomes `=A2+$B$1` |
| TSW-R15 | F2 edits in the formula bar; Ctrl/Cmd+Arrow jumps to the data edge; Ctrl/Cmd+; inserts today's local date; Ctrl/Cmd+D and Fill down fill the selection (formerly P15) | Ctrl+Down from A2 lands on the last filled row; Ctrl+; writes the date |
| TSW-R16 | Filling continues a series from the selected start cells: a numeric step (2, 4, 6), dates and weekday or month names | Filling 2, 4 down gives 6, 8; Mon gives Tue, Wed |
| TSW-R17 | Keyboard navigation: arrow keys move the selection, Shift+arrow extends it, Delete clears it, Ctrl/Cmd+S saves, Ctrl/Cmd+F opens find (formerly 23) | ArrowUp moves from A7 to A6 |
| TSW-R18 | A cell context menu opens on right-click and on a 500 ms long-press, stays inside the viewport and closes on Escape (formerly 24) | Menu with Copy, Paste values, Clear all appears and fits a 320×740 viewport |
| TSW-R19 | Zoom from 50% to 200% scales the grid (formerly 26) | Zoom 150 enlarges cells |
| TSW-R20 | Go to jumps to an A1 cell; Go to special selects blanks, formulas or constants (formerly P5) | Go to B4 selects B4; Go to formulas selects the formula cells |
| TSW-R21 | Find and replace searches case-insensitively and replaces in values and formulas (formerly 10) | Replacing `paper` with `Card` changes `Paper` |
| TSW-R22 | Find and replace offers match-case and regular-expression options | With match case, `paper` does not match `Paper`; regex `P.*r` matches `Paper` |
| TSW-R23 | Named ranges are stored with the workbook and resolve in formulas (formerly 6) | `=SUM(B2:B3)*TaxRate` uses the named value |
| TSW-R24 | The named range manager lists, goes to, defines and deletes names (formerly P4) | Defined name appears in the list; Delete removes it |
| TSW-R25 | A cell can carry a hyperlink; only safe schemes open, `javascript:` links are refused (formerly 28) | Link opens in a new tab; `javascript:alert(1)` is not rendered as a link |
| TSW-R26 | A cell can carry a comment or note, marked on the grid (formerly 29) | Saved note sets the cell's note marker |
| TSW-R27 | A quick row filter hides rows whose cells do not contain the typed text | Typing `ink` in Filter rows leaves only rows containing Ink |

### Formulas

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R28 | Relative, absolute and mixed references (`A1`, `$A$1`, `A$1`, `$A1`) parse and survive fill (formerly 4) | `$B$3` parses as absolute; fill keeps it |
| TSW-R29 | References to other sheets (`Sheet2!B3`, `'Sheet Name'!A1`) evaluate (formerly 5) | A cross-sheet formula returns the other sheet's value |
| TSW-R30 | Formulas are evaluated through a dependency graph; a circular reference is reported as `#CYCLE!` | Two cells that refer to each other show `#CYCLE!` |
| TSW-R31 | With the Univer engine selected and mounted, Univer engine-formula is the live formula source of truth; otherwise the portable DAG is (formerly 3) | Engine set to Univer shows `univer-engine-formula` |
| TSW-R32 | More than 150 Excel-compatible functions evaluate, including AVERAGE, SUMIFS, ROUNDUP, IF, IFS, SWITCH, TEXTJOIN, COUNTIF, SUMIF, VLOOKUP, XLOOKUP, INDEX and MATCH, through the local catalog and Formula.js; unknown names give `#NAME?` (formerly WA1) | `=POWER(2,3)` gives 8; `=NOTAFUNCTION(1)` gives `#NAME?` |
| TSW-R33 | Dotted Excel function names (for example STDEV.S, NORM.DIST) parse and evaluate | `=STDEV.S(1,2,3)` gives 1 |
| TSW-R34 | FILTER, SORT and UNIQUE spill into empty neighbouring cells; a blocked spill writes `#SPILL!` (formerly WA2) | FILTER result fills cells below; a value in the way gives `#SPILL!` |
| TSW-R35 | Insert function lists the full catalog with search; locked names SUM, AVERAGE, IF, VLOOKUP, XLOOKUP, INDEX-MATCH, TEXTJOIN, COUNTIF, SUMIF come first; choosing one puts its template in the formula bar (formerly P2) | Choosing SUM puts `=SUM(` in the bar |
| TSW-R36 | AutoSum writes `=SUM(…)` below a column, right of a row, or into a cell with numbers above (formerly P3) | AutoSum at B4 gives `=SUM(B2:B3)` |
| TSW-R37 | Formula help opens on tap or focus (never hover only), lists the formula's cell and name references and stays inside the viewport | Focusing the formula bar opens help with `data-trigger=focus-or-tap` |
| TSW-R38 | While a formula is typed, matching function names are suggested and the current function's arguments are shown | Typing `=SUMI` suggests SUMIF and SUMIFS; inside `SUMIF(` the argument list is shown |
| TSW-R39 | The status bar shows count, sum, average, minimum and maximum of the selection (formerly 20) | Selecting 1, 3, 5 shows sum 9, average 3 |

### Formatting

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R40 | A number-format picker applies General, Number, Integer, Percent, Currency, Scientific, Date, Time and Text formats to the selection (formerly 11) | Currency shows 2.5 as `$2.50` |
| TSW-R41 | A custom number-format pattern can be typed and applied (formerly P10) | Pattern `0.0` shows 2.5 as `2.5` |
| TSW-R42 | A duration format shows elapsed time beyond 24 hours (`[h]:mm:ss`) | 1.5 days shows `36:00:00` |
| TSW-R43 | Typed currency, percentage and date values are detected, stored as numbers and given the matching format | Typing `25%` stores 0.25 with a percent format |
| TSW-R44 | Cell styles: bold, italic, underline, font colour, fill colour and alignment on the selection (formerly 12) | Bold toggles `aria-pressed` and the cell weight |
| TSW-R45 | Cell styles include strikethrough and cell borders (sides, style, colour) | Strikethrough and a bottom border are painted and kept in XLSX export |
| TSW-R46 | Cells can be merged and unmerged; merges paint as row and column spans (formerly 13) | Merging A2:A3 gives rowspan 2 |
| TSW-R47 | Text can wrap; overflow can be set to ellipsis, clip or overflow (formerly 27) | Wrap sets `white-space: normal`; Clip hides overflow |
| TSW-R48 | Rows and columns can be frozen at the active cell (formerly 14) | Freeze at C2 keeps row 1 pinned |
| TSW-R49 | Rows and columns can be inserted, deleted and resized; hidden rows, sizes and A1 metadata shift with them (formerly 15) | Column width 140 is written; inserting a row shifts a hidden row down |
| TSW-R50 | Column width and row height can be auto-fitted to their contents | Auto-fit sets the column to the widest cell text |
| TSW-R51 | Conditional-format rules (greater than, less than, equal, contains) paint fill and text colour on matching cells (formerly 19) | Rule `> 3` paints 4 and not 2 |
| TSW-R52 | Conditional format colour scales interpolate fill between two colours over the range minimum and maximum (formerly P11) | Minimum gets the first colour, maximum the second |
| TSW-R53 | Conditional format data bars draw a bar in each cell proportional to its value in the range | The largest value has the longest bar |
| TSW-R54 | The workspace offers a high-contrast mode from its Theme setting | High contrast changes the grid palette and is remembered |

### Data tools

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R55 | The selection can be sorted A–Z or Z–A by its first column, numbers numerically (formerly 16) | Sort A–Z orders Ink before Paper |
| TSW-R56 | A multi-column sort orders by several key columns, each ascending or descending | Sort by Region then Amount descending orders ties by Amount |
| TSW-R57 | A column autofilter hides non-matching body rows and keeps the header (formerly 17) | Filter `paper` hides Ink |
| TSW-R58 | Filters accept regular expressions | Filter `^P` keeps Paper only |
| TSW-R59 | Data validation rules (list, number range, text length, custom) are stored with the workbook and block a failing value on Enter with the rule's message (formerly 18) | Entering 8 into a `2,4,6` list cell shows the message |
| TSW-R60 | A list-validated cell shows a dropdown of its allowed values (formerly P12) | Picker on B2 offers 2, 4, 6 |
| TSW-R61 | Remove duplicates packs the unique rows of the selection (formerly P8) | Two identical rows become one |
| TSW-R62 | Text to columns splits the selection on a delimiter (formerly P9) | `red,green,blue` fills three columns |

### Charts and pivots

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R63 | A chart is drawn with Chart.js from the current selection and follows it (formerly 21) | Selecting a range redraws the chart |
| TSW-R64 | Chart kinds column, bar, line and pie (formerly P13) | Column maps to a Chart.js bar chart; line and pie render |
| TSW-R65 | Chart kinds area and scatter | Area fills under the line; scatter plots x/y pairs |
| TSW-R66 | In-cell sparklines (line and column) summarise a range inside one cell | A sparkline cell draws the range's trend |
| TSW-R67 | A group-by helper sums a value column per group (formerly 22) | dept/amount groups to dev 10, ops 10 |
| TSW-R68 | A local PivotTable is built from a contiguous range with row, column, value and filter fields and SUM, COUNT, AVERAGE, MIN or MAX; it writes to a new sheet at A1 by default or to a chosen cell without overlapping the source, refreshes on edit and on Refresh, and rebuilds headers when the aggregation changes (formerly WB1) | Pivot of Item/Qty writes Pivot1 with totals; Count relabels to `Count of Qty` |
| TSW-R69 | GETPIVOTDATA reads grand totals, one field/item and row+column pairs from local pivots; a missing item gives `#REF!` (formerly WB2) | `=GETPIVOTDATA("Qty",Pivot1!A1,"Item","Paper")` gives 4 |

### Files and storage

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R70 | Workbooks are saved to and reopened from IndexedDB in this browser; the saved list can be cleared; malformed rows are rejected (formerly 30) | Saved workbook reopens with its sheets and names |
| TSW-R71 | Zoom, theme and last workbook are kept in LocalStorage (formerly 31) | Prefs read back after writing |
| TSW-R72 | Edits are saved to this browser automatically, without pressing Save, and the last workbook reopens on return | Reloading after an edit shows the edit |
| TSW-R73 | XLSX files are imported with SheetJS CE 0.20.3, keeping values, formulas, merges and safe hyperlinks (formerly 32) | Imported XLSX keeps `=A1+B1` and the merge |
| TSW-R74 | CSV files are imported per RFC 4180 (quoted fields, doubled quotes, CRLF); numbers become numbers | Quoted comma stays in one cell |
| TSW-R75 | TSV files are imported | A `.tsv` file opens with tab-separated columns |
| TSW-R76 | The workbook is exported as XLSX with exceljs 4.4.0, keeping formulas, formats, styles, hidden sheets, tab colours and comments (formerly 33) | Exported XLSX re-imports with the comment |
| TSW-R77 | The active sheet is exported as CSV with formula-like text neutralised (formerly 34) | `=CMD` is written as `'=CMD` |
| TSW-R78 | The active sheet is exported as TSV | Download has tab-separated rows |
| TSW-R79 | The active sheet is exported as JSON records keyed by the header row | Download is an array of objects |
| TSW-R80 | Title, author, tags and notes are written into every export that can carry them (XLSX properties, portable bundle) (formerly 35) | Bundle tags round-trip without duplicates |
| TSW-R81 | The workbook round-trips through a versioned portable JSON bundle and zip bundle (formerly 36) | Exported bundle re-imports with the same sheets and comments |
| TSW-R82 | Cell comments survive XLSX export and the portable bundle (formerly WA3) | Re-imported note equals the saved one |
| TSW-R83 | Print view hides the workspace chrome and prints the grid (formerly P14) | Print shows only the grid |
| TSW-R84 | Printing (and print to PDF) breaks pages at chosen rows and columns and repeats header rows | A set page break starts a new printed page |

### Collaboration and automation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R85 | Real-time collaboration on a shared workbook with other people (formerly X2) | — |
| TSW-R86 | Threaded multi-user comment conversations (formerly X9) | — |
| TSW-R87 | Cloud data connectors and cloud Power Query refresh (formerly X4) | — |
| TSW-R88 | Workbook macros in VBA or Google Apps Script (formerly X3) | — |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TSW-R89 | No hover-only actions; long-press and click menus; formula help on tap or focus; readable chrome at the portrait and landscape `CLIENT_VIEWPORTS` from 320×740 to 1024×768 (formerly P16) | Parity chrome, formula help and context menu fit every matrix viewport |
| TSW-R90 | No horizontal overflow and controls usable from 320 px to 2560 px wide | Page scroll width equals client width at 320, 375, 768, 1024, 1440, 1920 and 2560 px |
| TSW-R91 | No serious or critical axe violations in the workspace | Axe scan of the workspace and the catalog route |
| TSW-R92 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |
| TSW-R93 | The workspace lists its feature progress in a keyboard-focusable, scrollable list | List has `tabIndex=0` and an accessible name |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- TSW-R06: the owner notes give 100,000+ cells as the scale; new sheets start at 80 rows × 26 columns and grow on import. Whether new sheets should start larger is not recorded.
- TSW-R54 and TSW-R92: the workspace has its own Light / High contrast setting next to the site-wide theme; how the two combine is not recorded.
- TSW-R79: the owner notes ask for JSON export; the shape (records keyed by the header row) is the conservative default, owner may override.
- FEATURE_MATRIX exclusions X5 (SEQUENCE, SORTBY, RANDARRAY, array constants), X6 (workbook encryption), X7 (pivot caches, slicers, OLAP), X8 (drawing and images) and X10 (Solver, Goal Seek, Data Tables) were product cuts, not rule breaks; they are not recorded as requirements. Dotted names (X5) and sparklines (X8) are requested by the owner notes and are TSW-R33 and TSW-R66.

## Change log

- 2026-10-05 — Created as an as-built spec from `src/tools/sheets/`, its tests, FEATURE_MATRIX.md and [owner-feature-notes-2026-10-05.md](../../research/owner-feature-notes-2026-10-05.md).
