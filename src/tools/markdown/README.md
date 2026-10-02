# Markdown Workbench

Local editor for writing, previewing, and exporting Markdown. Documents, drafts, bibliographies, and exports stay in this browser. The tool does not upload them.

## What it does

- Source, split, and preview. In split view, scrolling either side moves the other.
- Formatting toolbar, syntax suggestions, find and replace, Vim keys, spellcheck, and a syntax guide.
- Tables with local formulas, math, Mermaid and Graphviz diagrams, GitHub alerts, emoji shortcodes, and citations (APA, IEEE, Chicago, MLA).
- Click a task checkbox in the preview to toggle that line.
- Open `.md`, `.markdown`, `.txt`, or local HTML. Paste or drop an image to embed it as a data URI (5 MB cap).
- Export Markdown, rendered Markdown, standalone HTML, print/PDF, DOCX, structural EPUB, or a syntax-tree JSON file.
- Drafts live in IndexedDB. Editor settings live in `localStorage` under `inmotools.markdown-workbench.prefs`.

## Handoff

Behavior changes and verification notes are appended in `docs/markdown-audit-2026-09-16.md`. Do not delete earlier sections of that file when recording a new pass.

## Fixes

- 2026-10-01 — Preview-to-source scroll (F11) lost the person's scroll when it came within 0.7 s of a caret move: the tool's own catch-up scroll and repeated caret reports pulled both panes back to the caret line. Now a preview scroll away from the tool's target takes over at once, a re-measure does not undo it, repeated caret reports for the same line no longer re-scroll the preview, and a reveal without focus no longer re-sends the selection. Browser tests "scrolling the preview moves the source…" and "outline supports filtering…" pass 60/60 repeated; all Markdown browser specs pass.
