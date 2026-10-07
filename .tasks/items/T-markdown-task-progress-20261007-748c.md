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

Current ordered item: MDW-R38 task progress. Local R38 runtime and associated leading-HTML-task/mixed-history repairs passed all 343 Markdown units (9.64s), TypeScript, clean build (13.66s), and all 20 production desktop/touch R36+R38 cases (1.2m), without retries/skips. First R38 production was 2 passed/4 failed; both confirmed defects are now repaired and covered by the expanded actual cycle. Next: publish this validated runtime/evidence through GitHub MCP, dispatch fresh full-site validation for its changed editor/import/UI, inspect main integration/Pages/official receipts, then verify R38 and advance to R51. R36 repair is deployed at main 8cc619f; current upstream record-only main is 726c04c. Earlier full validation 37571121544 on cc3cb0c remains in progress and does not validate latest mixed-history/HTML-task changes. Associated tasks stay active until fresh full/main/Pages evidence. R15 concern remains open after 40 retries-disabled repeats passed; cause unestablished, no centering/tolerance change. No PRs; no auth/backend/server database. Tool remains incomplete.

## Log

- 2026-10-07 04:35 UTC: Primary GFM task-list spec, MDN progress reference and W3C WCAG status-message guidance refreshed HTTP 200 at 04:33:44–45 UTC. Existing workspace parses the source into a native tree at line 285 but renders only word/line/read-time and save/action status; no task progress exists. Tests will verify actual source/control cycles before any passing claim.

- 2026-10-07 04:38 UTC: Actual unchanged-build progress baseline failed for absent UI. Counter first run 4/6 passed; fixtures for an invalid spanning marker and rejected-wrapper body were incorrect. Corrected fixtures match native parse behavior; all 6 units passed (473ms). TypeScript and first build passed (14.29s). Production 6-case acceptance is running; no browser pass claim yet.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Final local R38/associated repairs passed all 343 Markdown units (9.64s), TypeScript, clean production build (13.66s), and 20/20 combined R36+R38 production cases (1.2m) without retries/skips. Actual cycles cover closed quoted tasks, native progress attributes, keyboard Undo/Redo followed by toolbar Undo/Redo, worker format, CRLF Markdown download, direct/paragraph/nested/closed HTML tasks, boolean checked presence, non-task form controls, escaped labels, New/document replacement and 320/844/768 layouts with no status or progress overlap. No centering code changed. Next: publish, fresh full validation, main/Pages receipts; no latest release/full-pass claim.
