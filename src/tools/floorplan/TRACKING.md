# PlanCraft Studio — Tracking Ledger

This file is the single source of truth for PlanCraft Studio (`#/floorplan-studio`, slug `floorplan-studio`).
Read it before changing anything under `src/tools/floorplan/`. Keep it current in the same commit as the change it describes.

- Original design: `docs/superpowers/specs/2026-08-30-plancraft-studio-design.md`
- Original plan: `docs/superpowers/plans/2026-08-30-plancraft-studio.md`
- Task-state entry: `.tasks/IN_PROGRESS.md` → "PlanCraft Studio real-world hardening"
- Working branch: `claude/plancraft-hardening` (single branch for this pass; integrate to `main` by squash PR)

## Status legend

`open` not started · `wip` in progress on the working branch · `done` implemented with test evidence on the working branch · `merged` on `origin/main`

## 2026-09-27 hardening pass

Scope came from a full read of every file in `src/tools/floorplan/`, a strict DXF parse with ezdxf 1.4.4, and the owner's report that real-world use exposed defects the earlier "complete" status missed.

### Verified defects

| ID | Defect | Evidence | Fix | Status |
|----|--------|----------|-----|--------|
| F01 | DXF R2000 export is not a valid R2000 file (no CLASSES/TABLES/BLOCKS/OBJECTS, no handles, no AcDb subclass markers) | `ezdxf.readfile` strict read fails: "missing 'AcDbPolyline' subclass in LWPOLYLINE" | Write the minimal R2000 structure listed by the ezdxf DXF-internals docs, with handles and subclass markers; `$INSUNITS` = 4 (mm) | open |
| F02 | DXF exports are mirrored top-to-bottom | Canvas world Y points down; DXF WCS Y points up. A wall drawn downward on screen is upward in CAD | Negate Y for every DXF coordinate | open |
| F03 | Mouse-wheel zoom also scrolls the page | React registers `onWheel` as a passive listener, so `preventDefault()` is ignored (react/react#19651) | Native `wheel` listener with `{ passive: false }` | open |
| F04 | PDF export failure is silent | `exportPdf` throws when a scaled plan does not fit the sheet; the button calls it with `void`, producing an unhandled rejection and no message | Catch and report in the status bar; add sheet and scale pickers | open |
| F05 | Inspector numbers write 0/NaN while typing and add one undo step per keystroke | `Number('')` is 0; every `onChange` calls `commit` | Draft-then-commit number fields (Enter/blur), clamped to min/max, ignore invalid | open |
| F06 | Project name/author add one undo step per keystroke | `onChange` → `commit` | Commit on blur/Enter | open |
| F07 | A door or window cannot be selected again after clicking away | Select-mode hit test only checks components and walls; the wall wins | Hit-test openings before walls | open |
| F08 | Dimensions cannot be selected or deleted | No dimension hit test; delete handler has no dimension branch | Hit-test dimensions; delete them | open |
| F09 | An interior wall ending on another wall does not create rooms | Endpoint on a wall's interior is a free vertex; the host wall is not split, so the room graph has no junction | Snap to wall centerlines and split the host wall at the junction (openings re-hosted by position) | open |
| F10 | Clearance warnings fire for normal layouts (sofa against a wall, nightstand beside a bed) | The whole buffered envelope is tested against walls and every other envelope | Report footprint collisions (item vs item, item vs wall) and front access-zone conflicts separately | open |
| F11 | Toilet ADA clearance uses the generic 30"×48" clear floor space | 2010 ADA Standards 604.3.1: 60" (1525 mm) from side wall × 56" (1420 mm) from rear wall | Model a 1525 × 1420 mm zone with the toilet centerline 455 mm from its side edge (604.2 range 405–455 mm) | open |
| F12 | Space bar is captured page-wide | Window keydown `preventDefault` on Space blocks button activation and page scrolling | Pan with Space only while the pointer is over the canvas or the canvas has focus | open |
| F13 | Single-letter shortcuts fire with Ctrl/Cmd/Alt | No modifier guard (Ctrl+R rotates then reloads) | Ignore letter shortcuts when a modifier is held | open |
| F14 | Undo/redo while drawing leaves a stale rubber-band line | Draft state is not reset | Clear draft on undo/redo | open |
| F15 | Touch drafting: taps register on touch-down, a two-finger gesture drops a stray point, two-finger drag only zooms | `onWorldClick` fires on pointerdown for touch; pinch handler ignores midpoint travel | Tap fires on release when the finger did not move; two-finger gesture pans and zooms | open |
| F16 | Rotate/delete with nothing applicable still adds an undo step | Unconditional `commit` | Guard before committing | open |
| F17 | Restore JSON accepts malformed files | Only `schemaVersion` is checked | Structural validation with a plain error message | open |
| F18 | Openings can overhang the end of a wall | Offset ratio is not clamped | Clamp so the opening fits; refuse walls shorter than the opening | open |
| F19 | Escape leaves the wall tool instead of finishing the current run of walls | Escape maps straight to Select | First Escape ends the chain; second returns to Select | open |

### Real-world capability gaps

| ID | Gap | Fix | Status |
|----|-----|-----|--------|
| F20 | Components cannot be dragged | Drag to move (mouse, pen, touch), one undo step per drag | open |
| F21 | Wall corners cannot be moved | Drag vertices; dropping on another vertex merges them | open |
| F22 | No keyboard way to position a selected item | Arrow keys nudge by the grid step (Shift = ×10) | open |
| F23 | No duplicate | Duplicate button and Ctrl/Cmd+D | open |
| F24 | Rooms cannot be named | Room names stored by boundary and shown on canvas and exports | open |
| F25 | Metric only, although the tool targets US users (ADA, 1/4" = 1'-0") | Display units: millimeters or feet-inches for readouts, inputs, dimension labels, exports | open |
| F26 | Components are unlabeled boxes | Labels on canvas and exports | open |
| F27 | Exports draw doors without swing arcs | Arcs in SVG, PDF, and DXF (ARC entity) | open |
| F28 | Room names/areas missing from SVG and DXF | Labels at room centroid | open |
| F29 | Closing a room keeps the wall tool drawing from the closing point | Chain ends when the new wall joins existing geometry | open |
| F30 | Copy shows raw ids ("wall-lz3k2-5") and machine-like status text; export toast pushes donations | Plain-language copy pass | open |
| F31 | On phones, the tool list sits below the canvas | Tools above the canvas on narrow screens; touch-specific hints | open |
| F32 | Browser tab title stays "InMo Tools" in the tool | Tool-scoped `document.title` and meta description while mounted | open |
| F33 | No way to start a new plan | "New plan" (undoable) | open |
| F34 | No way to bring the drawing back into view | "Fit to drawing" button and `0` shortcut | open |
| F35 | SVG export has no background, so white "erase" strokes show on dark viewers | White background rectangle | open |

## Known limits (deliberate, not defects)

- Walls that cross each other mid-span (X junctions) are not split automatically; only T junctions (a wall ending on another) are. Draw the crossing as two walls meeting at the junction.
- Toilet clearance is modeled for a left-side wall; rotate the fixture for other orientations. Mirroring is not modeled.
- Tool pages use hash routes (`#/floorplan-studio`). Google does not index URL fragments as separate pages, so per-tool search indexing needs a site-wide routing change outside this tool. Tracked in `.tasks/BACKLOG.md`.

## Verification commands

```bash
pnpm exec vitest run tests/unit/floorplan-
pnpm exec tsc --noEmit -p tsconfig.app.json
pnpm exec playwright test tests/e2e/floorplan.spec.ts tests/e2e/floorplan-audit.spec.ts
```

DXF structure is additionally checked with ezdxf (`ezdxf.readfile` strict read plus `doc.audit()`), run outside the repository; results are recorded in the status column when a DXF item changes.
