# Tactical Matchboard Studio Implementation Plan

**Date:** 2026-09-21
**Spec:** `docs/superpowers/specs/2026-09-21-tactical-matchboard-studio-design.md`
**Branch:** `feature/tactical-matchboard-studio`
**Base:** `4dcc856bc97027862342513cdea7eb769c0ffbc1`

## Goal

Deliver the 60-feature Tactical Matchboard Studio through dependency-ordered, testable slices while preserving the repository's backend-free local-first architecture and unrelated concurrent work.

## Global constraints

- Stay on the single dedicated branch until branch-complete.
- Do not merge partial implementation.
- Keep `FEATURE_MATRIX.md`, `HANDOFF.md`, and `.tasks/IN_PROGRESS.md` synchronized with material state.
- Reuse exact-pinned platform/dependency capabilities before adding anything new.
- Do not upgrade a dependency merely because a newer version exists.
- Use pure deterministic engines and table-driven/invariant tests instead of one test file per feature.
- Registration in global catalog/workspace files waits until a coherent usable vertical slice exists.
- Every essential drag interaction gets a non-drag alternative.
- Every externally sourced ruleset/preset stores human-readable provenance and is editable.
- Imported content is untrusted.
- No cloud/account/telemetry/secret-bearing client surface.
- A feature moves to `verified` only with implementation plus the evidence relevant to that feature.

## Task 1 — Foundation contract and RED tests

**Files**
- Create `src/tools/tactics/FEATURE_MATRIX.md`
- Create `src/tools/tactics/HANDOFF.md`
- Create `tests/unit/tactics-engine.test.ts`
- Update `.tasks/IN_PROGRESS.md`

Define failing tests first for normalized coordinates, physical conversion, rules/profile provenance, formation totals/goalkeeper notation, snapping primitives, and starter project schema. Observe the PR test failure before implementation.

## Task 2 — Canonical schema, pitch/rules and formation engines

**Files**
- Create `src/tools/tactics/tactics-types.ts`
- Create `src/tools/tactics/tactics-engine.ts`
- Create `src/tools/tactics/pitch-engine.ts`
- Create `src/tools/tactics/formation-engine.ts`
- Update foundation unit tests and ledgers

Implement only the types/logic needed to satisfy the approved schema and Task 1 tests: schema version, integer project time, normalized positions, physical dimensions, provenance-bearing profiles, source-honest formation templates, count validation, mirroring/flipping primitives, and guide/grid snapping.

## Task 3 — Immutable editor/history and 2D board vertical slice

Add bounded history, project operations, teams/rosters/tokens/equipment, accessible SVG pitch, selection/move/precision controls, layer/lock/visibility/group operations, tactical arrows, and beginner workflow. Add catalog/lazy registration only when this slice can choose a pitch/team/formation, move players, add an arrow, and export a diagram without an inert control.

## Task 4 — Formation/restart authoring and ruleset UI

Complete sourced/editable pitch matrices, special-line overlays, custom rules profiles, small-sided/7v7/9v9/11v11 libraries, phase morphing, scenario transforms, legality aids, and set-piece/restart templates. Verify player-count invariants and provenance presentation.

## Task 5 — Timeline, trajectories and coordinated motion

Implement deterministic integer-time scenes/tracks/keyframes, interpolation/easing, Bézier motion paths, visibility spans, timing offsets, markers, coordinated action templates, linked units, ball possession/handoffs, and path-conflict review. Add focused invariant tests for sequencing/interpolation/transforms.

## Task 6 — Spatial analysis

Implement Euclidean Voronoi, hull/centroid/width/depth geometry, passing-lane clearance, authored orientation sectors, positional grids, distance/tethers, trajectory occupancy heat maps, and authored/imported speed/distance metrics with explicit analytical-honesty labels. Move high-cost work off-thread only where measurements justify it.

## Task 7 — Persistence, project interchange and session planning

Implement Dexie project vault, autosave/snapshots/recovery, schema validation/migration, safe JSON/ZIP project round trips, local assets, CSV/JSON trajectory import/export, and structured drill/session data. Test corrupt imports cannot replace a valid opened project.

## Task 8 — Synchronized 3D presentation

Reuse pinned Three.js for a lightweight pitch, players, goals, markings and ball elevation. Add camera presets/keyframes and 2D/3D editing synchronization against the same canonical state. Render on demand when static and dispose resources on teardown.

## Task 9 — Local video review and telestration

Implement local supported-video opening, precision seek/speed/step within platform limits, time-ranged telestration, manual/interpolated overlay tracking, event tagging, ordered clip playlists, and manually anchored multi-angle synchronization. Revoke object URLs and surface decode/resource failures.

## Task 10 — Professional export and metadata

Implement central export metadata editing; SVG/PNG/JPEG/WebP/social/HTML playback paths; vector-first PDF/contact sheets; analytics CSV/JSON; deterministic project JSON/ZIP; and capability-negotiated video export using verified WebCodecs/Mediabunny support with frame-sequence ZIP fallback. Never expose a format combination before capability verification.

## Task 11 — Responsive/accessibility/QoL hardening

Complete desktop context + explicit touch/keyboard alternatives, help/reference, conflict-safe shortcuts, pitch-first narrow layouts, timeline drawers/sheets, focus management, status feedback, reduced motion, target sizing, reflow/zoom/enlarged-text checks, and crash-safe recovery UX.

## Task 12 — Performance and adversarial audit

Exercise realistic complex sessions. Bound history, virtualize only where track counts require it, pause hidden/inactive work, dispose 3D/media resources, audit inputs/exports, and run Gauntlet against the approved spec, authoritative standards, repository conventions, and current inspectable competitor capabilities without copying trade dress.

## Task 13 — Branch-complete gate

Run tactical-focused units, production build, focused desktop/mobile Playwright, axe/accessibility, representative persistence/import/export round trips, media capability negotiation/fallback checks, and responsive viewport matrix. Fix or track every tactical defect. Confirm the feature ledger has no unapproved `planned`/`in-progress`/unexplained blocked feature.

## Task 14 — Reconcile and integrate

Fetch then-current `origin/main`, non-destructively reconcile legitimate workstream conflicts, rerun branch gate, merge via repository-supported PR mechanism, and verify exact integrated main revision.

## Task 15 — Exact-main deployment and closure

Verify required main validation, Pages artifact/deployment, and live route where feasible. Reconcile `.tasks`; only then move the workstream to DONE/WORK_LOG and call it integrated-complete.
