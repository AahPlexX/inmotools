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

Latest associated repair passed local scoped acceptance with R38 at 2026-10-07 04:43 UTC: all 343 Markdown units, TypeScript/build and 20 combined production desktop/touch cases, without retries/skips. The first R38 run confirmed the defect on unchanged deployed code; expanded real interaction acceptance now passes. Publish the current validated runtime, dispatch fresh full-site validation, inspect main/Pages/official receipts, then close this task. Existing full run 37571121544 covers the earlier runtime only and cannot validate this later change. Parent cursor R38; no latest release/full-pass claim.

## Log

- 2026-10-07 04:38 UTC: Source inspection confirms converter uses the pinned Turndown library without a checkbox rule/plugin. Current installed rule lookup uses custom filters before the default rule; native HTML input type/checked semantics come from WHATWG. Actual first-import browser baseline remains pending; no speculative cause or passing claim.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Associated repair passes expanded actual-cycle acceptance: all 20 R36+R38 production cases (1.2m), 343 Markdown units (9.64s), TypeScript and clean build (13.66s). No retries/skips. Latest runtime publication/full-site/main/Pages pending; task remains active.
