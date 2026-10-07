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

At 2026-10-07 13:54:07 UTC, diagnostic full 37576166482 on cc6580a completed successfully at 06:16:48 UTC. Official 2_validate.txt receipt: 3852 unit passes/14 skips and 1697 browser passes/171 skips (50.3m), zero flaky/retry cases and no failing geometry. Main 500adae and Pages 37577316388 contain these test-only diagnostics; runtime scrolling, <24px assertion and default timeout are unchanged. Earlier full 37568220227 and 37571121544 each failed at 2571.9765625px then passed retry. Cause remains unestablished; keep this task active. New R51 source requires its own full validation; inspect exact fresh logs for any future original failure, without treating later passes as a repair attribution.

## Log

- 2026-10-07 04:28 UTC: Official core workflow receipt confirms the failure and successful retry. Outside-tool Photo crop mobile was the other flaky case; no outside-tool edits. Local clean source cc3cb0c is published, with integration 37571120162 and full validation 37571121544 running. No typewriter change yet.

- 2026-10-07 04:38 UTC: Retries-disabled repeats all passed: 12 current repair mobile (1.8m), 12 earlier core mobile (2.9m), 12 current exact iPhone 13 CI profile (2.8m), 4 current exact-profile 6x CPU-throttled cases (1.2m). All use unchanged immutable builds; no centering code or acceptance thresholds changed. The successful core full workflow has zero downloadable artifacts, so no original failing trace is available. The cause remains unestablished; preserve this open concern and inspect fresh full validation 37571121544 before closure. Reproduce the tracked case with pnpm build and pnpm exec playwright test tests/e2e/markdown-inventory.spec.ts --grep MDW-R15 --project mobile-chromium --repeat-each 12 --retries 0 --workers 1. Optional local JSON receipts are outside the repository and are not prerequisites for continuation.

- 2026-10-07 05:06 UTC: Official completed full 37571121544 on cc3cb0c: 3846 unit passes/14 skips, 1689 browser passes/2 flaky/171 skips (37.3m). R15 mobile again failed at line 271 with exactly 2571.9765625px, then retry passed. No original failure artifacts are published by a successful workflow. Current sync handler treats scroll events after its 700ms ignore window as preview-driven and reveals a source line without moving the caret; a delayed native-event probe is testing this specific path. MDN scroll/scrollTo/requestAnimationFrame references returned HTTP 200 at 05:06:29 UTC. Cause and repair are not established.

- 2026-10-07 05:10 UTC: Native preview-scroll diagnostic wrappers delayed only the registered preview scroll listener by 1000ms. Ordinary 3 repeats passed (34.6s). Strengthened 2 repeats waited for a delivered-callback counter increment after the handler and two animation frames, then measured caret; both passed (16.4s). Source scrollTop 2731, previewTop 42, callbacks 8/7. This probe does not establish the CI cause; do not apply the hypothesized target/timer fix without new failing evidence. All production scrolling code/assertion thresholds remain unchanged. Optional external probe artifacts are not required for continuation; its event-delivery mechanism and exact observed values are recorded here.

- 2026-10-07 05:21 UTC: Test-only geometry receipt added to existing R15 assertions, without changing centering, timeout or threshold. Actual desktop/CI mobile R15 acceptance passed 2/2 (16.8s). Controlled external fault forced scroller scrollTop=0 during offset measurement; expected last-line failure logged structured geometry, attached JSON and preserved the original assertion. Exclude its earlier No tests found attempt (test/output directory collision) as harness setup, not product evidence. MDN getBoundingClientRect retrieved HTTP 200 at 05:17:44 UTC. Publish/dispatch fresh full validation for durable failing geometry; no scrolling repair claim.

- 2026-10-07 05:29 UTC: Test-only diagnostic source cc6580a published; integration 37576166438 and fresh full 37576166482 active. Application runtime is unchanged. Record-only main 08f04ec and Pages 37575162473 success; latest runtime full 37572856847 remains active.

- 2026-10-07 05:53 UTC: Diagnostic+record integration 37576583682 succeeded as main 500adae. Later R38 runtime full 37572856847 passed 1697 browsers/171 skips with no retries; earlier R15 cause still unestablished. Diagnostic full 37576166482 remains active. No scrolling/threshold/timeout change.

- 2026-10-07 13:54:07 UTC: Retrieved official diagnostic full receipt: 3852 units/14 skips; 1697 browsers/171 skips (50.3m), zero retries. No failing diagnostic geometry and no cause/repair claim.

- 2026-10-07 15:20:46 UTC: Full References integration 37637141396 passed 1711 browser cases/171 skips (46.5m), zero retry markers/flaky summaries and no original 2571.9765625px failure marker. Desktop/mobile R15 both passed. This is fresh non-reproduction evidence, not a cause or runtime fix attribution; keep active.

- 2026-10-07 15:44:07 UTC: Duplicate R51 main full 37640254171 completed with one Crystal scalar-field retry and 1710 passes/171 skips; no R15 failure captured. Metadata owned 37643618750 passed 246 browsers without retries; fresh full 37643618281 remains pending. Source centering/tolerance/timeout unchanged; no cause or repair attribution.
