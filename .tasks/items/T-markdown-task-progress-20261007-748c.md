---
task: T-markdown-task-progress-20261007-748c
tool: markdown-workbench
doc: task
kind: expand
state: done
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Show native document task progress

## Request

Implement the next frozen ordered item MDW-R38: task progress (done of total) for the document, including associated safe interaction and responsive improvements.

## Resume here

At 2026-10-07 05:37 UTC, official full 37572856847 completed successfully on runtime/tests 7025c67d: 3852 unit passes/14 skips; all 1697 executed browser cases passed, 171 skipped (50.3m), zero retries/flaky cases. R38/history/HTML task repairs are deployed at main 58be2be via integration 37572936067 and Pages 37573618697; scoped 228 owned browsers also passed without retries. Reproduce with pinned pnpm install --frozen-lockfile, pnpm build, pnpm test:unit and pnpm test:e2e; scoped tests/e2e/markdown-task-progress.spec.ts plus markdown-disclosures.spec.ts. Task done for this verified scope; parent cursor R51 remains active. The older R15 retry concern remains independently active and is not claimed repaired.

## Log

- 2026-10-07 04:35 UTC: Primary GFM task-list spec, MDN progress reference and W3C WCAG status-message guidance refreshed HTTP 200 at 04:33:44–45 UTC. Existing workspace parses the source into a native tree at line 285 but renders only word/line/read-time and save/action status; no task progress exists. Tests will verify actual source/control cycles before any passing claim.

- 2026-10-07 04:38 UTC: Actual unchanged-build progress baseline failed for absent UI. Counter first run 4/6 passed; fixtures for an invalid spanning marker and rejected-wrapper body were incorrect. Corrected fixtures match native parse behavior; all 6 units passed (473ms). TypeScript and first build passed (14.29s). Production 6-case acceptance is running; no browser pass claim yet.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Final local R38/associated repairs passed all 343 Markdown units (9.64s), TypeScript, clean production build (13.66s), and 20/20 combined R36+R38 production cases (1.2m) without retries/skips. Actual cycles cover closed quoted tasks, native progress attributes, keyboard Undo/Redo followed by toolbar Undo/Redo, worker format, CRLF Markdown download, direct/paragraph/nested/closed HTML tasks, boolean checked presence, non-task form controls, escaped labels, New/document replacement and 320/844/768 layouts with no status or progress overlap. No centering code changed. Next: publish, fresh full validation, main/Pages receipts; no latest release/full-pass claim.

- 2026-10-07 04:44 UTC: R38 final runtime/tests published as 7025c67d17b3bd1dadcd30191bc6bc76b2c68c1d, fetched and tree-compared equal. Integration 37572819658 running; fresh full validation 37572856847 queued on that revision. Zero open PRs. A record-only push can supersede integration; full runtime remains identical. No R38 main/deployment/full-pass claim yet.

- 2026-10-07 04:57 UTC: Latest repair integrated/deployed at main 58be2be: integration 37572936067 and Pages 37573618697 success. Official logs: 3852 unit passes/14 skips, 228 owned browsers passed (6.5m), no browser retries/skips. Fresh full 37572856847 still running; leave task active. Scoped R38 verified and cursor R51; tool incomplete.

- 2026-10-07 05:37 UTC: Downloaded official runtime full receipt 37572856847 confirms 3852 unit passes/14 skips and 1697 browser passes/171 skips (50.3m), zero retries/flakies. Latest associated repairs already integrated/deployed; scope complete. No claim to repair the older intermittent R15 failure.
