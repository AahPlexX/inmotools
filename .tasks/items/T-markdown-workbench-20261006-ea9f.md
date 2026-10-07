---
task: T-markdown-workbench-20261006-ea9f
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-06
updated: 2026-10-07
---

# Complete ordered Markdown requirement inventory with current verification and resumable records

## Request
Work through the reviewed requirement inventory in its recorded order, implement missing behavior and fix associated bugs. Keep each tool's spec, tracker, evidence and exact next action current in every checkpoint. Record source revisions, reproducible checks, known limitations and the next action at every checkpoint. Preserve browser-only operation, no authentication, no backend/server database.

## Resume here

Current ordered item: MDW-R35 definition lists, then MDW-R36 disclosure blocks. First eleven frozen inventory items have scoped verification. R34 passed TypeScript, 95 focused units, 17 expanded abbreviation cases, clean production build and 6/6 production browser cases (1.0m) on the print-corrected artifact at 2026-10-07 01:17 UTC. Browser coverage includes keyboard/touch glossary access, long-text bounds at 320×568/844×390, closed-glossary preview/HTML printing, actual HTML/EPUB/DOCX/AST exports, literal malicious-title DOM, auto-format/help and source-change cleanup. Next: research R35 grammar/current parser compatibility, specify boundaries, record baseline and implement. Frozen R33 Markdown regression is still running; canonical full validation/integration for newer source remains pending.

First ten inventory items have scoped verification. R31 integrated/deployed as 1e85224354e3513485ccf583c38d4fb1b93c3a01; integration 37552674213 and Pages 37553380467 succeeded. Frozen R31 Markdown regression passed 190/190 (13.9m), separate from R33. R29 full validation 37551755268 passed, confirmed at 01:13 UTC; preceding seven-item full validation 37538813696 passed. Newer source still requires canonical full browser validation.

Latest published R34 partial checkpoint: 16fbefedea8846a7d52c34d160dbbd3e2d0bbb2c; fetched local/remote trees compare equal. The print correction and scoped verification records follow that source in the current checkpoint. R33 runtime/tests b40be9c8cd2085a1abe757238a2de8928eaaa92b. Its integration/full browser checks are pending. Earlier integration 37554968674 was superseded by the parser correction; its dependency installation success does not certify newer source. Direct dev micromark-util-types 2.0.2 is the only package/lock addition; both lockfile YAML documents are retained. Shared changes require full browser checks. Resume from committed source/tests; local evidence artifacts in /workspace/inmotools-implementation-evidence are optional. Worktree ../inmotools-markdown-workbench; branch fix/markdown-workbench. Tool remains incomplete.

## Log
- 2026-10-06: scope outside the tool folder is limited to owned Markdown unit/browser acceptance tests and generated documentation indexes. New tests are necessary to verify the existing and added requirements; full browser checks are running against the built `770d69e` checkpoint. Combined acceptance passed 10/10 (32.1s), build passed; release/regression pending. Dated sources and portable commands are in `src/tools/markdown/VERIFICATION.md`.
- 2026-10-06: claimed `fix/markdown-workbench`.
- 2026-10-06 20:57 UTC: rechecked GitHub HEAD and current spec/tracker against source 3d64fdeff005555388cb2f593ed5c15bfa3b7756; inventory unchanged. Shell claim push failed because no Git credentials; GitHub MCP branch route is being used. No implementation change yet.
- 2026-10-06: MDW-R09 desktop/touch acceptance passed 2/2 against source base82c03cd; implemented behavior required no runtime change. Cursor advanced to MDW-R12; regression suite/integration pending.
- 2026-10-06: MDW-R09/12 acceptance6/6 pass and TypeScript check passes after preference validation. Source/local checkpoint based97e1b9d; full/shared regression, integration and deployment pending. Cursor MDW-R15.
- 2026-10-06: MDW-R15 baseline2/2 failed (missing control), implementation2/2 passed on desktop/touch including landscape resize. Record cursor MDW-R17. Full shared/regression and release checks pending.
- 2026-10-06: MDW-R17 desktop/touch2/2 pass with parsed table dimensions and Cancel/Undo. Cursor MDW-R18. Table builder unit boundary tests 9/9 passed; TypeScript check passed.

- 2026-10-06: MDW-R18 desktop/touch acceptance passed 2/2, lint unit tests 5/5 and TypeScript check passed. Cursor MDW-R19. Full regression/integration pending.

- 2026-10-06 21:31 UTC: MDW-R19 format engine/worker and cancellable editor action implemented. Five engine tests passed after protecting single-tilde spans; initial production check14/16 passed, with 2 formatting failures due to a DOM-only decoder. Replaced worker parsing with the official Prettier parser; unit5/5 and TypeScript passed. Rebuilding clean production artifact before rerun. Full first-checkpoint browser attempt134 passed,2 failed,2 interrupted,1668 not run; one failure is forced reduced-motion configuration, one is a Crystal workspace load timeout. Full regression remains open.

- 2026-10-06 21:33 UTC: combined six-item production acceptance passed 16/16 (57.3s). Clean build, TypeScript and five formatter-engine cases passed after removing the worker DOM dependency. Cursor MDW-R20. Corrected full regression and integration pending.

- 2026-10-06 21:41 UTC: MDW-R20 baseline failed 4/4, updated editor acceptance passed 4/4 (1.6m); TypeScript passed. Per-instance save hook restores its previous value on disable/unmount. Production verification with reload/rename is next. Remote57ae9cdf contains six earlier verified inventory items; GitHub integration run37535034041 is active. Corrected full browser checks use frozen ab46e40 tests/code and immutable production artifact; evidence full-browser-r19.json/log.

- 2026-10-06: MDW-R20 production acceptance passed 4/4 (54.2s) including reload/restoration/rename and storage failure. Source is in this checkpoint. Cursor MDW-R29. Prior six items integrated/deployed as fc6a820f315bbc8abfed5e4e6094dbef3b8a799e; integration run37535034041 and Pages run37535764096 succeeded. Full regression pending.

- 2026-10-06 21:59 UTC: MDW-R29 initial checks2/6 passed;4 failed (fallback final newline and long-code timeout on both projects). Readonly textarea fallback now selects the entire value, including terminal newline; not yet reverified. Long-code behavior requires baseline comparison and browser profiling. Current changes are uncommitted; no MDW-R29 completion or release is claimed. Earlier seven items are available remotely; R20 publication e8af2c308a5fa0be683ad0e063e661784f8685b8 awaits recorded integration result.

- 2026-10-06 22:18 UTC: MDW-R29 corrected focused checks passed 6/6 (48.7s); TypeScript passed. Native paste and file import on unchanged R20 production completed in 431ms and 1510ms respectively for the 2000-line fixture; Playwright direct insertText took 60,889ms. These are local observations, not universal timing guarantees or proof of a root cause. The acceptance test now uses native clipboard paste. Production/regression verification is pending. Stopped the custom full-suite attempt (351 passed, 6 failed, 2 interrupted, 1453 not run); its blocked-service-worker configuration invalidated offline coverage. Canonical GitHub validation is run 37538813696 on bcdd08ea, with browser checks still running.

- 2026-10-06 22:20 UTC: production R29 probe found clicking a clipboard fallback inside a task-list code block toggled the task and removed the fallback. Recorded as T-markdown-code-task-click-20261006-7762; code-frame click isolation added, awaiting committed regression and production verification. The initial 58-test production run uses the immutable pre-guard artifact, so its results alone do not verify the guard.

- 2026-10-06 22:25 UTC: guarded R29 clean build, TypeScript and production acceptance passed 12/12 (1.5m). Initial nested task regression failed on both projects; corrected runtime passed on both, including normal task toggling. An initial new-test attempt incorrectly clicked a disabled preview checkbox; it was stopped and corrected to click its task text, matching the existing preview interaction. Broader Markdown run remains in progress on the pre-guard artifact. Cursor MDW-R31.

- 2026-10-06 22:26 UTC: broader pre-guard production Markdown regression passed 58/58 (6.2m): all eight inventory items, preview/source scrolling, highlighting, oversized fences, Mermaid/Graphviz and HTML/EPUB diagram/code exports. Guard production acceptance separately passed 12/12. Canonical cross-tool full regression remains pending.

- 2026-10-07 00:23 UTC: GitHub confirmed R29 source 22f886e35490e2dd5f6257827a33c1757c8f91cb integrated as f0ae66023ecdc754f5681b39b5502c3d59ca5c0e. Integration run 37540554800 and Pages run 37541230836 succeeded. Canonical full validation run 37538813696 passed on preceding seven-item revision bcdd08ea. Requested full validation on current R29 main; its result is not yet available. Cursor MDW-R31.

- 2026-10-07 00:24 UTC: R31 baseline unit checks 8 failed, 2 passed; DANGER absent and five escaped standard alert markers incorrectly transformed. Added associated task T-markdown-alert-literals-20261007-d920. Source-aware marker matching and detached alert styling are specified before implementation. Browser baseline uses the unchanged R29 guard artifact, restarted after the paused environment stopped the preview process; connection-refused attempts are not product evidence.

- 2026-10-07 00:27 UTC: DANGER, source-aware escaped-marker matching and shared preview/HTML/EPUB alert styling implemented. TypeScript passed; unit run 52 passed/2 failed, unresolved. Browser baseline failed 4/4 on the restarted unchanged R29 production artifact. Current source changes are uncommitted and R31 remains partial. Next: inspect unit failures, correct them, rebuild and run production acceptance.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build passed.

- 2026-10-07 00:30 UTC: corrected unit harness passed 54/54 (1.78s); TypeScript and clean production build passed. R31 remains partial pending production browsers/regression. Current source and next action are checkpointed before starting those checks.

- 2026-10-07 00:32 UTC: R31 production acceptance/guide and existing-alert regression passed 10/10 (30.8s). Source 8787c1150604e182a5524b4ad7a43282f31d7f4e is published and tree-equal to local implementation. Canonical integration and frozen all-Markdown regression are running; no full-suite or R31 release success is claimed. Cursor MDW-R33.

- 2026-10-07 00:46 UTC: R33 grammar/source compatibility research is recorded in the spec and verification document. New 17-case baseline includes AST, literal/escape/code/math boundaries, formatting and HTML/EPUB/DOCX. First attempt used an incorrect formatter import; corrected to the installed formatMarkdownSource API and rerunning. No R33 runtime implementation yet.

- 2026-10-07 00:54 UTC: corrected R33 baseline 10 failed/7 passed; implementation is partial and unverified. Source, tracker/spec and exact next checks are updated together. R31 frozen all-Markdown regression passed 190/190 (13.9m), separate from R33.

- 2026-10-07 00:55 UTC: first R33 checks: 54 passed/16 failed; TypeScript failed. Corrected tokenizer context capture before returning its state and added custom script nodes to both MDast content maps. Corrected type/unit reruns are pending; R33 remains partial.

- 2026-10-07 00:56 UTC: TypeScript passed after the native extension corrections; unit checks 68 passed/2 failed. Both remaining failures assumed a particular HTML entity spelling, while actual output used equivalent safe numeric entities. Corrected assertions verify semantic content and escaping; rerun pending. R31 source/records integrated as 1e85224354e3513485ccf583c38d4fb1b93c3a01, integration run 37552674213 and Pages run 37553380467 succeeded.

- 2026-10-07 01:01 UTC: R33 corrected semantic assertions passed all 70 focused units (2.83s); TypeScript passed. R33 remains partial; production build passed, browser acceptance next. Current resume/evidence sections reconciled with completed R31 integration/deployment and 190/190 regression.

- 2026-10-07 01:02 UTC: working R33 source/records published through GitHub MCP as a4d30b68b5653f3fb4593582b35faed495184d2f; fetched tree compared equal. Production artifact was built from the identical implementation. New owned browser acceptance checks literal/escape/code/math boundaries, orientation bounds, auto-format/help and actual HTML/EPUB/DOCX/AST/clipboard exports; running on port 4190. R33 remains partial until results are available.

- 2026-10-07 01:02 UTC: first R33 production checks failed 4/4. Two failed a case-sensitive status assertion (actual status Markdown formatted); two confirmed DOCX export used a duplicate parser without script syntax. Workspace AST/DOCX and outline now use the same parser factory as preview; added heading-ID and escaped-marker/backslash unit checks. Correction checks/build/browser reruns pending; R33 remains partial. Earlier 70-unit/build success covers a4d30b6 only.

- 2026-10-07 01:03 UTC: parser-consistency TypeScript passed; units 79 passed/1 failed because the new heading assertion omitted the existing user-content- sanitization prefix. Corrected the assertion to the shared prefix constant. Rerun/build and production acceptance pending. No heading runtime defect was established by that assertion.

- 2026-10-07 01:03 UTC: common parser/export/outline correction passed TypeScript, all 80 focused units (9.56s) and clean production build. Corrected production browser acceptance is running on immutable markdown-r33-consistent-dist (port 4192). Canonical integration 37554968674 completed dependency installation successfully for the prior a4d30b6 package/lock checkpoint; its full checks remain in progress and do not certify the unpushed parser correction.

- 2026-10-07 01:04 UTC: R33 production acceptance passed 4/4 (19.7s) on the common parser correction; actual downloaded DOCX/AST now preserve script semantics. TypeScript/80 units/build passed. Source/tests published as b40be9c8cd2085a1abe757238a2de8928eaaa92b and tree-equal. Cursor MDW-R34; frozen Markdown regression and canonical integration/full browsers remain pending.

- 2026-10-07 01:06 UTC: R34 primary grammar/parser research and conservative boundaries recorded in spec/verification. Original Markdown Extra allows empty titles; markdown-it rejects them. Default follows the original for that case. Legacy remark-abbr is not installed. Next: baseline units/browser, then native compatible implementation. R33 latest scoped records published as 5f860bec8a05b96b1fb76655164e8db28f79a02c; broader regression/integration pending.

- 2026-10-07 01:09 UTC: R34 baseline 7 failed/2 passed. Native flow definitions, AST matching, common parse-tree transformation and escaped-text glossary are partially implemented, with owned responsive glossary CSS in preview/HTML/EPUB. Formatter preservation and type/unit/production checks remain pending. No R34 verification is claimed.

- 2026-10-07 01:11 UTC: first R34 checks: 7 failed/2 passed and TypeScript failed. Native definitions decoded correctly; default sanitizer stripped abbr. Added only the semantic abbr tag (title was already permitted) and fixed flatMap typing. Basic formatter preserves definition text; broader formatting boundaries are being tested before adding any formatter change. R34 remains partial.

- 2026-10-07 01:13 UTC: R34 corrected TypeScript passed; 95 focused units had 92 passes/3 failures. Two exposed invalid empty micromark title chunks; title chunks now open only when content exists. Third assertion mistook literal <img> inside a quoted title attribute for a DOM image; it now verifies actual parsed DOM and literal title, with matching production coverage added. Corrected rerun pending.

- 2026-10-07 01:13 UTC: canonical full R29 validation 37551755268 succeeded on integrated/deployed f0ae6602. Associated task-click task is done. Current R34 unit DOM assertion required a browser API absent from the Node unit runner; unit now verifies escaped text serialization, while the committed production case verifies actual DOM has no image and preserves the literal title. Corrected unit rerun pending.

- 2026-10-07 01:14 UTC: R34 corrected harness passed all 95 focused units (16.87s); TypeScript and clean production build passed. R34 remains partial; production browsers are running on the immutable built implementation. No formatter change was needed for the tested abbreviation boundaries.

- 2026-10-07 01:15 UTC: R34 source/tests/partial evidence published as 16fbefedea8846a7d52c34d160dbbd3e2d0bbb2c and tree-equal. Browser baseline on unchanged R33 failed 6/6. Initial R34 production exposed closed glossary print visibility; corrected native content-visibility print rule and added actual HTML print coverage. Rebuild/rerun pending.

- 2026-10-07 01:16 UTC: initial R34 production finished 4 passed/2 failed (1.2m), both failures were print visibility of a closed glossary. Corrected clean production build passed; corrected acceptance will use immutable markdown-r34-print-dist (port 4194). Two further owned unit checks cover indented/raw-HTML definitions and Unicode/link/image boundaries; their result is pending.

- 2026-10-07 01:17 UTC: R34 print-corrected production acceptance passed 6/6 (1.0m); TypeScript, 95 focused units, 17 expanded abbreviation cases and clean build passed. Cursor R35. Source/tests/current evidence are checkpointed together; broader regression and canonical integration/full browsers remain pending.
