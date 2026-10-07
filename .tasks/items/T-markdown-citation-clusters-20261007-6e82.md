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

2026-10-07 13:58:06 UTC: Final R51 runtime/tests and current records published through GitHub MCP as 46a147c11158796de59174a7d1a6236570cc544c; fetched tree equals locally tested 5d7d036. Full integration request 37632747834 is pending on that source. A record-only checkpoint will supersede this initial request before lengthy validation; inspect the latest fix/markdown-workbench integration run and its exact head SHA. Main remains 500adae; no R51 main/Pages/full success claim. All 28 focused production cases/370 units, TypeScript/build pass. Integration selects __FULL_SUITE__ for the shared recovery edit; no PR or separate duplicate full dispatch. Next: allow full integration to finish, inspect exact logs, verify main and Pages, mark R51 scoped verified and advance to R55; R15 cause remains unresolved.

## Log

- 2026-10-07 05:40 UTC: New bibliography suite first run 3/16 passed. Corrected HTML entity/attribute and CSL title-case assertions yield 12/16 passed; four genuine multi-entry failures remain. Separate diagnostic confirms only last Alpha entry is returned in APA, IEEE, Chicago author-date and MLA. Preserve this associated defect until fresh multi-entry acceptance and full/main/Pages evidence.

- 2026-10-07 05:44 UTC: Cluster repair passes 51 initial units; expanded isolated Markdown suite 363/363 passed (13.06s), including earlier same-author/year disambiguation updates. Actual browser/export/source cycles pending; no publication/release/full-pass claim for R51.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.

- 2026-10-07 13:58:06 UTC: Final R51 runtime/tests and current records published through GitHub MCP as 46a147c11158796de59174a7d1a6236570cc544c; fetched tree equals locally tested 5d7d036. Full integration request 37632747834 is pending on that source. A record-only checkpoint will supersede this initial request before lengthy validation; inspect the latest fix/markdown-workbench integration run and its exact head SHA. Main remains 500adae; no R51 main/Pages/full success claim. All 28 focused production cases/370 units, TypeScript/build pass. Integration selects __FULL_SUITE__ for the shared recovery edit; no PR or separate duplicate full dispatch.
