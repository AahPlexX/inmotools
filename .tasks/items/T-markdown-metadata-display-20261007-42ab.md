---
task: T-markdown-metadata-display-20261007-42ab
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve the workspace when YAML metadata contains cycles

## Request

Associated MDW-R39 metadata display defect: valid circular YAML aliases must not blank the app or destroy mounted editor state. Keep raw Markdown unchanged; display readable values and explicit circular references. Non-finite YAML numeric values must not be presented as null.

## Resume here

2026-10-07 15:44:07 UTC: Metadata cycle/display repair is integrated and deployed at main d424ad345a1d8f15863a636accae66f70fbaafa0, tree-identical to tested checkpoint 6b1f5f1/runtime d1edf246. Integration 37643618750 passed 3908 units/14 skips and 246 owned browsers (7.3m), no browser retries/skips; Pages 37645772950 succeeded. Live deployed cycle/lifecycle/viewport acceptance passed 4/4 (29.3s). Local scope 403 units/38 production cases, TypeScript/build passed. Fresh full-site validation 37643618281 remains in progress on exact 6b1f5f1; unit/build steps passed and browsers are running. Do not cancel that full run. Task 42ab stays active until its required full receipt; no full-success claim for this repair yet. This record checkpoint changes documentation only; runtime/tests remain equal to 6b1f5f1. Verify the latest record integration on main, then inspect/record full 37643618281 before closing 42ab and implementing next frozen R55 (task 12d4, no implementation). References R51 scoped verified with full 37637141396 (3896 units/14 skips, 1711 browsers/171 skips, zero retries) and live exports/Pages. Duplicate R51 main full 37640254171 passed 1710 browsers plus one retried Crystal scalar-field case/171 skips (43.5m); unattributed concern is backlog c492, no source changes/repair claim for Crystal. R15 cause remains unresolved; citation annotation loss backlog d713. Tool/inventory incomplete.

## Defaults specified before implementation

Use the existing compact JSON representation for ordinary objects/arrays, plain text for string fields, and the original primitive text for non-finite numbers. Replace only actual ancestor-cycle edges in this display with [Circular reference]; repeated shared objects in separate branches remain displayed normally. This representation is an inspection aid, not a serialized export or source mutation. If a value cannot be safely displayed, show an explicit see-source message and keep the tool usable. Metadata hints explain cycle markers. React renders values as text, never raw HTML. No dependency, backend or shared-runtime change is necessary. Keep labels/values within phone portrait/landscape/tablet bounds and test continued editor interaction, ordinary replacement/reset and original Markdown download. The full-browser reason for external acceptance tests is this owned source/display failure-cycle evidence.

## Primary source

[MDN TypeError: cyclic object value](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value), live HTTP 200 at 14:51:25 UTC; [MDN JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) documents circular-reference exceptions. The example explicitly notes its circular replacement changes the serialized representation; this tool uses markers only in read-only display and preserves source/download bytes. The current Workspace metadata map directly calls JSON.stringify(value) during render, so the exception escapes before the panel is opened. A first browser probe used a main locator after the root blanked and timed out; corrected body-level capture confirms the actual error and empty body on both immutable baselines. No baseline is attributed to R51.

## Log

- 2026-10-07 14:52:19 UTC: Current and unchanged production baselines both blank the root with the same cycle error; native parser/non-finite serialization measured. Repair defaults recorded before implementation. Current References full integration is allowed to finish without cancellation.

- 2026-10-07 14:55:29 UTC: Display/frontmatter focused units 32/32 passed, TypeScript/build passed. Actual candidate browser acceptance is running; helper remains local/unpublished and prior R51 full validates only a3885a9.

- 2026-10-07 14:59:44 UTC: Candidate four-case browser run failed 4/4: both cycle cases reached visible metadata, original Windows download and continued editing, then used a nonexistent Undo label; the actual control is Undo document step. Both long-key cases confirmed horizontal overflow from unbroken dt text. Test locator is corrected without changing timing/acceptance; owned metrics-label overflow-wrap:anywhere added after live primary MDN review. Final rebuilt acceptance pending, no browser pass claim.

- 2026-10-07 15:05:45 UTC: Final cycle-display browser acceptance 4/4 passed (23.3s), no retries/skips; all Markdown/shared-recovery units 403/403 passed (19.37s), TypeScript/clean build passed. Combined 38-case regression running. Runtime remains local; existing published References full integration is not interrupted or attributed to this repair.

- 2026-10-07 15:11:18 UTC: First combined final-build acceptance passed 38/38 (3.1m), no retries/skips. Extended cycle acceptance now verifies AST download, local save/New/restore with original CRLF bytes, and ordinary metadata replacement; fresh 38-case lifecycle run is in progress on unchanged production runtime. No final expanded acceptance claim yet.

- 2026-10-07 15:14:43 UTC: Final expanded production acceptance passed 38/38 (3.5m), no retries/skips; 403 units, TypeScript and clean build pass. Exact owned runtime 9527486; expanded tests 21801ce. Checks include AST, local save/New/restore with exact original CRLF download and ordinary metadata replacement. Required publication/new full/main/Pages still pending; existing References full is not interrupted.

- 2026-10-07 15:23:20 UTC: Metadata source/tests d1edf246 published through GitHub MCP and fetched tree-compared equal to local validated source. Initial owned integration 37643416284 is running; immediate record-only checkpoint supersedes it before lengthy checks. Dispatch new full on exact checkpoint, then leave required runs uninterrupted. No new main/Pages/full-pass claim.

- 2026-10-07 15:27:53 UTC: Published checkpoint 6b1f5f1 tree-equal to checked local source; exact latest owned integration 37643618750 and fresh full 37643618281 are running. Neither has a pass/main receipt yet. Records staged locally without interrupting these validations; publish next evidence after owned integration completes.

- 2026-10-07 15:44:07 UTC: Metadata repair main d424ad3 is tree-identical to 6b1f5f1/runtime d1edf246. Official integration 37643618750: 3908 unit passes/14 skips and 246 owned browser passes (7.3m), zero retries/skips. Pages 37645772950 succeeded; live acceptance 4/4 (29.3s). Fresh full 37643618281 still running on exact checkpoint; no full-pass claim and task 42ab remains active. Duplicate prior-source R51 main full 37640254171: 1710 browser passes/1 Crystal retry/171 skips (43.5m), 3896 units/14 skips. New backlog c492 records the unattributed Crystal failure; no source/timeout changes.
