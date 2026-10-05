---
tool: markdown-workbench
folder: src/tools/markdown
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-markdown-workbench-design.md
tracker: src/tools/markdown/TRACKER.md
updated: 2026-10-05
---

# Markdown Workbench — tracker

## Resume here

92 requirements: 64 verified, 3 implemented, 2 partial, 23 missing, 0 prohibited. Next action: add tests for the implemented rows (Open work 1), then build the missing rows in the order of Open work. No blocker.

## Documents

- Spec: [2026-10-05-markdown-workbench-design.md](../../../docs/superpowers/specs/2026-10-05-markdown-workbench-design.md)
- Older design, plan and audits (history): [2026-09-04-markdown-workbench-design.md](../../../docs/superpowers/specs/2026-09-04-markdown-workbench-design.md), [2026-09-04-markdown-workbench.md](../../../docs/superpowers/plans/2026-09-04-markdown-workbench.md), [markdown-audit-2026-09-16.md](../../../docs/markdown-audit-2026-09-16.md) (F01–F10 ledger), [markdown-audit-2026-09-19.md](../../../docs/markdown-audit-2026-09-19.md), [README.md](README.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Task file: `.tasks/items/T-markdown-workbench-20261005-f698.md`; dark contrast: `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Code: `MarkdownWorkspace.tsx`, `MarkdownEditor.tsx`, `MarkdownPreview.tsx`, `*-engine.ts`, `*-plugin.ts`, workers
- Unit tests: `tests/unit/markdown-*.test.ts`; browser tests: `tests/e2e/markdown-workbench.spec.ts`, `tests/e2e/markdown-workbench-ux.spec.ts`, `tests/e2e/markdown-mermaid.spec.ts`

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
| MDW-R09 | implemented | `MarkdownEditor.tsx` (CodeMirror search panel) | No test uses the regex option |
| MDW-R10 | verified | e2e "syntax suggestions are on by default, context-aware, and can be disabled" | |
| MDW-R11 | verified | e2e "editor settings expose usable touch targets and visible font-size feedback", "changing the font size keeps the caret and document intact" | |
| MDW-R12 | implemented | `MarkdownEditor.tsx` (Compartments), `MarkdownWorkspace.tsx` (prefs) | The switches' touch targets have a test; their behaviour and storage do not |
| MDW-R13 | verified | e2e "toolbar undo groups adjacent typing into one document step and redo restores it"; unit "undo restores the previous present and pushes the current one into future", "caps the past at 100 entries, dropping the oldest first" | |
| MDW-R14 | verified | e2e "focus writing hides secondary chrome but keeps an obvious exit control" | |
| MDW-R15 | missing | — | |
| MDW-R16 | verified | e2e "markdown help opens an accessible syntax guide modal with supported examples", "syntax guide fits narrow landscape and keeps its close control reachable" | |
| MDW-R17 | missing | — | The Table button inserts a fixed two-column starter |
| MDW-R18 | missing | — | |
| MDW-R19 | missing | — | |
| MDW-R20 | missing | — | Vim keybindings exist (editor settings) |
| MDW-R21 | verified | unit "parses CommonMark headings and paragraphs with source line positions", "parses GFM tables as a single top-level node", "parses GFM strikethrough and task lists without throwing", "renders a GFM table", "renders a footnote reference and its body" | |
| MDW-R22 | verified | unit "strips raw script tags from the rendered output, leaving only the inert text", "strips a javascript: URI from a link", "strips inline event handler attributes from raw HTML"; e2e "Standalone HTML export keeps sanitized Markdown inert through the detached render path" | |
| MDW-R23 | verified | e2e "ATX heading levels are visibly distinct in the rendered preview" | |
| MDW-R24 | verified | unit "gives every heading a GitHub-style anchor id, de-duplicated against repeats", "assigns a heading's rendered anchor id to the exact same slug the outline panel uses" | |
| MDW-R25 | verified | e2e "inserting a table of contents links to and lands on the actual rendered heading" | |
| MDW-R26 | verified | e2e "inserting a table of contents links to and lands on the actual rendered heading" | |
| MDW-R27 | verified | e2e "fenced code blocks are colored by language in the live preview"; unit "wraps a recognized language into styled spans without losing any source text", "leaves an unrecognized language as plain escaped text instead of guessing" | |
| MDW-R28 | verified | e2e "an oversized recognized fence remains readable without running cosmetic syntax highlighting"; unit "leaves an oversized recognized fence plain instead of parsing it for cosmetic highlighting" | |
| MDW-R29 | missing | — | |
| MDW-R30 | verified | e2e "GitHub-style alert blockquotes render as styled callouts instead of plain quotes"; unit "leaves an ordinary blockquote without a marker untouched" | |
| MDW-R31 | missing | — | Five GitHub kinds exist |
| MDW-R32 | verified | e2e "a recognized emoji shortcode renders as its emoji in the live preview"; unit "converts a recognized emoji shortcode and leaves an unrecognized one exactly as written", "does not convert emoji-shaped text inside inline code or a fenced code block" | |
| MDW-R33 | missing | — | |
| MDW-R34 | missing | — | |
| MDW-R35 | missing | — | |
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

1. Tests for implemented rows: MDW-R09, MDW-R12, MDW-R68.
2. Editing: MDW-R15, MDW-R17, MDW-R18, MDW-R19, MDW-R20.
3. Markdown syntax and rendering: MDW-R29, MDW-R31, MDW-R33, MDW-R34, MDW-R35, MDW-R36, MDW-R38.
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

- 2026-10-05, branch `expand/markdown-workbench`: `pnpm tool:check markdown-workbench --base origin/main`: incomplete, 64/92, no errors; `pnpm docs:check` clean; `vitest run` cad-progress, sheets-wave-b, deployment-config 23/23.

## Change log

- **2026-10-05:** Created with the spec; 92 requirements.
