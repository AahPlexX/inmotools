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

Latest associated repair is published in 7025c67d17b3bd1dadcd30191bc6bc76b2c68c1d, tree-equal to validated source (343 Markdown units, TypeScript/build, 20 combined desktop/touch production cases passed without retries/skips). At 2026-10-07 04:44 UTC, integration 37572819658 is running and fresh full-site validation 37572856847 is queued; record-only pushes may supersede integration. Inspect latest main/Pages/official full receipts before closing this task. Earlier full 37571121544 validates the older runtime only. Parent cursor R38; no latest release/full-pass claim.

## Log

- 2026-10-07 04:38 UTC: Source inspection confirms converter uses the pinned Turndown library without a checkbox rule/plugin. Current installed rule lookup uses custom filters before the default rule; native HTML input type/checked semantics come from WHATWG. Actual first-import browser baseline remains pending; no speculative cause or passing claim.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Associated repair passes expanded actual-cycle acceptance: all 20 R36+R38 production cases (1.2m), 343 Markdown units (9.64s), TypeScript and clean build (13.66s). No retries/skips. Latest runtime publication/full-site/main/Pages pending; task remains active.
