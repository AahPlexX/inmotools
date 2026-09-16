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

Baseline: 191 Markdown unit tests passed across 18 files. Production build with changes passed. Browser regressions cover highlight styling, selection formatting/undo, visible search, dialog focus return and landscape sizing, and failed storage preserving edits. Exact-main browser CI and deployment must pass before closing this entry.

No truncated code or missing package import was confirmed in inspected files. This audit does not certify every possible Markdown extension or browser behavior. Preview fenced-code language coloring remains separate from the source highlighting fix and is not implemented by this change. Follow-up verification remains for delayed file-read cancellation and save completion during active typing; these guards have source/build review but no dedicated browser regression yet.

## Sources checked

- Official CodeMirror language source: https://github.com/codemirror/language/blob/main/src/highlight.ts
- WAI modal dialog pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN dialog element: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog

Research date: 2026-09-16 UTC. GOVERNANCE.md was read and not modified.
