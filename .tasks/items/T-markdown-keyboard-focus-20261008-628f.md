---
task: T-markdown-keyboard-focus-20261008-628f
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-08
updated: 2026-10-08
---

# Keep the source textbox reachable by keyboard on touch profiles

## Request

Associated accessibility defect found during MDW-R93 regression: the editor scroll region must have a keyboard-reachable descendant, including a physical keyboard on a phone. Preserve caret editing, Undo and typewriter behavior.

## Resume here

2026-10-08 21:29:32 UTC: citation/keyboard runtime d9ac316996072b002c59ff92eaa8ee9b98d14400 is integrated and deployed; current fetched main 57293d5662522e5de6b3900edcb30780346ff0d6 has identical runtime/tests. Required full validation [37840159373](https://github.com/AahPlexX/inmotools/actions/runs/37840159373), validate job 113527207416, succeeded: 4039 unit passes/15 skips; 1788 browser passes, 171 skips and one unrelated Photo white-balance retry (53.3m). Markdown citation/keyboard and original R15 cases passed without retry; no centering diagnostic was emitted. The Photo retry raised image.decode EncodingError, then passed; its cause is not established and is recorded for the later ordered Photo review. Owned integration 37840304306 passed 320 browsers without retries/skips; main Pages 37844849210 succeeded on 57293d5. Live acceptance passed 6/6 desktop/touch (87.0s), including actual exports, unrestricted axe, keyboard reachability and phone portrait/landscape, tablet and desktop bounds. Citation task d713 and keyboard task 628f are done. Local 534 units/one optional skip, TypeScript/build, final 8/8 browsers and 28/28 export regressions remain valid; a separate verified official Pandoc 3.12.1 run passed all 11 export units including real conversion, with no skip. Material stress evidence remains 79/80 mobile exports with one separate startup visibility timeout, then isolated startup 40/40 and original R15 mobile 12/12 passes. Tasks 6b82 and 17bf remain open; passing checks do not establish their causes or fixes. Next associated implementation is MDW-R94 / task 9a5c: missing author-in-text bibliography embedding and existing literal-key false positives in Pandoc export, with released-reader research and production baselines. Next frozen tool is PDF-R02 after associated Markdown work. Do not repeat completed R55-R86 or R93 implementation or dispatch another full run for documentation alone.

## Evidence

Current W3C WCAG 2.1.1 Keyboard understanding and CodeMirror EditorView API retrieved live HTTP 200 on 2026-10-08. CodeMirror documents contentAttributes and warns against directly mutating contentDOM because editor updates undo unmanaged changes. The exact source `[see @alpha, p. 14 and *` + `longannotation` repeated 30 times + `*]` followed by `[compare @alpha, p. 27; @missing, chap. 2]` reproduces the original/candidate mobile axe result. A first external axe probe used browser.newPage and was rejected by the runner; corrected explicit browser.newContext produced both actual measurements.

Shared reason: owned browser test outside the tool folder; full browser suite is required under GOVERNANCE.md. Companion task d713 covers the compound-citation fix and current inventory records.

- 2026-10-08 21:29:32 UTC: required immutable-source full validation 37840159373 succeeded with the exact counts in Resume here. Runtime/tests match deployed main. Associated repair complete; unresolved centering/startup investigations remain separate.
