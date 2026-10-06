---
task: T-repository-responsive-fixes-20261006-12c4
doc: task
kind: fix
state: done
branch: main (repository-wide)
created: 2026-10-06
updated: 2026-10-06
---

# Phone and tablet layout defects, and a catalog-wide guard

## Request
Owner, 2026-10-06: check each tool for device-agnostic responsiveness and execute the fixes.

## Resume here
Done. Remaining phone usability work is listed below and is not started.

## Log
- 2026-10-06: measured all 39 tools at 320, 360, 390, 414, 768, 1024 and 1440 px (phone sizes with touch and 2x pixel density). No tool scrolls sideways, but the workspace clips horizontal overflow, so the existing overflow checks could not see cut-off content.
- 2026-10-06: fixed: CAD canvas drawn at 2x its container on screens with pixel density 2 or more (`setSize(..., true)`); Tabular Sheet pivot panel wrapped into columns off-screen and its chart overflowed at 320 px; Regex Matrix Flags input overshot its column; Crystal editor card and reflection table wider than the screen; shared header links were 21px tall (now at least 24px, 32px on touch); editable fields under 16px on 20 tools (iPhone Safari zooms on focus; now 16px on touch screens).
- 2026-10-06: added tests/e2e/responsive.spec.ts (39 tools x 320/390/768 px). It fails on the previous source for all 39 tools and catches the CAD, Tabular, Regex and Crystal defects individually.
- 2026-10-06: verification: tsc clean; 345 unit files / 3,731 tests passed; build clean; full browser suite desktop 897 passed, mobile 728 passed. A first mobile run failed one Typing test (first viewport) because 44px header links on touch pushed the passage down; the touch size is 32px.
- 2026-10-06: not done, for the owner: a phone layout that puts the editor earlier (Markdown Workbench's editor starts 2.9 screens down; Tabular Sheet's grid 10.3); tap targets under 24px inside tools (Photo Studio 78, Crystal 20, Markdown 14, Typing 10, PlanCraft 8, Packet Inspector 6, others 1-4); text under 11px in 8 tools.
