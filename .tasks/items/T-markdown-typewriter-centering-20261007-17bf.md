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

At 2026-10-07 05:29 UTC, R15's intermittent broad-run failure remains unresolved. Core full 37568220227 and prior repair full 37571121544 both failed once at the final-line caret assertion with exactly 2571.9765625px, then passed retry. Earlier 40 focused/profile/throttled cases and 5 delayed-preview probes passed; the delayed-event hypothesis is unproven. Test-only failure diagnostics are now implemented locally in the existing R15 case: preserve the <24px/default-timeout assertion, log stage/project/cursor/scroller/content/preview/viewport/focus geometry, attach JSON and rethrow the original error. Both desktop/CI mobile acceptance cases passed (16.8s). A controlled external scrollTop=0 fault produced the geometry receipt and retained its expected assertion failure; this is logger verification, not a product baseline or cause. Published diagnostic source cc6580a60d07211f59bafbcb3a333d6e8663c29a at 05:24:42 UTC; integration 37576166438 and fresh full 37576166482 are active at 2026-10-07 05:29 UTC. Next: inspect exact canonical/main and full receipts; a retried failure now retains portable geometry in the official log, then diagnose from actual failing data. App scrolling code and thresholds are unchanged. Shared-path reason: owned test-only evidence lives in tests/e2e; full browser verification required. Current app runtime equals 7025c67d/deployed 58be2be, with record-only main 08f04ec. Parent cursor R51; task stays active.

## Log

- 2026-10-07 04:28 UTC: Official core workflow receipt confirms the failure and successful retry. Outside-tool Photo crop mobile was the other flaky case; no outside-tool edits. Local clean source cc3cb0c is published, with integration 37571120162 and full validation 37571121544 running. No typewriter change yet.

- 2026-10-07 04:38 UTC: Retries-disabled repeats all passed: 12 current repair mobile (1.8m), 12 earlier core mobile (2.9m), 12 current exact iPhone 13 CI profile (2.8m), 4 current exact-profile 6x CPU-throttled cases (1.2m). All use unchanged immutable builds; no centering code or acceptance thresholds changed. The successful core full workflow has zero downloadable artifacts, so no original failing trace is available. The cause remains unestablished; preserve this open concern and inspect fresh full validation 37571121544 before closure. Reproduce the tracked case with pnpm build and pnpm exec playwright test tests/e2e/markdown-inventory.spec.ts --grep MDW-R15 --project mobile-chromium --repeat-each 12 --retries 0 --workers 1. Optional local JSON receipts are outside the repository and are not prerequisites for continuation.

- 2026-10-07 05:06 UTC: Official completed full 37571121544 on cc3cb0c: 3846 unit passes/14 skips, 1689 browser passes/2 flaky/171 skips (37.3m). R15 mobile again failed at line 271 with exactly 2571.9765625px, then retry passed. No original failure artifacts are published by a successful workflow. Current sync handler treats scroll events after its 700ms ignore window as preview-driven and reveals a source line without moving the caret; a delayed native-event probe is testing this specific path. MDN scroll/scrollTo/requestAnimationFrame references returned HTTP 200 at 05:06:29 UTC. Cause and repair are not established.

- 2026-10-07 05:10 UTC: Native preview-scroll diagnostic wrappers delayed only the registered preview scroll listener by 1000ms. Ordinary 3 repeats passed (34.6s). Strengthened 2 repeats waited for a delivered-callback counter increment after the handler and two animation frames, then measured caret; both passed (16.4s). Source scrollTop 2731, previewTop 42, callbacks 8/7. This probe does not establish the CI cause; do not apply the hypothesized target/timer fix without new failing evidence. All production scrolling code/assertion thresholds remain unchanged. Optional external probe artifacts are not required for continuation; its event-delivery mechanism and exact observed values are recorded here.

- 2026-10-07 05:21 UTC: Test-only geometry receipt added to existing R15 assertions, without changing centering, timeout or threshold. Actual desktop/CI mobile R15 acceptance passed 2/2 (16.8s). Controlled external fault forced scroller scrollTop=0 during offset measurement; expected last-line failure logged structured geometry, attached JSON and preserved the original assertion. Exclude its earlier No tests found attempt (test/output directory collision) as harness setup, not product evidence. MDN getBoundingClientRect retrieved HTTP 200 at 05:17:44 UTC. Publish/dispatch fresh full validation for durable failing geometry; no scrolling repair claim.

- 2026-10-07 05:29 UTC: Test-only diagnostic source cc6580a published; integration 37576166438 and fresh full 37576166482 active. Application runtime is unchanged. Record-only main 08f04ec and Pages 37575162473 success; latest runtime full 37572856847 remains active.
