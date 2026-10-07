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

Current ordered item: MDW-R38 task progress. Validated runtime/tests published through GitHub MCP as 7025c67d17b3bd1dadcd30191bc6bc76b2c68c1d, fetched and tree-compared equal to local source. Local acceptance: 343 Markdown units (9.64s), TypeScript/build (13.66s), 20 R36+R38 desktop/touch production cases (1.2m), no retries/skips. At 2026-10-07 04:44 UTC, integration 37572819658 is running and fresh full-site validation 37572856847 is queued on 7025c67d; record-only pushes may supersede integration, so inspect latest run. This full run validates latest editor/import changes; earlier full 37571121544 on cc3cb0c is still running and does not. Next: inspect main integration/Pages/official receipts; verify R38 and advance to R51 after scoped release. Associated tasks remain active until full/main/Pages evidence. R15 concern remains open after 40 retries-disabled repeats passed; cause unestablished, no centering/tolerance change. Main last observed 726c04c contains the earlier repaired runtime plus current handoff, not R38. Zero open PRs through GitHub MCP at 04:44 UTC. Tool remains incomplete; no auth/backend/server database.

## Log

- 2026-10-07 04:35 UTC: Primary GFM task-list spec, MDN progress reference and W3C WCAG status-message guidance refreshed HTTP 200 at 04:33:44–45 UTC. Existing workspace parses the source into a native tree at line 285 but renders only word/line/read-time and save/action status; no task progress exists. Tests will verify actual source/control cycles before any passing claim.

- 2026-10-07 04:38 UTC: Actual unchanged-build progress baseline failed for absent UI. Counter first run 4/6 passed; fixtures for an invalid spanning marker and rejected-wrapper body were incorrect. Corrected fixtures match native parse behavior; all 6 units passed (473ms). TypeScript and first build passed (14.29s). Production 6-case acceptance is running; no browser pass claim yet.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Final local R38/associated repairs passed all 343 Markdown units (9.64s), TypeScript, clean production build (13.66s), and 20/20 combined R36+R38 production cases (1.2m) without retries/skips. Actual cycles cover closed quoted tasks, native progress attributes, keyboard Undo/Redo followed by toolbar Undo/Redo, worker format, CRLF Markdown download, direct/paragraph/nested/closed HTML tasks, boolean checked presence, non-task form controls, escaped labels, New/document replacement and 320/844/768 layouts with no status or progress overlap. No centering code changed. Next: publish, fresh full validation, main/Pages receipts; no latest release/full-pass claim.

- 2026-10-07 04:44 UTC: R38 final runtime/tests published as 7025c67d17b3bd1dadcd30191bc6bc76b2c68c1d, fetched and tree-compared equal. Integration 37572819658 running; fresh full validation 37572856847 queued on that revision. Zero open PRs. A record-only push can supersede integration; full runtime remains identical. No R38 main/deployment/full-pass claim yet.
