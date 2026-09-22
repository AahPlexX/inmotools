# Tactical Matchboard Studio Execution Queue

**Updated:** 2026-09-22
**Branch:** `feature/tactical-matchboard-studio`  
**Existing PR:** #76 only — do not create a replacement/parallel PR.  
**Code tip described by this queue before this documentation commit:** `a8ee9f46`

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
- **Status:** DONE
- **Depends on:** none
- **Primary files:** `tests/unit/tactics-engine.test.ts`, current tactical source files only if the gate exposes a defect
- **Evidence:** exact SHA `1374fd43c025d20a661317b54def6dede1cedaaf` passed **22/22** focused tactical units, `tsc --noEmit -p tsconfig.app.json` with exit 0, and a production Vite build (`✓ built in 1m 37s`).
- **Exit evidence:** satisfied. The earlier verifier pnpm-path mismatch was environmental and required no repository change.
- **Reverse-safe:** complete.
### T03-02 — Correct gate defects
- **Status:** DONE — conditional branch not triggered
- **Depends on:** T03-01 produces a real failing diagnostic
- **Primary files:** only files named by a failing diagnostic; tactical scope only
- **Outcome:** T03-01 was green after correcting only the verifier invocation. No Tactical Matchboard source defect was produced, so no corrective code task was required.
- **Exit evidence:** no failing tactical diagnostic remained.
- **Reverse-safe:** complete.
### T03-03 — Register the coherent beginner vertical slice
- **Status:** DONE
- **Depends on:** T03-01 green; T03-02 not triggered
- **Primary files:** `src/catalog.ts`, `src/tools/workspaces.tsx`, `tests/unit/tactics-engine.test.ts`
- **Implementation:** commit `163a63d78131e90762246e86f58803e87d9d4788` adds one `ToolSlug`, one source-honest catalog entry, and one lazy workspace loader for the existing `TacticalMatchboardWorkspace`.
- **TDD evidence:** registration contract was RED first (**22 passed / 1 failed**, catalog entry undefined), then GREEN **23/23**. The exact committed SHA passed **23/23** focused units and TypeScript exit 0; exact-commit Vite log records `✓ built in 55.63s` and emits dedicated Tactical Matchboard JS/CSS chunks.
- **Exit evidence:** route registration compiles/builds without removing unrelated catalog/workspace entries.
- **Reverse-safe:** complete.
### T03-04 — Add focused browser contract
- **Status:** DONE
- **Depends on:** T03-03
- **Primary files:** `tests/e2e/tactical-matchboard-studio.spec.ts`, `scripts/select-e2e-specs.mjs`
- **Action:** cover beginner setup, player selection, click-to-move, D-pad movement, numeric movement, two-point arrow authoring, undo/redo, SVG download, and touch-equivalent operation.
- **Implementation:** commit `f885ed383b0bac6e85a10115a765d85baaad34b0` adds the focused Tactical Matchboard browser spec, repository selector mapping, and selector regression coverage.
- **Exit evidence:** exact SHA `f885ed38` passed **26/26** focused tactical/selector units, production/PWA build, and **10/10** focused Playwright scenarios across desktop and mobile Chromium.
- **Reverse-safe:** complete.

### T03-05 — Accessibility and responsive gate
- **Status:** DONE
- **Depends on:** T03-04
- **Primary files:** tactical workspace/board/CSS and tactical e2e only
- **Action:** run Axe plus keyboard-only and device-width coverage; verify no essential operation relies on dragging; verify target sizing/reflow and phone/tablet/laptop layouts.
- **Implementation:** commit `ff82ade9e8290d382ec868bcb1dc4c58eca6c2b8` extends the focused browser contract with keyboard activation, Axe, five CSS-width viewport classes, document overflow, and essential 44px target checks.
- **Exit evidence:** **14 passed / 2 intentionally skipped** across desktop and mobile Chromium. The skips avoid rerunning the same shared-DOM Axe and CSS-width matrices in the emulated mobile project; mobile workflow and keyboard cases still execute there.
- **Reverse-safe:** complete.

### T03-06 — Close Task 3 vertical-slice milestone
- **Status:** DONE
- **Depends on:** T03-05
- **Primary files:** `FEATURE_MATRIX.md`, `HANDOFF.md`, `TODO_SEQUENCE.md`, `.tasks/IN_PROGRESS.md`
- **Action:** reconcile feature-row states against evidence; do not inflate the verified numerator for partial features.
- **Exit evidence:** current ledgers agree; no partial row was promoted to verified; exact next task is T04-01.
- **Reverse-safe:** complete.

### T04-01 — Complete pitch/rules/formation authoring
- **Status:** ACTIVE — forward agent `/root`, started 2026-09-22
- **Depends on:** T03-06
- **Primary files:** tactical pitch/formation/rules engines, Tactical workspace rules UI, focused tests
- **Implemented at `a8ee9f46`:** custom rules profiles; current IFAB plus explicitly dated futsal references; deterministic profile overlays; custom and sourced formation libraries; phase capture/morphing; whole-project mirror/flip transforms; formation review; provenance-bearing built-in/custom restart templates; responsive accessible UI and focused tests.
- **Remaining action:** editable forks of sourced profiles, current primary-source specialty/grassroots line coverage, sourced restart-specific legality checks, and a focused whole-project vertical-transform assertion.
- **Exit evidence:** primary-source provenance, invariant tests, build/browser evidence required by affected feature rows.
- **Current evidence:** `a8ee9f46` passes 29/29 tactical units, 3/3 selector units, production/PWA build, and 16 browser scenarios with 2 intentional duplicate-project skips across desktop/mobile Chromium. Rows 9, 10, 11, 12, and 15 are verified; rows 1, 2, 13, and 14 remain open as described in the feature matrix.
- **Reverse-safe:** no; its remaining primary files stay reserved.

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
