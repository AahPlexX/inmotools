---
task: T-markdown-citation-clusters-20261007-6e82
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Retain all citation clusters and bibliography entries

## Request

Associated R51 bug: retain every resolved document citation in citeproc's registry and apply changed cluster output to the corresponding in-text key, including earlier citations affected by disambiguation.

## Resume here

At 2026-10-07 13:56 UTC, R51 final immutable production acceptance passed all 28 R36/R38/R51 cases (3.7m), desktop/touch, no retries or skips. All 370 Markdown/shared recovery units passed (19.75s), TypeScript and production build passed. Actual generated References are checked in preview, rendered Markdown/reimport, HTML/print, DOCX, EPUB and AST; source CRLF/literals/uncited entries, all four styles, stale/reset/pending/error cycles and 320/844/768 bounds are covered. Actual failed IEEE import retains source and recovers with another style; leaving Markdown restores shell reload recovery. Shared opt-in guard reason is recorded in T-markdown-preload-preservation-20261007-a67d. R51 is implemented, publication/integration/full/main/Pages pending; R55 next after those receipts. R15 cause remains unresolved; prior diagnostic full 37576166482 passed 3852 units/14 skips and 1697 browsers/171 skips without retries, not R51 validation. Next: publish this working source through GitHub MCP; integration automatically selects the full browser suite because src/lib/deployment-recovery.ts changed. Inspect exact integration/full logs, main tree and Pages before marking verified; no PR, no duplicate full dispatch needed if integration runs full.

## Log

- 2026-10-07 05:40 UTC: New bibliography suite first run 3/16 passed. Corrected HTML entity/attribute and CSL title-case assertions yield 12/16 passed; four genuine multi-entry failures remain. Separate diagnostic confirms only last Alpha entry is returned in APA, IEEE, Chicago author-date and MLA. Preserve this associated defect until fresh multi-entry acceptance and full/main/Pages evidence.

- 2026-10-07 05:44 UTC: Cluster repair passes 51 initial units; expanded isolated Markdown suite 363/363 passed (13.06s), including earlier same-author/year disambiguation updates. Actual browser/export/source cycles pending; no publication/release/full-pass claim for R51.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.
