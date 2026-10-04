---
task: T-hardware-packet-inspector-20261004-7ea6
tool: hardware-packet-inspector
doc: task
kind: expand
state: done
branch: expand/hardware-packet-inspector
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. HPI-R08, R11, R17, R20 are `verified`; HPI-R09 eviction is covered; HPI-R01 and R03 are `partial` and await a physical check with a real serial device (steps in the tracker Notes). HPI-R18 (Web Bluetooth) is not built and stays `missing`.

## Log
- 2026-10-04: claimed `expand/hardware-packet-inspector`.
- 2026-10-04: added `tests/e2e/hardware.spec.ts` tests HPI-R01, R03, R08, R09, R11, R17, R20 (seven widths) using the simulator and a Web Serial fake; all passed 3/3 (`--repeat-each=3`, 87 passed, 21 skipped on the mobile project). HPI-R08, R11, R17, R20 implemented → verified; HPI-R01, R03 implemented → partial with `[awaiting physical testing by human]`; HPI-R09 note cleared.
