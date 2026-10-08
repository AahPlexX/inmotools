# Markdown Workbench

Local editor for writing, previewing, and exporting Markdown. Documents, drafts, bibliographies, and exports stay in this browser. The tool does not upload them.

## What it does

- Source, split, and preview. In split view, scrolling either side moves the other.
- Formatting toolbar, cancellable local auto-format, syntax suggestions, find and replace, Vim keys, spellcheck, optional typewriter scrolling, and a syntax guide.
- Tables with local formulas and a dimension picker, math, Mermaid and Graphviz diagrams, GitHub alerts, subscripts/superscripts, abbreviation definitions with a glossary, definition lists, native disclosure sections, emoji shortcodes, and citations (APA, IEEE, Chicago, MLA).
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

2026-10-07 17:02:50 UTC: Final R55 runtime/test checkpoint 64e17739586fac7c92a38ea94ef436fc11312d2b is published through GitHub MCP and fetched tree equals locally validated 406af5f. It includes both grades, native boundary/count/syllable fixes, exact legacy R54 assertions, Unicode hyphen equivalence and actual generated-caption decisions. Local 443 units (15.49s), TypeScript/clean production build and 12/12 combined browsers (59.8s), zero retries/skips, passed. Fresh full integration 37655869959 is pending on exact source. This immediate documentation-only checkpoint supersedes that initial request; obtain the latest integration head/official full receipt without further record-only pushes. Runtime/tests must remain identical to 64e1773. Earlier R55 full requests apply to older source and cannot establish final repair acceptance. Main still 2410e7a; no final R55 main/Pages/full-success claim. After full success compare main tree, verify Pages and live cases, then finish R55/advance R56. Frozen cursor R55; tool incomplete 79/92. R15/citation/Crystal concerns remain open.

## Historical fixes

- 2026-10-01 — Preview-to-source scroll (F11) lost the person's scroll when it came within 0.7 s of a caret move: the tool's own catch-up scroll and repeated caret reports pulled both panes back to the caret line. Now a preview scroll away from the tool's target takes over at once, a re-measure does not undo it, repeated caret reports for the same line no longer re-scroll the preview, and a reveal without focus no longer re-sends the selection. Browser tests "scrolling the preview moves the source…" and "outline supports filtering…" pass 60/60 repeated; all Markdown browser specs pass.
