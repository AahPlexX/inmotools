---
task: T-apca-token-matrix-20261004-0c8f
tool: apca-token-matrix
doc: task
kind: expand
state: done
branch: expand/apca-token-matrix
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. APC-R06, R07, R10, R12, R14 moved from `implemented` to `verified`. Remaining: APC-R15, R16 `missing` (tracker Open work).

## Log
- 2026-10-04: claimed `expand/apca-token-matrix`.
- 2026-10-04: browser tests APC-R06, R07, R10, R12, R14 added to `tests/e2e/contrast.spec.ts`; `playwright test tests/e2e/contrast.spec.ts --repeat-each=3` 57 passed, 21 skipped (desktop-only viewport matrix). No code defects found.
