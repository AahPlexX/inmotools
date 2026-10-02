---
tool: fuzzy-deduplicator
folder: src/tools/dedupe
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-fuzzy-deduplicator-design.md
tracker: src/tools/dedupe/TRACKER.md
updated: 2026-10-01
---

# Fuzzy Deduplicator — tracker

## Resume here

On `origin/main`. 14 requirements: 11 verified, 2 implemented without a covering test, 1 missing (site theme, TASK-028). Next action: add tests for FDD-R07 and R13. No blocker.

## Documents

- Spec: [2026-10-01-fuzzy-deduplicator-design.md](../../../docs/superpowers/specs/2026-10-01-fuzzy-deduplicator-design.md)
- Original design: "Tool 19" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `dedupe-engine.ts`, `dedupe-table.ts`, `dedupe.worker.ts`, `DedupeWorkspace.tsx`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/dedupe.test.ts`; browser tests: `tests/e2e/dedupe.spec.ts`

## Requirement status

`unit` = `tests/unit/dedupe.test.ts`; `e2e` = `tests/e2e/dedupe.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FDD-R01 | verified | e2e "decodes Windows-1252 CSV…", "a slower previous CSV read cannot overwrite a newer file selection" | XLSX input has no test |
| FDD-R02 | verified | unit "rejects malformed quoted CSV…"; e2e "rejects malformed CSV with an unterminated quoted field" | |
| FDD-R03 | verified | unit "makes normalized header collisions unique and reports them", "preserves cells beyond the header row…" | |
| FDD-R04 | verified | unit "provides bounded deterministic similarity scores", "uses Double Metaphone-compatible phonetic keys" | |
| FDD-R05 | verified | unit "returns stable clusters at the configured threshold", "does not let a stricter hard-coded blocker hide a pair…" | |
| FDD-R06 | verified | unit "reports the weakest pair across a transitive cluster…"; e2e "labels transitive cluster confidence as the weakest pair" | |
| FDD-R07 | implemented | — | Stop has no test |
| FDD-R08 | verified | unit "defaults canonical fields to the first nonblank member"; e2e "requires explicit cluster review…" | |
| FDD-R09 | verified | e2e "bounds large cluster rows and lets users control review columns independently" | |
| FDD-R10 | verified | e2e "…reports export progress, and allows zero-cluster export" | |
| FDD-R11 | verified | unit "protects spreadsheet exports from formula execution prefixes", "neutralizes formula-like values while preserving ordinary signed numeric and phone values exactly" | |
| FDD-R12 | verified | `tests/e2e/accessibility.spec.ts` route `fuzzy-deduplicator` | |
| FDD-R13 | implemented | — | No viewport test for this route |
| FDD-R14 | missing | — | Delivered through TASK-028 |

## Open work

1. Add tests for FDD-R07, R13, and XLSX input.
2. FDD-R14 with TASK-028.

## Known limitations

- Very large files are bounded by browser memory.

## Verification evidence

- 2026-10-01, `main` @ `49a6754a`: `tests/unit/dedupe.test.ts` 11/11; `tests/e2e/dedupe.spec.ts` 12 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
