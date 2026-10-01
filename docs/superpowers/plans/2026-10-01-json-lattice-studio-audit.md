# JSON Lattice Studio — 2026-10-01 production audit

**Scope:** `src/tools/lattice` only (catalog slug `json-lattice`). Crystal Lattice Studio was not touched.
**Design:** `docs/superpowers/specs/2026-08-30-json-lattice-studio-design.md` (addendum appended; earlier sections kept).

## Findings and resolutions

| Finding | Resolution |
| --- | --- |
| Search counted matches but never moved the view to them | Previous / next match, Enter, and Shift+Enter select and center the node |
| Minimap was a static picture with no view rectangle | Click or drag pans; a rectangle shows the current view; cap of 1,200 nodes is named in the tooltip |
| Wheel zoom could scroll the page, and line-mode wheels barely zoomed | Non-passive wheel listener; line, page, and pixel deltas normalized; ctrl/meta+wheel pinches |
| Touch had pan and buttons, but no pinch | Two-pointer pinch zooms around the view |
| Fit reset on every resize, so mobile chrome show/hide threw away a pan | Fit once per layout |
| Node text was sliced to 88 characters with no way to read the rest | Full value stays in the node `title` |
| No path or value copy, unlike JSON Hero | Inspector Copy path / Copy value; schema Copy schema |
| XML could be imported but not exported | Export XML |
| Collapse was per node only | Collapse all / Expand all |
| Double-click edit is unreliable on touch | Edit button on the selected primitive |
| Controls had no tooltips; copy said "canonical", "ELK worker", "RFC 6902", "normalized exports" | Title tooltips and plain status/revision/disclaimer copy |
| SQL failures only landed in the bottom status line | Inline alert next to Run SQL |

## Left as-is

- Diff tombstones and move connectors described in the original spec are still engine-side, not drawn on the graph. Drawing them well needs a layout pass for nodes that are not in the current graph; that is a follow-up, not a silent half-render.
- Privacy Shield remains a heuristic. The disclaimer says so.
- Foreign-key dashes remain convention-based (`id` / `*_id` / `*Id`).
