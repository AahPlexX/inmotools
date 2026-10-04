---
task: T-otel-flamegraph-20261004-b474
tool: otel-flamegraph
doc: task
kind: expand
state: done
branch: expand/otel-flamegraph
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done; OTF-R04, R07, R08, R09, R10, R12 and R15 verified. The four `missing` requirements (OTF-R13, R16, R17, R18) are build work, not tests.

## Log
- 2026-10-04: claimed `expand/otel-flamegraph`.
- 2026-10-04: tests added to `tests/e2e/otel.spec.ts` for OTF-R04, R07, R08, R09, R10, R12, R15 (7 widths); 72 passed, 24 skipped over three repeats, desktop and mobile. No code change needed.
