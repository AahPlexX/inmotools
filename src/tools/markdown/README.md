# Markdown Workbench

Local editor for writing, previewing, and exporting Markdown. Documents, drafts, bibliographies, and exports stay in this browser. The tool does not upload them.

## What it does

- Source, split, and preview. In split view, scrolling either side moves the other.
- Formatting toolbar, cancellable local auto-format, syntax suggestions, find and replace, Vim keys, spellcheck, optional typewriter scrolling, and a syntax guide.
- Tables with local formulas and a dimension picker, math, Mermaid and Graphviz diagrams, GitHub alerts, subscripts/superscripts, abbreviation definitions with a glossary, definition lists, native disclosure sections, emoji shortcodes, and citations (APA, IEEE, Chicago, MLA).
- Click a task checkbox in the preview to toggle that line; document task progress shows completed/total and includes nested tasks.
- Resolved prose citations generate References in preview and rendered exports; code/metadata literals and uncited library entries are excluded. Original Markdown remains unchanged.
- Prose counts, reading/speaking estimates, Gunning Fog and English Flesch–Kincaid/Coleman–Liau grade estimates; code, math and metadata are excluded.
- Open `.md`, `.markdown`, `.txt`, or local HTML. Paste or drop an image to embed it as a data URI (5 MB cap).
- Export Markdown, rendered Markdown, standalone HTML, print/PDF, DOCX, structural EPUB, or a syntax-tree JSON file.
- Drafts live in IndexedDB. Editor settings live in `localStorage` under `inmotools.markdown-workbench.prefs`.

## Handoff

Read [TRACKER.md](TRACKER.md) **Resume here** first, then the [current spec](../../../docs/superpowers/specs/2026-10-05-markdown-workbench-design.md), [active tool task](../../../.tasks/items/T-markdown-workbench-20261006-ea9f.md), and [verification evidence](VERIFICATION.md). The [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md) preserves the original cross-tool sequence. Update the tracker, current task, inventory cursor and evidence together when behavior or check status changes.

2026-10-07 16:47:28 UTC: Final R55 runtime/test source 13a456e1f72429031eaed9dc7c10e3d45e210ad2 is published through GitHub MCP and fetched tree equals locally tested 5743f8c; its corrected R54 assertion is included. Full integration 37654245633 is active on that exact source. This immediate publication-record checkpoint contains documentation only and replaces that initial request; inspect the latest integration head for the final full receipt and allow it to finish without further record-only pushes. Runtime is d9a94abb; all candidate runtime/tests remain exact 13a456e. Local 436 units, TypeScript/build and combined 8/8 production browser checks (41.3s), zero retries/skips, passed. Main still 2410e7a (specification only). No R55 main/Pages/full-success claim. After full success: compare main tree, verify Pages and live acceptance, then close R55/advance R56. Cursor R55; tool incomplete 79/92; R15/citation/Crystal concerns remain open.

## Historical fixes

- 2026-10-01 — Preview-to-source scroll (F11) lost the person's scroll when it came within 0.7 s of a caret move: the tool's own catch-up scroll and repeated caret reports pulled both panes back to the caret line. Now a preview scroll away from the tool's target takes over at once, a re-measure does not undo it, repeated caret reports for the same line no longer re-scroll the preview, and a reveal without focus no longer re-sends the selection. Browser tests "scrolling the preview moves the source…" and "outline supports filtering…" pass 60/60 repeated; all Markdown browser specs pass.
