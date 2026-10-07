---
task: T-markdown-typewriter-centering-20261007-17bf
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Investigate intermittent typewriter caret centering

## Request

Associated bug investigation from the ordered tool audit: preserve MDW-R15 first/last caret centering through phone orientation changes and ordinary editing, without weakening its acceptance.

## Resume here

At 2026-10-07 05:10 UTC, the intermittent R15 mobile failure remains unresolved. Core full 37568220227 and prior repair full 37571121544 both failed once at the final-line caret assertion with exactly 2571.9765625px, then passed retry. Latest scoped R38 integration 37572936067 passed both R15 projects without retries; current app is deployed at main 58be2be, with record-only main 9a1e101. Earlier 40 focused/core/CI-profile/6x-throttled repeats passed. A source-driven preview scroll delivery-delay hypothesis did not reproduce on the unchanged R38 artifact: 3 ordinary delayed cases passed (34.6s); 2 strengthened cases waited for actual delayed handling and passed (16.4s), with source scrollTop 2731, previewTop 42, and 7/8 delivered callbacks. No scrolling implementation, tolerance or timeout changed. Next: inspect fresh full 37572856847, preserve any repeated failure, and capture cursor/scroller/viewport/focus geometry and source-preview event sequence from a failing case before applying a repair. Successful full workflows currently publish no failure artifacts, so console geometry or another portable evidence mechanism is needed for a retried failure. Parent ordered cursor R51; associated task remains active.

## Log

- 2026-10-07 04:28 UTC: Official core workflow receipt confirms the failure and successful retry. Outside-tool Photo crop mobile was the other flaky case; no outside-tool edits. Local clean source cc3cb0c is published, with integration 37571120162 and full validation 37571121544 running. No typewriter change yet.

- 2026-10-07 04:38 UTC: Retries-disabled repeats all passed: 12 current repair mobile (1.8m), 12 earlier core mobile (2.9m), 12 current exact iPhone 13 CI profile (2.8m), 4 current exact-profile 6x CPU-throttled cases (1.2m). All use unchanged immutable builds; no centering code or acceptance thresholds changed. The successful core full workflow has zero downloadable artifacts, so no original failing trace is available. The cause remains unestablished; preserve this open concern and inspect fresh full validation 37571121544 before closure. Reproduce the tracked case with pnpm build and pnpm exec playwright test tests/e2e/markdown-inventory.spec.ts --grep MDW-R15 --project mobile-chromium --repeat-each 12 --retries 0 --workers 1. Optional local JSON receipts are outside the repository and are not prerequisites for continuation.

- 2026-10-07 05:06 UTC: Official completed full 37571121544 on cc3cb0c: 3846 unit passes/14 skips, 1689 browser passes/2 flaky/171 skips (37.3m). R15 mobile again failed at line 271 with exactly 2571.9765625px, then retry passed. No original failure artifacts are published by a successful workflow. Current sync handler treats scroll events after its 700ms ignore window as preview-driven and reveals a source line without moving the caret; a delayed native-event probe is testing this specific path. MDN scroll/scrollTo/requestAnimationFrame references returned HTTP 200 at 05:06:29 UTC. Cause and repair are not established.

- 2026-10-07 05:10 UTC: Native preview-scroll diagnostic wrappers delayed only the registered preview scroll listener by 1000ms. Ordinary 3 repeats passed (34.6s). Strengthened 2 repeats waited for a delivered-callback counter increment after the handler and two animation frames, then measured caret; both passed (16.4s). Source scrollTop 2731, previewTop 42, callbacks 8/7. This probe does not establish the CI cause; do not apply the hypothesized target/timer fix without new failing evidence. All production scrolling code/assertion thresholds remain unchanged. Optional external probe artifacts are not required for continuation; its event-delivery mechanism and exact observed values are recorded here.
