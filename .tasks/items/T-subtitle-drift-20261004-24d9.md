---
task: T-subtitle-drift-20261004-24d9
tool: subtitle-drift
doc: task
kind: expand
state: done
branch: expand/subtitle-drift
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. SUB-R11, R13, R14, R17 implemented → verified. SUB-R15, R18 and R19 stay missing. Tracker updated.

## Log
- 2026-10-04: claimed `expand/subtitle-drift`.
- 2026-10-04: browser tests added in `tests/e2e/subtitles.spec.ts` for SUB-R11 (anchor and source edits clear output), R13 (before/after table, 100 rows per page), R14 (SRT download name and content), R17 (320–2560 px); `--repeat-each=3` 57 passed, 21 skipped, 0 failed. No code change needed.
