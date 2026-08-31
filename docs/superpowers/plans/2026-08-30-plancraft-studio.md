# PlanCraft Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PlanCraft Studio as a production-ready local-first architectural floor-plan drafting tool in InmoTools.

**Architecture:** Keep the tool isolated under `src/tools/floorplan/`, with pure geometry/state/export modules, a module Web Worker for heavier calculations, and a dual-canvas React workspace. Register it through the existing catalog and lazy workspace map, plus the requested `#/floorplan-studio` hash alias.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Tailwind CSS 4/project CSS, Web Workers, Canvas 2D, `pdf-lib`, Vitest, Playwright, axe-core, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-08-30-plancraft-studio-design.md`

## Global Constraints

- 100% client-side; no server or network processing.
- New floor-plan module uses arrow-function declarations only.
- Authoritative geometric units are integer millimeters.
- Zoom range is `[0.01, 5]`; history cap is 100 committed states.
- Autosave key is `inmotools_plancraft_autosave` with a 2000 ms debounce.
- `#/floorplan-studio` is a first-class route alias; generic tool routing remains compatible.
- R12 exports use R12-compatible entities; R2000 may use newer entities.
- APCA is guidance, not a WCAG conformance claim.

---

### Task 1: RED geometry contracts

**Files:**
- Create: `tests/unit/floorplan-geometry.test.ts`
- Create: `tests/unit/floorplan-state.test.ts`
- Create: `tests/unit/floorplan-export.test.ts`

**Produces:** failing contracts for `worldToScreen`, `screenToWorld`, `polygonMetrics`, `satOverlap`, `extractRoomFaces`, `createSnapIndex`, `applyCommand`, `undoState`, `redoState`, `exportSvg`, `exportDxf`, and `serializeProject`.

- [ ] Write fixtures covering convex/concave area, centroid, transform inversion at 0.01 and 5 zoom, adjacent SAT boxes, closed-room extraction, nearest snap lookup, history cap, undo/redo, and layer-preserving SVG/DXF/JSON output.
- [ ] Run `pnpm test:unit` and confirm only the new floor-plan suites fail because modules are absent.
- [ ] Commit the RED tests without production implementation.

### Task 2: Geometry and snap engine

**Files:**
- Create: `src/tools/floorplan/floorplan-types.ts`
- Create: `src/tools/floorplan/geometry-engine.ts`
- Create: `src/tools/floorplan/snap-index.ts`

**Produces:** pure deterministic math and topology functions consumed by worker, UI and tests.

- [ ] Implement affine conversion/clamping and integer-mm helpers.
- [ ] Implement shoelace area/centroid/perimeter and cycle canonicalization.
- [ ] Implement directed half-edge room extraction and exterior-face filtering.
- [ ] Implement SAT convex overlap and circle clearance helpers.
- [ ] Implement a balanced 2D k-d snap index with radius query.
- [ ] Run the geometry suite and full unit suite to GREEN.

### Task 3: Transactional project state

**Files:**
- Create: `src/tools/floorplan/state-engine.ts`
- Test: `tests/unit/floorplan-state.test.ts`

**Produces:** `createInitialProject`, `commitProject`, `undoState`, `redoState`, `updateSelection`, `loadProject`, history capped at 100 states.

- [ ] Implement immutable state transitions with deterministic IDs supplied by callers.
- [ ] Ensure undo/redo restores geometry and clears redo on a new committed edit.
- [ ] Add serializable view/layer/project metadata.
- [ ] Run state and full unit suites to GREEN.

### Task 4: Export pipelines

**Files:**
- Create: `src/tools/floorplan/export-engine.ts`
- Test: `tests/unit/floorplan-export.test.ts`

**Produces:** structured SVG, version-correct DXF R12/R2000, JSON backup and vector PDF generation.

- [ ] Implement world bounds and semantic layer grouping.
- [ ] Implement R12 AC1009 and R2000 AC1015 entity writers with correct entity restrictions.
- [ ] Implement `pdf-lib` sheet presets, scale transform, title block, north arrow and scale bar.
- [ ] Run export and full unit suites to GREEN.

### Task 5: Worker and drawing primitives

**Files:**
- Create: `src/tools/floorplan/floorplan-worker.ts`
- Create: `src/tools/floorplan/symbol-library.ts`
- Create: `src/tools/floorplan/render-engine.ts`

**Produces:** worker protocol for rooms/snaps/clearance and Canvas 2D primitives for walls, hosted openings, components, dimensions, hatches and overlay feedback.

- [ ] Define typed worker request/result unions.
- [ ] Reuse pure geometry engine in the worker; no duplicated math.
- [ ] Add parametric FF&E/MEP catalog and clearance metadata from the PRD.
- [ ] Add distinct existing/new/demolition/load-bearing wall rendering and door/window geometry.
- [ ] Add base-scene and overlay-scene render functions.

### Task 6: React workspace

**Files:**
- Create: `src/tools/floorplan/FloorplanCanvas.tsx`
- Create: `src/tools/floorplan/FloorplanInspector.tsx`
- Create: `src/tools/floorplan/FloorplanWorkspace.tsx`
- Modify: `src/styles.css`

**Produces:** responsive toolbox/dual-canvas/inspector UI, pointer/touch/keyboard drafting, autosave, worker integration and export controls.

- [ ] Implement select, continuous wall, door, window, measurement, ADA circle and component placement tools.
- [ ] Implement snapping, Shift angle lock, Space-pan, wheel/pinch zoom and selection transforms.
- [ ] Wire worker room/clearance results into DOM HUD and status text.
- [ ] Wire 100-state undo/redo shortcuts and deletion/rotate/flip shortcuts.
- [ ] Add 2-second localStorage recovery bus and JSON import/export.
- [ ] Add responsive desktop/tablet/mobile scaffolding and reduced-motion-safe interaction feedback.

### Task 7: Registry and route integration

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/tools/workspaces.tsx`
- Modify: `src/App.tsx`
- Test: `tests/e2e/app.spec.ts`

**Produces:** tool 21 in catalog, lazy workspace registration, `#/floorplan-studio` alias and generic route compatibility.

- [ ] Add `floorplan-studio` ToolSlug and metadata.
- [ ] Add lazy loader.
- [ ] Teach hash routing to resolve the exact alias without breaking `#/tools/:slug`.
- [ ] Update E2E expectations so catalog links may use a tool-specific route helper while generic compatibility remains smoke-tested.

### Task 8: E2E, accessibility and delivery verification

**Files:**
- Create: `tests/e2e/floorplan.spec.ts`
- Update documentation/task board state after verification.

**Produces:** browser evidence for real integration and responsive behavior.

- [ ] Exercise wall drafting → room extraction → hosted opening → component placement → undo/redo → export.
- [ ] Exercise keyboard shortcuts and autosave recovery.
- [ ] Run axe on the DOM workspace controls and verify no serious/critical violations.
- [ ] Run mobile viewport overflow/touch smoke checks.
- [ ] Run `pnpm test:unit`, `pnpm build`, and `pnpm test:e2e` in CI.
- [ ] Verify GitHub Pages deployment and the live `#/floorplan-studio` route.
