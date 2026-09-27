# Markdown audit — 2026-09-16

Scope: Markdown Workbench on main 3215f6826ebca52c3f062d189a545f1615fff035. No dependencies or unrelated tools changed.

## Findings addressed

1. Markdown parser had no highlight extension. Attach CodeMirror default highlight style to the source editor.
2. Existing syntax guide was hard to discover; fixed-height body calculation could clip wrapped headers. Label the trigger explicitly and use a centered flex dialog with a scrolling body.
3. Search/replace was keyboard-only. Add a visible button using CodeMirror's search panel.
4. Selection formatting lacked touch controls. Add bold, italic, strike, link, task and table insertion through undoable editor transactions.
5. Manual save reported success even after persistence failed. Return a success boolean and preserve the failure message.
6. Save completion cleared dirty state for newer edits. Compare the saved snapshot and draft ID to the current document.
7. Delayed file reads could overwrite subsequent edits. Cancel replacement when the source or request changes.
8. New and draft switching could discard edits before debounce completed. Save first; preserve the current editor on failure or intervening edits.
9. Starter copy used unexplained GFM jargon. Replace it with a plain-language example.

## Verification and completion

Baseline: 191 Markdown unit tests passed across 18 files. Production build with changes passed. Browser regressions cover highlight styling, selection formatting/undo, visible search, dialog focus return and landscape sizing, and failed storage preserving edits. Focused browser CI and deployment evidence is recorded below; the broader follow-up items remain open.

No truncated code or missing package import was confirmed in inspected files. This audit does not certify every possible Markdown extension or browser behavior.

## Follow-up — 2026-09-18

Both items left open above are now closed.

**Preview fenced-code language coloring.** `code-highlight-engine.ts` colors non-diagram fenced code blocks in the rendered preview using the exact same `defaultHighlightStyle` (from `@codemirror/language`) already mounted on the source editor, so preview tokens carry the same colors as the editor rather than a second highlighting theme. Each fence's `language-<lang>` class (the standard remark-rehype class, already used by `diagram-renderer.ts` to find mermaid/dot blocks) is resolved to a CodeMirror 5 "legacy mode" stream parser from `@codemirror/legacy-modes`, loaded lazily and cached, then walked with `@lezer/highlight`'s `highlightCode` — the documented approach for applying CodeMirror highlighting outside a live editor. `@lezer/highlight` was only resolving transitively before this; it is now an explicit dependency pinned to the exact version already in the lockfile (`1.2.3`), so no new package version entered the tree. About 40 language aliases are covered (js/ts/jsx/tsx, c/cpp/java/csharp/kotlin/objective-c/dart, css/scss/less, html/xml/svg, sh/bash, sql and its dialects, yaml, python, ruby, rust, go, swift, r, perl, lua, powershell, haskell, toml, dockerfile, groovy, pascal, fortran, diff, ini/properties, nginx, protobuf, coffeescript, elm, haxe, julia); an unrecognized language is left as plain, un-colored text rather than guessed at. Wired into the same debounced/idle render pass diagrams already use, sharing its generation guard, and re-measures scroll-sync anchors if coloring changed the DOM. Covered by `markdown-code-highlight.test.ts` (6 unit tests on the pure, DOM-free highlighting function) and a new e2e case in `markdown-workbench-ux.spec.ts` proving a recognized language renders multiple distinct token colors in the live preview and an unrecognized one stays plain.

**Delayed file-read cancellation and save-completion-during-typing.** Both guards (`loadMarkdownFile`'s revision/source check; `startNewDraft`/`loadDraft`'s save-then-check-for-intervening-edit) were already implemented per findings 7 and 8 above; only their dedicated browser regression was missing. Two new `markdown-workbench-ux.spec.ts` cases now reproduce each race directly: one gates `File.prototype.text()` open via `page.addInitScript`, types an intervening edit while the read is still pending, then releases it and asserts the load is cancelled with the document showing the edit rather than the file's content; the other gates the `indexedDB.open()` call underneath a "New document" save the same way, types while the save is pending, and asserts the switch is cancelled with the same edit preserved rather than discarded.

Verification: `tsc --noEmit` clean. Full Markdown unit suite (19 files, 202 tests including the two new files above) passes except the pre-existing, unrelated `markdown-citation.test.ts` timeout flake documented elsewhere in this repo's history. Full Markdown e2e suite (`markdown-workbench.spec.ts`, `markdown-workbench-ux.spec.ts`, `markdown-mermaid.spec.ts`) passes 86/86 on desktop and mobile Chromium; one transient failure during a heavily parallel run (the webserver process itself died mid-run) reproduced as a clean pass in isolation and was not a code defect. Production build passes.

## MVP completion pass — 2026-09-18 (second)

A user comparison against markdownlivepreview.com (a bare-bones reference: open/copy/export-PDF/reset/sync-scroll/dark-mode) flagged that despite already exceeding it in most dimensions (autosave drafts, math, diagrams, table formulas, citations, multi-format export), this tool was still missing several capabilities genuinely typical of a full markdown editor. Six gaps were found and closed:

1. **Formatting toolbar was thin.** Bold/Italic/Strikethrough/Link/Task/Table/Find-replace only — no heading, blockquote, inline/block code, lists, horizontal rule, or image insertion, despite the syntax guide already teaching all of these. `MarkdownEditor.tsx` gained: a stateless Heading button that cycles the caret's line through H1-H6 then back to a paragraph; a `toggleLinePrefix` helper for Blockquote/Bullet-list (toggles the prefix off if every selected line already has it); `toggleOrderedList` (same toggle behavior, renumbering 1./2./3.../); Inline code and Code block (fenced) via the existing `insertPattern`; Horizontal rule (inserts `---` on its own line); and an Image button matching the existing Link button's URL-insertion pattern.
2. **No image embedding.** Dropping a file over the editor only ever tried to open it as a new *document* (`loadMarkdownFile`). Pasting or dropping an actual image now embeds it as a `![alt](data:...)` data URI at the cursor/drop point — never uploaded anywhere, matching this tool's local-first design — via `EditorView.domEventHandlers({ paste, drop })` in `MarkdownEditor.tsx`. Capped at 5 MB with a clear status message past that; a non-image drop still falls through unhandled to the existing outer `.md`-file-open handler (verified both paths independently).
3. **GitHub-style alert blockquotes didn't render.** `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` rendered as an ordinary blockquote with the literal marker text visible — not part of remark-gfm (only tables/task-lists/strikethrough/autolinks/footnotes are). `github-alerts-plugin.ts` is a small remark (mdast) plugin rewriting the matched blockquote's `hName`/`hProperties` so remark-rehype emits a styled `<div class="markdown-alert markdown-alert-<kind>">` in its place, using the app's existing `--good`/`--warning`/`--danger`/`--signal` tokens for each kind's color rather than inventing new ones.
4. **No heading anchors.** No heading in the rendered preview or in any HTML/EPUB export had an `id`, so no link could ever target a specific section. `heading-id-plugin.ts` assigns the exact same GitHub-style slug the Outline panel already computes (extracted to a new shared `heading-slug.ts` so the two can never drift) — discovered empirically that `rehype-sanitize`'s `defaultSchema` (GitHub's own schema) clobber-prefixes `id`/`name` with `user-content-`, exactly matching what GitHub's own renderer does; both the plugin and the new Table of Contents button account for this prefix.
5. **No way to insert a Table of Contents.** A "Table of contents" toolbar button builds a nested markdown link list from `buildOutline()` at click time and inserts it at the cursor; each link's `#user-content-<slug>` anchor was verified end-to-end to actually land on its heading in the live preview.
6. **No emoji shortcodes.** `:tada:`, `:rocket:`, etc. were inert text. No emoji-shortcode package exists even transitively in this project (checked before adding one), so `emoji-plugin.ts` is a small curated map (~150 common GitHub shortcodes) applied as a remark text-node transform — inline code and fenced code blocks are separate mdast node types and are never visited, and an unrecognized shortcode is left exactly as written. The syntax guide dialog (`MarkdownSyntaxHelp.tsx`) gained matching examples for alerts, footnotes and emoji, plus a horizontal-rule example, so all of this is actually discoverable.

Verification: `tsc --noEmit` clean. `markdown-render.test.ts` gained 12 new cases (heading id assignment and de-duplication, id/slug parity with the Outline panel, all five alert kinds plus an unmarked-blockquote negative case, emoji conversion plus a negative case proving code fences are untouched, and a footnote-survives-sanitization check). Seven new `markdown-workbench-ux.spec.ts` browser cases cover the toolbar end-to-end, paste-to-embed, drop-to-embed, a plain `.md` drop still opening as a new document, alert rendering, emoji rendering, and the Table-of-Contents round trip landing on its real heading. Every new test passed repeatedly across multiple isolated and light-load runs on both desktop and mobile Chromium; the only failures seen were under sustained heavy concurrent/sequential load on this dev machine (the same page-load-timeout class of flake independently diagnosed for unrelated tools/branches earlier the same day), confirmed non-reproducing by isolated reruns and, in one case, by simply raising the assertion timeout. Two new dependencies were promoted from transitive to explicit and pinned to their already-resolved lockfile versions (`@lezer/highlight`, `unist-util-visit`) — no new package version entered the tree.

## Final completion pass — 2026-09-24

The two remaining Markdown-specific tracked gaps are closed.

**Toolbar document history (TASK-013).** CodeMirror's native Ctrl/Cmd+Z stack remains the fine-grained editing history so caret and selection behavior stay native. The workspace toolbar remains a separate document-level history, but adjacent editor transactions are now coalesced by edit proximity into one meaningful toolbar step instead of one snapshot per keystroke. Explicit document operations (open, draft load, new) and toolbar undo/redo reset the coalescing boundary. The visible controls are "Undo step" and "Redo step" with explicit accessible names that distinguish them from the editor's native history.

**Live table formulas (TASK-014 Markdown item).** Per-keystroke formula preparation no longer runs synchronously in React rendering. `table-formula-runner.ts` owns a reusable Worker, reuses it after completed work, terminates a busy stale worker when newer source arrives, correlates responses by request id, and falls back to synchronous evaluation only when Workers are unavailable. `table-formula.worker.ts` performs the existing closed-grammar evaluator unchanged, so formula semantics, cycle detection, and the no-`eval`/no-`Function` security property remain intact. Explicit export actions still prepare their one requested source snapshot synchronously; this does not recreate the removed typing-path stall.

**Regression proof.** The first CI pass failed only because the new runner module did not yet exist, proving the worker-runner test was red for the intended reason. After the runner existed but before workspace wiring, browser regressions still failed because no formula Worker was constructed and the new toolbar labels/behavior were absent. Final pre-integration run 36042091133 passed 154/154 unit files (1507/1507 tests), the production TypeScript/Vite build, and all 100 focused Markdown browser checks on desktop and mobile Chromium. No dependency was added.

Shared task-state files in this closeout were regenerated from the then-current `main` versions before the branch ref moved, preserving parallel workstream entries rather than replaying stale branch copies.

## Sources checked

- Official CodeMirror language source: https://github.com/codemirror/language/blob/main/src/highlight.ts
- WAI modal dialog pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN dialog element: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog

Research date: 2026-09-16 UTC. GOVERNANCE.md was read and not modified.

## Integration evidence

Implemented on main at 1e9bef197327337d638b5a0bfd50b203165fcc48. All 191 Markdown units pass after changes; Pages deployment succeeded. Live source highlight spans, syntax dialog opening/closing and visible find/replace were verified. Focused run 35144034742 passed 78/80 checks; both failures were an obsolete single-draft assumption in the same desktop/mobile test. The corrected test now verifies both preserved drafts and deletes only the requested one. Rerun 35144496126 at main 007be946664ebee98e05f9dd56ddf7d9183c23b1 passed all 50 checks in the affected workflow spec on desktop/mobile; build and Pages deployment also passed. The application source tree is identical to the first run, where all UX and Mermaid checks passed. Full validation fails outside Markdown in Vector tests.

## Gauntlet hardening — 2026-09-26

A post-completion adversarial pass closed four hardening contracts without expanding the Markdown feature ledger:

1. **Citation async snapshot safety.** A citation-format result is accepted only when bibliography, style, source/citekeys, and request generation still match the request that produced it, so a delayed formatter cannot overwrite newer document state.
2. **Table-formula Worker lifecycle safety.** The reusable Worker runner now rejects stale callbacks, recovers cleanly from termination/failure, and preserves the synchronous fallback when Worker construction is unavailable.
3. **Detached export sanitization.** Standalone/rendered export paths retain the same sanitized document boundary rather than allowing detached export assembly to reintroduce active unsafe markup.
4. **Graphviz SVG safety.** Generated SVG is parsed and rebuilt from the SVG root; executable/container elements and event-handler attributes are removed, unsafe navigation schemes are stripped, non-anchor external resource references are rejected while same-document fragments are preserved, and safe HTTP(S)/mailto/tel navigation links remain usable.

### Adversarial regression evidence

- The first safe-link browser assertion intentionally failed on branch head `e5910d2` because Playwright string `hasText: 'Safe'` also matched `Unsafe`; this was a test-locator defect, not a sanitizer failure.
- A role-based replacement then failed because imported Graphviz SVG anchors were not exposed as `role=link` in this browser surface. The final regression therefore asserts the real SVG DOM boundary directly: exact `Safe` and `Unsafe` anchor text, retained HTTPS `href` on `Safe`, null `href` on `Unsafe`, and no `javascript:` URL anywhere in rendered diagram markup.
- Focused branch run `36283681892` at `43721c0151dd0b0d2869d49bdb0d664c651c1140` passed **20 Markdown unit files / 215 tests**, production browser fixture build, and **106/106** desktop/mobile Chromium cases.
- Final PR run `36283957420` at durable head `3df572c5b08ff041fc07e34d13186b178707d9da` passed the repository unit suite (**195 files / 1956 tests**), production build, Chromium install, and **106/106** selected Markdown desktop/mobile browser cases.
- PR #79 was squash-merged to `origin/main` as product revision `9c005972e60c445700a45739865d4f0391cfd1ed`; the temporary Markdown-only workflow was deleted before integration and the PR branch was automatically removed after merge.
- Exact-main focused run `36284149989` passed the production build and **106/106** selected Markdown desktop/mobile Chromium checks on `9c005972`.
- Exact-main Pages run `36284150052` passed frozen dependency installation, repository unit tests and production build, built/uploaded the Pages artifact, and deployment job `108521673120` succeeded. Its repository-wide browser matrix was still running at the moment this record was written; Markdown completion does not depend on that duplicate broad check because the exact-main focused matrix is already green.
- A forced uncached fetch of `https://aahplexx.github.io/inmotools/#/tools/markdown-workbench` after deployment returned HTTP 200 and rendered the current Markdown Workbench production surface.

### Final audit notes

- No Markdown `FIXME` or `HACK` implementation markers, XHR/WebSocket path, or internal prompt/confidence/chain-of-thought text is present under `src/tools/markdown/`.
- Remaining `TODO` matches are comments in bundled upstream CSL style XML, not open Markdown implementation work.
- `fetch` usage is confined to export asset inlining/EPUB packaging for document-referenced images/styles; citation style and locale data remain bundled local static assets. No hidden telemetry or selected-file upload path was introduced by this hardening.
- Current Graphviz documentation confirms SVG supports graph-level stylesheet URLs and image/resource references. Graphviz's current SVG renderer emits the stylesheet as an XML processing instruction before the SVG root; root-only import therefore excludes it, while the sanitizer's non-anchor `href` policy rejects external SVG resource references.

### Sources checked for this pass

- Playwright locators: https://playwright.dev/docs/locators
- Graphviz `stylesheet`: https://graphviz.org/docs/attrs/stylesheet/
- Graphviz SVG renderer source (`gvrender_core_svg.c`): https://gitlab.com/graphviz/graphviz/-/blob/main/plugin/core/gvrender_core_svg.c
- Graphviz SVG output: https://graphviz.org/docs/outputs/svg/
- SVG 2 linking/external resources: https://www.w3.org/TR/SVG/linking.html

Research date: 2026-09-26 local / 2026-09-27 UTC. `GOVERNANCE.md` was read and not modified.


## Real-world remediation pass — 2026-09-27

Status: **COMPLETE — 7/7 accepted remediation functions verified on `14099c3c476d74bce943abc8a4623ced9435a9c7`.**

The prior completion record remains historical evidence, not a waiver for newly reproduced real-world defects. This pass started from `origin/main` at `48257af167d4296552ccb4e4b09570e0aee0a45d`; the pre-write focused-tool and Pages workflows on that revision were green. Scope is restricted to Markdown Workbench source, its browser regression suite, this handoff record, and the additive task-state entry.

### Seven-function acceptance ledger

- **F01 — dirty-safe file replacement:** opening or dropping another Markdown/plain-text document saves the current dirty document first. A failed save blocks replacement rather than discarding editor state.
- **F02 — imported-file draft isolation:** a document opened from disk receives a fresh browser-local draft identity, so its next autosave cannot overwrite the draft that was active before the open.
- **F03 — durable draft metadata:** autosave preserves the current effective document title instead of silently renaming a saved draft to "Autosave"; changing only the document name is dirty state and is autosaved; restoring a draft restores its saved timestamp.
- **F04 — hash-safe preview anchors:** same-document fragment links (including generated TOCs and footnotes) navigate inside the live preview without replacing the application's `#/tools/markdown-workbench` route. Standalone exports keep ordinary HTML fragment behavior.
- **F05 — Preview view:** Source, Split, and Preview are first-class modes. Preview uses the full workspace width while CodeMirror stays mounted, preserving its native selection/history across mode switches; Print/PDF accepts Split or Preview.
- **F06 — real file validation:** the picker hint is backed by runtime validation for `.md`, `.markdown`, `.txt`, `text/markdown`, and `text/plain`; unsupported selections are rejected without replacing the current document.
- **F07 — conventional formatting shortcuts:** CodeMirror handles Ctrl/Cmd+B, I, E, and K for bold, italic, inline code, and link insertion through the same formatting primitive used by the visible toolbar. Toolbar controls remain available for touch/pointer use and expose `aria-keyshortcuts`.

### Root causes closed in this pass

1. `loadMarkdownFile` replaced editor state after `File.text()` without first flushing a dirty document and without clearing `draftIdRef`. The first behavior could lose edits inside the 1.2-second autosave window; the second could make a later autosave of the imported file update the previously active draft record.
2. The generic autosave path called `persistDraft(source)`; the optional name parameter therefore collapsed an existing named draft back to "Autosave", and `documentName` changes alone never scheduled persistence.
3. The app is hash-routed, while rendered Markdown legitimately contains `#fragment` anchors. The preview previously let those anchors use browser-default hash navigation, which competes with the router's own `window.location.hash`. Preview-only click handling now keeps fragment navigation local to the rendered document.
   The same metadata audit also extended the existing pending-save race guards for New/load-draft transitions from source text alone to source text **or document-name changes**, matching the new dirty-state contract.
4. The file input's `accept` list was only a picker hint; no runtime file-kind check existed.
5. Common Markdown keyboard formatting conventions were absent despite equivalent visible toolbar actions already existing.

### Current primary references

- GitHub Docs — Keyboard shortcuts: https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
- GitHub Docs — Basic writing and formatting syntax: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
- MDN — `accept` HTML attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept
- MDN — `Location.hash`: https://developer.mozilla.org/en-US/docs/Web/API/Location/hash
- CodeMirror 6 guide/reference — keymaps and command precedence: https://codemirror.net/docs/guide/ and https://codemirror.net/docs/ref/
- W3C — WCAG 2.2: https://www.w3.org/TR/WCAG22/

### Validation evidence

- Exact-product focused run `36329231897` / job `108647853700`: production TypeScript/Vite build passed; focused selection resolved to all three Markdown browser specs; **118/118** desktop/mobile Chromium checks passed.
- Exact-product Pages run `36329231892`: **195 unit files / 1956 tests** passed, production build passed, Pages artifact build/upload passed, and deployment job `108647967903` succeeded.
- The repository-wide Playwright sweep in that Pages run finished with **953 passed, 22 skipped, 1 flaky**. The sole flaky case was outside Markdown (`tests/e2e/typing.spec.ts:439` on mobile Chromium) and passed on retry; Playwright's documented retry classification treats a first-attempt failure that passes on retry as `flaky`. No Markdown test failed.
- The focused run directly exercises F01/F02 together plus F03, F05, F06, F07, the name-only transition race guard, and an actual click of a generated TOC link for F04 on both configured Chromium projects.

This seven-function remediation is therefore closed. Any future Markdown work must be based on a newly verified defect or explicitly approved new scope rather than reopening this completed ledger.


## Historical branch reconciliation — 2026-09-27

Status: **ACTIVE — F08–F10 implemented; exact-main validation pending.**

After F01–F07 closed, the old branch `claude/markdown-tool-audit-docs-lwrb3w` was compared against current `origin/main` before branch cleanup. It has no open pull request and is far behind current main, so its tree is not safe to merge. Three behaviors in its unique commits were nevertheless still valid when re-verified against the newer production implementation:

- **F08 — export-safe fenced-code coloring.** Current main highlighted the live preview only. Detached HTML/EPUB export rendering called `renderMarkdown` and diagrams but never `highlightCodeBlocks`, so recognized fences exported as plain code. The current lazy/cached language loader is retained; highlighting now emits Lezer `classHighlighter`'s stable `tok-*` classes, live preview imports `code-highlight.css`, detached export runs the same highlighting pass, standalone HTML embeds the CSS when needed, and EPUB packages it in `styles/markdown.css`.
- **F09 — bounded cosmetic highlighting.** A recognized fence had no size bound even though highlighting is cosmetic and reruns during editing. `MAX_HIGHLIGHT_SOURCE_CHARS = 20_000` now returns the existing safe plain-code fallback before loading/parsing a grammar.
- **F10 — one authoritative export-asset contract.** `markdown-types.ts` still declared an unused `ExportAsset { filename, mimeType }` while the actual export pipeline uses `export-assets.ts`'s `ExportAsset { path, mediaType, data }`. The dead contradictory type is removed.

### Reconciliation evidence to run

- focused unit regression for the oversized-fence fallback;
- live browser regression proving recognized fences still receive visible token colors;
- real downloaded standalone HTML proving highlighted markup and its token CSS travel together;
- real downloaded EPUB proving the chapter and packaged stylesheet travel together;
- oversized-fence browser regression proving the source remains visible without token spans;
- exact-main production build and complete Markdown desktop/mobile browser matrix;
- exact-main Pages unit/build/artifact/deploy gate.

No dependency is added. Current official Lezer documentation describes `classHighlighter` as the highlighter that emits stable predictable token classes for external CSS; CodeMirror's own styling guidance uses static highlighting for non-editor HTML. The stale branch is treated as evidence only, not as an integration source of truth.
