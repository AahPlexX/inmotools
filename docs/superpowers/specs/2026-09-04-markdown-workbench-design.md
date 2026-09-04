# Markdown Workbench — Design

**As of:** 2026-09-04
**Plan:** `docs/superpowers/plans/2026-09-04-markdown-workbench.md`

## Purpose

Author CommonMark and GFM documents with live math, diagrams, spreadsheet-style table formulas, and real citation formatting, then publish to several formats — entirely in the browser, with no account, upload, or server round-trip.

The audience is technical writers, researchers, and documentation engineers who currently reach for a desktop application or a hosted editor to get citations and DOCX out of Markdown.

## Scope boundary

This suite processes text the user supplies and files the user opens. It performs no network access of its own. The four CSL citation styles are bundled as build-time static assets specifically so that citation formatting never becomes a fetch.

## Honest capability limits

These are stated in the interface, not only here, because each one is a place where a tool could plausibly claim more than it delivers:

- **DOCX math is plain text.** Converting KaTeX output to OMML, Word's native equation format, is not implemented. The export contains an italic plain-text rendering of each expression. The engine accepts an optional image resolver for callers that can rasterise, and falls back to text when none is supplied.
- **EPUB is structural, not validated.** The container, OPF manifest, NCX, and nav document are built to specification, but the output has not been checked against the EPUBCheck reference implementation, and no reliable client-side EPUBCheck exists. It is labelled "EPUB (structural)" for that reason.
- **PDF is the browser's print pipeline.** Rendering arbitrary rich HTML — math, diagram SVG, tables — to PDF with a client-side library was rejected as infeasible at acceptable fidelity. Print-to-PDF uses the engine already in the browser.
- **Vancouver is not offered.** Every published Vancouver CSL file is a *dependent* style that resolves to an independent parent, and this tool does not implement multi-file style resolution. Offering it would mean shipping a style that silently formats as something else.
- **Diagram and citation support depends on WebAssembly.** Where the browser cannot supply it, the failure is reported with an explanation rather than producing quietly wrong output.

## Architecture

Framework-free engine modules under `src/tools/markdown/`, each independently unit-testable without React or a DOM, with three React components composing them.

| Module | Responsibility |
| --- | --- |
| `parse-engine` | CommonMark + GFM + math to mdast, plus root-level source-line anchors |
| `render-engine` | mdast to sanitized HTML with KaTeX; raw inline HTML is never enabled |
| `document-pipeline` | Applies formulas then citations; the single source of truth for every consumer |
| `table-formula-engine` | Tokeniser, parser, cycle detection, and evaluator for `=` cells |
| `citation-engine` | BibTeX and CSL-JSON parsing, citeproc-js formatting, marker substitution |
| `math-engine` | Direct KaTeX rendering and math diagnostics |
| `diagram-engine` | Mermaid dispatch and Graphviz worker orchestration |
| `outline-engine` | Heading outline from the parse tree |
| `scroll-sync` | Interpolates preview offset from the editor's current source line |
| `frontmatter-engine` | YAML, TOML, and JSON frontmatter |
| `prose-metrics-engine` | Heuristic readability and timing estimates |
| `slide-engine` | Thematic-break sectioning |
| `state-engine` | Document-level undo and redo |
| `autosave-engine` | IndexedDB draft store behind an injectable interface |
| `export-engine` | Standalone HTML, DOCX, EPUB, and AST JSON serialisation |

### One document pipeline, not per-export transformation

`prepareDocument` applies table-formula evaluation and then citation substitution, and the preview plus all export paths consume its output.

This is the design's load-bearing decision. The first implementation transformed the document on the preview path only, and each export decided independently what to serialise — so HTML and EPUB scraped the substituted preview while DOCX and AST JSON parsed raw source. The same document then exported a formula cell as `10` in one format and `=B2*C2` in another. Formats now agree because they cannot diverge, not because each is separately remembered to be correct.

Formulas are evaluated before citations so that a citation marker inside a table cell cannot influence how a formula parses.

### Source-level substitution must respect code

Both substitution passes skip fenced blocks and inline code spans. A document explaining `[@citekey]` syntax inside a fence must not have its own examples rewritten; the same applies to a document showing `=SUM(...)`. Math diagnostics blank code regions while preserving newlines and total length, so reported line numbers still map to the original source.

An unresolved citekey is left exactly as written. A marker that silently vanished would be worse than one that visibly needs attention, and the unresolved key is reported separately.

### citeproc-js is never shown a key it cannot resolve

`updateItems` throws internally when asked for a citekey its `retrieveItem` callback cannot find — an unresolved id makes the engine's own serialisation fail with `"undefined" is not valid JSON`. Requested keys are therefore filtered against the parsed library before any citeproc call, and unresolved keys are represented without involving the engine.

citeproc emits an HTML fragment for styles that use italics or small caps. Since the renderer never permits raw HTML, such markup would be escaped and displayed to the reader, so fragments are reduced to text content before substitution.

### Mermaid on the main thread, Graphviz in a worker

Mermaid's renderer creates and measures real DOM elements, which a worker cannot provide, so it runs on the main thread — debounced and idle-scheduled to protect typing responsiveness. `@hpcc-js/wasm-graphviz` has no DOM dependency and runs in a dedicated worker.

Diagram rendering is asynchronous while the document keeps changing, so each pass carries a generation token. A superseded pass abandons its work and terminates any worker it started; otherwise every keystroke in a document containing a `dot` block leaks another worker.

### Formula evaluation without dynamic code execution

The evaluator is a hand-written tokeniser, recursive-descent parser, and dependency-ordered evaluator with cycle detection. It uses neither `eval` nor the `Function` constructor: introducing a dynamic code-execution surface for a small closed arithmetic grammar is an avoidable risk. Cyclic cells resolve to a labelled `#REF!` value rather than hanging or throwing.

### Editor configuration is reconfigured, not rebuilt

Every user-toggleable editor setting lives in a CodeMirror `Compartment`. Rebuilding the view on each change discarded the caret, selection, scroll position, and the editor's undo history, which made the font-size slider unusable because each step of a drag reconstructed the editor.

### Two history levels, deliberately separated

CodeMirror's own fine-grained text history serves Ctrl+Z inside the editor and preserves the caret. The workspace keeps document-level snapshots behind the toolbar. An externally applied document swap — undo, redo, draft load, file open — is excluded from CodeMirror's history so the two cannot fight; without that, Ctrl+Z immediately after a toolbar Undo would reinstate the newer text. Unifying them is tracked as TASK-013, because both obvious unifications regress something real.

## Interface

Toolbar for view mode, undo and redo, file actions, editor settings, and exports; a name bar; a source and preview split; a status line; and collapsible panels for outline, metrics, frontmatter, math diagnostics, citations, slides, and local drafts.

### Quality-of-life features

Open a local `.md` by picker or drag-and-drop; bibliography by picker or paste; document naming that drives every export filename and title, defaulting to frontmatter `title`, then the first heading; click-to-navigate outline and slide list; math diagnostics that locate malformed expressions by line; Vim keybindings; line wrapping; adjustable font size; spellcheck toggle; debounced autosave with explicit save, load, delete, and new draft; Ctrl/Cmd+S; clipboard copy for source and rendered HTML; storage-usage reporting; and an unsaved-changes prompt armed only while changes are actually unsaved.

### Print output is scoped

`window.print()` alone would print the privacy rail, site header, tool guidance, toolbar, source editor, every panel, and the footer around the document. A print stylesheet gated on a body class reduces printed output to the rendered document, with break hints so headings are not separated from their content and tables, code blocks, diagrams, and display math are not split across pages.

### Responsiveness and legibility

The split collapses to a single column below 860 px, the export group unpins from the right, and the name field spans full width. Panels and metric grids use `auto-fit` with `minmax` so clusters reflow by available width rather than at fixed breakpoints. Long content wraps with `overflow-wrap: anywhere`; diagrams and display math scroll within their own bounds rather than widening the page.

## Testing

Unit coverage is one suite per engine: parsing, rendering and sanitisation, scroll-sync interpolation, formula evaluation including cycles and errors, frontmatter in three formats, prose metrics, slide splitting, history, autosave, math rendering and diagnostics, diagram scheduling and error paths, citation parsing, formatting, extraction and substitution, the document pipeline, filename derivation, and the outline.

Browser coverage: catalog and alias routing, live preview editing, view toggling, undo and redo, formula evaluation, citation substitution including the code-fence exclusion and the unresolved-key path, every export control with download content assertions, local file open, bibliography file load, outline navigation, math diagnostics, frontmatter-driven naming, the full draft lifecycle, caret survival across font-size changes, and a five-viewport sweep asserting no horizontal overflow, no overlapping text rectangles, no clipped containers, and no serious or critical axe violations.

Regression guards worth naming: HTML export from Source view must still contain the document body, and the plain and rendered Markdown exports must differ in the expected direction.

## Deliberately excluded

Real-time collaboration, cloud sync, and comment threads, all of which require a backend. A WYSIWYG hybrid editing mode, which conflicts with a source-of-truth Markdown document. Presentation delivery with speaker notes and timers; the slide panel is sectioning, not a deck. PlantUML and LaTeX-package diagram syntaxes such as `tikz-cd`, which require a server or a full TeX engine.
