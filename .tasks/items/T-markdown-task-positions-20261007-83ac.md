---
task: T-markdown-task-positions-20261007-83ac
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Preserve native task source positions

## Request

Associated MDW-R36/37 interaction repair from the ordered audit: a task displayed inside a quoted disclosure must toggle its exact source marker without changing quote prefixes or line endings; literal task-looking code must remain untouched.

## Resume here

Latest runtime is scoped-verified and deployed at main 58be2be9e46203b87e416699e1a7e038c9dbc7fd, equal to published runtime/tests 7025c67d. Integration 37572936067 and Pages 37573618697 succeeded; official receipt: 3852 unit passes/14 skips, 228 owned browser passes (6.5m), no browser retries/skips. Local 343 units, TypeScript/build and 20 combined production cases passed. At 2026-10-07 04:57 UTC, fresh full-site validation 37572856847 on 7025c67d remains in progress; earlier 37571121544 succeeded on older runtime with 1689 passes/2 flaky/171 skips (37.3m). Its R15 mobile case repeated the same 2571.9765625px failure, then passed retry. Inspect latest full receipt and any owned failures, then close this task with its exact source/main receipts and computed tool-check result. Parent ordered cursor is R51. Task remains active until full-site evidence; no full-pass claim.

## Log

- 2026-10-07 03:54 UTC: Baseline tests/unit/markdown-task-toggle.test.ts: 2 failed/3 passed in 209ms, confirming quoted and metadata-prefixed tasks return null. Current helper scans entire source lines with a list-marker regex and reconstructs all line endings. Official GFM task-list and native mdast parser positions supply the implementation basis. GFM primary spec was retrieved HTTP 200 at 03:51:56 UTC. Browser exact-text baseline pending; exclude the earlier strict-locator setup failure.

- 2026-10-07 03:59 UTC: Associated quoted-task exact-text browser baseline failed on both projects for an unchanged [ ] marker; the earlier ambiguous locator is excluded. Native-position repair now passes 28 task/disclosure unit cases (1.74s), including nested quotes, metadata offsets, mixed CRLF/lone-CR, code/malformed fallback guards and native tab/newline marker values. Standard markers change one value character; a native line-spanning whitespace marker is replaced by [x], preserving every source byte outside the marker, and Undo restores it. This behavior follows the installed primary GFM tokenizer, which accepts whitespace/line endings in task-marker values. Fresh TypeScript/build/all-Markdown units and production quoted-click/Undo remain pending; full validation must be refreshed for this changed runtime.

- 2026-10-07 04:06 UTC: Core R36 source 240803fc integrated into main ad789c1526c07573685bbb2fe67eace19bd8817e; integration 37568523733 and Pages 37569211207 succeeded. The associated native-position helper passed all 337 Markdown units (10.03s), TypeScript and build. Production rerun: 10/12 passed (55.4s); quoted clicks now change the right marker but keyboard Undo skipped the externally synchronized edit on both projects. This is a confirmed second associated defect, not a passing acceptance result. Task edits now request a guarded minimal CodeMirror transaction with existing isolateHistory/full and the isolated document-change callback, preserving caret/history without an external whole-document replacement. Official CodeMirror reference HTTP 200 at 04:05:47 UTC. Fresh build and actual keyboard/toolbar Undo/Redo acceptance are next. Full validation 37568220227 on the earlier core runtime remains in progress and cannot validate this helper/history change.

- 2026-10-07 04:13 UTC: Windows import baseline reproduced the new transaction guard rejecting a valid CRLF source on both projects; the editor represents document line breaks canonically while original source is retained outside it. A private source state/effect now retains original text for task edits, compares canonical editor coordinates, and records an inverse source effect for keyboard history. Ordinary LF edits retain the prior path without extra full-source history effects. Exact downloaded Windows source before/after task and Undo is in acceptance; fresh TypeScript/build/browser evidence is pending. Parent cursor remains R36; this repair is not published or verified yet.

- 2026-10-07 04:21 UTC: Associated repair scoped acceptance complete: fresh 337 Markdown units passed (10.02s), TypeScript and clean source-history build passed. Production source-history run passed 12/14 (1.1m), including exact Windows Markdown download and keyboard Undo; two Redo assertions used a platform-inappropriate shortcut. Current official/installed CodeMirror history bindings specify Control-Y on Windows/Linux and Meta-Shift-Z on macOS; test correction alone passed both quoted keyboard/toolbar Undo/Redo cases (8.8s) on the same runtime. All 14 scoped R36 cases pass across these runs, without retries or skips. Core release ad789c is verified through GitHub MCP; official integration logs show 3840 unit passes/14 skips and 218 browser passes (6.2m). Publish the associated runtime repair now, then obtain fresh full validation/main/Pages evidence; no hotfix full-pass or release claim yet.

- 2026-10-07 04:28 UTC: Repair cc3cb0c published through GitHub MCP and fetched/tree-compared to local source; integration 37571120162 and full validation 37571121544 are in progress. Core full run 37568220227 succeeded with 1683 passes, 2 flaky cases and 171 skips (36.5m). Owned R15 mobile failed its final-line caret-centering assertion by 2571.9765625px before passing retry; Photo crop mobile was the other flaky case. The R15 failure occurred on the earlier core runtime, before the source-history repair; attribution to that repair is unsupported. Associated investigation T-markdown-typewriter-centering-20261007-17bf records it. No current-repair full-pass/main claim.

- 2026-10-07 04:32 UTC: GitHub MCP verified repair integration 37571120162 success and Pages 37571765626 success on main 8cc619f8ed999e92b503e30f16d3e19d6f611bfa. Downloaded official integration logs: 3846 unit passes/14 skips, 222 owned browser passes (6.3m), no browser retries/skips. Runtime and acceptance files diff equal to published cc3cb0c. Fresh full validation 37571121544 is still running; R36 remains implemented pending its receipt. Twelve local mobile R15 repeats passed without retries (1.8m) on unchanged repair artifact; earlier core and exact CI-profile repeats continue.

- 2026-10-07 04:39 UTC: R38 actual cycle exposed a further mixed-history defect on unchanged deployed editor code: keyboard task Undo then Redo within the document coalescing window leaves duplicate current/past snapshots, so immediate toolbar Undo does not change source. Both projects failed (3/3 remained instead of 2/3), while earlier independently sequenced history acceptance passed. The current update listener sends undo/redo through typing coalescing; preserve distinct document steps for these native history events through the existing isolated callback. R38 acceptance now verifies that mixed cycle. This associated task remains active.

- 2026-10-07 04:43 UTC: Associated repair passes expanded actual-cycle acceptance: all 20 R36+R38 production cases (1.2m), 343 Markdown units (9.64s), TypeScript and clean build (13.66s). No retries/skips. Latest runtime publication/full-site/main/Pages pending; task remains active.

- 2026-10-07 04:57 UTC: Latest repair integrated/deployed at main 58be2be: integration 37572936067 and Pages 37573618697 success. Official logs: 3852 unit passes/14 skips, 228 owned browsers passed (6.5m), no browser retries/skips. Fresh full 37572856847 still running; leave task active. Scoped R38 verified and cursor R51; tool incomplete.
