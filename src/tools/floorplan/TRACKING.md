# PlanCraft Studio — Tracking Ledger

> **Historical record (banner added 2026-10-05).** Written before the current workflow. Branches, pull requests, PR numbers and registration steps mentioned here (`src/catalog.ts` entries, `workspaces.tsx` loaders, `ToolSlug`, `.tasks/IN_PROGRESS.md`, `.tasks/config.json` IDs) are no longer used: tools register through `src/tools/<folder>/<slug>.meta.ts`, work starts with `pnpm task:start`, and pushes merge without pull requests ([AGENTS.md](../../../AGENTS.md)). Feature facts and evidence below stay valid as a record; current status is in the tool's tracker or task file.

This file is the single source of truth for PlanCraft Studio (`#/floorplan-studio`, slug `floorplan-studio`).
Read it before changing anything under `src/tools/floorplan/`. Keep it current in the same commit as the change it describes.

- Original design: `docs/superpowers/specs/2026-08-30-plancraft-studio-design.md`
- Original plan: `docs/superpowers/plans/2026-08-30-plancraft-studio.md`
- Task-state entry: `.tasks/DONE.md` → "PlanCraft Studio real-world hardening — 38/38 complete" (and `.tasks/WORK_LOG.md`, 2026-09-29)
- Working branch: none open. The 2026-09-27 pass was developed on `claude/plancraft-hardening` and fast-forwarded into `main` at `8b09048` (2026-09-29). Start any new PlanCraft work from current `main` and add rows below.

## Status legend

`open` not started · `wip` in progress on the working branch · `done` implemented with test evidence on the working branch · `merged` on `origin/main`

## 2026-09-27 hardening pass

Scope came from a full read of every file in `src/tools/floorplan/`, a strict DXF parse with ezdxf 1.4.4, and the owner's report that real-world use exposed defects the earlier "complete" status missed.

### Verified defects

| ID | Defect | Evidence | Fix | Status |
|----|--------|----------|-----|--------|
| F01 | DXF R2000 export is not a valid R2000 file (no CLASSES/TABLES/BLOCKS/OBJECTS, no handles, no AcDb subclass markers) | `ezdxf.readfile` strict read fails: "missing 'AcDbPolyline' subclass in LWPOLYLINE" | Write the minimal R2000 structure listed by the ezdxf DXF-internals docs, with handles and subclass markers; `$INSUNITS` = 4 (mm) | merged |
| F02 | DXF exports are mirrored top-to-bottom | Canvas world Y points down; DXF WCS Y points up. A wall drawn downward on screen is upward in CAD | Negate Y for every DXF coordinate | merged |
| F03 | Mouse-wheel zoom also scrolls the page | React registers `onWheel` as a passive listener, so `preventDefault()` is ignored (react/react#19651) | Native `wheel` listener with `{ passive: false }` | merged |
| F04 | PDF export failure is silent | `exportPdf` throws when a scaled plan does not fit the sheet; the button calls it with `void`, producing an unhandled rejection and no message | Catch and report in the status bar; add sheet and scale pickers | merged |
| F05 | Inspector numbers write 0/NaN while typing and add one undo step per keystroke | `Number('')` is 0; every `onChange` calls `commit` | Draft-then-commit number fields (Enter/blur), clamped to min/max, ignore invalid | merged |
| F06 | Project name/author add one undo step per keystroke | `onChange` → `commit` | Commit on blur/Enter | merged |
| F07 | A door or window cannot be selected again after clicking away | Select-mode hit test only checks components and walls; the wall wins | Hit-test openings before walls | merged |
| F08 | Dimensions cannot be selected or deleted | No dimension hit test; delete handler has no dimension branch | Hit-test dimensions; delete them | merged |
| F09 | An interior wall ending on another wall does not create rooms | Endpoint on a wall's interior is a free vertex; the host wall is not split, so the room graph has no junction | Snap to wall centerlines and split the host wall at the junction (openings re-hosted by position) | merged |
| F10 | Clearance warnings fire for normal layouts (sofa against a wall, nightstand beside a bed) | The whole buffered envelope is tested against walls and every other envelope | Report footprint collisions (item vs item, item vs wall) and front access-zone conflicts separately | merged |
| F11 | Toilet ADA clearance uses the generic 30"×48" clear floor space | 2010 ADA Standards 604.3.1: 60" (1525 mm) from side wall × 56" (1420 mm) from rear wall | Model a 1525 × 1420 mm zone with the toilet centerline 455 mm from its side edge (604.2 range 405–455 mm) | merged |
| F12 | Space bar is captured page-wide | Window keydown `preventDefault` on Space blocks button activation and page scrolling | Pan with Space only while the pointer is over the canvas or the canvas has focus | merged |
| F13 | Single-letter shortcuts fire with Ctrl/Cmd/Alt | No modifier guard (Ctrl+R rotates then reloads) | Ignore letter shortcuts when a modifier is held | merged |
| F14 | Undo/redo while drawing leaves a stale rubber-band line | Draft state is not reset | Clear draft on undo/redo | merged |
| F15 | Touch drafting: taps register on touch-down, a two-finger gesture drops a stray point, two-finger drag only zooms | `onWorldClick` fires on pointerdown for touch; pinch handler ignores midpoint travel | Tap fires on release when the finger did not move; two-finger gesture pans and zooms | merged |
| F16 | Rotate/delete with nothing applicable still adds an undo step | Unconditional `commit` | Guard before committing | merged |
| F17 | Restore JSON accepts malformed files | Only `schemaVersion` is checked | Structural validation with a plain error message | merged |
| F18 | Openings can overhang the end of a wall | Offset ratio is not clamped | Clamp so the opening fits; refuse walls shorter than the opening | merged |
| F19 | Escape leaves the wall tool instead of finishing the current run of walls | Escape maps straight to Select | First Escape ends the chain; second returns to Select | merged |
| F36 | Selecting something shows nothing on the canvas | `drawOverlayScene` received `selectedId` but drew no highlight | Amber highlight for the selected wall (with its length), opening, item, or dimension; corner handles in Select | merged |
| F37 | Existing walls are nearly invisible on the canvas | `#334155` on `#0b1120` is about 1.8:1; WCAG 2.2 SC 1.4.11 asks for 3:1 on meaningful graphics | Slate-400 `#94a3b8` (about 7:1) | merged |
| F38 | Imperial grids drift off whole inches | `snapToGrid` rounded the grid size, so a 6" (152.4 mm) grid became 152 mm and 12 steps measured 5'-11 3/4" | Use the grid size as given | merged |

### Real-world capability gaps

| ID | Gap | Fix | Status |
|----|-----|-----|--------|
| F20 | Components cannot be dragged | Drag to move (mouse, pen, touch), one undo step per drag | merged |
| F21 | Wall corners cannot be moved | Drag vertices; dropping on another vertex merges them | merged |
| F22 | No keyboard way to position a selected item | Arrow keys nudge by the grid step (Shift = ×10) | merged |
| F23 | No duplicate | Duplicate button and Ctrl/Cmd+D | merged |
| F24 | Rooms cannot be named | Room names stored by boundary and shown on canvas and exports | merged |
| F25 | Metric only, although the tool targets US users (ADA, 1/4" = 1'-0") | Display units: millimeters or feet-inches for readouts, inputs, dimension labels, exports | merged |
| F26 | Components are unlabeled boxes | Labels on canvas and exports | merged |
| F27 | Exports draw doors without swing arcs | Arcs in SVG, PDF, and DXF (ARC entity) | merged |
| F28 | Room names/areas missing from SVG and DXF | Labels at room centroid | merged |
| F29 | Closing a room keeps the wall tool drawing from the closing point | Chain ends when the new wall joins existing geometry | merged |
| F30 | Copy shows raw ids ("wall-lz3k2-5") and machine-like status text; export toast pushes donations | Plain-language copy pass | merged |
| F31 | On phones, the tool list sits below the canvas | Tools above the canvas on narrow screens; touch-specific hints | merged |
| F32 | Browser tab title stays "InMo Tools" in the tool | Tool-scoped `document.title` and meta description while mounted | merged |
| F33 | No way to start a new plan | "New plan" (undoable) | merged |
| F34 | No way to bring the drawing back into view | "Fit to drawing" button and `0` shortcut | merged |
| F35 | SVG export has no background, so white "erase" strokes show on dark viewers | White background rectangle | merged |

## Evidence log

- 2026-09-27 — Baseline before changes: floorplan units 23/23 pass on `a771885`.
- 2026-09-27 — Engine batch (F01, F02, F10, F11, F27, F28, F35; export and analysis halves of F24–F26): floorplan units 42/42, `tsc --noEmit` clean. ezdxf 1.4.4 strict `readfile` + `audit()` on a door/wall/sofa/dimension fixture: R12 `AC1009` 0 errors 0 fixes; R2000 `AC1015` 0 errors 0 fixes, `$INSUNITS` 4. Door ARC reads back center (1542, 0), r 915, 270°→0° (open leaf to closed jamb). `\U+00FC` decodes to "ü".
- 2026-09-27 — Plan operations batch (`plan-operations.ts`, `parseProjectJson`): floorplan units 52/52, `tsc` clean. Engine halves of F07, F08, F09, F16, F17, F18, F21, F23 are tested; rows stay `wip` until the workspace uses them.
- 2026-09-27 — Workspace batch (canvas, inspector, workspace, layout, catalog copy): `tsc` clean; floorplan + spec-selection units 55/55; `pnpm build` passes (tool stays a lazy chunk); browser specs `floorplan`, `floorplan-audit`, `floorplan-hardening` 39 passed, 1 skipped (wheel test is desktop-only) on desktop and mobile Chromium. Screenshots reviewed at 1440×900 and iPhone 13. Local runs used the container Chromium through a git-excluded config because the pinned Playwright expects a different browser build.
- 2026-09-29 — Integration: merged current `main` into the branch, then fast-forwarded `origin/main` to `8b09048` (owner-approved; PR creation returned 403 for the session). Merged tree: `tsc` clean, full unit suite 2154/2154, build, floorplan browser specs 39 passed / 1 skipped. Exact-main CI: Pages run `36614107269` passed units, build, the full browser suite, Pages build, and deploy; focused run `36614107352` passed. All rows moved to `merged`.
- Clearance rules now: `collision` (footprints overlap; seating may tuck under tables/desks), `wall_collision`, `access_blocked` (zone in front of an item, `bufferOffset` deep, blocked by non-seating footprints or walls), `ada_turning_circle`, `ada_fixture_clearance`. MEP devices and the turning-space guide never collide. The library clearance overrides the copy stored in older saves.

## Known limits (deliberate, not defects)

- Walls that cross each other mid-span (X junctions) are not split automatically; only T junctions (a wall ending on another) are. Draw the crossing as two walls meeting at the junction.
- Toilet clearance is modeled for a left-side wall; rotate the fixture for other orientations. Mirroring is not modeled.
- Access zones are a single strip in front of an item (local +Y). A dining table's zone is its front edge only; seating is exempt so chairs around the table never warn.
- DXF R12 predates Unicode text, so non-ASCII characters in labels become "?" there; R2000 keeps them as `\U+XXXX` escapes.
- Tool pages use hash routes (`#/floorplan-studio`). Google does not index URL fragments as separate pages, so per-tool search indexing needs a site-wide routing change outside this tool. Tracked in `.tasks/BACKLOG.md`.

## Verification commands

```bash
pnpm exec vitest run tests/unit/floorplan-
pnpm exec tsc --noEmit -p tsconfig.app.json
pnpm exec playwright test tests/e2e/floorplan.spec.ts tests/e2e/floorplan-audit.spec.ts
```

DXF structure is additionally checked with ezdxf (`ezdxf.readfile` strict read plus `doc.audit()`), run outside the repository; results are recorded in the status column when a DXF item changes.
