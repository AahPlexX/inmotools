# PlanCraft Studio Design

**Source:** User-provided PlanCraft Studio PRD, approved for implementation on 2026-08-30.

## Goal

Add a fully local-first architectural floor-plan drafting workspace to InmoTools at `#/floorplan-studio`, while preserving the suite's registry-driven catalog, lazy loading, privacy model, responsive behavior, and GitHub Pages deployment.

## Integration ledger

| New capability | Live caller | Registration | Negative control |
|---|---|---|---|
| Floor-plan workspace | `src/tools/workspaces.tsx` lazy loader | `src/catalog.ts` | Removing the loader makes the registered route fail to open |
| Route alias | `src/App.tsx` hash parser | `#/floorplan-studio` plus generic `#/tools/floorplan-studio` compatibility | Alias must resolve to the same workspace or E2E fails |
| Geometry engine | `FloorplanWorkspace.tsx` + geometry worker | worker messages and direct lightweight calculations | Concave polygon/adjacent SAT/zoom inversion fixtures must fail if math regresses |
| Command history | `FloorplanWorkspace.tsx` | transactional reducer | Undo after a wall command must remove that command and redo must restore it |
| Worker engine | `FloorplanWorkspace.tsx` | `new Worker(new URL(...), { type: 'module' })` | Room summary must still update when walls form a closed cycle |
| Export engine | workspace Export menu | SVG/DXF/PDF/JSON download actions | Exports must contain registered layers/entities and remain local |
| Dual canvas | workspace viewport | base canvas + overlay canvas | Pointer overlay must not require base-scene redraw on every move |
| Autosave | workspace state effect | `inmotools_plancraft_autosave` | Reload recovery must restore project state without network access |

## Architecture

PlanCraft is an isolated tool module under `src/tools/floorplan/`. All authoritative geometry is stored in integer millimeters. UI state remains in React 19; expensive room extraction, clearance collision checks, and snap-index rebuilding are offloaded to a module Web Worker. The viewport uses a static/base canvas for walls, rooms, hatches and dimensions plus an overlay canvas for cursor guides, selection boxes and snap feedback.

The module uses arrow-function declarations throughout. Existing host files are not globally refactored simply to satisfy the module-specific style rule.

## Core model

The implementation preserves the PRD's immutable `Point2D`, `WallVertex`, `WallSegment`, `HostedOpening`, `PlanComponent`, `ClearanceEnvelope`, and `RoomFace` concepts. Project state additionally contains layers, dimensions, viewport state, project metadata, and a command history capped at 100 committed states.

World coordinates are millimeters. Screen conversion is:

- `screenX = worldX * scale + panX`
- `screenY = worldY * scale + panY`
- inverse: `worldX = (screenX - panX) / scale`, `worldY = (screenY - panY) / scale`

Zoom is clamped to `[0.01, 5]`. Grid snapping operates in world units; pointer snap radius is converted from 15 CSS pixels to world millimeters using the inverse scale.

## Geometry and topology

The geometry engine provides:

- Shoelace signed area, absolute area, centroid and perimeter.
- SAT collision for convex clearance polygons plus circle-vs-polygon clearance checks.
- Half-edge face extraction from wall segments. Directed edges are sorted by polar angle at each vertex; the face walker follows the next edge around each interior cycle, canonicalizes duplicate cycles, and removes the exterior face.
- A balanced two-dimensional k-d tree for nearby snap targets.
- Wall boundary/miter helpers with bevel fallback for acute joins below 30 degrees.
- Hosted opening projection along the wall centerline.

The worker owns room extraction, room metrics, snap-index rebuilds and clearance evaluation. It never persists state and never accesses network APIs.

## Drafting interaction

Supported tools in the first complete release are Select, Continuous Wall, Door, Window, Measure, ADA Turning Circle and component placement. Keyboard shortcuts follow the PRD: W, D, N, M, V/Escape, R, F, Delete/Backspace, Cmd/Ctrl+Z, Cmd/Ctrl+Y. Shift constrains wall drafting to 0/45/90/135-degree directions. Space + pointer pans. Pointer/touch gestures support single-pointer object interaction and two-pointer pinch zoom on touch devices.

Hosted doors/windows are children of walls rather than detached geometry. Doors render leaf/swing arcs from hinge/flip state. Windows render a double glazing line. Existing/new/demolition wall states and load-bearing hatching are visually distinct.

## Components, MEP and clearance

A compact parametric symbol catalog covers the requested living, bedroom, dining, kitchen/bath, office/storage and MEP groups. Components are stored as semantic symbols with dimensions and clearance envelopes, not arbitrary SVG blobs. Clearance feedback is calculated from the envelopes and rendered in the overlay.

ADA guidance includes the 1525 mm turning circle and 455 mm pull-side latch clearance requested in the PRD. These are planning aids, not a certification claim; final code/regulatory compliance remains the user's responsibility.

## Responsive UX

Desktop uses the requested toolbox / viewport / inspector three-column layout. Tablet collapses the inspector into a slide-over region. Mobile uses a bottom tool strip, collapsible inspector sheet, one-finger pan when no drafting gesture is active, and pinch zoom. Controls remain keyboard reachable and visible focus is inherited from the InmoTools shell.

The workspace uses a dark drafting surface locally without changing the global InmoTools light shell. Fluid sizes use `clamp()` and the PlanCraft CSS variables requested in the PRD.

## Accessibility

DOM controls target WCAG 2.2 keyboard, focus, name/role/value and contrast requirements, with automated axe checks as regression evidence. APCA Lc may be used as additional design guidance, but is not described as WCAG conformance. Canvas information that is operationally important is mirrored in DOM status text, room lists and inspector fields.

## Exports

- **JSON:** lossless project state, history and view state.
- **SVG:** millimeter viewBox and semantic layer groups.
- **DXF R12:** AC1009-compatible entities such as LINE, ARC, POLYLINE and TEXT.
- **DXF R2000:** AC1015 with LWPOLYLINE and MTEXT where appropriate. HATCH is only emitted where the selected DXF version supports it. The exporter does not falsely emit R2000-only entities in an R12 file.
- **PDF:** `pdf-lib` vector output with Arch D, Arch C, Letter and A4 presets, project title, scale, date, north arrow and scale bar.

## Persistence and privacy

A 2-second debounced autosave writes to `window.localStorage['inmotools_plancraft_autosave']`. No server, analytics, telemetry or upload path is introduced. The existing Buy Me a Coffee link remains the only optional external monetization action.

## Performance budgets

Rendering separates static and interactive layers to avoid full redraws on pointer movement. Worker calculations are measured with `performance.now()` and surfaced in the HUD when useful. The implementation avoids eagerly importing floor-plan code into the landing bundle; the workspace stays lazy-loaded.

## Testing

Vitest covers transforms, polygon math, face extraction, SAT, snap lookup, command history and export structure. Playwright covers route reachability, wall drafting, room enclosure, undo/redo, autosave recovery, mobile overflow, keyboard shortcuts and export availability. Existing catalog-derived route tests remain authoritative for regression coverage.