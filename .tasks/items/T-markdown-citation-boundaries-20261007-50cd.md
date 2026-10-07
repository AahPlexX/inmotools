---
task: T-markdown-citation-boundaries-20261007-50cd
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve citation code boundaries while generating References

## Request

Associated bug discovered while researching the next ordered requirement MDW-R51: citation processing must preserve native code literals and append only document citations to a generated References section, without changing original source.

## Resume here

At 2026-10-07 14:25:51 UTC, final R51 metadata-repaired runtime passed all 34 R36/R38/R51 production cases (4.2m), desktop/touch, no retries or skips; all 391 Markdown/shared recovery units passed (23.29s), TypeScript/build passed. The strengthened export fixture and YAML/TOML/JSON × LF/CRLF/CR browser cycles exclude metadata/uncited keys and preserve exact original download bytes. Native metadata payload parsing and original body slicing handle mixed line endings and braces/escaped quotes in JSON strings. Earlier baseline failed 8 units/49 passes and both actual export cases, recorded in task 291b. R51 is implemented, associated tasks stay active until fresh full/main/Pages receipts. Published 46a147c + record 8bbca5f/full 37632859293 validate only prior runtime; publish this real repair now, superseding that run with required fresh full integration. Shared recovery guard reason remains in task a67d. Next: publish through GitHub MCP, inspect latest exact integration head/full receipt, verify main tree and Pages, then mark R51 verified and advance to R55. R55 preparatory task 12d4 has current official sources and reproducible metrics baselines, no runtime change. R15 cause unresolved.

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
