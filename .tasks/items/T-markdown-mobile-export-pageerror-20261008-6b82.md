---
task: T-markdown-mobile-export-pageerror-20261008-6b82
tool: markdown-workbench
doc: task
kind: fix
state: backlog
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Investigate a one-off page error on mobile during the Pandoc export browser test

## Request

Find the source of three page errors that failed the pageerror assertion once in a combined mobile run, without hiding them. Found while implementing MDW-R82.

## Resume here

Not started. The assertion now prints the page error messages, so the next occurrence names itself. Reproduce with: pnpm exec playwright test tests/e2e/markdown-pandoc-export.spec.ts tests/e2e/markdown-text-export.spec.ts --project=mobile-chromium --workers=1 --repeat-each=20 on a freshly built preview.

## Evidence and reproduction

2026-10-08, local Windows host: the first combined run of the two new export specs (right after a production build and the preview server starting) passed 7 of 8; mobile-chromium markdown-pandoc-export.spec.ts first test failed expect(errors).toEqual([]) with 3 extra entries (the messages were not printed). It did not reproduce in 3 repeat runs of that spec (6 tests) or in 24 further tests (6 repeats of both specs) on mobile. The failing run was the first load after the preview server started, so a transient first-load error is possible but unproven.

## Log

- 2026-10-08: recorded with the assertion improved to print messages. No product change.
