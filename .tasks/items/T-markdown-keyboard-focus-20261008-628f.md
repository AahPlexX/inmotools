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

2026-10-08 20:29:23 UTC: frozen Markdown R55-R86 work is retained on main 64c6c5c. Associated MDW-R93 compound-citation and MDW-R87 keyboard-focus repairs passed final local acceptance: 534 Markdown/recovery units (one optional real-Pandoc test skipped), 31 cluster cases included; TypeScript/production build; 8/8 desktop/touch browser cases (125.9s), zero retries/skips, including unrestricted axe and R15 orientation checks. The earlier combined References/Pandoc/TXT run passed 28/28 (185.0s). This checkpoint is ready for GitHub MCP integration; obtain the exact official source/run, main tree, Pages and live receipts, then run the required full browser suite before closing tasks d713 and 628f. R15 centering cause and one-off mobile export pageerror remain unestablished; successful checks do not close them. Next frozen tool is pdf-sanitizer, PDF-R02. No released/full-pass claim yet.

## Evidence

Current W3C WCAG 2.1.1 Keyboard understanding and CodeMirror EditorView API retrieved live HTTP 200 on 2026-10-08. CodeMirror documents contentAttributes and warns against directly mutating contentDOM because editor updates undo unmanaged changes. The exact source `[see @alpha, p. 14 and *` + `longannotation` repeated 30 times + `*]` followed by `[compare @alpha, p. 27; @missing, chap. 2]` reproduces the original/candidate mobile axe result. A first external axe probe used browser.newPage and was rejected by the runner; corrected explicit browser.newContext produced both actual measurements.

Shared reason: owned browser test outside the tool folder; full browser suite is required under GOVERNANCE.md. Companion task d713 covers the compound-citation fix and current inventory records.
