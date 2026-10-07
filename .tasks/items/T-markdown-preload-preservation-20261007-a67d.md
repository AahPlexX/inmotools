---
task: T-markdown-preload-preservation-20261007-a67d
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve an open document through optional import failures

## Request

Associated R51 failure-cycle defect: a failed citation style import must retain the open source, stop the loading indicator, report a local error and allow another bundled style or original Markdown export.

## Resume here

At 2026-10-07 13:56 UTC, R51 final immutable production acceptance passed all 28 R36/R38/R51 cases (3.7m), desktop/touch, no retries or skips. All 370 Markdown/shared recovery units passed (19.75s), TypeScript and production build passed. Actual generated References are checked in preview, rendered Markdown/reimport, HTML/print, DOCX, EPUB and AST; source CRLF/literals/uncited entries, all four styles, stale/reset/pending/error cycles and 320/844/768 bounds are covered. Actual failed IEEE import retains source and recovers with another style; leaving Markdown restores shell reload recovery. Shared opt-in guard reason is recorded in T-markdown-preload-preservation-20261007-a67d. R51 is implemented, publication/integration/full/main/Pages pending; R55 next after those receipts. R15 cause remains unresolved; prior diagnostic full 37576166482 passed 3852 units/14 skips and 1697 browsers/171 skips without retries, not R51 validation. Next: publish this working source through GitHub MCP; integration automatically selects the full browser suite because src/lib/deployment-recovery.ts changed. Inspect exact integration/full logs, main tree and Pages before marking verified; no PR, no duplicate full dispatch needed if integration runs full.

## Log

- 2026-10-07 06:01 UTC: Deliberate IEEE asset request abort caused default-source reload on desktop and mobile, so no local alert existed. Other 26 current cases passed, including pending-state controls. Added a mounted/current-route capture guard after primary-source review; local rejection remains uncanceled, so the normal formatter catch can show an actionable error. Outside-workspace recovery acceptance is added; no pass claim for this guard yet.

- 2026-10-07 06:06 UTC: Read-only native listener probe records other(undefined) then guard(true) registration, but invocation other first at target phase 2/defaultPrevented=false, then guard at phase 2/defaultPrevented=true. Source resets to default, alert count zero. Shared recovery opt-in check is now required before reload; reason and full-suite requirement recorded before the shared change.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.
