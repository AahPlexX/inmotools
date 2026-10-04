---
task: T-exif-scrubber-20261004-60fc
tool: exif-scrubber
doc: task
kind: expand
state: done
branch: expand/exif-scrubber
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. EXF-R04, R06, R08, R09, R14, R18 are `verified`; EXF-R01 drag and drop and EXF-R12 retry are covered. Remaining work is in the tracker's Open work (EXF-R16, R19, R20).

## Log
- 2026-10-04: claimed `expand/exif-scrubber`.
- 2026-10-04: added `tests/e2e/exif.spec.ts` tests EXF-R01, R04, R06, R08 (two), R09, R12, R14, R18 (seven widths) and unit "EXF-R02 treats ICC colour-profile tags as settings, not identity fields"; all passed 3/3 (`--repeat-each=3`, 87 passed, 21 skipped on the mobile project). EXF-R04, R06, R08, R09, R14, R18 implemented → verified; EXF-R01 and R12 notes cleared.
- 2026-10-04: fix in `exif-engine.ts`: ICC colour-profile tags were classified as identity fields, so a JPEG stripped with its colour profile kept was reported as still carrying privacy fields.
