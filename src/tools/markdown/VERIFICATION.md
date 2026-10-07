---
tool: markdown-workbench
doc: research
updated: 2026-10-07
---

# Ordered Markdown implementation evidence

Live requirement state and the next item are in [TRACKER.md](TRACKER.md). The frozen cross-tool inventory is in [.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). This record gives reproducible commands and the scope of observed checks; it does not certify untested devices or remaining requirements.

## Source and acceptance checkpoint

Audit baseline: `3d64fdeff005555388cb2f593ed5c15bfa3b7756`, rechecked through GitHub MCP at 2026-10-06 20:57 UTC. Implementation began from claim revision `82c03cd9257213babf4fedc5e4ca32cebb63e135`. Runtime and test checkpoint for MDW-R09/12/15/17: local revision `770d69e`. These first four items were subsequently included in the seven-item integrated/deployed checkpoint recorded below.

- MDW-R09: regex replacement, match-case isolation and Undo passed on desktop and touch phone; existing runtime behavior retained.
- MDW-R12: valid settings persisted after reload and Vim resumed; malformed stored values reproduced a defect on both projects before typed preference validation. Valid and malformed preference checks then passed on both projects.
- MDW-R15: the missing-control baseline failed on both projects. First and last caret lines, a phone landscape resize and editable source after disabling passed after implementation.
- MDW-R17: chosen 3×4 data dimensions, invalid dimensions, Cancel/focus return and Undo passed on both projects. Header row is separate. Pure table construction and eight invalid boundary cases passed 9/9.
- Combined production acceptance: 10/10 passed in 32.1s on 2026-10-06. TypeScript and production build passed. The full browser regression run remains pending; newer changes need their own acceptance and production checks.

## Reproduce

Use the repository's pinned dependencies and committed browser tests:

```sh
pnpm install --frozen-lockfile
pnpm test:unit
pnpm build
pnpm test:e2e tests/e2e/markdown-inventory.spec.ts tests/e2e/markdown-code-controls.spec.ts --workers=1
pnpm test:e2e --workers=2
pnpm tool:check markdown-workbench --base origin/main
pnpm docs:check
```

Local checks used the same installed CLIs directly because the temporary worktree links to existing dependencies and the pnpm wrapper attempted to reinstall that link. Equivalent commands: `node node_modules/vitest/vitest.mjs run tests/unit`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`, and `node node_modules/@playwright/test/cli.js test`. Production preparation also ran `scripts/copy-pyodide.mjs` and `scripts/copy-libarchive.mjs` before Vite build.

Local browser adaptation: Chromium desktop 1440×900; touch phone 390×844, mobile mode, device scale 2; blocked service workers, reduced motion, one worker for focused acceptance, no retries. Chromium launch flags enabled software WebGL in this environment. Tests also resize to 844×390 for landscape Typewriter acceptance. Standard CI uses the committed Playwright config and iPhone 13 Chromium profile. These are browser simulations; physical browser and assistive-technology claims require separate evidence.

Raw local artifacts: `/workspace/inmotools-implementation-evidence/`. Files: `mdw-first-four-production.json`, `mdw-first-four-production.log`, `mdw-r12-verified.json`, `mdw-r15-fixed.json`, `mdw-r17.json`, `mdw-r17-unit.log`, `typecheck-r17.log`, `build-checkpoint.log`. The source test cases are committed so a new environment can regenerate evidence without these local paths.

## Authoritative references

All links below returned HTTP 200 when retrieved on **2026-10-06 20:58:48 UTC**. Installed dependency versions remain pinned; no dependency upgrade was needed.

| Reference | Applied constraint |
| --- | --- |
| [CodeMirror SearchQuery](https://codemirror.net/docs/ref/#search.SearchQuery) | Regex and case-sensitive replacement acceptance uses the library's actual search controls. |
| [CodeMirror scrollIntoView](https://codemirror.net/docs/ref/#view.EditorView.scrollIntoView) | Typewriter caret uses vertical centering with adaptive editor padding; cleanup removes scheduled work and observers. |
| [codemirror-vim official repository](https://github.com/replit/codemirror-vim/blob/master/README.md) | Vim integration is tested against the installed implementation. |
| [Prettier browser API](https://prettier.io/docs/browser) | Browser formatting uses standalone plus explicit parser plugins; no Node service or remote processing. |
| [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) | Two or more trailing spaces can be meaningful hard breaks; differing bullet markers form separate lists. Style checks must preserve literals and explain suggestions as style. |
| [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Wrapping, narrow viewports and orientation are acceptance concerns. |
| [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) | Later unsaved-work checks must account for activation and mobile delivery limits. |

## MDW-R19 current checkpoint

- Auto-format runs in a local module worker, preserves frontmatter/literal code, protects single-tilde delimiters, maps the caret and isolates the formatting Undo step. Editing, moving the caret, switching documents or unmounting cancels pending work; Cancel is available while running.
- Five format-engine tests and TypeScript passed after corrections. Initial production acceptance14/16 passed; both failures were formatting startup (`document is not defined`) from the preview parser browser dependency inside the worker. The worker now uses Prettier's browser-safe parser through its plugin preprocess API. After removing that dependency, TypeScript, a clean production build and combined acceptance passed 16/16 (57.3s) on desktop/touch. MDW-R19 is verified for these cases; full regression and release checks remain pending.
- Official [Prettier API](https://prettier.io/docs/api) and [options](https://prettier.io/docs/options) retrieved HTTP200 at 2026-10-06 21:23:25–26 UTC; `formatWithCursor` maps the caret, `proseWrap: preserve` avoids prose reflow and `embeddedLanguageFormatting: off` preserves embedded code. Official [plugin API](https://prettier.io/docs/plugins) retrieved HTTP200 at 21:30:31 UTC; the parser/preprocess extension receives the formatter's parser options.
- First-checkpoint full browser attempt ended134 passed,2 failed,2 interrupted,1668 not run. A forced reduced-motion config invalidated the app test's initial smooth-scroll expectation; remove that adaptation for full-suite runs. The other failure was Crystal Lattice's workspace visibility timeout, still requiring isolation. No full-suite success is claimed. Full unit checkpoint passed 3741 with 13 skipped,346 files passed and2 skipped (484.98s); that run selected the original checkpoint tests before the new lint/format tests were added. New engine checks must be cited separately.

## MDW-R20 current checkpoint

Official [Vim engine write implementation](https://github.com/replit/codemirror-vim/blob/master/packages/codemirror-vim-core/vim.js) was retrieved HTTP200 at 2026-10-06 21:33:00 UTC. Installed packages are @replit/codemirror-vim6.4.0 and core0.1.0; both the official source and installed implementation delegate :w/:write to an instance save hook when no global save command exists. The hook delegates to the workspace's existing save path and restores its previous value during cleanup. No global Vim command is changed.

Baseline4/4 failed; initial editor checks passed4/4 (1.6m), including a named draft with automatic saving suppressed and a transaction failure without text loss. TypeScript passed. Production checks including reload/restoration/rename passed 4/4 (54.2s); clean build and TypeScript passed. The six-item checkpoint was published through GitHub MCP as57ae9cdf9a8f01f22785d58b6f28bb9518744bc0; local and fetched source trees compared equal. Integration [run37535034041](https://github.com/AahPlexX/inmotools/actions/runs/37535034041) and Pages [run37535764096](https://github.com/AahPlexX/inmotools/actions/runs/37535764096) succeeded; integrated revision fc6a820f315bbc8abfed5e4e6094dbef3b8a799e. That local full-suite attempt was stopped: 351 passed, 6 failed, 2 interrupted, 1453 not run. Blocked service workers invalidated offline coverage. It is not full-suite success. Canonical validation now uses the committed GitHub workflow and standard browser configuration.


## Current release and MDW-R29 checkpoint

Seven inventory items were published as `e8af2c308a5fa0be683ad0e063e661784f8685b8`, integrated as `bcdd08ea4f42067c50f2c54870cf69d13a9902ef`, and deployed successfully in [Pages run 37537306543](https://github.com/AahPlexX/inmotools/actions/runs/37537306543). Canonical full validation [run 37538813696](https://github.com/AahPlexX/inmotools/actions/runs/37538813696) uses that main revision and the committed configuration. Verified on 2026-10-07 00:23 UTC: that run succeeded, including records, unit tests, build and the full browser suite. Deployment and validation are separate jobs; deployment success does not certify browser validation.

MDW-R29 live-preview code controls and the nested task-click guard passed production acceptance 12/12 (1.5m), TypeScript and a clean build. R29 is integrated/deployed as f0ae6602; its full validation run 37551755268 remains in progress. Six focused desktop/touch checks passed (48.7s), plus TypeScript. Clipboard content includes every literal line and terminal newline; blocked clipboard access exposes a readonly, fully selectable fallback. Line-number DOM is bounded to visible lines. Detached exports do not run the preview enhancer. Initial tests exposed a selection fallback dropping a final newline; native textarea selection corrected it.

The unchanged R20 production baseline processed the 2000-line fixture via native paste in 431ms and file import in 1510ms, while direct Playwright `keyboard.insertText` took 60,889ms. These local probes distinguish input paths; they do not establish a universal performance bound or root cause. The committed long-code acceptance uses native clipboard paste. Preserve this observation for MDW-R85 input/performance review. Artifacts: `mdw-r29-fixed-paste.json/log`, `typecheck-r29-fallback.log` and `build-r29.log` in the optional local evidence directory.

Official [MDN Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) was retrieved HTTP 200 at 2026-10-06 21:37:11 UTC, [W3C Clipboard API](https://www.w3.org/TR/clipboard-apis/) at 21:43:27 UTC and [MDN textarea.select](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/select) at 21:59:58 UTC. Clipboard access may reject; fallback selection is verified by a native clipboard round trip including its final newline.

Associated R29 task-click defect: clicking the readonly clipboard fallback inside a task-list item toggled its task and removed the fallback on the initial production artifact. Code frames now stop click propagation to the task handler. Committed regression checks cover source preservation plus ordinary task toggling, horizontal code scrolling at 320×568 and 844×390, keyboard focus and print overflow. The nested-task baseline failed on both projects; guarded production acceptance passed 12/12 (1.5m), including those checks and ordinary task toggling. Artifact: `mdw-r29-guard-production-fixed-test.json/log`, `build-r29-guard.log`, `typecheck-r29-guard.log`. The broader run passed 58/58 (6.2m) on the pre-guard immutable artifact, covering eight inventory items, scroll synchronization, highlighting, oversized fences, task toggling and diagram/code exports. The newer guard artifact separately passed 12/12. Artifact: `mdw-r29-production.json/log`.

For MDW-R31, the official [GitHub alert syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) returned HTTP 200 at 2026-10-06 22:24:21 UTC. It lists NOTE, TIP, IMPORTANT, WARNING and CAUTION. DANGER is a Workbench extension, not one of those five GitHub kinds. Implementation has not started in this checkpoint.

- 2026-10-07 00:23 UTC: GitHub confirmed R29 source 22f886e35490e2dd5f6257827a33c1757c8f91cb integrated as f0ae66023ecdc754f5681b39b5502c3d59ca5c0e. Integration run 37540554800 and Pages run 37541230836 succeeded. Canonical full validation run 37538813696 passed on preceding seven-item revision bcdd08ea. Requested full validation on current R29 main; its result is not yet available. Cursor MDW-R31.


## MDW-R31 current checkpoint

As of 2026-10-07 00:30 UTC, DANGER, source-aware escaped-marker preservation and shared alert styling are implemented locally. TypeScript, a clean production build and corrected alert/render/export unit checks passed 54/54 (1.78s). Production acceptance remains pending. Twelve-case baseline units had 10 failures and 2 passes; detached warning styles were absent. Four browser baseline checks failed on the unchanged R29 guard production artifact. Stopped-server connection-refused attempts are environment failures, not product evidence.

Next: serve the clean production artifact and run `pnpm test:e2e tests/e2e/markdown-alerts.spec.ts --workers=1`, then Markdown regression. Artifacts: `mdw-r31-unit-export-baseline.log`, `mdw-r31-units.log`, `mdw-r31-browser-baseline-active.json/log`, `typecheck-r31.log`.

Official [GitHub syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts), [unified API](https://github.com/unifiedjs/unified#processorrunsynctree-file) and [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) were refreshed HTTP 200 on 2026-10-07 00:24:28–29 UTC. GitHub lists five standard kinds; DANGER is documented as a Workbench extension. The unified runSync API accepts the source file alongside the parsed tree, allowing original marker bytes to be checked before transforming unescaped text.

Full validation of integrated/deployed R29 main f0ae6602 is [run 37551755268](https://github.com/AahPlexX/inmotools/actions/runs/37551755268), in progress. It does not cover newer R31 changes.

At 2026-10-07 00:29 UTC the two remaining unit failures were identified as the default unit runner replacing CSS imports with empty strings. Official [Vitest CSS configuration](https://vitest.dev/config/css) returned HTTP 200 at 00:29:07 UTC and documents this behavior. The owned export test supplies the tracked CSS file to verify packaging logic; production acceptance checks actual Vite inline CSS separately. Corrected rerun/build remain pending.

Corrected unit harness passed 54/54 (1.78s); TypeScript and clean build passed at the R31 implementation checkpoint. Artifacts: `mdw-r31-units-corrected-harness.log`, `typecheck-r31.log`, `build-r31.log`. Production cases measure callout bounds at 320×568 and 844×390, title contrast in light/dark workspaces, and downloaded HTML rendering plus EPUB stylesheet packaging. Official [WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) returned HTTP 200 at 2026-10-07 00:30:28 UTC; normal text requires 4.5:1. No production-browser result is claimed yet.
