---
tool: regex-log-structurer
folder: src/tools/logs
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-regex-log-structurer-design.md
tracker: src/tools/logs/TRACKER.md
updated: 2026-10-01
---

# Log Structurer — tracker

## Resume here

On `origin/main`. 20 requirements: 13 verified, 3 implemented without a covering test, 4 missing. Next action: add tests for LGS-R11, R13, R16. No blocker.

## Documents

- Spec: [2026-10-01-regex-log-structurer-design.md](../../../docs/superpowers/specs/2026-10-01-regex-log-structurer-design.md)
- Code: `log-engine.ts` (structuring, kinds, exports), `log-runner.ts` + `log.worker.ts` (worker with deadline), `LogWorkspace.tsx` (UI)
- Task history: `.tasks/DONE.md` TASK-016 (worker and output cap)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/logs.test.ts`, `tests/unit/logs-audit.test.ts`, `tests/unit/log-runner.test.ts`; browser tests: `tests/e2e/audit-hardening.spec.ts` (Log Structurer and PagedTable cases)

## Requirement status

`logs` = `tests/unit/logs.test.ts`; `audit` = `tests/unit/logs-audit.test.ts`; `runner` = `tests/unit/log-runner.test.ts`; `e2e` = `tests/e2e/audit-hardening.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| LGS-R01 | verified | e2e "Regex Log Structurer reads a log file and reports inferred column kinds" | 8 MB cut-off has no test |
| LGS-R02 | verified | logs "reads group names straight from the pattern source" and the escape/character-class group; audit "derives escaped named captures…" | |
| LGS-R03 | verified | logs "applies the ignore-case flag", "applies multiline anchors in document mode"; e2e "…only offers the flags that can actually apply" | |
| LGS-R04 | verified | logs "document scan mode" group | |
| LGS-R05 | verified | audit "keeps source line numbers…", "reports source line numbers for document-mode matches and gaps" | |
| LGS-R06 | verified | logs "column kind inference" group; e2e "…reports inferred column kinds" | |
| LGS-R07 | verified | logs "maps named capture groups into columns and preserves unmatched lines"; audit "preserves whitespace and genuine blank unmatched lines…", "quotes unmatched TSV fields containing tabs…" | |
| LGS-R08 | verified | logs "reports declared columns even when no line matches"; e2e "a pattern that matches but declares no groups is diagnosed…" | |
| LGS-R09 | verified | runner "with a worker" group (19 tests) | |
| LGS-R10 | verified | runner "falls back to structuring synchronously…" | |
| LGS-R11 | implemented | — | |
| LGS-R12 | verified | e2e "Regex Log Structurer pages a large result…", "PagedTable jumps to the first, last, or a typed page…" | |
| LGS-R13 | implemented | — | |
| LGS-R14 | verified | logs "exports RFC4180-safe CSV cells", "escapes markdown table delimiters"; audit "neutralizes spreadsheet formulas in CSV…" | |
| LGS-R15 | verified | `tests/e2e/accessibility.spec.ts` route `regex-log-structurer` | |
| LGS-R16 | implemented | — | No viewport test for this route |
| LGS-R17 | missing | — | Delivered through TASK-028 |
| LGS-R18 | missing | — | Added 2026-10-02 |
| LGS-R19 | missing | — | Added 2026-10-02 |
| LGS-R20 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: LGS-R18, LGS-R19, LGS-R20.
1. Add tests for LGS-R11, R13, R16, and the 8 MB cut-off in LGS-R01.
2. LGS-R17 with TASK-028.

## Known limitations

- Input is capped at 8 MB; larger files load their first 8 MB only.

## Verification evidence

- 2026-10-01, `main` @ `ee3c120b`: log units 57/57; the five Log Structurer/PagedTable cases in `audit-hardening.spec.ts` 14 passed across desktop and mobile; accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added LGS-R18, LGS-R19, LGS-R20 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
