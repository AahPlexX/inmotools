---
task: T-markdown-citation-boundaries-20261007-50cd
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve citation code boundaries while generating References

## Request

Associated bug discovered while researching the next ordered requirement MDW-R51: citation processing must preserve native code literals and append only document citations to a generated References section, without changing original source.

## Resume here

Done at 2026-10-07 15:20:46 UTC. References runtime a924c377/checkpoint a3885a9 is integrated at main 230f637d3c60a31a45559aaa05bc41c1c05de582 (exact tree equality). Full integration 37637141396 succeeded at 15:19:16 UTC: 3896 unit passes/14 skips and 1711 browser passes/171 skips (46.5m), zero browser retries/flaky cases. Pages build/deploy jobs 112856996133/112857318705 succeeded in run 37640254171; deploy completed 14:52:34 UTC. Live deployed actual References export acceptance passed 2/2 desktop/touch (27.7s). Separate duplicate main/PR validate jobs may still be running; they are not needed to invent or replace this exact full receipt. tool:check markdown-workbench reports incomplete 79/92 verified; this scoped task is done, not the tool. Continue current tracker/parent task; cycle-display repair 42ab requires its own release, then R55.

## Log

- 2026-10-07 04:53 UTC: Reachable actual baseline source: # Fixture citations, prose See [@fixture], indented [@fixture], inline ``[@fixture] ` example``, and a four-backtick md fence containing a triple-backtick line followed by [@fixture]. Synthetic CSL-JSON entry id fixture/type book/title Synthetic bibliography fixture/author Test Fixture/year 2026. Preview code texts were (Fixture, 2026), (Fixture, 2026) ` example, and triple-backtick + (Fixture, 2026). Zero References headings despite a populated bibliography panel. The earlier exact-select-label locator timeout is excluded as setup evidence; corrected documented label selection produced this baseline. Optional local receipt citation-boundaries-baseline.json is not needed for reproduction.
- 2026-10-07 04:53 UTC: Official CSL specification source and CommonMark 0.31.2 retrieved HTTP 200 at 04:48:59–04:49:00 UTC. Hosted CSL and citeproc documentation returned HTTP 403, so no content from those blocked pages was used. Primary citeproc repository's historical attic manual retrieved HTTP 200 at 04:50:59 UTC; validate API details against installed citeproc 2.4.63 and current upstream implementation before using it. No dependency/runtime changes yet.

- 2026-10-07 05:33 UTC: Current primary citeproc source and installed API corroborate CSL bibliography array order/output; pure rehype fragment parsing/sanitization and semantic Markdown preserve browser/worker portability without new dependencies. Native generated-section design records unfinished-block, code, metadata, source-position, stale async result, reset, style and export boundaries before implementation. This is a specification checkpoint, not an implementation/pass claim.

- 2026-10-07 05:43 UTC: Multi-entry baseline exposed true registry loss in all four styles after 12 other bibliography tests passed; separate cluster task records primary API source and repair. First cluster/citation combined 51 units passed. Expanded Markdown first run 361 passed/2 API timeouts under concurrent build/browser; isolated rerun pending. TypeScript and build succeeded; actual production verification pending.

- 2026-10-07 05:53 UTC: Final engine units 364 passed in 12.45s; first production 6/6 in 42.4s. Later native entity/markup guards and pending/error export controls require rebuilt 8-case acceptance. Recognized shortcodes are inline literals in reference metadata; unsupported CSL small-cap/font/hanging-indent typography remains explicitly outside exact-layout claims. Original source unchanged.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.

- 2026-10-07 13:58:06 UTC: Final R51 runtime/tests and current records published through GitHub MCP as 46a147c11158796de59174a7d1a6236570cc544c; fetched tree equals locally tested 5d7d036. Full integration request 37632747834 is pending on that source. A record-only checkpoint will supersede this initial request before lengthy validation; inspect the latest fix/markdown-workbench integration run and its exact head SHA. Main remains 500adae; no R51 main/Pages/full success claim. All 28 focused production cases/370 units, TypeScript/build pass. Integration selects __FULL_SUITE__ for the shared recovery edit; no PR or separate duplicate full dispatch.

- 2026-10-07 14:19:40 UTC: Metadata first repair passed 384 Markdown/recovery units, TypeScript/build; final expanded metadata/native-line-ending tests are pending. Corrected unchanged production metadata fixture failed 2/2 due to the extra References entry.

- 2026-10-07 14:21:04 UTC: Expanded final Markdown/shared recovery units passed 391/391 (23.29s), TypeScript/build pass. Production 34-case R36/R38/R51 acceptance is running with one worker and no retries. No associated repair/full/main/Pages success claim yet.

- 2026-10-07 14:25:51 UTC: Final metadata-repaired R51 source passes 34/34 owned R36/R38/R51 production cases (4.2m), no retries/skips, and 391 units (23.29s), TypeScript/build. Real repair publication/fresh full/main/Pages pending.

- 2026-10-07 14:28:54 UTC: Metadata-repaired runtime/test checkpoint a924c377059efc0c879af613f2cf98652e8ffb41 published through GitHub MCP; fetched tree equals locally validated eb72999. Fresh full integration 37636989225 is pending on that exact source and supersedes older runtime run 37632859293. This immediate record-only checkpoint will supersede the initial fresh request before lengthy validation; inspect the latest integration run/head for final full results. Main remains 500adae; no repair main/Pages/full-success claim. Final local scope 391 units/34 production cases (4.2m), TypeScript/build passes, no retries/skips. Next: let fresh required full integration finish without further record-only pushes, retrieve exact official receipt, verify main tree/Pages/no PRs, then close R51 associated tasks/advance R55. R15 cause remains unresolved; task 12d4 supplies next-item official research/baselines.

- 2026-10-07 15:20:46 UTC: References runtime a924c377/checkpoint a3885a9 is integrated at main 230f637d3c60a31a45559aaa05bc41c1c05de582 (exact tree equality). Full integration 37637141396 succeeded at 15:19:16 UTC: 3896 unit passes/14 skips and 1711 browser passes/171 skips (46.5m), zero browser retries/flaky cases. Pages build/deploy jobs 112856996133/112857318705 succeeded in run 37640254171; deploy completed 14:52:34 UTC. Live deployed actual References export acceptance passed 2/2 desktop/touch (27.7s). Separate duplicate main/PR validate jobs may still be running; they are not needed to invent or replace this exact full receipt. Scoped task done; computed tool completion 79/92, still incomplete.
