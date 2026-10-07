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

At 2026-10-07 13:56 UTC, R51 final immutable production acceptance passed all 28 R36/R38/R51 cases (3.7m), desktop/touch, no retries or skips. All 370 Markdown/shared recovery units passed (19.75s), TypeScript and production build passed. Actual generated References are checked in preview, rendered Markdown/reimport, HTML/print, DOCX, EPUB and AST; source CRLF/literals/uncited entries, all four styles, stale/reset/pending/error cycles and 320/844/768 bounds are covered. Actual failed IEEE import retains source and recovers with another style; leaving Markdown restores shell reload recovery. Shared opt-in guard reason is recorded in T-markdown-preload-preservation-20261007-a67d. R51 is implemented, publication/integration/full/main/Pages pending; R55 next after those receipts. R15 cause remains unresolved; prior diagnostic full 37576166482 passed 3852 units/14 skips and 1697 browsers/171 skips without retries, not R51 validation. Next: publish this working source through GitHub MCP; integration automatically selects the full browser suite because src/lib/deployment-recovery.ts changed. Inspect exact integration/full logs, main tree and Pages before marking verified; no PR, no duplicate full dispatch needed if integration runs full.

## Log

- 2026-10-07 04:53 UTC: Reachable actual baseline source: # Fixture citations, prose See [@fixture], indented [@fixture], inline ``[@fixture] ` example``, and a four-backtick md fence containing a triple-backtick line followed by [@fixture]. Synthetic CSL-JSON entry id fixture/type book/title Synthetic bibliography fixture/author Test Fixture/year 2026. Preview code texts were (Fixture, 2026), (Fixture, 2026) ` example, and triple-backtick + (Fixture, 2026). Zero References headings despite a populated bibliography panel. The earlier exact-select-label locator timeout is excluded as setup evidence; corrected documented label selection produced this baseline. Optional local receipt citation-boundaries-baseline.json is not needed for reproduction.
- 2026-10-07 04:53 UTC: Official CSL specification source and CommonMark 0.31.2 retrieved HTTP 200 at 04:48:59–04:49:00 UTC. Hosted CSL and citeproc documentation returned HTTP 403, so no content from those blocked pages was used. Primary citeproc repository's historical attic manual retrieved HTTP 200 at 04:50:59 UTC; validate API details against installed citeproc 2.4.63 and current upstream implementation before using it. No dependency/runtime changes yet.

- 2026-10-07 05:33 UTC: Current primary citeproc source and installed API corroborate CSL bibliography array order/output; pure rehype fragment parsing/sanitization and semantic Markdown preserve browser/worker portability without new dependencies. Native generated-section design records unfinished-block, code, metadata, source-position, stale async result, reset, style and export boundaries before implementation. This is a specification checkpoint, not an implementation/pass claim.

- 2026-10-07 05:43 UTC: Multi-entry baseline exposed true registry loss in all four styles after 12 other bibliography tests passed; separate cluster task records primary API source and repair. First cluster/citation combined 51 units passed. Expanded Markdown first run 361 passed/2 API timeouts under concurrent build/browser; isolated rerun pending. TypeScript and build succeeded; actual production verification pending.

- 2026-10-07 05:53 UTC: Final engine units 364 passed in 12.45s; first production 6/6 in 42.4s. Later native entity/markup guards and pending/error export controls require rebuilt 8-case acceptance. Recognized shortcodes are inline literals in reference metadata; unsupported CSL small-cap/font/hanging-indent typography remains explicitly outside exact-layout claims. Original source unchanged.

- 2026-10-07 13:50:59 UTC: Shared opt-in guard implemented after confirmed listener-order failure; 370 units and TypeScript passed. Final production failure-cycle acceptance is pending; unpublished source, no R51 completion claim.

- 2026-10-07 13:56 UTC: Final shared-guard runtime passed 28/28 R36/R38/R51 production cases (3.7m), no retries/skips. 370 units, TypeScript/build pass; R51 implemented, exact integration/full/main/Pages pending.
