# Done

## TASK-011: Close the Markdown Workbench completeness gaps
**Priority:** P0 | **Tags:** local-first, editor, export, correctness

An audit of the shipped suite found capability that was built and unit-tested but never reachable from any caller, alongside defects that made the same document export inconsistently.

Corrected behaviour: formatted in-text citations are now applied to the document, where previously `formatCitations` produced a citation map that nothing consumed and every `[@citekey]` marker stayed literal; substitution skips fenced and inline code so a document that demonstrates the syntax is never rewritten, reduces citeproc HTML fragments to text because raw HTML is escaped by the renderer, and leaves an unresolved marker verbatim so it stays visible. The preview and all five exports now share one `prepareDocument` pipeline, replacing a split where HTML and EPUB read the substituted preview while DOCX and AST JSON parsed raw source, so one formula cell could export as `10` in one format and `=B2*C2` in another. Also fixed: HTML and EPUB wrote an empty document body when exported from Source view because the preview pane they read is not mounted in that mode; the unsaved-changes prompt was armed on mount and fired for untouched documents; `fontSize` and `spellcheck` sat in the editor construction dependencies so every slider step destroyed and rebuilt CodeMirror, discarding caret, selection, scroll position and undo history; `window.print()` had no print stylesheet and printed the whole application shell; Graphviz created a worker per diagram per render pass and never cancelled superseded ones; and externally applied document swaps entered CodeMirror's history, so Ctrl+Z immediately after a toolbar Undo reversed the undo.

Previously unreachable code now wired: `deleteDraft`, which was exported and unit-tested with no interface, leaving drafts unremovable; parsed frontmatter; `renderMath`; the storage quota estimate; and a slide list that rendered only a count.

Added: document outline with click-to-navigate, frontmatter panel, math diagnostics listing malformed expressions by line, local `.md` open by picker and drag-and-drop, bibliography file picker, document naming that drives every export filename and title, draft save, load, delete and new with Ctrl/Cmd+S, clipboard copy for source and rendered HTML, and a rendered-Markdown export.

Export filenames now derive from the document title instead of a hardcoded `document.*`. Unit assertions rose from 300 to 343 and browser tests from 180 to 202. Merged as pull request 8.

---

## TASK-010: Add the Markdown Workbench
**Priority:** P1 | **Tags:** local-first, editor, math, citations, export

Shipped the `markdown-workbench` suite as the twenty-sixth catalog entry. Authoring covers CommonMark and GFM with KaTeX math including the `\ce{}` chemistry extension, Mermaid diagrams on the main thread because its renderer requires real DOM, Graphviz in a dedicated worker, a hand-written dependency-ordered table formula evaluator that uses neither `eval` nor the `Function` constructor, and citeproc-js citation formatting against four CSL styles bundled as local assets with no runtime network fetch. Export paths are Markdown, a standalone offline HTML file, browser print-to-PDF, DOCX, a structurally correct EPUB container, and an AST JSON snapshot. Rendering sanitizes on every pass and never enables raw inline HTML.

Documented scope limits carried in the interface rather than implied away: DOCX renders math as plain text because OMML conversion is out of scope, the EPUB is structural and not validated against the EPUBCheck reference implementation, and the Vancouver style is not bundled because its published CSL files are dependent styles requiring multi-file resolution this tool does not implement. Merged as pull request 7.

---

## TASK-009: Restore automatic GitHub Pages redeployment
**Priority:** P0 | **Tags:** deployment, ci, reliability

`main` had four consecutive failing validation runs, so the deploy job never ran and the published site silently stopped tracking `main`. Four independent causes were found and fixed in order: `tests/unit/regex-substitution.test.ts` was committed without the `regex-substitution.ts` module and the `executePcre2Substitution` export it imported; a commit replaced the real contents of `src/catalog.ts` and `src/tools/workspaces.tsx` with `__CATALOG__` and `__WORKSPACES__` placeholder tokens; the follow-up that supplied the real AetherCast implementation removed the `energy-macro-planner` catalog entry instead of adding AetherCast alongside it, so a shipped tool disappeared from the catalog; and `tests/unit/deployment-config.test.ts` asserted a `vite.config.ts` change that had not yet been made.

The catalog regression is the reason the registry is now covered by an assertion that every `ToolSlug` has both a catalog entry and a workspace loader, so removing a shipped tool fails validation rather than reaching production. Merged as pull requests 4 and 6, with the live deployment confirmed by the deployments API.

---

## TASK-004: Stop publishing sourcemaps to the deployed site
**Priority:** P2 | **Tags:** deployment, performance

`build.sourcemap` is now `false`, so roughly 20 MB of `.map` files no longer ship to GitHub Pages. Sourcemaps remain available by building locally. Asserted by `tests/unit/deployment-config.test.ts` so the setting cannot silently regress.

---

## TASK-003: Decide the PWA precache policy for DuckDB WebAssembly
**Priority:** P1 | **Tags:** performance, pwa, deployment

Offline DuckDB was confirmed to be an unintended consequence of `workbox.globPatterns` including `wasm`, not a required capability. Both DuckDB binaries are excluded from the precache through `globIgnores` and served by a `CacheFirst` runtime cache populated on first actual use, so a visitor who never opens the DuckDB workbench never downloads them. The Pyodide runtime is excluded on the same basis, and the Markdown Workbench later adopted the same discipline for its own heavy lazily-loaded chunks.

First-visit precache fell from roughly 80 MB across 48 entries to roughly 11.5 MB across 111 entries. Asserted by `tests/unit/deployment-config.test.ts`.

---

## TASK-008: Add AetherCast
**Priority:** P1 | **Tags:** local-first, environmental, import

Shipped the `aethercast` suite as the twenty-fifth catalog entry. It reads an hourly air-quality and UV export the user already has, then computes US EPA AQI, European EAQI, WHO 2021 guideline comparisons, and Fitzpatrick sun-exposure estimates, screens for wildfire and inversion anomalies, and exports a brief or dataset. The tool performs no network access of its own.

This entry is recorded retrospectively: the suite reached `main` without a task record, and the placeholder-token and dropped-catalog-entry failures repaired under TASK-009 both originated in its commit sequence. Its design intent is not documented under `docs/superpowers`; see TASK-012.

---

## TASK-007: Add the Energy & Macronutrient Planner
**Priority:** P1 | **Tags:** local-first, calculator, accessibility, responsive

Shipped the `energy-macro-planner` suite with the `#/energy-macro-planner` alias. A pure stateless engine computes basal metabolic rate from Mifflin-St Jeor, the revised Harris-Benedict equation, and Katch-McArdle when body fat is supplied, then derives daily energy expenditure, a goal-adjusted target, and macronutrient grams using the Atwater factors. Results are checked against the Acceptable Macronutrient Distribution Range and the protein adequacy reference, with advisories for targets below basal rate or the commonly used planning floors. Covered by 27 unit assertions and 24 browser tests, including a five-viewport sweep that asserts no horizontal overflow, no overlapping text, no clipped containers, and no serious or critical accessibility violations.

---

## TASK-002: Complete JSON Lattice Studio
**Priority:** P0 | **Tags:** graph, local-first, editor, worker

Shipped JSON Lattice Studio as the `json-lattice` catalog entry with the `#/json-lattice` route alias. Slice 3 history, ELK worker layout, and SVG/CSV/raster export are in place alongside the CodeMirror editor, dual-layer viewport, minimap, inspector, and the inline edit, collapse, search, diff, privacy, schema, JSONPath, and DuckDB SQL workflows. Covered by eleven lattice unit suites and `tests/e2e/lattice.spec.ts`, including desktop and mobile accessibility and overflow checks. Deployed by GitHub Actions run 33587212287.

---

## TASK-001: Add PlanCraft Studio floor-plan tool
**Priority:** P0 | **Tags:** architecture, canvas, local-first

Implemented PlanCraft Studio as InmoTools tool 21 with worker-offloaded geometry, responsive dual-canvas drafting, transactional history, local autosave, accessibility, and vector export pipelines. Catalog-link and route validation completed successfully in GitHub Actions run 33351325621.

---
