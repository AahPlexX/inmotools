---
tool: duckdb-workbench
folder: src/tools/duckdb
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-duckdb-workbench-design.md
tracker: src/tools/duckdb/TRACKER.md
updated: 2026-10-01
---

# DuckDB Workbench — tracker

## Resume here

On `origin/main`. 27 requirements: 14 verified, 7 implemented without a covering test, 1 partial, 5 missing. Next action: add tests for the `implemented` rows. No blocker.

## Documents

- Spec: [2026-10-01-duckdb-workbench-design.md](../../../docs/superpowers/specs/2026-10-01-duckdb-workbench-design.md)
- Code: `duckdb-client.ts` (session, file registration, streaming capture, value normalization), `DuckDbWorkspace.tsx` (UI)
- Task history: `.tasks/DONE.md` TASK-003 (precache policy); `.tasks/NEXT.md` TASK-014 (cancel and paging reconciliations)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/duckdb.test.ts`, `tests/unit/deployment-config.test.ts`; browser test: `tests/e2e/duckdb.spec.ts`

## Requirement status

`unit` = `tests/unit/duckdb.test.ts`; `e2e` = `tests/e2e/duckdb.spec.ts` "queries local files losslessly with bounded capture, types, history, export, schema, and removal".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DDB-R01 | verified | e2e | |
| DDB-R02 | implemented | — | e2e registers one file only |
| DDB-R03 | implemented | — | |
| DDB-R04 | verified | e2e | |
| DDB-R05 | implemented | — | |
| DDB-R06 | implemented | — | Cancel wiring reconciled in TASK-014; no test |
| DDB-R07 | verified | e2e (1,000-row cap) | 32 MiB path has no test |
| DDB-R08 | verified | unit "preserves bigint precision…", "applies Arrow decimal scale…", "preserves lists, structs, maps, and binary values structurally", "preserves duplicate-named columns by position…"; e2e | |
| DDB-R09 | verified | e2e (`duckdb-result-metadata`) | |
| DDB-R10 | verified | e2e (`getByLabel('NULL')`) | |
| DDB-R11 | verified | e2e ("1 of 1,000 captured rows match") | |
| DDB-R12 | verified | e2e "queries local files losslessly with bounded capture, types, history, export, schema, and removal" (asserts the `Rows 1–200 of 1,000` range text) | |
| DDB-R13 | implemented | — | |
| DDB-R14 | verified | e2e (history contains the query) | Loading back from history has no test |
| DDB-R15 | verified | e2e | |
| DDB-R16 | verified | e2e | |
| DDB-R17 | verified | e2e (CSV download) | |
| DDB-R18 | implemented | — | |
| DDB-R19 | implemented | — | |
| DDB-R20 | verified | `tests/unit/deployment-config.test.ts` "keeps DuckDB WebAssembly out of the install-time precache and caches it on first use" | |
| DDB-R21 | verified | `tests/e2e/accessibility.spec.ts` route `duckdb-workbench` | |
| DDB-R22 | partial | `tests/e2e/app.spec.ts` "layout does not create accidental horizontal page overflow" | Checked at the desktop and mobile project sizes only |
| DDB-R23 | missing | — | Delivered through TASK-028 |
| DDB-R24 | missing | — | Added 2026-10-02 |
| DDB-R25 | missing | — | Added 2026-10-02 |
| DDB-R26 | missing | — | Added 2026-10-02 |
| DDB-R27 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: DDB-R24, DDB-R25, DDB-R26, DDB-R27.
1. Add tests for DDB-R02, R03, R05, R06, R13, R18, R19, and the remaining DDB-R22 widths.
2. DDB-R23 with TASK-028.

## Known limitations

- Captures stop at the row cap or 32 MiB; very large results are labeled incomplete rather than held in memory.
- Registered files last for the session only.

## Verification evidence

- 2026-10-01, `main` @ `2cb14f5f`: `tests/unit/duckdb.test.ts` 9/9; `tests/e2e/duckdb.spec.ts` 2 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added DDB-R24, DDB-R25, DDB-R26, DDB-R27 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
