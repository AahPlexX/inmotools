---
tool: markdown-workbench
doc: research
updated: 2026-10-06
---

# Ordered Markdown implementation evidence

Live requirement state and the next item are in [TRACKER.md](TRACKER.md). The frozen cross-tool inventory is in [.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md). This record gives reproducible commands and the scope of observed checks; it does not certify untested devices or remaining requirements.

## Source and acceptance checkpoint

Audit baseline: `3d64fdeff005555388cb2f593ed5c15bfa3b7756`, rechecked through GitHub MCP at 2026-10-06 20:57 UTC. Implementation began from claim revision `82c03cd9257213babf4fedc5e4ca32cebb63e135`. Runtime and test checkpoint for MDW-R09/12/15/17: local revision `770d69e`. Integration and deployment are pending until the task log supplies the remote revision and successful workflow run.

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
pnpm test:e2e tests/e2e/markdown-inventory.spec.ts --workers=1
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
