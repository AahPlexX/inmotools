---
tool: markdown-workbench
folder: src/tools/markdown
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-markdown-workbench-design.md
tracker: src/tools/markdown/TRACKER.md
updated: 2026-10-07
---

# Markdown Workbench — tracker

## Resume here

Current ordered item: MDW-R35 definition lists, then MDW-R36 disclosure blocks. R35 remains partial. Native parsing, GFM compatibility patch, DOCX mapping, responsive CSS and local HTML import passed 6/6 production acceptance on the pre-formatter artifact. Native token-range formatter protection is implemented and passed 24/24 focused checks including nested tables, quote/list containers, CRLF and caret/marker collisions. An additional listItemIndent library correction allows native lists inside list items. Expanded item-boundary/multiple-term tests, canonical patch installation, TypeScript, clean build and real browser-worker checks are next. Do not certify the earlier browser artifact for this new formatter/patch.

First eleven frozen inventory items have scoped verification. Latest published R34 checkpoint: 1fe8211074ca9e5ecd5ee5f2d1640bffde983f39. R34 TypeScript, 95 focused units, 17 abbreviation cases, clean build and 6/6 production cases passed. Frozen R33 Markdown regression passed 194/194 (16.9m) on b40be9c8cd2085a1abe757238a2de8928eaaa92b; frozen R34 regression completed with 199 passes/1 failure (16.9m). The desktop preview-scroll case could not find the source editor before its interaction; inspect/reproduce separately before claiming a full regression pass. R29 canonical full validation 37551755268 passed on integrated/deployed f0ae6602. R31 integrated/deployed as 1e85224354e3513485ccf583c38d4fb1b93c3a01 with 190/190 Markdown checks; newer source still requires canonical full browser validation/integration.

R35 dependency changes are exact remark-definition-list 2.0.1 plus a canonical patch of micromark-extension-definition-list 2.0.2 in both exported builds. Existing locked versions were not upgraded; both lockfile YAML documents are retained. Workspace/patch shared changes fix reproduced GFM colon-row truncation and require full browser checks. Own node_modules links to isolated /workspace/inmotools-implementation-evidence/r35-dependencies/node_modules; original/frozen trees are untouched. Reproduce from committed source/tests and pinned pnpm; local artifacts are optional. Worktree ../inmotools-markdown-workbench; branch fix/markdown-workbench. Tool remains incomplete.

## Documents

- Spec: [2026-10-05-markdown-workbench-design.md](../../../docs/superpowers/specs/2026-10-05-markdown-workbench-design.md)
- Older design, plan and audits (history): [2026-09-04-markdown-workbench-design.md](../../../docs/superpowers/specs/2026-09-04-markdown-workbench-design.md), [2026-09-04-markdown-workbench.md](../../../docs/superpowers/plans/2026-09-04-markdown-workbench.md), [markdown-audit-2026-09-16.md](../../../docs/markdown-audit-2026-09-16.md) (F01–F10 ledger), [markdown-audit-2026-09-19.md](../../../docs/markdown-audit-2026-09-19.md), [README.md](README.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Task file: `.tasks/items/T-markdown-workbench-20261005-f698.md`; dark contrast: `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Code: `MarkdownWorkspace.tsx`, `MarkdownEditor.tsx`, `MarkdownPreview.tsx`, `*-engine.ts`, `*-plugin.ts`, workers
- Current ordered implementation checks and dated official sources: [VERIFICATION.md](VERIFICATION.md)
- Unit tests: `tests/unit/markdown-*.test.ts`; browser tests: `tests/e2e/markdown-workbench.spec.ts`, `tests/e2e/markdown-workbench-ux.spec.ts`, `tests/e2e/markdown-mermaid.spec.ts`, `tests/e2e/markdown-inventory.spec.ts`

`e2e` = the three Markdown browser specs unless another file is named; `unit` = `tests/unit/markdown-*.test.ts`.

## Requirement status

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| MDW-R01 | verified | e2e "editing the source updates the live preview, and toggling Source view hides it", "Preview view is full-width, responsive, and returns to the mounted editor without losing text" | |
| MDW-R02 | verified | e2e "editing the source updates the live preview, and toggling Source view hides it" | |
| MDW-R03 | verified | e2e "manual source scrolling keeps the split preview aligned without moving the caret", "scrolling the preview moves the source without jumping the caret to the top"; unit "interpolates linearly between two bounding anchors", "returns the nearest interpolated source line for a preview offset" | |
| MDW-R04 | verified | e2e "source highlighting, selection formatting and visible search work together" | |
| MDW-R05 | verified | e2e "the formatting toolbar covers heading, blockquote, code, lists, rule and image insertion", "source highlighting, selection formatting and visible search work together" | |
| MDW-R06 | verified | e2e "common Markdown formatting shortcuts match the visible toolbar actions", "GitHub-style quote and list shortcuts use the same Markdown actions as the toolbar" | |
| MDW-R07 | verified | e2e "formatting controls expose keyboard-accessible explanatory tooltips" | |
| MDW-R08 | verified | e2e "source highlighting, selection formatting and visible search work together" | |
| MDW-R09 | verified | e2e "MDW-R09 regex replacement and match case preserve unrelated text and remain undoable" | Desktop and touch phone pass on 2026-10-06; preserves case-distinct text and editor Undo |
| MDW-R10 | verified | e2e "syntax suggestions are on by default, context-aware, and can be disabled" | |
| MDW-R11 | verified | e2e "editor settings expose usable touch targets and visible font-size feedback", "changing the font size keeps the caret and document intact" | |
| MDW-R12 | verified | e2e "MDW-R12 editor settings persist and Vim normal mode resumes after reload", "MDW-R12 invalid stored preference values fall back to usable editor settings" | Desktop/touch pass; malformed values fall back to supported defaults |
| MDW-R13 | verified | e2e "toolbar undo groups adjacent typing into one document step and redo restores it"; unit "undo restores the previous present and pushes the current one into future", "caps the past at 100 entries, dropping the oldest first" | |
| MDW-R14 | verified | e2e "focus writing hides secondary chrome but keeps an obvious exit control" | |
| MDW-R15 | verified | e2e "MDW-R15 typewriter keeps first and last caret lines centered through orientation changes" | Desktop/touch pass; first/last line, landscape resize and reversible edit behavior |
| MDW-R16 | verified | e2e "markdown help opens an accessible syntax guide modal with supported examples", "syntax guide fits narrow landscape and keeps its close control reachable" | |
| MDW-R17 | verified | e2e "MDW-R17 bounded table builder inserts chosen dimensions and supports cancel and undo" | Desktop/touch pass; quick Table starter retained; 1–100 data rows, 1–20 columns; header separate |
| MDW-R18 | verified | e2e "MDW-R18 style suggestions report source lines, reveal the caret and preserve valid hard breaks"; unit "reports heading jumps, adjacent mixed bullets and trailing whitespace at their actual source lines" | Literal code/math/HTML/frontmatter and intentional hard breaks preserved; first200 suggestions and total shown |
| MDW-R19 | verified | e2e "MDW-R19 auto-format aligns a table, keeps literals and can undo the whole formatting action", "MDW-R19 a delayed formatter cannot overwrite a newer edit"; unit "preserves code and document extensions and returns a usable mapped caret" | Production desktop/touch pass; worker-only DOM dependency removed; metadata/code preserved and stale work cancelled |
| MDW-R20 | verified | e2e "MDW-R20 Vim write saves the named draft without relying on the autosave timer", "MDW-R20 Vim write reports local storage failure without losing the document" | Production desktop/touch 4/4; reload, restore and renamed draft retained; transaction failure preserves source |
| MDW-R21 | verified | unit "parses CommonMark headings and paragraphs with source line positions", "parses GFM tables as a single top-level node", "parses GFM strikethrough and task lists without throwing", "renders a GFM table", "renders a footnote reference and its body" | |
| MDW-R22 | verified | unit "strips raw script tags from the rendered output, leaving only the inert text", "strips a javascript: URI from a link", "strips inline event handler attributes from raw HTML"; e2e "Standalone HTML export keeps sanitized Markdown inert through the detached render path" | |
| MDW-R23 | verified | e2e "ATX heading levels are visibly distinct in the rendered preview" | |
| MDW-R24 | verified | unit "gives every heading a GitHub-style anchor id, de-duplicated against repeats", "assigns a heading's rendered anchor id to the exact same slug the outline panel uses" | |
| MDW-R25 | verified | e2e "inserting a table of contents links to and lands on the actual rendered heading" | |
| MDW-R26 | verified | e2e "inserting a table of contents links to and lands on the actual rendered heading" | |
| MDW-R27 | verified | e2e "fenced code blocks are colored by language in the live preview"; unit "wraps a recognized language into styled spans without losing any source text", "leaves an unrecognized language as plain escaped text instead of guessing" | |
| MDW-R28 | verified | e2e "an oversized recognized fence remains readable without running cosmetic syntax highlighting"; unit "leaves an oversized recognized fence plain instead of parsing it for cosmetic highlighting" | |
| MDW-R29 | verified | e2e "MDW-R29 numbered code copies every literal line and keeps preview controls out of HTML exports", "MDW-R29 denied clipboard access offers selection of code without line numbers", "MDW-R29 long code keeps the numbered gutter bounded while showing the last lines", "MDW-R29 selecting code inside a task preserves its checkbox while ordinary task clicks still work", "MDW-R29 code controls wrap through orientation changes and print without clipping or copy controls" | Production desktop/touch checks 12/12 including ordinary task toggling; TypeScript and clean build passed. Canonical full validation passed on integrated/deployed f0ae6602 (run 37551755268) |
| MDW-R30 | verified | e2e "GitHub-style alert blockquotes render as styled callouts instead of plain quotes"; unit "leaves an ordinary blockquote without a marker untouched" | |
| MDW-R31 | verified | e2e "MDW-R31 DANGER previews preserve formatting and literal escapes through orientation changes", "MDW-R31 standalone HTML and EPUB retain the callout title, body and self-contained styling"; unit "renders %s with a title, body formatting and source anchor", "keeps an escaped %s marker literal", "retains existing alert styling in standalone HTML", "packages existing alert styling in EPUB" | Production acceptance plus alert/guide regression 10/10; light/dark contrast, 320px/landscape, source escapes and detached exports passed. Unit checks 54/54, TypeScript/build passed; 190/190 Markdown regression and integration/deployment passed; canonical cross-tool checks pending |
| MDW-R32 | verified | e2e "a recognized emoji shortcode renders as its emoji in the live preview"; unit "converts a recognized emoji shortcode and leaves an unrecognized one exactly as written", "does not convert emoji-shaped text inside inline code or a fenced code block" | |
| MDW-R33 | verified | e2e "MDW-R33 scripts preserve literal boundaries and readable bounds through orientation changes and formatting", "MDW-R33 actual HTML, EPUB, DOCX, AST and clipboard exports retain script semantics"; unit "keeps script heading text and IDs consistent between outline and preview" | TypeScript, 80 focused units, clean build, 4/4 production cases and 194/194 frozen Markdown regression passed; canonical cross-tool/integration pending |
| MDW-R34 | verified | e2e "MDW-R34 abbreviation glossary is readable without hover through orientation changes and formatting", "MDW-R34 actual exports preserve semantic abbreviations, accessible expansions and readable DOCX", "MDW-R34 removing definitions or their uses clears the glossary and never leaks earlier definitions" | TypeScript, 95 focused units, 17 abbreviation cases, clean build and 6/6 production cases passed; broader regression/integration pending |
| MDW-R35 | partial | tests/unit/markdown-definition-lists.test.ts; tests/e2e/markdown-definition-lists.spec.ts | Native parser, nested-list/GFM compatibility patch, exports/import and opaque formatter implemented; final production worker checks pending |
| MDW-R36 | missing | — | Raw HTML is not rendered |
| MDW-R37 | verified | e2e "live counts stay visible and a preview task click edits the source"; unit "checks an open task and unchecks a completed one" | |
| MDW-R38 | missing | — | |
| MDW-R39 | verified | unit "parses a YAML frontmatter block delimited by ---", "parses a TOML frontmatter block delimited by +++", "parses a JSON frontmatter block delimited by braces"; e2e "surfaces frontmatter and uses its title for exports" | |
| MDW-R40 | verified | unit "renders a valid inline expression to KaTeX markup", "renders a valid display-mode expression", "renders the mhchem \\ce{} chemistry notation", "renders the native CD commutative-diagram environment in display mode" | |
| MDW-R41 | verified | e2e "reports malformed math without breaking the preview"; unit "reports a malformed expression with its line and an explanation" | |
| MDW-R42 | verified | e2e "renders Mermaid in the real browser integration and preserves its source anchor", "shows Mermaid failures as visible accessible errors instead of title-only help", "turns the Mermaid 12 Gantt metadata crash into a line-specific authoring error", "rejects oversized Mermaid source before the library can substitute a different diagram" | |
| MDW-R43 | verified | e2e "Graphviz output cannot inject an active javascript URL into the preview" | |
| MDW-R44 | verified | e2e "evaluates a table formula and keeps a static cell untouched", "table formula preparation runs in a background worker"; unit "detects a direct two-cell cycle (A1 -> B1 -> A1) and reports it without evaluating", "never uses eval() or the Function constructor internally" | |
| MDW-R45 | verified | unit "splits a document into multiple slides on --- boundaries", "records the correct starting source line for each slide" | |
| MDW-R46 | verified | e2e "resolves a pasted .bib citekey and substitutes the formatted citation into the document", "loads a bibliography from a local file and resolves citations from it" | |
| MDW-R47 | verified | unit "formats an APA in-text citation and bibliography entry for a resolved citekey", "formats an IEEE numeric in-text citation", "formats a Chicago author-date in-text citation", "formats an MLA in-text citation" | |
| MDW-R48 | verified | e2e "an unresolved citekey is reported and left verbatim in the document", "a citation marker inside a code fence is never rewritten" | |
| MDW-R49 | verified | e2e "changing citation style never shows a stale previous style while the new style loads" | |
| MDW-R50 | verified | e2e "invalid bibliography input explains the parse problem instead of failing silently" | |
| MDW-R51 | missing | — | In-text citations are substituted; no reference list is generated |
| MDW-R52 | verified | e2e "builds a clickable outline from the document headings", "outline supports filtering and marks the current source section" | |
| MDW-R53 | verified | e2e "live counts stay visible and a preview task click edits the source" | |
| MDW-R54 | verified | e2e "document metrics show characters and lines alongside words and sentences"; unit "counts words and sentences in a simple two-sentence passage", "computes a Gunning Fog index from words, sentences, and complex words" | |
| MDW-R55 | missing | — | Gunning Fog exists |
| MDW-R56 | missing | — | AST JSON export exists |
| MDW-R57 | missing | — | |
| MDW-R58 | verified | e2e "opens a local Markdown file without uploading it", "file selection validates Markdown or plain text instead of trusting accept alone", "dropping a .md file over the editor still opens it as a whole new document" | |
| MDW-R59 | verified | e2e "local HTML files import as Markdown without upload" | |
| MDW-R60 | verified | e2e "opening a file saves dirty work first and gives the imported file a separate draft identity" | |
| MDW-R61 | verified | e2e "a delayed file read that loses a race with a newer edit is cancelled instead of overwriting it", "starting a new document while its save is still pending is cancelled instead of discarding the newer edit", "starting a new document while a name-only change races its pending save is cancelled" | |
| MDW-R62 | verified | e2e "a pasted or dropped image is embedded locally as a data URI without uploading anything" | |
| MDW-R63 | verified | e2e "untouched default content does not create a local draft on the autosave timer"; unit "saves a draft and lists it back" | |
| MDW-R64 | verified | e2e "document names survive autosave and a name-only edit is persisted" | |
| MDW-R65 | verified | e2e "saves, lists, reloads and deletes a local draft"; unit "removes a draft by id", "lists drafts most-recently-updated first" | |
| MDW-R66 | verified | e2e "manual save reports IndexedDB failure but a clean document can still start New" | |
| MDW-R67 | verified | unit "reports usage and quota when the browser storage API is available", "returns null fields, rather than throwing, when the storage API is unavailable" | |
| MDW-R68 | implemented | `MarkdownWorkspace.tsx` (`beforeunload`) | No test |
| MDW-R69 | missing | — | Each draft keeps its latest text only |
| MDW-R70 | missing | — | Drafts are switched one at a time |
| MDW-R71 | missing | — | |
| MDW-R72 | missing | — | |
| MDW-R73 | verified | e2e "the document name drives every export filename and defaults from the document title"; unit "slugifies a plain document title" | |
| MDW-R74 | verified | e2e "exposes every export control and downloads Markdown, HTML and AST JSON", "the rendered Markdown export carries evaluated formulas while the plain export keeps the source" | |
| MDW-R75 | verified | e2e "HTML export still contains the document when exporting from Source view", "standalone HTML export preserves fenced-code syntax colors with self-contained CSS", "Source-view standalone HTML renders Mermaid instead of exporting its code fence"; unit "inlines referenced HTML images for a genuinely standalone export" | |
| MDW-R76 | verified | e2e "routes the Print / PDF export through the browser print dialog rather than a direct download" | |
| MDW-R77 | verified | e2e "downloads a DOCX and a structural EPUB"; unit "preserves fenced code, blockquotes, ordered-list semantics, links, and image references", "preserves DOCX footnote references and definitions", "falls back to an italic plain-text paragraph for math when no image resolver is supplied" | |
| MDW-R78 | verified | e2e "downloads a DOCX and a structural EPUB", "EPUB export packages the fenced-code token stylesheet with highlighted markup", "Source-view EPUB packages rendered Mermaid SVG instead of its code fence"; unit "stores the mimetype file uncompressed as the EPUB specification requires" | |
| MDW-R79 | verified | e2e "exposes every export control and downloads Markdown, HTML and AST JSON"; unit "serializes the parsed syntax tree losslessly to formatted JSON" | |
| MDW-R80 | verified | e2e "Copy HTML preserves fenced-code token classes in the copied rendered fragment", "Source-view Copy HTML awaits rendered Mermaid instead of copying its code fence" | |
| MDW-R81 | missing | — | |
| MDW-R82 | missing | — | |
| MDW-R83 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The workspace has its own Dark workspace switch; the 2026-10-04 `E2E_THEME=dark` axe run found color-contrast violations in this workspace |
| MDW-R84 | verified | e2e "dark workspace is readable and reversible without changing document content" | |
| MDW-R85 | missing | — | |
| MDW-R86 | partial | e2e "stays readable without overflow or collisions at <name>" | Tested at 320, 390, 844, 768, 1024, 1280 and 1440 px; 1920 and 2560 px have no test |
| MDW-R87 | verified | e2e "stays readable without overflow or collisions at <name>"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" | |
| MDW-R88 | verified | e2e "catalog link, exact alias, and generic route open the same local workspace" | |
| MDW-R89 | verified | e2e "markdown page copy reads like product guidance rather than implementation notes" | |
| MDW-R90 | verified | e2e "toolbar clearly groups workspace, document, editor and export controls" | |
| MDW-R91 | verified | unit "inlines referenced HTML images for a genuinely standalone export", "turns referenced images into EPUB package assets" | |
| MDW-R92 | verified | unit "runtime-caches lazy Mermaid diagram chunks that are intentionally excluded from precache" | |

## Open work

1. Tests for implemented rows: MDW-R68.
2. Editing: listed editing requirements complete; retain regression coverage.
3. Markdown syntax and rendering: MDW-R33, MDW-R34, MDW-R35, MDW-R36, MDW-R38.
4. Citations: MDW-R51.
5. Navigation and metrics: MDW-R55, MDW-R56, MDW-R57.
6. Files and storage: MDW-R69, MDW-R70, MDW-R71, MDW-R72.
7. Export: MDW-R81, MDW-R82.
8. Non-functional: MDW-R83, MDW-R85, MDW-R86.

## Known limitations

- DOCX math is plain text; EPUB is not EPUBCheck-validated; PDF uses the browser print dialog.
- Vancouver citation style is not offered (dependent CSL styles).
- Images embedded by paste or drop are capped at 5 MB.

## Verification evidence

- 2026-10-06: MDW-R20 production acceptance passed 4/4 (54.2s), including saved-name reload/restoration/rename and storage-failure source preservation. TypeScript and build passed. Six earlier inventory items integrated as fc6a820f315bbc8abfed5e4e6094dbef3b8a799e; integration run37535034041 and Pages run37535764096 succeeded. Full regression remains pending.

- 2026-10-06 21:33 UTC: combined MDW-R09/12/15/17/18/19 production acceptance passed 16/16 (57.3s) with normal motion defaults, including lint bounds at 320 portrait and 844 landscape, formatter Undo and a delayed-worker edit race. Formatting engine tests passed 5/5; TypeScript check and clean build passed. Full regression/integration pending.

- 2026-10-06: MDW-R18 missing-control baseline failed 2/2; implementation passed 2/2 on desktop/touch (1.2m). Lint unit tests passed 5/5; TypeScript check passed. Source changes are in this checkpoint; full regression and release remain pending.

- 2026-10-06, production checkpoint `770d69e`: MDW-R09/12/15/17 combined acceptance passed 10/10 (32.1s). Production build passed. New owned tests outside the tool folder require full browser checks under GOVERNANCE.md; that run is in progress and no full-regression or integration success is claimed.

- 2026-10-06: `markdown-inventory.spec.ts --grep MDW-R17`: 2/2 passed desktop/touch (13.7s), including invalid dimensions, 3×4 rendered table, cancellation/focus and Undo. `tests/unit/markdown-table-builder.test.ts` passed 9/9 (valid GFM dimensions and8 invalid boundaries); TypeScript check passed. No runtime dependency change.

- 2026-10-06: `markdown-inventory.spec.ts --grep MDW-R15` passed 2/2 desktop/touch (14.5s); missing-control baseline failed 2/2. Initial/last caret lines stay within 24px of editor center after landscape resize; disabling the option retains editable source. Checkpoint code changes are in the same commit; release/regression checks pending.

- 2026-10-06, local checkpoint based on `97e1b9d`: `node node_modules/@playwright/test/cli.js test --config /workspace/inmotools-implementation-evidence/playwright.config.mjs markdown-inventory.spec.ts`: 6/6 passed for MDW-R09/12 (desktop/touch); type check passed. Initial malformed-value baseline failed on both projects; valid-Vim test assertion normalized DOM text before rerun. Pending: full/shared-scope regression checks, remote checkpoint and CI/deployment.

- 2026-10-06, base `82c03cd9257213babf4fedc5e4ca32cebb63e135`: `node node_modules/@playwright/test/cli.js test --config /workspace/inmotools-implementation-evidence/playwright.config.mjs markdown-inventory.spec.ts --grep MDW-R09`: 2/2 passed, desktop Chromium1440×900 and touch Chromium390×844. Test file `tests/e2e/markdown-inventory.spec.ts`; test source is included with this checkpoint. Config uses reduced motion, blocked service workers and software WebGL. Full/shared-scope regression checks and integration are not yet complete.

- 2026-10-05, branch `expand/markdown-workbench`: `pnpm tool:check markdown-workbench --base origin/main`: incomplete, 64/92, no errors; `pnpm docs:check` clean; `vitest run` cad-progress, sheets-wave-b, deployment-config 23/23.

## Change log

- **2026-10-05:** Created with the spec; 92 requirements.

- 2026-10-06 22:25 UTC: MDW-R29 production acceptance passed 12/12 (1.5m) on the guard build. Clipboard and manual fallback preserve terminal newline, 2000-line gutter DOM stays bounded, 320px/landscape controls remain reachable, print removes controls and clipping, and code interaction preserves nested task state. TypeScript/build passed. Cursor MDW-R31; broader regression and publication remain pending.

- 2026-10-07 00:23 UTC: GitHub confirmed R29 source 22f886e35490e2dd5f6257827a33c1757c8f91cb integrated as f0ae66023ecdc754f5681b39b5502c3d59ca5c0e. Integration run 37540554800 and Pages run 37541230836 succeeded. Canonical full validation run 37538813696 passed on preceding seven-item revision bcdd08ea. Requested full validation on current R29 main; its result is not yet available. Cursor MDW-R31.

- 2026-10-07 00:27 UTC: R31 implementation adds DANGER, source-aware literal markers and shared alert CSS in preview/HTML/EPUB. TypeScript passed. Unit checks: 52 passed, 2 failed; failures are unresolved. Browser baseline on unchanged R29 production failed 4/4. Current R31 is partial; production acceptance/release pending.

- 2026-10-07 00:29 UTC: both remaining unit failures came from the default unit runner replacing CSS imports with empty strings, confirmed in official Vitest CSS documentation. The owned test now supplies the tracked stylesheet to verify export logic; production browser checks will verify actual Vite inline CSS. Corrected unit rerun is pending. Clean R31 production build passed.

- 2026-10-07 00:32 UTC: MDW-R31 production acceptance/alert and guide regression passed 10/10 (30.8s). Source 8787c115 published and local/remote trees equal. Cursor MDW-R33. Integration run 37552440278 and frozen full Markdown regression are in progress.

- 2026-10-07 00:54 UTC: R33 baseline 10 failed/7 passed. Native parser extension, parse/render integration, DOCX script runs and syntax help implemented; type-only direct pin reuses locked 2.0.2. Current checks not yet run; do not mark verified. R31 frozen Markdown regression passed 190/190 (13.9m).

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

- 2026-10-07 01:22 UTC: R33 frozen Markdown regression passed 194/194 (16.9m); separate from R34/R35. R35 baseline 6 failed/2 passed. Native library review found documented GFM colon-row incompatibility, requiring reproduction/fix. Isolated pinned dependency installation remains pending; existing dependencies/artifacts are unchanged.

- 2026-10-07 01:25 UTC: isolated pnpm 12.3.4 add/install succeeded in 15.4s. Native binary/package registry integrity matched; existing locked dependency versions were unchanged. App manifest adds only exact remark-definition-list 2.0.1; canonical lock retains both YAML documents. Own dependency link now points to the isolated installation; original/frozen dependency trees are untouched. Native R35 integration begins; GFM/table/export compatibility checks remain pending. Frozen R34 full Markdown regression is running on source/tests 1fe8211 and immutable print-corrected artifact.

- 2026-10-07 01:26 UTC: native R35 checks 5 failed/5 passed. Two failures confirm GFM colon rows were interrupted at root/nested table positions; package patch excludes table row/head tokens from term eligibility in both exported builds. DOCX structural mapping added because unsupported native nodes produced an empty document. Other two failures were overly strict source-line attribute assertions and a colon fixture with a valid prior paragraph term; corrected without changing grammar. Rerun/type/style/build/browser checks pending.

- 2026-10-07 01:33 UTC: latest patch distinguishes completed GFM delimiter exit events from provisional headers at the current source offset. Confirmed-token unit rerun is running; previous refinement had 103 passes/6 failures, TypeScript/build passed but behavior remained incomplete. Definition-list HTML import rules added using the official Turndown addRule API (primary README HTTP 200 at 01:33:15). First browser baseline attempt had duplicate Playwright module instances from mixed dependency roots; that is an environment failure, not product evidence. Corrected isolated runner baseline is next.

- 2026-10-07 01:36 UTC: private flow diagnostics confirmed tight terms are provisional tableRow tokens under unfinished tableHead tokens. Temporary instrumentation was restored. The canonical package patch now accepts provisional candidates and protects completed GFM tables; root/nested/first-body-row and definition-after-table cases are tracked. Latest correction checks pending; R35 remains partial. Shared pnpm workspace/patch files are necessary for this reproduced compatibility bug; full canonical browser checks remain required.

- 2026-10-07 01:37 UTC: candidate-header patch passed all 109 focused units (17.86s); TypeScript passed. Pinned pnpm 12.3.4 frozen installation passed with resolution skipped (712ms), validating manifest/workspace/patch/lock consistency. Corrected browser baseline on unchanged R34 failed 6/6. Extra nested formatter cases are running; corrected production rebuild/acceptance pending. R35 remains partial.

- 2026-10-07 01:39 UTC: 109 focused units passed on the candidate-header correction; TypeScript, frozen installation and clean build passed. Added nested formatter cases had 14 passes/1 failure: a definition-contained table becomes a paragraph and a second definition after formatting. R35 remains partial. Protect native definition-list/container ranges in the browser-safe formatter, then rerun/build/acceptance. Current source, failing regression and next action are checkpointed together.

- 2026-10-07 01:45 UTC: R35 production acceptance passed 6/6 (43.9s): orientation/bounds, actual HTML/EPUB/DOCX/AST exports and nested local HTML import. Additional unit formatter regression remains failing, so R35 stays partial. Frozen R34 full Markdown regression ended 199 passed/1 failed (16.9m); desktop preview-scroll setup timed out locating the source editor. No full-pass claim; inspect and reproduce that failure. Next: expanded formatter/container tests, clean build and actual browser-worker verification.

- 2026-10-07 01:47 UTC: partial checkpoint published as 9c30efe715319f82ef2a1bfa5eea2b6f6b8af46a. Formatter protection is now drafted from native micromark token ranges, preserving enclosing quote/list containers and rejecting unsafe restoration. Added nested/caret/CRLF/private-character collision cases; validation pending. Exact direct pins reuse locked micromark 4.0.2, GFM extension 3.0.0, math extension 3.1.0 and patched definition extension 2.0.2. Initial add left a broken direct micromark link, causing TypeScript/import failures before tests; isolated frozen installation is being repaired. Official micromark README fetched HTTP 200 at 01:46:23; published 4.0.2 exports parse/preprocess/postprocess and declares sideEffects false. Actual browser-worker verification remains mandatory. R34 preview-scroll reproduction is running on its frozen artifact.

- 2026-10-07 01:50 UTC: R34 frozen preview-scroll reproduction passed 2/2 (26.3s); original full run remains 199/200, with engine-loading timeout as observed evidence and no determined root cause. Native opaque-block formatter passed 24/24 focused cases after diagnosing another library bug: listItemIndent blocked valid terms inside list items. Both exported library builds now skip that prefix; canonical patch generation and expanded item-boundary/multiple-term cases are pending. Direct dependency lock links repaired using pinned pnpm; unrelated jszip transitive deduplication was reverted to retain every existing locked version. Frozen installation passed (12.3s). R35 remains partial until clean build/browser-worker and expanded regression checks pass.

- 2026-10-07 01:51 UTC: expanded nested-list tests found one further parser failure (25 passed/1 failed): only the final term survived when list-item indentation separated multiple terms. Backward term collection now skips the same non-content prefix tokens while retaining item boundaries. Expanded eight-file unit run and regenerated canonical package patch are in progress; no verified-state change. Formatter and parser changes still require production worker checks.

- 2026-10-07 01:51 UTC: expanded eight-file checks passed 118/118 (10.18s). Canonical regenerated patch installed; frozen pnpm installation passed with resolution skipped (81ms). Every prior locked version is retained; only direct parser pins and patch hashes changed. Clean TypeScript/build and repeated units on the final installed patch are running. R35 production worker/Undo regression remains pending; cursor stays R35.
