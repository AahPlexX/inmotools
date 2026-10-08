---
task: T-markdown-keyboard-focus-20261008-628f
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Keep the source textbox reachable by keyboard on touch profiles

## Request

Associated accessibility defect found during MDW-R93 regression: the editor scroll region must have a keyboard-reachable descendant, including a physical keyboard on a phone. Preserve caret editing, Undo and typewriter behavior.

## Resume here

2026-10-08 20:31:39 UTC: final compound-citation and keyboard-focus runtime/tests d9ac316996072b002c59ff92eaa8ee9b98d14400 are published through GitHub MCP; fetched tree equals the locally checked tree. Local final citation suite passed 534 Markdown/recovery units (one optional Pandoc skip), TypeScript/build and final keyboard/citation/R15 production acceptance passed 8/8 desktop/touch (125.9s), zero retries/skips; earlier combined References/Pandoc/TXT acceptance passed 28/28 (185.0s). Required fresh full validation 37840159373 runs on exact source d9ac316. This immediate record-only checkpoint supersedes initial owned integration 37840057312; let the latest integration and independent full validation complete without further record-only pushes. Main currently 64c6c5c, so no released/full-pass claim. Obtain official receipts, compare main runtime/tests, verify Pages/live, then close d713 and 628f. R15 cause and one-off mobile export pageerror remain unestablished; repeats and fresh full diagnostics may supply evidence but non-reproduction is not a fix. Next frozen tool: pdf-sanitizer, PDF-R02.

## Evidence

Current W3C WCAG 2.1.1 Keyboard understanding and CodeMirror EditorView API retrieved live HTTP 200 on 2026-10-08. CodeMirror documents contentAttributes and warns against directly mutating contentDOM because editor updates undo unmanaged changes. The exact source `[see @alpha, p. 14 and *` + `longannotation` repeated 30 times + `*]` followed by `[compare @alpha, p. 27; @missing, chap. 2]` reproduces the original/candidate mobile axe result. A first external axe probe used browser.newPage and was rejected by the runner; corrected explicit browser.newContext produced both actual measurements.

Shared reason: owned browser test outside the tool folder; full browser suite is required under GOVERNANCE.md. Companion task d713 covers the compound-citation fix and current inventory records.
