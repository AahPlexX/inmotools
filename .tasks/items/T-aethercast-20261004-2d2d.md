---
task: T-aethercast-20261004-2d2d
tool: aethercast
doc: task
kind: expand
state: done
branch: expand/aethercast
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. AEC-R03, R04, R14, R17, R18, R19 are `verified`; AEC-R06 JSON re-import is covered. Remaining work is in the tracker's Open work.

## Log
- 2026-10-04: claimed `expand/aethercast`.
- 2026-10-04: added `tests/unit/aethercast-engine.test.ts` "AEC-R14 …" and `tests/e2e/aethercast.spec.ts` tests AEC-R03, R04, R14, R17, R18, R19; all passed 3/3 (`--repeat-each=3`, 96 passed). AEC-R03, R04, R14, R17, R18, R19 implemented → verified; AEC-R06 evidence extended and note cleared. Recorded T-aethercast-20261004-3116 (inversion night hours use the viewer's timezone).
