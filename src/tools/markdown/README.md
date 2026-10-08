# Markdown Workbench

Local editor for writing, previewing, and exporting Markdown. Documents, drafts, bibliographies, and exports stay in this browser. The tool does not upload them.

## What it does

- Source, split, and preview. In split view, scrolling either side moves the other.
- Formatting toolbar, cancellable local auto-format, syntax suggestions, find and replace, Vim keys, spellcheck, optional typewriter scrolling, and a syntax guide.
- Tables with local formulas and a dimension picker, math, Mermaid and Graphviz diagrams, GitHub alerts, subscripts/superscripts, abbreviation definitions with a glossary, definition lists, native disclosure sections, emoji shortcodes, and citations (APA, IEEE, Chicago, MLA).
- Table builder also converts pasted CSV to a pipe table and copies the table at the cursor as CSV.
- Click a task checkbox in the preview to toggle that line; document task progress shows completed/total and includes nested tasks.
- Resolved prose citations generate References in preview and rendered exports; code/metadata literals and uncited library entries are excluded. Original Markdown remains unchanged.
- Prose counts, reading/speaking estimates, Gunning Fog and English Flesch–Kincaid/Coleman–Liau grade estimates; code, math and metadata are excluded.
- Keep several documents open in tabs (New tab, Open in new tab); each tab is saved as a local draft when you leave it.
- Export every local draft as one ZIP of `.md` files and import such a ZIP back.
- Open `.md`, `.markdown`, `.txt`, or local HTML. Paste or drop an image to embed it as a data URI (5 MB cap).
- Syntax tree panel: browse the parsed tree with the keyboard; choosing a node highlights its source range.
- Compare changes panel: diff the current text against the opened file or a saved draft.
- Export Markdown, rendered Markdown, standalone HTML, print/PDF, DOCX, structural EPUB, or a syntax-tree JSON file.
- Drafts live in IndexedDB, with up to 20 earlier versions per draft that can be restored. Editor settings live in `localStorage` under `inmotools.markdown-workbench.prefs`.

## Handoff

Read [TRACKER.md](TRACKER.md) **Resume here** first, then the [current spec](../../../docs/superpowers/specs/2026-10-05-markdown-workbench-design.md), [active tool task](../../../.tasks/items/T-markdown-workbench-20261006-ea9f.md), and [verification evidence](VERIFICATION.md). The [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md) preserves the original cross-tool sequence. Update the tracker, current task, inventory cursor and evidence together when behavior or check status changes.

2026-10-08 20:29:23 UTC: frozen Markdown R55-R86 work is retained on main 64c6c5c. Associated MDW-R93 compound-citation and MDW-R87 keyboard-focus repairs passed final local acceptance: 534 Markdown/recovery units (one optional real-Pandoc test skipped), 31 cluster cases included; TypeScript/production build; 8/8 desktop/touch browser cases (125.9s), zero retries/skips, including unrestricted axe and R15 orientation checks. The earlier combined References/Pandoc/TXT run passed 28/28 (185.0s). This checkpoint is ready for GitHub MCP integration; obtain the exact official source/run, main tree, Pages and live receipts, then run the required full browser suite before closing tasks d713 and 628f. R15 centering cause and one-off mobile export pageerror remain unestablished; successful checks do not close them. Next frozen tool is pdf-sanitizer, PDF-R02. No released/full-pass claim yet.

## Historical fixes

- 2026-10-01 — Preview-to-source scroll (F11) lost the person's scroll when it came within 0.7 s of a caret move: the tool's own catch-up scroll and repeated caret reports pulled both panes back to the caret line. Now a preview scroll away from the tool's target takes over at once, a re-measure does not undo it, repeated caret reports for the same line no longer re-scroll the preview, and a reveal without focus no longer re-sends the selection. Browser tests "scrolling the preview moves the source…" and "outline supports filtering…" pass 60/60 repeated; all Markdown browser specs pass.
