# Markdown Workbench — Implementation Plan

**As of:** 2026-09-24
**Design:** `docs/superpowers/specs/2026-09-04-markdown-workbench-design.md`

## Status

Complete. Registered as the `markdown-workbench` suite. The original delivery and completeness audit were followed by the 2026-09-18 MVP expansion and the 2026-09-24 final completion pass. No Markdown-specific accepted work remains in `NEXT.md` after TASK-013 and TASK-014's Markdown performance finding were closed.

## Slices

1. **Engines and local workers.** `src/tools/markdown/` contains the parsing, rendering, document-pipeline, table-formula, citation, math, diagram, outline, frontmatter, prose-metrics, scroll-sync, slide, state, autosave and export engines plus the formula/diagram worker boundaries. Pure logic stays independently testable; browser-only orchestration is isolated behind narrow runners.
2. **Engine tests.** Markdown-focused unit suites cover parser/render behavior, cyclic and malformed formulas, worker reuse/cancellation, all three frontmatter formats, citation extraction/substitution, math diagnostics, history behavior, autosave, highlighting, export shape and filename derivation.
3. **Editor.** `MarkdownEditor.tsx` — CodeMirror 6 with markdown language support, search, bracket closing, and optional Vim keybindings. Every setting is held in a `Compartment` so changes reconfigure in place; externally applied document swaps are annotated out of CodeMirror's history.
4. **Preview.** `MarkdownPreview.tsx` — sanitized render, then a debounced generation-tokened diagram pass that replaces `mermaid` and `dot` fences with rendered SVG and terminates superseded Graphviz workers.
5. **Workspace.** `MarkdownWorkspace.tsx` — toolbar, name bar, split layout, status line, and seven collapsible panels; owns the document pipeline result that the preview and every export consume.
6. **Assets.** Four CSL styles and the en-US locale bundled under `csl-assets/` as build-time static imports; `citeproc.d.ts` supplies the narrow ambient declaration citeproc lacks.
7. **Styles.** Appended to `src/styles.css` using the shared surface palette, with a single-column collapse below 860 px and a print stylesheet gated on a body class.
8. **Registration.** Catalog entry and `ToolSlug` union in `src/catalog.ts`, lazy loader in `src/tools/workspaces.tsx`.
9. **Precache policy.** `vite.config.ts` `globIgnores` excludes the suite chunk, the Graphviz worker, Mermaid's per-diagram-type chunks, the CSL style chunks, and the KaTeX fonts, following the discipline established for DuckDB and Pyodide under TASK-003, so a visitor who never opens the suite never downloads them.
10. **Browser tests.** `markdown-workbench.spec.ts`, `markdown-workbench-ux.spec.ts`, and `markdown-mermaid.spec.ts` cover routing, authoring, grouped toolbar history, live Worker-backed formulas, formatting, local image/file flows, diagrams, exports, citations, outline/diagnostics/drafts, responsive layout and accessibility across desktop and mobile Chromium.

## Completeness audit (pull request 8)

The audit looked specifically for capability that existed but was unreachable, and for places where two code paths could disagree about the same document. It found both.

Defects fixed: citations were formatted and discarded, so no marker was ever replaced; the preview and exports had diverged into two transformation paths; HTML and EPUB produced an empty body from Source view; the unsaved-changes prompt fired for untouched documents; the editor rebuilt on every font-size step; print emitted the whole application shell; Graphviz workers were never cancelled; and external swaps polluted CodeMirror's history.

Unreachable code wired: `deleteDraft` (exported and unit-tested with no interface, so drafts could not be removed), parsed frontmatter, `renderMath`, the storage quota estimate, and a slide list that rendered only a count.

Added: outline, math diagnostics, local file open, bibliography picker, document naming, draft management, clipboard actions, and a rendered-Markdown export.

## Verification

- 343 unit tests pass, up from 300 before the audit.
- `tsc --noEmit -p tsconfig.app.json` clean; the suite code-splits into its own chunk.
- Build clean. Precache 111 entries at roughly 11.5 MB, with zero heavy-asset leaks and zero sourcemaps published.
- 202 browser tests pass across `desktop-chromium` and `mobile-chromium`, up from 180; the catalog-driven accessibility sweep covers the new route automatically.

## Deliberately excluded

Native Word equations, EPUBCheck validation, client-side PDF generation, and the Vancouver citation style — each rejected for a stated technical reason rather than deferred, and each surfaced in the interface rather than left implicit. See the design document's capability limits.

## Final follow-up — 2026-09-24

TASK-013 is complete without merging the two stacks: CodeMirror retains fine-grained native undo/caret behavior, while the toolbar groups adjacent editor changes into coarse document steps and resets that grouping across explicit document operations. TASK-014's Markdown-specific main-thread finding is also complete: live table-formula preparation runs in a cancellable local Web Worker. Final pre-integration validation run 36042091133 passed 154/154 unit files (1507/1507 tests), the production build, and all 100 focused Markdown browser checks.
