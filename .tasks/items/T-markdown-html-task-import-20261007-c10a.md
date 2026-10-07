---
task: T-markdown-html-task-import-20261007-c10a
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve leading HTML list task checkbox state

## Request

Associated R38 import-cycle defect: importing a native HTML task list must retain its leading list checkbox states as native Markdown task markers, so source, preview and task counts agree.

## Resume here

Latest runtime is scoped-verified and deployed at main 58be2be9e46203b87e416699e1a7e038c9dbc7fd, equal to published runtime/tests 7025c67d. Integration 37572936067 and Pages 37573618697 succeeded; official receipt: 3852 unit passes/14 skips, 228 owned browser passes (6.5m), no browser retries/skips. Local 343 units, TypeScript/build and 20 combined production cases passed. At 2026-10-07 04:57 UTC, fresh full-site validation 37572856847 on 7025c67d remains in progress; earlier 37571121544 covers older runtime. Inspect latest full receipt and any owned failures, then close this task with its exact source/main receipts and computed tool-check result. Parent ordered cursor is R51. Task remains active until full-site evidence; no full-pass claim.

## Log

- 2026-10-07 04:38 UTC: Source inspection confirms converter uses the pinned Turndown library without a checkbox rule/plugin. Current installed rule lookup uses custom filters before the default rule; native HTML input type/checked semantics come from WHATWG. Actual first-import browser baseline remains pending; no speculative cause or passing claim.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Associated repair passes expanded actual-cycle acceptance: all 20 R36+R38 production cases (1.2m), 343 Markdown units (9.64s), TypeScript and clean build (13.66s). No retries/skips. Latest runtime publication/full-site/main/Pages pending; task remains active.

- 2026-10-07 04:57 UTC: Latest repair integrated/deployed at main 58be2be: integration 37572936067 and Pages 37573618697 success. Official logs: 3852 unit passes/14 skips, 228 owned browsers passed (6.5m), no browser retries/skips. Fresh full 37572856847 still running; leave task active. Scoped R38 verified and cursor R51; tool incomplete.
