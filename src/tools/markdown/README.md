# Markdown Workbench

Local editor for writing, previewing, and exporting Markdown. Documents, drafts, bibliographies, and exports stay in this browser. The tool does not upload them.

## What it does

- Source, split, and preview. In split view, scrolling either side moves the other.
- Formatting toolbar, cancellable local auto-format, syntax suggestions, find and replace, Vim keys, spellcheck, optional typewriter scrolling, and a syntax guide.
- Tables with local formulas and a dimension picker, math, Mermaid and Graphviz diagrams, GitHub alerts, subscripts/superscripts, abbreviation definitions with a glossary, definition lists, native disclosure sections, emoji shortcodes, and citations (APA, IEEE, Chicago, MLA).
- Click a task checkbox in the preview to toggle that line; document task progress shows completed/total and includes nested tasks.
- Open `.md`, `.markdown`, `.txt`, or local HTML. Paste or drop an image to embed it as a data URI (5 MB cap).
- Export Markdown, rendered Markdown, standalone HTML, print/PDF, DOCX, structural EPUB, or a syntax-tree JSON file.
- Drafts live in IndexedDB. Editor settings live in `localStorage` under `inmotools.markdown-workbench.prefs`.

## Handoff

Read [TRACKER.md](TRACKER.md) **Resume here** first, then the [current spec](../../../docs/superpowers/specs/2026-10-05-markdown-workbench-design.md), [active tool task](../../../.tasks/items/T-markdown-workbench-20261006-ea9f.md), and [verification evidence](VERIFICATION.md). The [ordered inventory](../../../.tasks/items/T-ordered-requirement-inventory-20261006-9cf1.md) preserves the original cross-tool sequence. Update the tracker, current task, inventory cursor and evidence together when behavior or check status changes.

As of 2026-10-07, the current ordered item is MDW-R38; MDW-R51 follows it. The core disclosure release is deployed, and the associated quoted-task/source-history repair is integrated/deployed with canonical owned browser acceptance passed; fresh full browser validation is running. The tracker records exact revisions, receipts and the associated typewriter investigation. Refresh those records and GitHub results before continuing. Older audits and the dated fixes below are historical evidence.

## Historical fixes

- 2026-10-01 — Preview-to-source scroll (F11) lost the person's scroll when it came within 0.7 s of a caret move: the tool's own catch-up scroll and repeated caret reports pulled both panes back to the caret line. Now a preview scroll away from the tool's target takes over at once, a re-measure does not undo it, repeated caret reports for the same line no longer re-scroll the preview, and a reveal without focus no longer re-sends the selection. Browser tests "scrolling the preview moves the source…" and "outline supports filtering…" pass 60/60 repeated; all Markdown browser specs pass.
