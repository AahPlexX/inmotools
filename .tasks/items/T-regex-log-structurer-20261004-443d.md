---
task: T-regex-log-structurer-20261004-443d
tool: regex-log-structurer
doc: task
kind: expand
state: done
branch: expand/regex-log-structurer
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. LGS-R11, R13, R16 implemented → verified; LGS-R01 stays verified with the 8 MB cut-off now tested and fixed. LGS-R17 to R20 stay missing. Tracker updated.

## Log
- 2026-10-04: claimed `expand/regex-log-structurer`.
- 2026-10-04: defect found by the new LGS-R01 test: the 8 MB cut-off compared characters, so a 9 MB file of two-byte text loaded whole. `LogWorkspace.tsx` now reads `file.slice(0, 8 MB)` when `file.size` is over 8 MB.
- 2026-10-04: browser tests added in `tests/e2e/logs.spec.ts` for LGS-R01 (cut-off), R11 (one run after 300 ms, fake clock), R13 (long and multi-line cell disclosure), R16 (320–2560 px); `--repeat-each=3` 39 passed, 21 skipped, 0 failed; existing Log Structurer browser cases and accessibility 16 passed; log units 57/57.
