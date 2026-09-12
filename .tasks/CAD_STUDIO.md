# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Authoritative plan:** `docs/superpowers/plans/2026-09-11-cad-studio.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `dfda96a0ad55112cfd2de466b3959a728e32a062`
**Current gate:** G4 — named parameters and constrained sketch system
**Completed gates:** 4 / 12
**Completed user-facing capabilities:** 0 / 100

## Deterministic completion equation

`COMPLETE = G0..G11 all complete AND capabilities 1..100 = 100/100 AND export matrix verified AND exact dependency policy satisfied AND latest CAD branch checks green AND branch reconciled with current main AND final CAD head contained in origin/main AND main validation/Pages deployment green.`

A capability counts only when production behavior exists, relevant validation passes, and any required user interaction is usable rather than decorative. Infrastructure alone never increments the 100-feature count.

## Gate ledger

- [x] **G0 — Architecture and dependency governance.** Approved exact-B-Rep architecture, domain boundary, 100-capability target, export policy, exact-pin rule, licensing/browser constraints, and implementation plan are committed.
- [x] **G1 — Serializable parametric project engine.** Project/history types, downstream dependency closure, suppression, dirty propagation, dependency-safe reorder, undo/redo, and history limits are implemented and unit-tested.
- [x] **G2 — Canonical units foundation.** Canonical millimeter/radian storage and supported length/angle conversions reject non-finite values and pass unit/build validation.
- [x] **G3 — Semantic topology references.** Provenance + geometry fingerprint scoring resolves unique references and explicitly returns ambiguous/missing rather than silently retargeting geometry.
- [ ] **G4 — Parameters and constrained sketch system.** Named dimensional formulas, cycle/error handling, sketch entities, geometric/dimensional constraints, DOF analysis, drag solve, deterministic conflict isolation, and public sketch analysis are green.
- [ ] **G5 — Exact OCCT worker kernel.** Re-verified exact dependencies are pinned, route-lazy WASM initializes in a dedicated worker, revision cancellation works, and analytic geometry fixtures + STEP round-trip pass.
- [ ] **G6 — Exact solid/surface feature evaluator.** Required primitives, extrude/revolve/sweep/loft, booleans, hole, fillet/chamfer, shell/thicken/draft/offset/split/rib, pattern/mirror/helix/thread/text, datums, surfaces, and healing are functional.
- [ ] **G7 — CAD workspace and sketch interaction.** Responsive workspace, model tree, contextual inspector, precision sketch editing, selection, camera/navigation, exact numeric alternatives, undo/redo, feature diagnostics, and command access are functional.
- [ ] **G8 — Inspection and lightweight components.** Exact measurement, mass, sections, interference/clearance, wall/draft/overhang/print checks, mesh diagnostics, component instances/relations, motion preview, and exploded presentation are functional.
- [ ] **G9 — Persistence and professional export.** IndexedDB recovery/native project plus verified STEP, 3MF, GLB/glTF, STL, OBJ, SVG/DXF projection, PNG and per-format metadata mapping/sidecar behavior are functional.
- [ ] **G10 — Accessibility, responsive resilience, performance and recovery.** Keyboard/touch/non-drag alternatives, WCAG 2.2 AA-relevant behavior, 320 CSS px reflow, zoom/text enlargement, worker failure recovery, stale-result protection, memory discipline, and route-lazy loading are verified.
- [ ] **G11 — Integration and release proof.** Current main is reconciled without loss of parallel work; CAD registration/focused E2E mapping is integrated; adversarial review passes; latest branch CI is green; final CAD head is merged into main; main CI + Pages deploy succeed; only then may this status change to COMPLETE.

## Capability accounting

| Range | Domain | Complete |
| --- | --- | ---: |
| 1–16 | Sketch creation and inference | 0 / 16 |
| 17–32 | Sketch constraints and dimensions | 0 / 16 |
| 33–58 | Exact 3D construction | 0 / 26 |
| 59–65 | Surface and repair | 0 / 7 |
| 66–75 | Parametric workflow | 0 / 10 |
| 76–92 | Selection, inspection, viewport | 0 / 17 |
| 93–100 | Lightweight components | 0 / 8 |
| **Total** |  | **0 / 100** |

## Current evidence

- G1–G3 remain green from their committed unit/build checkpoints.
- The sketch solver supports point/line/circle geometry, fixed-point/fixed-entity, horizontal/vertical, coincident, distance/horizontal-distance/vertical-distance, length/radius/diameter/angle, perpendicular/parallel/tangent/concentric/equal-length/equal-radius, midpoint/point-on-line/point-on-circle/symmetric-points, disabled constraints, DOF rank analysis, soft drag seeding, and deterministic conflict reporting.
- Formula/reference-dimension RED was established at `143dfa230912d34d3d2a66bef2d3733bc84a085f`; production support through `13884f5ffd31a358574a0b8ebe4c49280571c407` passed all four new tests. Tracker-aligned run `34661768357` passed the full unit suite and production build.
- Public sketch-analysis RED was established through `afa238c9c6c2cec4ac6e2d752525f8cbd9bbc7af`; after isolating the façade boundary in `08e286ceabd8c1802ded8ce6d4c4bbec9041aec4`, production support is committed at `dfda96a0ad55112cfd2de466b3959a728e32a062`. Its implementation run passed both analysis tests and 673 tests overall with only the expected pre-ledger freshness failure; tracker-aligned run `34661965781` passed the full unit suite and production build.
- G5 dependency re-verification on 2026-09-11 still corroborates `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, and `ml-matrix@6.15.0` between npm/current official tagged or source metadata. Installation remains pending; no lockfile is being hand-edited.
- The prior aligned dimensional checkpoint run `34643533639` passed all 668 unit tests and production build. Its browser failure was isolated to the concurrently developed Vector Studio `svg-sprite-compiler` route, not CAD.
- G4 remains open until its full planned sketch/entity contract and numerical dependency policy are satisfied; internal foundations do not count as completed user-facing capabilities.
- `main` contains unrelated concurrent work; CAD remains isolated until G11 reconciliation.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any `cad-*.test.ts` functional test, CAD E2E tests, or the authoritative CAD design/plan. If implementation advances without this ledger advancing, unit validation fails.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.