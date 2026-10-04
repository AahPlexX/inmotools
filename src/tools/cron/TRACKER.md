---
tool: cron-team-matrix
folder: src/tools/cron
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-cron-team-matrix-design.md
tracker: src/tools/cron/TRACKER.md
updated: 2026-10-04
---

# Cron Team Matrix — tracker

## Resume here

On `origin/main`. 25 requirements: 19 verified, 6 missing (CRN-R20 site theme; CRN-R21–R25 added 2026-10-02). Next action: build CRN-R21–R25. No blocker.

## Documents

- Spec: [2026-10-01-cron-team-matrix-design.md](../../../docs/superpowers/specs/2026-10-01-cron-team-matrix-design.md)
- Code: `cron-engine.ts` (parsing, projection, offsets, calendar), `CronWorkspace.tsx` (UI)
- Task history: `.tasks/DONE.md` (run-count horizon; unrecognized-timezone crash fix) and `.tasks/NEXT.md` TASK-014 (paged output)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/cron.test.ts`; browser tests: `tests/e2e/cron.spec.ts`

## Requirement status

`unit` = `tests/unit/cron.test.ts`; `e2e` = `tests/e2e/cron.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| CRN-R01 | verified | unit "returns ordered upcoming runs in the source timezone" | |
| CRN-R02 | verified | unit "preserves seconds from six-field cron expressions"; e2e "keeps a fixed reference instant…" | |
| CRN-R03 | verified | e2e "CRN-R03 an invalid cron expression shows a plain error and the workspace stays usable" | |
| CRN-R04 | verified | unit "bounds the requested run count" | |
| CRN-R05 | verified | unit "requires an unambiguous editable reference instant", "rejects impossible ISO calendar dates…"; e2e "keeps a fixed reference instant across rerenders…" | |
| CRN-R06 | verified | e2e "diagnoses invalid source and comparison timezones without unmounting" | |
| CRN-R07 | verified | unit "partitions valid, duplicate, invalid, and over-limit zones"; e2e "diagnoses invalid…" | |
| CRN-R08 | verified | unit "searches supported identifiers with starts-with matches first"; e2e "discovers supported timezones…" | |
| CRN-R09 | verified | e2e "CRN-R09 the source timezone is always a matrix column" | |
| CRN-R10 | verified | unit "projects one instant into multiple named zones with offsets" | |
| CRN-R11 | verified | e2e "keeps a fixed reference instant…" (`cron-first-instant`, `cron-reference-value`) | |
| CRN-R12 | verified | unit "supports normal and overnight working-hour windows"; e2e "…labels working hours in text" | |
| CRN-R13 | verified | unit "reports concrete New York UTC-offset changes"; e2e "…reports offset changes…" | |
| CRN-R14 | verified | e2e "CRN-R14 the 24-hour distribution counts runs per source-zone hour"; unit "returns run hours safely" | |
| CRN-R15 | verified | e2e "CRN-R15 the run table is paged at 50 rows per page" | |
| CRN-R16 | verified | e2e "keeps a fixed reference instant…" (CSV download) | |
| CRN-R17 | verified | unit "exports only the calculated occurrences…", "folds content lines to the RFC 5545 75-octet limit"; e2e (.ics download) | |
| CRN-R18 | verified | `tests/e2e/accessibility.spec.ts` route `cron-team-matrix` | |
| CRN-R19 | verified | e2e "CRN-R19 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| CRN-R20 | missing | — | Delivered through TASK-028 |
| CRN-R21 | missing | — | Added 2026-10-02 |
| CRN-R22 | missing | — | Added 2026-10-02 |
| CRN-R23 | missing | — | Added 2026-10-02 |
| CRN-R24 | missing | — | Added 2026-10-02 |
| CRN-R25 | missing | — | Added 2026-10-02 |

## Open work

1. Build the requirements added 2026-10-02: CRN-R21, CRN-R22, CRN-R23, CRN-R24, CRN-R25.
2. CRN-R20 with TASK-028.

## Known limitations

- Timezone names and rules come from the browser's `Intl` data, so results can differ slightly between browsers with different timezone database versions.

## Verification evidence

- 2026-10-04, `expand/cron-team-matrix`: `pnpm build`; `PW_PORT=4204 pnpm exec playwright test tests/e2e/cron.spec.ts --repeat-each=3` 63 passed, 21 skipped (the CRN-R19 viewport matrix runs on the desktop project only).
- 2026-10-01, `main` @ `35e55040`: `tests/unit/cron.test.ts` 14/14; `tests/e2e/cron.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Browser tests added for CRN-R03, R09, R14, R15, R19 (now `verified`).
- 2026-10-02 — Added CRN-R21, CRN-R22, CRN-R23, CRN-R24, CRN-R25 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
