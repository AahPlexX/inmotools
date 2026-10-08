---
task: T-markdown-drafts-zip-flake-20261008-d7f3
tool: markdown-workbench
doc: task
kind: fix
state: backlog
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Investigate the drafts ZIP count that failed once on desktop and passed on retry

## Request

Find why the MDW-R71 draft list count assertion failed once in the official integration run and passed on retry, without weakening the expectation or its default timeout. Found while integrating MDW-R81; no R71 code or test changed for this observation.

## Resume here

Not started. Read the evidence below, reproduce with repeated runs of the single test on desktop Chromium (pnpm exec playwright test tests/e2e/markdown-drafts-zip.spec.ts --repeat-each=20 --workers=1), record the failing state, then fix the cause.

## Evidence and reproduction

[Official integration run 37794937029](https://github.com/AahPlexX/inmotools/actions/runs/37794937029), source a7e93467 (MDW-R81, which does not touch drafts or ZIP code). Desktop Chromium, tests/e2e/markdown-drafts-zip.spec.ts:16 "MDW-R71 three drafts export to a ZIP with three .md files and import back" failed on the first attempt at line 54, expect(list.locator("li")).toHaveCount(3) with a 5000 ms timeout, then passed on retry. The run concluded success with 426 browser passes. No local failure has been observed.

## Log

- 2026-10-08: recorded while integrating MDW-R81. Baseline not yet recorded.
