# Tactical Matchboard Studio Execution Queue

**Updated:** 2026-09-21  
**Branch:** `feature/tactical-matchboard-studio`  
**Existing PR:** #76 only — do not create a replacement/parallel PR.  
**Code tip described by this queue before this documentation commit:** `a6225790fabfbc835e174cc439afbdf33a2a23cb`

## Purpose and source-of-truth roles

- `FEATURE_MATRIX.md` is the authoritative 60-feature status ledger.
- `TODO_SEQUENCE.md` is the authoritative execution order and concurrency contract.
- `HANDOFF.md` is the authoritative resume snapshot and exact next action.
- `.tasks/IN_PROGRESS.md` is the repository-wide pointer to this workstream.
- The implementation plan/spec define accepted scope and completion gates; this queue does not shrink them.

## Agent coordination protocol

1. Stay on the single branch above. Never create another Tactical Matchboard branch or PR unless the user explicitly changes this rule.
2. Before every write, compare the last known branch tip to the live branch. If another agent advanced it, refresh the affected files and re-evaluate before writing.
3. An agent must treat the **Primary files** on an `ACTIVE` item as reserved. Do not concurrently edit those files from another queue item.
4. A forward-working agent takes the lowest-numbered `READY` item.
5. A reverse-working agent takes the highest-numbered `READY` item **whose dependencies are all DONE** and whose Primary files do not overlap an ACTIVE item.
6. `BLOCKED` means do not implement it yet. `CONDITIONAL` means execute only if its condition becomes true.
7. Do not mark an item `DONE` from code inspection alone when its Exit evidence requires an executable gate.
8. Update this file, `HANDOFF.md`, `FEATURE_MATRIX.md`, and `.tasks/IN_PROGRESS.md` in the same development round whenever material state changes.

## Ordered queue

### T03-01 — Execute current Task 3 gate
- **Status:** READY
- **Depends on:** none
- **Primary files:** `tests/unit/tactics-engine.test.ts`, current tactical source files only if the gate exposes a defect
- **Action:** run the focused tactical unit suite and production build on the current branch tip. Preferred commands: `pnpm exec vitest run tests/unit/tactics-engine.test.ts` and `pnpm build`.
- **Current limitation:** the connected GitHub surface reports no Actions workflow runs for the current tactical commits, so no executable RED/GREEN/build proof exists yet.
- **Exit evidence:** exact branch SHA + focused unit result + production build result, including every failing test/build diagnostic if red.
- **Reverse-safe:** yes; this is the only currently READY item.

### T03-02 — Correct gate defects
- **Status:** BLOCKED
- **Depends on:** T03-01 produces a real failing diagnostic
- **Primary files:** only files named by the failing diagnostic; tactical scope only
- **Action:** fix each genuine tactical defect test-first where behavior changes, then rerun the focused gate.
- **Exit evidence:** failing diagnostic resolved on a newer exact SHA; focused unit/build results recorded.
- **Reverse-safe:** no; conditional on T03-01 evidence.

### T03-03 — Register the coherent beginner vertical slice
- **Status:** BLOCKED
- **Depends on:** T03-01 green, plus T03-02 if needed
- **Primary files:** `src/catalog.ts`, `src/tools/workspaces.tsx`, Tactical Matchboard registration-only support
- **Action:** add one additive catalog/lazy-loader route for the existing `TacticalMatchboardWorkspace`. Preserve every unrelated tool entry.
- **Gate:** only proceed if choose/configure pitch + choose team/formation + move player + add arrow + export SVG are all non-inert after the executable gate.
- **Exit evidence:** route resolves to the workspace on the exact branch SHA; no unrelated catalog/workspace entries lost.
- **Reverse-safe:** no.

### T03-04 — Add focused browser contract
- **Status:** BLOCKED
- **Depends on:** T03-03
- **Primary files:** `tests/e2e/tactical-matchboard-studio.spec.ts`, `scripts/select-e2e-specs.mjs`
- **Action:** cover beginner setup, player selection, click-to-move, D-pad movement, numeric movement, two-point arrow authoring, undo/redo, SVG download, and touch-equivalent operation.
- **Exit evidence:** focused desktop + mobile Chromium tactical spec results on an exact SHA.
- **Reverse-safe:** no.

### T03-05 — Accessibility and responsive gate
- **Status:** BLOCKED
- **Depends on:** T03-04
- **Primary files:** tactical workspace/board/CSS and tactical e2e only
- **Action:** run Axe plus keyboard-only and device-width coverage; verify no essential operation relies on dragging; verify target sizing/reflow and phone/tablet/laptop layouts.
- **Exit evidence:** recorded Axe/keyboard/reflow results and any accepted limitation.
- **Reverse-safe:** no.

### T03-06 — Close Task 3 vertical-slice milestone
- **Status:** BLOCKED
- **Depends on:** T03-05
- **Primary files:** `FEATURE_MATRIX.md`, `HANDOFF.md`, `TODO_SEQUENCE.md`, `.tasks/IN_PROGRESS.md`
- **Action:** reconcile feature-row states against evidence; do not inflate the verified numerator for partial features.
- **Exit evidence:** current ledgers agree and exact next task is T04-01.
- **Reverse-safe:** no.

### T04-01 — Complete pitch/rules/formation authoring
- **Status:** BLOCKED
- **Depends on:** T03-06
- **Primary files:** tactical pitch/formation/rules engines, Tactical workspace rules UI, focused tests
- **Action:** sourced/editable pitch matrices, verified specialty overlays, custom rules profiles, formation authoring, transforms, legality aids, restart/set-piece templates.
- **Exit evidence:** primary-source provenance, invariant tests, build/browser evidence required by affected feature rows.
- **Reverse-safe:** no until T03 closes.

### T05-01 — Timeline, trajectories and coordinated motion
- **Status:** BLOCKED
- **Depends on:** T04-01
- **Primary files:** new tactical timeline/motion modules + tactical UI/tests
- **Action:** integer-time scenes/tracks/keyframes, easing, Bézier paths, visibility spans, offsets, markers, coordinated actions, linked units, possession/handoffs, conflict review.
- **Exit evidence:** deterministic interpolation/sequencing tests + browser workflow.
- **Reverse-safe:** no.

### T06-01 — Spatial analysis
- **Status:** BLOCKED
- **Depends on:** T05-01
- **Primary files:** new tactical analysis modules + tactical UI/tests
- **Action:** Euclidean Voronoi, hull/compactness, passing-lane clearance, orientation sectors, grids, tethers, occupancy heat maps, authored/imported distance/speed metrics.
- **Exit evidence:** analytical-honesty labels + deterministic geometry tests + browser evidence.
- **Reverse-safe:** no.

### T07-01 — Persistence, interchange and session planning
- **Status:** BLOCKED
- **Depends on:** T06-01
- **Primary files:** tactical persistence/import/session modules + tests
- **Action:** Dexie vault, autosave/snapshots/recovery, migration, safe JSON/ZIP round-trip, assets, trajectory import/export, session plans.
- **Exit evidence:** corrupt-import preservation and deterministic round-trip tests.
- **Reverse-safe:** no.

### T08-01 — Synchronized 3D presentation
- **Status:** BLOCKED
- **Depends on:** T07-01
- **Primary files:** tactical Three.js projection modules + UI/tests
- **Action:** synchronized pitch/players/ball, camera presets/keyframes, 2D/3D shared-state editing, on-demand rendering, disposal.
- **Exit evidence:** lifecycle/resource tests and browser proof.
- **Reverse-safe:** no.

### T09-01 — Local video review and telestration
- **Status:** BLOCKED
- **Depends on:** T08-01
- **Primary files:** tactical local-media modules + UI/tests
- **Action:** local video open/review, time-ranged telestration, manual/interpolated tracking, events, clip playlists, manual multi-angle sync, object-URL cleanup.
- **Exit evidence:** browser media behavior and failure-path evidence.
- **Reverse-safe:** no.

### T10-01 — Professional export and metadata
- **Status:** BLOCKED
- **Depends on:** T09-01
- **Primary files:** tactical export modules + UI/tests
- **Action:** metadata editor, raster/social/standalone HTML, PDF/contact sheets, analytics CSV/JSON, project JSON/ZIP, capability-negotiated video export/fallback.
- **Exit evidence:** format/capability tests and representative artifact inspection.
- **Reverse-safe:** no.

### T11-01 — Responsive/accessibility/QoL hardening
- **Status:** BLOCKED
- **Depends on:** T10-01
- **Primary files:** tactical UI/CSS/help/shortcuts + e2e
- **Action:** complete desktop/touch/keyboard equivalents, help, shortcuts, narrow-layout drawers/sheets, focus/status/reduced-motion/target/reflow/zoom/enlarged-text hardening.
- **Exit evidence:** viewport matrix + Axe + keyboard/touch-equivalent results.
- **Reverse-safe:** no.

### T12-01 — Performance and adversarial audit
- **Status:** BLOCKED
- **Depends on:** T11-01
- **Primary files:** tactical scope only
- **Action:** realistic complex sessions, history/resource bounds, inactivity pausing, input/export adversarial review, source/spec drift audit.
- **Exit evidence:** measured findings resolved or explicitly tracked.
- **Reverse-safe:** no.

### T13-01 — Branch-complete gate
- **Status:** BLOCKED
- **Depends on:** T12-01
- **Primary files:** tactical tests/docs; tactical defects only
- **Action:** focused units, production build, desktop/mobile Playwright, Axe, persistence/import/export/media/responsive matrices; reconcile all 60 rows.
- **Exit evidence:** branch-complete contract satisfied or exact blockers listed.
- **Reverse-safe:** no.

### T14-01 — Reconcile and integrate
- **Status:** BLOCKED
- **Depends on:** T13-01 branch-complete
- **Primary files:** conflict files only, existing PR #76
- **Action:** fetch then-current `main`, non-destructively reconcile, rerun branch gate, use existing repository-supported PR integration.
- **Exit evidence:** exact integrated `main` SHA and green required gates.
- **Reverse-safe:** never before T13.

### T15-01 — Exact-main deployment and closure
- **Status:** BLOCKED
- **Depends on:** T14-01
- **Primary files:** deployment/task ledgers only as required
- **Action:** exact-main validation, Pages artifact/deployment/live route verification where feasible, task reconciliation.
- **Exit evidence:** exact deployed revision and closure records.
- **Reverse-safe:** never before T14.
