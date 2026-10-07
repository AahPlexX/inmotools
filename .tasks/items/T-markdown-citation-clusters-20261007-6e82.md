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

At 2026-10-07 14:25:51 UTC, final R51 metadata-repaired runtime passed all 34 R36/R38/R51 production cases (4.2m), desktop/touch, no retries or skips; all 391 Markdown/shared recovery units passed (23.29s), TypeScript/build passed. The strengthened export fixture and YAML/TOML/JSON × LF/CRLF/CR browser cycles exclude metadata/uncited keys and preserve exact original download bytes. Native metadata payload parsing and original body slicing handle mixed line endings and braces/escaped quotes in JSON strings. Earlier baseline failed 8 units/49 passes and both actual export cases, recorded in task 291b. R51 is implemented, associated tasks stay active until fresh full/main/Pages receipts. Published 46a147c + record 8bbca5f/full 37632859293 validate only prior runtime; publish this real repair now, superseding that run with required fresh full integration. Shared recovery guard reason remains in task a67d. Next: publish through GitHub MCP, inspect latest exact integration head/full receipt, verify main tree and Pages, then mark R51 verified and advance to R55. R55 preparatory task 12d4 has current official sources and reproducible metrics baselines, no runtime change. R15 cause unresolved.

## Log

- 2026-10-07 05:40 UTC: New bibliography suite first run 3/16 passed. Corrected HTML entity/attribute and CSL title-case assertions yield 12/16 passed; four genuine multi-entry failures remain. Separate diagnostic confirms only last Alpha entry is returned in APA, IEEE, Chicago author-date and MLA. Preserve this associated defect until fresh multi-entry acceptance and full/main/Pages evidence.

- 2026-10-07 05:44 UTC: Cluster repair passes 51 initial units; expanded isolated Markdown suite 363/363 passed (13.06s), including earlier same-author/year disambiguation updates. Actual browser/export/source cycles pending; no publication/release/full-pass claim for R51.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.

- 2026-10-07 13:58:06 UTC: Final R51 runtime/tests and current records published through GitHub MCP as 46a147c11158796de59174a7d1a6236570cc544c; fetched tree equals locally tested 5d7d036. Full integration request 37632747834 is pending on that source. A record-only checkpoint will supersede this initial request before lengthy validation; inspect the latest fix/markdown-workbench integration run and its exact head SHA. Main remains 500adae; no R51 main/Pages/full success claim. All 28 focused production cases/370 units, TypeScript/build pass. Integration selects __FULL_SUITE__ for the shared recovery edit; no PR or separate duplicate full dispatch.

- 2026-10-07 14:25:51 UTC: Final metadata-repaired R51 source passes 34/34 owned R36/R38/R51 production cases (4.2m), no retries/skips, and 391 units (23.29s), TypeScript/build. Real repair publication/fresh full/main/Pages pending.
