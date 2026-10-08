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

2026-10-08 20:53:16 UTC: citation/keyboard runtime d9ac316996072b002c59ff92eaa8ee9b98d14400 is integrated on main f526d76621edf35e3647186ff13756dcbfcc64c3. Official integration 37840304306 on record head 7525aa2 succeeded: 4039 unit passes/15 skips, 320 browser passes (10.4m), no browser retries/skips. Main runtime/tests match the validated source. Required independent full validation 37840159373 remains active on d9ac316; main Pages 37842135029 succeeded on f526d766 and live production acceptance passed 6/6 desktop/touch (87.0s), zero retries/skips, including actual downloads, keyboard accessibility and viewport warning bounds. Obtain the remaining exact full receipt before closing d713 and 628f. Local acceptance remains 534 units/one optional skip, TypeScript/build, 8/8 final browsers and 28/28 export regression. Material stress evidence: 79/80 mobile export repeats, one separate startup-editor visibility timeout; subsequent isolated startup 40/40 and R15 mobile 12/12 passed, neither is a root-cause fix. Tasks 6b82 and 17bf stay open. Next associated item MDW-R94 / task 9a5c fixes confirmed missing author-in-text bibliography embedding in Pandoc export. Next frozen tool remains pdf-sanitizer, PDF-R02, after associated Markdown work. Do not repeat completed R55-R86 or R93 implementation.

## Evidence

Current W3C WCAG 2.1.1 Keyboard understanding and CodeMirror EditorView API retrieved live HTTP 200 on 2026-10-08. CodeMirror documents contentAttributes and warns against directly mutating contentDOM because editor updates undo unmanaged changes. The exact source `[see @alpha, p. 14 and *` + `longannotation` repeated 30 times + `*]` followed by `[compare @alpha, p. 27; @missing, chap. 2]` reproduces the original/candidate mobile axe result. A first external axe probe used browser.newPage and was rejected by the runner; corrected explicit browser.newContext produced both actual measurements.

Shared reason: owned browser test outside the tool folder; full browser suite is required under GOVERNANCE.md. Companion task d713 covers the compound-citation fix and current inventory records.
