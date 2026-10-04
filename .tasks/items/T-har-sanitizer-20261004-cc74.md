---
task: T-har-sanitizer-20261004-cc74
tool: har-sanitizer
doc: task
kind: expand
state: done
branch: expand/har-sanitizer
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. HAR-R01, R09, R11, R12, R16 implemented → verified; HAR-R13 and R14 kept verified with tests for search and row windowing. HAR-R17 and R18 stay missing. Tracker updated.

## Log
- 2026-10-04: claimed `expand/har-sanitizer`.
- 2026-10-04: added browser tests in `tests/e2e/har.spec.ts` for HAR-R01 (drop, sample, Clear), R09, R11 (jump), R12 (CSV), R13 (search), R14 (windowing, device pixel ratio), R16 (320–2560 px); `--repeat-each=3` 69 passed, 21 skipped, 0 failed. No code change needed.
