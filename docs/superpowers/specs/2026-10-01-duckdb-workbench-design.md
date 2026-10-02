---
tool: duckdb-workbench
folder: src/tools/duckdb
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-duckdb-workbench-design.md
tracker: src/tools/duckdb/TRACKER.md
updated: 2026-10-01
---

# DuckDB Workbench — spec

As built at `7609e01d` (last change under `src/tools/duckdb/`). Requirement prefix: `DDB`. Status of each requirement: [TRACKER.md](../../../src/tools/duckdb/TRACKER.md).

## Purpose

Let data analysts, BI developers and data engineers query local CSV and Parquet files with SQL in the browser, inspect exact results, and export only what they need, without uploading the data anywhere.

## Scope

In scope:
- Registering local CSV and Parquet files in an in-browser DuckDB database.
- Running SQL with bounded result capture, exact value handling, search, schema view and export.

Out of scope:
- Remote data sources and database connections: the tool reads only files the person chooses on this device (platform rules).
- Saving a database between visits: files are registered in memory for the session only.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- DuckDB-Wasm 1.32.0 (pinned), served from the site's own files and run in a dedicated Web Worker.
- The DuckDB binaries are not precached at first visit; they are cached on first use (TASK-003, asserted by `tests/unit/deployment-config.test.ts`).
- Result capture is bounded by a row cap and 32 MiB of normalized data, because browser memory is finite.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DDB-R01 | One or more local CSV or Parquet files are registered in DuckDB-Wasm running in a Web Worker, and the status names them as ready | Choosing `data.csv` shows it ready |
| DDB-R02 | New selections add to the registered set; choosing a file with an existing name replaces it | Selecting a second file keeps the first; same name replaces |
| DDB-R03 | Choosing a single file fills the editor with `SELECT * FROM '<name>' LIMIT 100`, with quotes in the name escaped | Editor shows the starter query for the chosen file |
| DDB-R04 | A query runs from the Run query button | Sum query returns `6` |
| DDB-R05 | Ctrl+Enter (Cmd+Enter on macOS) runs the query | Shortcut runs the query |
| DDB-R06 | A running query can be cancelled | Cancel stops the query and reports it |
| DDB-R07 | Result capture stops at the selected row cap (1,000, 10,000 or 50,000) or 32 MiB, and an incomplete capture is labeled as such in the status and metadata | 1,005-row query with a 1,000 cap is labeled incomplete |
| DDB-R08 | Values are exact: BIGINT kept as text, DECIMAL scale applied, lists, structs, maps and binary kept structurally, duplicate column names kept by position | `9007199254740993`, `123.45`, nested values and two `duplicate` columns display exactly |
| DDB-R09 | Each result column's DuckDB type is shown | Metadata lists `total:` with its type |
| DDB-R10 | NULL values are shown distinctly and announced as NULL | NULL cell has the NULL label |
| DDB-R11 | A search box filters displayed rows only and reports how many captured rows match | Searching `999` reports 1 of 1,000 |
| DDB-R12 | Results are paged at 200 rows per page | 1,000 rows show "Rows 1–200 of 1,000" |
| DDB-R13 | Values longer than 120 characters are shortened, with a button that shows the full value | Long value opens in the inspector |
| DDB-R14 | The last 12 distinct queries are kept in a history list and can be loaded back into the editor | Run query appears in history; choosing it fills the editor |
| DDB-R15 | Each registered file has a Schema action that describes its columns | Schema for `data.csv` shown |
| DDB-R16 | A registered file can be removed | Remove reports the file removed |
| DDB-R17 | Export the captured rows as CSV | `query-result.csv` downloads |
| DDB-R18 | Export the captured rows as JSON with columns, types, rows and completeness | `query-result.json` contains those keys |
| DDB-R19 | A failing query or unreadable file shows "Query failed" or "Could not open data locally" with the reason, and the workspace stays usable | Invalid SQL shows the message; next query still runs |
| DDB-R20 | After first use, the DuckDB binaries are served from the browser cache, so the workbench keeps working offline | Deployment config caches DuckDB binaries on first use |
| DDB-R21 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| DDB-R22 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| DDB-R23 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| DDB-R24 | CSV export has an option to neutralize spreadsheet formulas (off by default, so the default stays byte-exact) | With the option on, `=1+1` is written as text |
| DDB-R25 | JSON and JSON Lines files can be registered and queried | `SELECT * FROM 'data.jsonl'` returns rows |
| DDB-R26 | Export the captured result as Parquet | Downloaded Parquet re-imports with the same rows and types |
| DDB-R27 | Queries can be saved by name in this browser and reopened | Saved query survives a reload |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added DDB-R24, DDB-R25, DDB-R26, DDB-R27 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/duckdb/`, the catalog entry, `.tasks/DONE.md` TASK-003 and the tool's tests.
