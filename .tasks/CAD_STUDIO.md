# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Capability expansion:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`
**Authoritative plans:** `docs/superpowers/plans/2026-09-11-cad-studio.md` + `docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `a332dcc77c6060f775a2eb1248eeab3f9fdb8637`
**Current gate:** G4 — named parameters and constrained sketch system
**Completed gates:** 4 / 16
**Capability target:** 195
**Completed user-facing capabilities:** 0 / 195

## Deterministic completion equation

`COMPLETE = G0..G15 all complete AND completed user-facing capabilities = the authoritative declared capability target (currently 195/195) AND export matrix verified AND exact dependency policy satisfied AND latest CAD branch checks green AND branch reconciled with current main AND final CAD head contained in origin/main AND main validation/Pages deployment green.`

The capability target is a floor rather than a ceiling. It increases whenever later research identifies another materially useful, non-redundant function that is realistically supportable by the local-first browser/GitHub Pages architecture. A capability may leave scope only under an explicitly committed environment limitation, unrelated-domain, superseded, or documented `other` rationale.

A capability counts only when production behavior exists, relevant validation passes, and any required user interaction is usable rather than decorative. Infrastructure alone never increments the capability count.

## Gate ledger

- [x] **G0 — Architecture and dependency governance.** Approved exact-B-Rep architecture, domain boundary, living capability-floor policy, export policy, exact-pin rule, licensing/browser constraints, and implementation plans are committed.
- [x] **G1 — Serializable parametric project engine.** Project/history types, downstream dependency closure, suppression, dirty propagation, dependency-safe reorder, undo/redo, and history limits are implemented and unit-tested.
- [x] **G2 — Canonical units foundation.** Canonical millimeter/radian storage and supported length/angle conversions reject non-finite values and pass unit/build validation.
- [x] **G3 — Semantic topology references.** Provenance + geometry fingerprint scoring resolves unique references and explicitly returns ambiguous/missing rather than silently retargeting geometry.
- [ ] **G4 — Parameters and constrained sketch system.** Complete the expanded sketch-entity contract, named dimensional formulas, cycle/error handling, geometric/dimensional constraints, DOF analysis, drag solve, deterministic conflict isolation, profile/geometry diagnostics, accepted inference proposals, and numerical-library policy.
- [ ] **G5 — Exact OCCT worker kernel.** Re-verified exact dependencies are pinned, route-lazy WASM initializes in a dedicated worker, revision cancellation/restart works, unsupported browsers are explicit, and analytic geometry + STEP/BREP round-trip fixtures pass.
- [ ] **G6 — Exact solid/surface feature evaluator.** Required primitives, extrude/revolve/sweep/loft, booleans, hole, fillet/chamfer, shell/thicken/draft/offset/split/rib, pattern/mirror/helix/thread/text, datums, surfaces, defeaturing, and healing are functional.
- [ ] **G7 — CAD workspace and sketch interaction.** Responsive workspace, model tree, contextual inspector, precision sketch editing, selection, camera/navigation, exact numeric alternatives, undo/redo, feature diagnostics, and command access are functional.
- [ ] **G8 — Inspection and lightweight components.** Exact measurement, mass/inertia/curvature/section inspection, interference/clearance, wall/draft/overhang/print checks, semantic inspection annotations, component instances/relations, motion preview, and exploded presentation are functional.
- [ ] **G9 — Persistence and professional export.** IndexedDB recovery/native project plus verified STEP, 3MF, GLB/glTF, STL, OBJ, SVG/DXF projection, PNG, batch/manifest workflows, and per-format metadata mapping/sidecar behavior are functional.
- [ ] **G10 — Import, direct-edit, mesh, material, and reusable engineering-data workflows.** Exact STEP/XCAF/BREP import, supported sketch/vector imports, explicitly typed mesh/reference imports, raster underlay, exact 3D curves, defeature/direct workflows, named selections, material library, mesh repair/booleans/refinement, and geometry-quality reporting are functional.
- [ ] **G11 — Sheet-metal system.** Base/converted sheet metal, flanges, bends/rips/joints, hems, jogs, reliefs, tabs/forms, lofted sheet metal, bend rules, linked folded/flat patterns, bend tables/sequences, and fabrication flat-pattern export are functional.
- [ ] **G12 — Technical drawings and model-based definition.** Multi-sheet HLR drawings, projected/auxiliary/section/detail/break/flat views, associative dimensions/tolerances, centers/hatching, manufacturing annotations/GD&T, BOM/tables/balloons, title/revision systems, standards, associative regeneration, drawing export, and native model annotations are functional.
- [ ] **G13 — Tolerance, engineering-content, assembly-extension, and any-user command/guidance workflows.** Model tolerance metadata, fits/stacks, standard hardware, gear/rack generation, expanded component patterns/limits/relink/suppression/explodes/BOM, command search, tree filtering, shortcuts/favorites, and guided/standard/precision presentation are functional.
- [ ] **G14 — Accessibility, responsive resilience, performance and recovery.** Keyboard/touch/non-drag alternatives, WCAG 2.2 AA-relevant behavior, 320 CSS px reflow, zoom/text enlargement, worker failure recovery, stale-result protection, memory discipline, route-lazy loading, and large-project safeguards are verified.
- [ ] **G15 — Integration and release proof.** Current main is reconciled without loss of parallel work; CAD registration/focused E2E mapping is integrated; adversarial review passes; latest branch CI is green; final CAD head is merged into main; main CI + Pages deploy succeed; only then may this status change to COMPLETE.

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
| 101–113 | Import, reference, direct editing, reusable engineering data | 0 / 13 |
| 114–121 | Advanced exact inspection and model quality | 0 / 8 |
| 122–134 | Sheet-metal design and fabrication | 0 / 13 |
| 135–157 | Technical drawings and model-based definition | 0 / 23 |
| 158–163 | Expanded lightweight assembly workflow | 0 / 6 |
| 164–181 | Persistence and professional export | 0 / 18 |
| 182–187 | Sketch intelligence and tolerance engineering | 0 / 6 |
| 188–191 | Mechanical content and mesh workflows | 0 / 4 |
| 192–195 | Any-user command and guidance workflow | 0 / 4 |
| **Total** |  | **0 / 195** |

## Current evidence

- G1–G3 remain green from committed unit/build checkpoints.
- Parameter/formula dimensions, reference dimensions, public sketch analysis, DOF/conflict reporting, and the point/line/circle constraint family are implemented and green at their aligned checkpoints.
- The living capability-floor policy and expanded 16-gate completion guard are committed and green; the authoritative floor is currently 195 and may increase.
- Profile diagnostics at `a14fc812e64a5d30e2426a43488b295fefedfeef` cover deterministic non-mutating closed line/circle regions, open endpoints, micro-gaps, duplicate/overlapping lines, and interior self-intersections. Aligned run `34663848767` passed the full unit suite and production build.
- Advanced sketch entity support through `d438aed7e00b19a788b0789147e8a3521c27e3c1` adds serializable arc, ellipse, elliptical-arc, and spline contracts plus pre-kernel geometry validation. Run `34664168754` passed all five advanced-entity tests and 683 tests overall before the expected stale-ledger guard. A later aligned run passed 684/684 CAD-era unit tests; transient shared-main Crystal Studio failures were isolated and not modified under CAD-only authority.
- Constraint-inference RED is committed at `2881645e86a75b065cfa2fa62d229d6cc1850a7c`; run `34664385049` failed for the intended missing `sketch-inference` module while the unrelated Crystal module was also transiently absent on that synthetic merge.
- Explicit constraint proposals are implemented at `49dfcddfa5f5add1d6778c923a5960e2f323c265`. Run `34664438312` passed all five inference tests and **692 tests overall**; its only failure was the expected stale CAD progress SHA. The current-main Crystal tests were green in that run. Proposals are deterministic, non-mutating, confidence-ranked, duplicate-suppressed even against disabled equivalents, and include horizontal, vertical, coincident, and finite-line/circle tangency inference.
- Advanced-curve RED landed at `9d53f772e5d696cfa023903888cce56955a04617` (three new fixtures covering full-ellipse/closed-spline intrinsic closure, mixed arc-and-line loops, and open-spline/elliptical-arc endpoint diagnostics). GREEN followed at `6146ef1df8f9c898dde952bd82047b708a755e12`, generalizing profile-region detection onto a shared connectable-entity abstraction (line, arc, elliptical-arc, open spline) while keeping duplicate/overlap/self-intersection checks scoped to straight lines. A local `pnpm test:unit` run passed all 8 `cad-sketch-diagnostics` cases and **690/692 tests overall**; the only failures were the expected stale CAD progress SHA (now corrected below) and a pre-existing, unrelated `markdown-citation` timeout not touched under CAD-only authority.
- Current dependency research corroborates `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, and `ml-matrix@6.15.0`; fresh verification remains mandatory immediately before installation and no lockfile is hand-edited.
- Explicit environment exclusions remain IGES I/O, automatic arbitrary triangle-mesh-to-clean-parametric-B-Rep reconstruction, and guaranteed semantic STEP PMI embedding until adapter support is verified. Unrelated-domain and superseded exclusions remain documented in the expansion spec. There are no current `other` exclusions.
- Arc constraint RED landed at `81cb850` (five new fixtures covering the intrinsic equal-radius identity, a radius dimension on an arc, circle/arc concentricity, circle/arc equal-radius, and conflict isolation when a fixed point breaks an arc's radius identity). GREEN followed at `15367933ce93cbcade88d04300ce850fe51cab66`: `sketch-solver.ts` now enforces, for every arc, that its start and end points share one radius from its center as an always-on structural residual (not a user-toggleable constraint, mirroring the existing validation rule in `sketch-geometry.ts`), and generalizes the radius, diameter, concentric, and equal-radius constraints to resolve against either a circle or an arc. A local `pnpm exec tsc --noEmit -p tsconfig.app.json` and full `pnpm exec vitest run tests/unit` passed **696/697 tests**; the only failure was the pre-existing, unrelated `markdown-citation` Chicago-style timeout, not touched under CAD-only authority.
- Fixed-entity RED landed at `7053ca9` (four new fixtures locking an arc, an ellipse, an elliptical arc, and a spline in place while an unrelated free point in the same sketch stays unconstrained). GREEN followed at `80c2d1a94c4120cf2a3aef70f8a4b72a56db6c21`: `fixedEntityResidual` now locks every point an arc, ellipse, elliptical-arc, or spline references at its captured initial position, matching the existing line/circle behavior. This commit also consolidates the seven per-entity lookup maps that were being threaded individually through every solver function (`residualForConstraint`, `residualVector`, `numericJacobian`, `solveCore`, `conflictIds`, `solveSketch`) into a single `SketchIndex` built once per solve, since the positional parameter list was becoming unwieldy with more entity-aware constraint work ahead. A local `pnpm exec tsc --noEmit -p tsconfig.app.json`, full `pnpm exec vitest run tests/unit`, and `pnpm exec vite build` all passed, with **700/701 tests**; the only failure remains the pre-existing, unrelated `markdown-citation` timeout.
- Concentric-ellipse RED landed at `96cfc8f` (a circle/ellipse fixture and an arc/elliptical-arc fixture, each fixing one entity's center and asserting the other's center is pulled to match). GREEN followed at `a332dcc77c6060f775a2eb1248eeab3f9fdb8637`: `curveCenter` now also resolves an ellipse's or elliptical arc's center point, so `concentric` accepts any mix of circle, arc, ellipse, and elliptical-arc entities. Concentricity only compares center points, so unlike tangent/point-on-arc it carries no angular-span ambiguity. Full unit suite passed **702/703**; the only failure remains the pre-existing, unrelated `markdown-citation` timeout.
- G4 remains open: tangent and point-on-arc/point-on-ellipse constraints are deliberately deferred rather than approximated, because they require angular-span/clockwise handling (arcs, elliptical arcs) or true implicit-curve tangency (ellipses) that the project's own invariants forbid silently approximating. Ellipse, elliptical-arc, and spline entities can now be fixed in place and (ellipse/elliptical-arc only) participate in concentric constraints, but still have no radius-family (radius/diameter/equal-radius), tangent, or point-on-curve coverage of their own, and no DOF/conflict test coverage beyond what concentric and fixed-entity already exercise. Foundations alone do not count as completed user-facing capabilities.
- `main` contains unrelated concurrent work; CAD remains isolated until G15 reconciliation.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any CAD functional/E2E test other than the guard itself, or the authoritative CAD specifications/plans. It derives the capability floor from the expansion specification, requires the ledger denominator to match it, and validates the declared gate denominator against the sequential gate list.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.