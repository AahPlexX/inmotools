---
task: T-markdown-mobile-export-pageerror-20261008-6b82
tool: markdown-workbench
doc: task
kind: fix
state: backlog
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-09
---

# Investigate a one-off page error on mobile during the Pandoc export browser test

## Request

Find the source of three page errors that failed the pageerror assertion once in a combined mobile run, without hiding them. Found while implementing MDW-R82.

## Resume here

2026-10-09 14:29 UTC: backlog; original three pageerrors and earlier local startup timeout still lack established causes. R94 full37856784792 on ed970297 passed1799 browsers/171 skips without retry: non-reproduction only. Current R95 runtime6875774/main15bdec65 separately produced a live post-deploy startup timeout with preserved network trace: new entry index-Dm5-ig-7.js returnedHTTP404 after Pages37943298127 deploy completed14:21:58. The exact URL returnedHTTP200 at14:25:16, byte-matched the immutable artifact at14:26, and live6/6 passed after availability changed. Distinct live transition evidence, not a cause/fix for this task's original local failures. Unique external r95-deployed-live-browser.json/log/results preserve the new startup trace; r95-postdeploy-asset-probe.json and r95-candidate-availability-proof.json preserve the later availability/source proof. Keep all original assertions; no failure-hiding or repeated unchanged stress run is justified.


2026-10-08 21:29:32 UTC: additional official full validation 37840159373 on d9ac316 succeeded: 4039 units/15 skips and 1788 browser passes/171 skips/one unrelated Photo image.decode retry. Original Markdown centering and export cases passed both profiles without retry. This is non-reproduction, not a root-cause fix; retain this task and its original expectation/artifact limitations. Latest deployed runtime/test tree matches main 57293d5.

2026-10-08 20:37:41 UTC: original three-pageerror failure remains unexplained. Current published citation/keyboard runtime d9ac316: retries-disabled 20-repeat mobile run of Pandoc/TXT export specs finished 79 passes / one failure (308.6s). None of the 20 first Pandoc cases reproduced its pageerror assertion. The separate failure was repeat 15 of the second Pandoc case, before editing/export: Markdown source textbox was not found within its existing 5-second startup assertion. Do not conflate this with the original three pageerrors or claim a product repair. The written log/JSON preserve the exact failure; the trace/screenshot were overwritten when the following R15 run reused its output directory, so startup DOM/network evidence is unavailable. Future execution runs now use separate output directories. Subsequent isolated startup repeats passed 40/40 (2.8m), without an established cause. Keep original assertions and diagnostic pageerror messages; additional replay requires a concrete new hypothesis or changed source/evidence. Preserve each future failure's trace in its own output directory before running another check.

## Evidence and reproduction

2026-10-08, local Windows host: the first combined run of the two new export specs (right after a production build and the preview server starting) passed 7 of 8; mobile-chromium markdown-pandoc-export.spec.ts first test failed expect(errors).toEqual([]) with 3 extra entries (the messages were not printed). It did not reproduce in 3 repeat runs of that spec (6 tests) or in 24 further tests (6 repeats of both specs) on mobile. The failing run was the first load after the preview server started, so a transient first-load error is possible but unproven.

## Log

- 2026-10-08: recorded with the assertion improved to print messages. No product change.

- 2026-10-08: current runtime 20-repeat mobile run: 79/80 passed, zero retries/skips; first Pandoc pageerror case passed all 20 repeats. One distinct startup editor-visibility timeout; no established cause or runtime fix. Failure artifacts were overwritten by a later run; log/JSON remain and future output directories are isolated.

- 2026-10-09: recorded separate live deployment-entry404→200 observation and available-release6/6 success without attributing it to the original pageerror or local-startup failures. No product repair; backlog retained.
