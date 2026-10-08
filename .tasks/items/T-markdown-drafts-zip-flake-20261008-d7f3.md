---
task: T-markdown-drafts-zip-flake-20261008-d7f3
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Stop a stale autosave from re-saving a deleted draft

## Request

Find why the MDW-R71 draft list count assertion failed in the official integration runs (once and passed on retry in run 37794937029; on every attempt in run 37799815383, which blocked the R82 integration), without weakening the expectation or its default timeout.

## Resume here

Done. The cause was a product defect, fixed in MarkdownWorkspace.tsx and covered by a new e2e test. Nothing remains open for this task.

## Evidence and reproduction

- Official failing run 37799815383, artifact integrate-failure-37799815383-1 (error-context.md of the failing test): the page showed Local drafts and storage (4) with drafts Gamma, Gamma, Beta, Alpha, the status Saved in the same second as the others, and an open document Gamma. Expected 3, received 4 at tests/e2e/markdown-drafts-zip.spec.ts line 54.
- Cause: editing and renaming the open document schedules an autosave after 1200 ms. Pressing Save draft did not cancel that timer, and its callback never re-checked whether the document still needed saving. When the draft was deleted before the timer fired, the timer saved the open document again as a new draft. A runner fast enough to delete inside the 1.2 s window shows the duplicate; this host usually finished the test first (20 of 20 passes alone, 8 of 8 with 6x CPU throttling, and 6 of 32 failures under 6 parallel workers were 30 s timeouts of a different kind).
- Baseline before the fix: the new test "MDW-R71 deleting the open document's draft is not undone by an autosave that was already pending" failed 6 of 6 (3 repeats on desktop and mobile) at its second "No local drafts saved yet." assertion.
- Fix: the autosave timer callback now compares the current source and document name with what was last saved and returns without saving when they match.
- After the fix: markdown-drafts-zip.spec.ts 18 passed (3 repeats, desktop and mobile, no retries); snapshots, tabs, unload, workbench, workbench-ux, pandoc-export and text-export specs 162 passed; TypeScript clean.

## Log

- 2026-10-08: recorded while integrating MDW-R81 (backlog). 2026-10-08: root cause found from the CI artifact while integrating MDW-R82, regression test written first, fixed, closed.
