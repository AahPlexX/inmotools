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

Current ordered item: MDW-R36 disclosure blocks, then MDW-R38 task progress. Core source 240803fc integrated/deployed at origin/main ad789c1526c07573685bbb2fe67eace19bd8817e: integration 37568523733 passed 3840 units/14 skips and 218 browsers without retries/skips in 6.2m; Pages 37569211207 succeeded. Associated task T-markdown-task-positions-20261007-83ac repairs quoted checkboxes, keyboard history and exact Windows source. Latest local repair: all 337 Markdown units passed (10.02s), TypeScript/build passed; 12/14 production cases passed on source-history artifact, then the two quoted keyboard/toolbar history cases passed with the documented platform Redo key (8.8s). All 14 scoped cases now pass across those runs. The failed Redo assertion used an unsupported platform binding; source was unchanged for its correction. Next: publish the associated repair with these records, refresh full validation on its runtime, obtain successful main integration/Pages/full browsers, close the associated task and verify R36, then advance to R38. Full run 37568220227 on the earlier b7dff7c core remains in progress; it does not validate this helper/editor change. No PRs; no auth/backend/server database. Tool remains incomplete.

## Log

- 2026-10-07 03:54 UTC: Baseline tests/unit/markdown-task-toggle.test.ts: 2 failed/3 passed in 209ms, confirming quoted and metadata-prefixed tasks return null. Current helper scans entire source lines with a list-marker regex and reconstructs all line endings. Official GFM task-list and native mdast parser positions supply the implementation basis. GFM primary spec was retrieved HTTP 200 at 03:51:56 UTC. Browser exact-text baseline pending; exclude the earlier strict-locator setup failure.

- 2026-10-07 03:59 UTC: Associated quoted-task exact-text browser baseline failed on both projects for an unchanged [ ] marker; the earlier ambiguous locator is excluded. Native-position repair now passes 28 task/disclosure unit cases (1.74s), including nested quotes, metadata offsets, mixed CRLF/lone-CR, code/malformed fallback guards and native tab/newline marker values. Standard markers change one value character; a native line-spanning whitespace marker is replaced by [x], preserving every source byte outside the marker, and Undo restores it. This behavior follows the installed primary GFM tokenizer, which accepts whitespace/line endings in task-marker values. Fresh TypeScript/build/all-Markdown units and production quoted-click/Undo remain pending; full validation must be refreshed for this changed runtime.

- 2026-10-07 04:06 UTC: Core R36 source 240803fc integrated into main ad789c1526c07573685bbb2fe67eace19bd8817e; integration 37568523733 and Pages 37569211207 succeeded. The associated native-position helper passed all 337 Markdown units (10.03s), TypeScript and build. Production rerun: 10/12 passed (55.4s); quoted clicks now change the right marker but keyboard Undo skipped the externally synchronized edit on both projects. This is a confirmed second associated defect, not a passing acceptance result. Task edits now request a guarded minimal CodeMirror transaction with existing isolateHistory/full and the isolated document-change callback, preserving caret/history without an external whole-document replacement. Official CodeMirror reference HTTP 200 at 04:05:47 UTC. Fresh build and actual keyboard/toolbar Undo/Redo acceptance are next. Full validation 37568220227 on the earlier core runtime remains in progress and cannot validate this helper/history change.

- 2026-10-07 04:13 UTC: Windows import baseline reproduced the new transaction guard rejecting a valid CRLF source on both projects; the editor represents document line breaks canonically while original source is retained outside it. A private source state/effect now retains original text for task edits, compares canonical editor coordinates, and records an inverse source effect for keyboard history. Ordinary LF edits retain the prior path without extra full-source history effects. Exact downloaded Windows source before/after task and Undo is in acceptance; fresh TypeScript/build/browser evidence is pending. Parent cursor remains R36; this repair is not published or verified yet.

- 2026-10-07 04:21 UTC: Associated repair scoped acceptance complete: fresh 337 Markdown units passed (10.02s), TypeScript and clean source-history build passed. Production source-history run passed 12/14 (1.1m), including exact Windows Markdown download and keyboard Undo; two Redo assertions used a platform-inappropriate shortcut. Current official/installed CodeMirror history bindings specify Control-Y on Windows/Linux and Meta-Shift-Z on macOS; test correction alone passed both quoted keyboard/toolbar Undo/Redo cases (8.8s) on the same runtime. All 14 scoped R36 cases pass across these runs, without retries or skips. Core release ad789c is verified through GitHub MCP; official integration logs show 3840 unit passes/14 skips and 218 browser passes (6.2m). Publish the associated runtime repair now, then obtain fresh full validation/main/Pages evidence; no hotfix full-pass or release claim yet.
