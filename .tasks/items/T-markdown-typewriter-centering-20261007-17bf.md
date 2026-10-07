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

Open owned retry concern from core full run 37568220227: mobile R15 last-line caret offset was 2571.9765625px, then retry passed. At 2026-10-07 04:38 UTC, 40 retries-disabled local repeats passed across core/current mobile, exact CI profile and 6x CPU throttling. Cause remains unestablished; no centering implementation or tolerance/timeout was changed. The successful core run has zero downloadable artifacts, so its failing trace is unavailable. Inspect fresh full run 37571121544 and preserve the open concern if it cannot be reproduced. Parent cursor is R38; associated task remains active. Reproduction command and dated official reference are in the log.

## Log

- 2026-10-07 04:28 UTC: Official core workflow receipt confirms the failure and successful retry. Outside-tool Photo crop mobile was the other flaky case; no outside-tool edits. Local clean source cc3cb0c is published, with integration 37571120162 and full validation 37571121544 running. No typewriter change yet.

- 2026-10-07 04:38 UTC: Retries-disabled repeats all passed: 12 current repair mobile (1.8m), 12 earlier core mobile (2.9m), 12 current exact iPhone 13 CI profile (2.8m), 4 current exact-profile 6x CPU-throttled cases (1.2m). All use unchanged immutable builds; no centering code or acceptance thresholds changed. The successful core full workflow has zero downloadable artifacts, so no original failing trace is available. The cause remains unestablished; preserve this open concern and inspect fresh full validation 37571121544 before closure. Reproduce the tracked case with pnpm build and pnpm exec playwright test tests/e2e/markdown-inventory.spec.ts --grep MDW-R15 --project mobile-chromium --repeat-each 12 --retries 0 --workers 1. Optional local JSON receipts are outside the repository and are not prerequisites for continuation.
