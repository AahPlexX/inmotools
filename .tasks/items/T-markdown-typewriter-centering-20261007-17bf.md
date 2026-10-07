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

At 2026-10-07 04:28 UTC, core full validation 37568220227 on b7dff7c succeeded with 1683 passes, 2 flaky cases and 171 skips. Its mobile MDW-R15 case failed once at tests/e2e/markdown-inventory.spec.ts:271 after End + newline/Last insertion: expected caret-center offset <24px; measured 2571.9765625px. Retry passed. No cause established. Core source did not include the later source-history repair. Inspect the existing animation-frame centering and resize path, refresh official CodeMirror scroll/measurement documentation, reproduce against immutable core/current artifacts with retries disabled, and record observations before changing runtime. Parent ordered cursor remains R36. Shared-path reason: tool-owned browser acceptance lives in tests/e2e; any change there requires full suite verification under governance.

## Log

- 2026-10-07 04:28 UTC: Official core workflow receipt confirms the failure and successful retry. Outside-tool Photo crop mobile was the other flaky case; no outside-tool edits. Local clean source cc3cb0c is published, with integration 37571120162 and full validation 37571121544 running. No typewriter change yet.
