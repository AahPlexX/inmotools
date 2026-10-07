---
task: T-markdown-html-task-import-20261007-c10a
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve leading HTML list task checkbox state

## Request

Associated R38 import-cycle defect: importing a native HTML task list must retain its leading list checkbox states as native Markdown task markers, so source, preview and task counts agree.

## Resume here

At 2026-10-07 05:37 UTC, official full 37572856847 completed successfully on runtime/tests 7025c67d: 3852 unit passes/14 skips; all 1697 executed browser cases passed, 171 skipped (50.3m), zero retries/flaky cases. R38/history/HTML task repairs are deployed at main 58be2be via integration 37572936067 and Pages 37573618697; scoped 228 owned browsers also passed without retries. Reproduce with pinned pnpm install --frozen-lockfile, pnpm build, pnpm test:unit and pnpm test:e2e; scoped tests/e2e/markdown-task-progress.spec.ts plus markdown-disclosures.spec.ts. Task done for this verified scope; parent cursor R51 remains active. The older R15 retry concern remains independently active and is not claimed repaired.

## Log

- 2026-10-07 04:38 UTC: Source inspection confirms converter uses the pinned Turndown library without a checkbox rule/plugin. Current installed rule lookup uses custom filters before the default rule; native HTML input type/checked semantics come from WHATWG. Actual first-import browser baseline remains pending; no speculative cause or passing claim.

- 2026-10-07 04:39 UTC: First R38 production run: 2 passed/4 failed (48.1s). Both responsive cases passed. Both HTML import cases confirmed checkbox state is lost (Tasks: none instead of 1/1). Both mixed keyboard Undo/Redo followed by document Undo cases confirmed a no-op snapshot: counts remained 3/3 instead of 2/3. Editor/history and converter runtime were unchanged from deployed main for these baselines. Preserve these failures; repair both associated interaction paths before verification.

- 2026-10-07 04:43 UTC: Associated repair passes expanded actual-cycle acceptance: all 20 R36+R38 production cases (1.2m), 343 Markdown units (9.64s), TypeScript and clean build (13.66s). No retries/skips. Latest runtime publication/full-site/main/Pages pending; task remains active.

- 2026-10-07 04:57 UTC: Latest repair integrated/deployed at main 58be2be: integration 37572936067 and Pages 37573618697 success. Official logs: 3852 unit passes/14 skips, 228 owned browsers passed (6.5m), no browser retries/skips. Fresh full 37572856847 still running; leave task active. Scoped R38 verified and cursor R51; tool incomplete.

- 2026-10-07 05:37 UTC: Downloaded official runtime full receipt 37572856847 confirms 3852 unit passes/14 skips and 1697 browser passes/171 skips (50.3m), zero retries/flakies. Latest associated repairs already integrated/deployed; scope complete. No claim to repair the older intermittent R15 failure.
