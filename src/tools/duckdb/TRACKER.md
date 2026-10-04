---
tool: duckdb-workbench
folder: src/tools/duckdb
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-duckdb-workbench-design.md
tracker: src/tools/duckdb/TRACKER.md
updated: 2026-10-04
---

# DuckDB Workbench — tracker

## Resume here

On `origin/main`. 27 requirements: 22 verified, 5 missing. Next action: build the missing requirements (Open work). No blocker.

## Documents

- Spec: [2026-10-01-duckdb-workbench-design.md](../../../docs/superpowers/specs/2026-10-01-duckdb-workbench-design.md)
- Code: `duckdb-client.ts` (session, file registration, streaming capture, value normalization), `DuckDbWorkspace.tsx` (UI)
- Task history: `.tasks/DONE.md` TASK-003 (precache policy); `.tasks/NEXT.md` TASK-014 (cancel and paging reconciliations)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/duckdb.test.ts`, `tests/unit/deployment-config.test.ts`; browser test: `tests/e2e/duckdb.spec.ts`

## Requirement status

`unit` = `tests/unit/duckdb.test.ts`; `e2e` = `tests/e2e/duckdb.spec.ts`; a bare `e2e` cites its test "queries local files losslessly with bounded capture, types, history, export, schema, and removal".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DDB-R01 | verified | e2e | |
| DDB-R02 | verified | e2e "DDB-R02 a second selection keeps the first file and a same-name selection replaces it" | |
| DDB-R03 | verified | e2e "DDB-R03 choosing one file fills the editor with an escaped starter query" | |
| DDB-R04 | verified | e2e | |
| DDB-R05 | verified | e2e "DDB-R05 Ctrl+Enter and Cmd+Enter run the query from the editor" | |
| DDB-R06 | verified | e2e "DDB-R06 Cancel stops a running query, reports it, and the workspace stays usable" | |
| DDB-R07 | verified | e2e (1,000-row cap); e2e "DDB-R07 capture stops before 32 MiB and is labeled incomplete" | |
| DDB-R08 | verified | unit "preserves bigint precision…", "applies Arrow decimal scale…", "preserves lists, structs, maps, and binary values structurally", "preserves duplicate-named columns by position…"; e2e | |
| DDB-R09 | verified | e2e (`duckdb-result-metadata`) | |
| DDB-R10 | verified | e2e (`getByLabel('NULL')`) | |
| DDB-R11 | verified | e2e ("1 of 1,000 captured rows match") | |
| DDB-R12 | verified | e2e "queries local files losslessly with bounded capture, types, history, export, schema, and removal" (asserts the `Rows 1–200 of 1,000` range text) | |
| DDB-R13 | verified | e2e "DDB-R13 a value longer than 120 characters is shortened and opens in full" | |
| DDB-R14 | verified | e2e "DDB-R14 a query chosen from history fills the editor" | |
| DDB-R15 | verified | e2e | |
| DDB-R16 | verified | e2e | |
| DDB-R17 | verified | e2e (CSV download) | |
| DDB-R18 | verified | e2e "DDB-R18 JSON export contains columns, types, rows and completeness" | |
| DDB-R19 | verified | e2e "DDB-R19 invalid SQL and an unreadable file report the reason and the workspace stays usable" | |
| DDB-R20 | verified | `tests/unit/deployment-config.test.ts` "keeps DuckDB WebAssembly out of the install-time precache and caches it on first use" | |
| DDB-R21 | verified | `tests/e2e/accessibility.spec.ts` route `duckdb-workbench` | |
| DDB-R22 | verified | e2e "DDB-R22 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| DDB-R23 | missing | — | Delivered through TASK-028 |
| DDB-R24 | missing | — | Added 2026-10-02 |
| DDB-R25 | missing | — | Added 2026-10-02 |
| DDB-R26 | missing | — | Added 2026-10-02 |
| DDB-R27 | missing | — | Added 2026-10-02 |

## Open work

1. Build the requirements added 2026-10-02: DDB-R24, DDB-R25, DDB-R26, DDB-R27.
2. DDB-R23 with TASK-028.

## Known limitations

- Captures stop at the row cap or 32 MiB; very large results are labeled incomplete rather than held in memory.
- Registered files last for the session only.

## Verification evidence

- 2026-10-04, `expand/duckdb-workbench`: `pnpm build` clean; `PW_PORT=4202 pnpm exec playwright test tests/e2e/duckdb.spec.ts --repeat-each=3` 81 passed, 21 skipped (mobile viewport-matrix cases skipped by design), desktop and mobile.
- 2026-10-01, `main` @ `2cb14f5f`: `tests/unit/duckdb.test.ts` 9/9; `tests/e2e/duckdb.spec.ts` 2 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Tests added for DDB-R02, R03, R05, R06, R07 (32 MiB path), R13, R14 (load from history), R18, R19, R22 (7 widths); those rows verified.
- 2026-10-02 — Added DDB-R24, DDB-R25, DDB-R26, DDB-R27 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
