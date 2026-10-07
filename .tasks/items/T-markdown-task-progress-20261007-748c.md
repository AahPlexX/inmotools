---
task: T-markdown-task-progress-20261007-748c
tool: markdown-workbench
doc: task
kind: expand
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Show native document task progress

## Request

Implement the next frozen ordered item MDW-R38: task progress (done of total) for the document, including associated safe interaction and responsive improvements.

## Resume here

Latest runtime is scoped-verified and deployed at main 58be2be9e46203b87e416699e1a7e038c9dbc7fd, equal to published runtime/tests 7025c67d. Integration 37572936067 and Pages 37573618697 succeeded; official receipt: 3852 unit passes/14 skips, 228 owned browser passes (6.5m), no browser retries/skips. Local 343 units, TypeScript/build and 20 combined production cases passed. At 2026-10-07 04:57 UTC, fresh full-site validation 37572856847 on 7025c67d remains in progress; earlier 37571121544 succeeded on older runtime with 1689 passes/2 flaky/171 skips (37.3m). Its R15 mobile case repeated the same 2571.9765625px failure, then passed retry. Inspect latest full receipt and any owned failures, then close this task with its exact source/main receipts and computed tool-check result. Parent ordered cursor is R51. Task remains active until full-site evidence; no full-pass claim.

## Log

- 2026-10-07 04:35 UTC: Primary GFM task-list spec, MDN progress reference and W3C WCAG status-message guidance refreshed HTTP 200 at 04:33:44–45 UTC. Existing workspace parses the source into a native tree at line 285 but renders only word/line/read-time and save/action status; no task progress exists. Tests will verify actual source/control cycles before any passing claim.

- 2026-10-07 04:38 UTC: Actual unchanged-build progress baseline failed for absent UI. Counter first run 4/6 passed; fixtures for an invalid spanning marker and rejected-wrapper body were incorrect. Corrected fixtures match native parse behavior; all 6 units passed (473ms). TypeScript and first build passed (14.29s). Production 6-case acceptance is running; no browser pass claim yet.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Final local R38/associated repairs passed all 343 Markdown units (9.64s), TypeScript, clean production build (13.66s), and 20/20 combined R36+R38 production cases (1.2m) without retries/skips. Actual cycles cover closed quoted tasks, native progress attributes, keyboard Undo/Redo followed by toolbar Undo/Redo, worker format, CRLF Markdown download, direct/paragraph/nested/closed HTML tasks, boolean checked presence, non-task form controls, escaped labels, New/document replacement and 320/844/768 layouts with no status or progress overlap. No centering code changed. Next: publish, fresh full validation, main/Pages receipts; no latest release/full-pass claim.

- 2026-10-07 04:44 UTC: R38 final runtime/tests published as 7025c67d17b3bd1dadcd30191bc6bc76b2c68c1d, fetched and tree-compared equal. Integration 37572819658 running; fresh full validation 37572856847 queued on that revision. Zero open PRs. A record-only push can supersede integration; full runtime remains identical. No R38 main/deployment/full-pass claim yet.

- 2026-10-07 04:57 UTC: Latest repair integrated/deployed at main 58be2be: integration 37572936067 and Pages 37573618697 success. Official logs: 3852 unit passes/14 skips, 228 owned browsers passed (6.5m), no browser retries/skips. Fresh full 37572856847 still running; leave task active. Scoped R38 verified and cursor R51; tool incomplete.
