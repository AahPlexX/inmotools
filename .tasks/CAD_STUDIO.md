# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Authoritative plan:** `docs/superpowers/plans/2026-09-11-cad-studio.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `b9b7702f85fde0c94ebf0af9a072e5a3260cc0e1`
**Current gate:** G4 — named parameters and constrained sketch system
**Completed gates:** 4 / 12
**Completed user-facing capabilities:** 0 / 100

## Deterministic completion equation

CAD Studio is **COMPLETE** only when every condition below is simultaneously true:

`COMPLETE = G0..G11 all complete AND capabilities 1..100 = 100/100 AND export matrix verified AND exact dependency policy satisfied AND latest CAD branch checks green AND branch reconciled with current main AND final CAD head contained in origin/main AND main validation/Pages deployment green.`

No subjective percentage, visual polish claim, or partial feature count may override this equation. A capability counts as complete only when its production behavior exists, its relevant test/evidence passes, and any required UI interaction is usable rather than decorative.

## Gate ledger

- [x] **G0 — Architecture and dependency governance.** Approved exact-B-Rep architecture, domain boundary, 100-capability target, export policy, exact-pin rule, licensing/browser constraints, and implementation plan are committed.
- [x] **G1 — Serializable parametric project engine.** Project/history types, downstream dependency closure, suppression, dirty propagation, dependency-safe reorder, undo/redo, and history limits are implemented and unit-tested.
- [x] **G2 — Canonical units foundation.** Canonical millimeter/radian storage and supported length/angle conversions reject non-finite values and pass unit/build validation.
- [x] **G3 — Semantic topology references.** Provenance + geometry fingerprint scoring resolves unique references and explicitly returns ambiguous/missing rather than silently retargeting geometry.
- [ ] **G4 — Parameters and constrained sketch system.** Named dimensional formulas, cycle/error handling, sketch entities, geometric/dimensional constraints, DOF analysis, drag solve, and deterministic conflict isolation are green.
- [ ] **G5 — Exact OCCT worker kernel.** Re-verified exact dependencies are pinned, route-lazy WASM initializes in a dedicated worker, revision cancellation works, and analytic geometry fixtures + STEP round-trip pass.
- [ ] **G6 — Exact solid/surface feature evaluator.** Required primitives, extrude/revolve/sweep/loft, booleans, hole, fillet/chamfer, shell/thicken/draft/offset/split/rib, pattern/mirror/helix/thread/text, datums, surfaces, and healing are functional.
- [ ] **G7 — CAD workspace and sketch interaction.** Responsive workspace, model tree, contextual inspector, precision sketch editing, selection, camera/navigation, exact numeric alternatives, undo/redo, feature diagnostics, and command access are functional.
- [ ] **G8 — Inspection and lightweight components.** Exact measurement, mass, sections, interference/clearance, wall/draft/overhang/print checks, mesh diagnostics, component instances/relations, motion preview, and exploded presentation are functional.
- [ ] **G9 — Persistence and professional export.** IndexedDB recovery/native project plus verified STEP, 3MF, GLB/glTF, STL, OBJ, SVG/DXF projection, PNG and per-format metadata mapping/sidecar behavior are functional.
- [ ] **G10 — Accessibility, responsive resilience, performance and recovery.** Keyboard/touch/non-drag alternatives, WCAG 2.2 AA-relevant behavior, 320 CSS px reflow, zoom/text enlargement, worker failure recovery, stale-result protection, memory discipline, and route-lazy loading are verified.
- [ ] **G11 — Integration and release proof.** Current main is reconciled without loss of parallel work; CAD registration/focused E2E mapping is integrated; adversarial review passes; latest branch CI is green; final CAD head is merged into main; main CI + Pages deploy succeed; only then may this status change to COMPLETE.

## User-facing capability accounting

The authoritative capability descriptions are numbered 1–100 in the design spec. Counts below may increase only when implementation + relevant validation are both complete.

| Capability range | Domain | Complete |
| --- | --- | ---: |
| 1–16 | Sketch creation and inference | 0 / 16 |
| 17–32 | Sketch constraints and dimensions | 0 / 16 |
| 33–58 | Exact 3D construction | 0 / 26 |
| 59–65 | Surface and repair | 0 / 7 |
| 66–75 | Parametric workflow | 0 / 10 |
| 76–92 | Selection, inspection, viewport | 0 / 17 |
| 93–100 | Lightweight components | 0 / 8 |
| **Total** |  | **0 / 100** |

Infrastructure that enables a capability does not count as the capability itself. For example, the project engine, topology resolver, unit system, parameter-expression engine, and internal sketch solver are foundations; capability counts advance only when the end-user operation itself is implemented and validated.

## Current evidence snapshot

- Project-engine RED was observed on commit `9b07be3ddda937815d32da93454ea123dcdbd293`; production implementation then passed unit tests and production build on `02f9d306c5dd9eb89c42076f7e185a0c5efbd79a`.
- Unit-conversion RED was observed on `abcbe017fa4a6a9bc832f48b8d65e52707fcf22f`; implementation on `74f70c2caa9982ad3780d54efc9ffda8cdeb7a30` passed unit tests and build.
- Topology-reference RED was observed on `7ef0e3bab07581c809121f64a00c35a3f49461d2`; implementation on `211abe88e5023cb0245afa404d06b6618e2f2f7a` passed unit tests and build.
- Parameter-expression RED was observed on `6a1e5f32a05d6cf21728c20a0bab63a328aa673b`; the implementation plus tolerance-correct test at `93bcc6d60340d81a0c4b968e9dc2883858807fb5` passed the complete unit suite and production build.
- Constrained-sketch solver contracts were added at `36c750764db204ac33634abbfcfa5ac552b3abe6`. Serializable sketch types and the initial deterministic hard-constraint solver through `9a4dcd6f2092d08ae369c3f5b45c20b0eeb48bfd` pass the complete unit suite and production build.
- Curved-constraint RED contracts were added at `ee81f295bb1224bc7911d1d483cd2382ec153442` for circle radius as a geometric degree of freedom, perpendicular line pairs, and line-circle tangency. With the ledger aligned, run `34641504540` failed exactly those three contracts while 651 other tests passed and the CAD freshness guard stayed green.
- Production support for circle radius variables plus perpendicular and line-circle tangent residuals is committed through `de62580fb701fbcfcc1d6df9a95022f2805a1d97`. On its implementation run all eight sketch-solver tests passed; after ledger alignment, run `34641746787` passed the complete unit suite and production build against the PR synthetic merge with current `main`.
- Relational-constraint RED contracts were added at `353a4e1847900c33fb9c32cabeeb21cda743c603`. Aligned run `34641939226` failed exactly the four new parallel, concentric, equal-length, and equal-radius contracts while the previous eight sketch tests, the CAD freshness guard, and 654 other tests passed.
- Production support for parallel, concentric, equal-length, and equal-radius relationships is committed through `b9b7702f85fde0c94ebf0af9a072e5a3260cc0e1`. Its implementation run proved all 12 sketch-solver tests pass; after ledger alignment, run `34642105230` passed the complete unit suite and production build against the PR synthetic merge with current `main`.
- The solver now models point/line/circle entities plus fixed-point, horizontal, vertical, point-distance, coincident, radius, perpendicular, parallel, tangent, concentric, equal-length, equal-radius, DOF rank analysis, disabled constraints, soft drag seeding, and explicit conflict reporting. This is not yet the full 17–32 constraint capability set.
- G4 remains incomplete until the remaining required constraint/dimension family, sketch entities, and end-user sketch operations are implemented and green.
- Final PR/browser/main/Pages status is intentionally owned by G11, so transient CI state changes do not force this ledger into a self-triggering update loop.
- `main` contains unrelated concurrent work; CAD remains isolated until the integration gate.

## Freshness invariant

This file is the CAD progress SSOT. The repository test `tests/unit/cad-progress.test.ts` compares **Last tracked implementation commit** with the newest commit that changed CAD production code, CAD functional tests, or the CAD design/plan. If implementation advances without this ledger advancing, CAD unit validation must fail.

Every CAD work cycle therefore ends in one of two states:

1. production/test work + this ledger describe the same latest checkpoint; or
2. validation is red and the branch is explicitly not merge-ready.

The shared `.tasks/IN_PROGRESS.md` is updated only during the integration gate to avoid overwriting other agents' parallel task entries. This dedicated ledger remains authoritative for CAD progress until then.