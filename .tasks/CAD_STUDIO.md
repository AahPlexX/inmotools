# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Capability expansion:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`
**Authoritative plans:** `docs/superpowers/plans/2026-09-11-cad-studio.md` + `docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `24cbce43b6b4e57eeb77a2804ba16c79462b2f05`
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
- Advanced sketch entity support through `d438aed7e00b19a788b0789147e8a3521c27e3c1` adds serializable arc, ellipse, elliptical-arc, and spline contracts plus pre-kernel geometry validation. Run `34664168754` passed all five advanced-entity tests and 683 tests overall before the expected stale-ledger guard.
- Explicit constraint proposals are implemented at `49dfcddfa5f5add1d6778c923a5960e2f323c265`. Run `34664438312` passed all five inference tests and 692 tests overall; proposals are deterministic, non-mutating, confidence-ranked, duplicate-suppressed, and include horizontal, vertical, coincident, and finite-line/circle tangency inference.
- Advanced profile topology is implemented at `6146ef1df8f9c898dde952bd82047b708a755e12`: full ellipses and closed splines are intrinsic closed regions; line, arc, elliptical-arc, and open-spline endpoints participate in connectable-region and micro-gap analysis while straight-line duplicate/overlap/self-crossing diagnostics remain exact and line-scoped.
- Arc structural/constraint support is implemented at `15367933ce93cbcade88d04300ce850fe51cab66`: every arc has an always-on equal-radius identity, and radius/diameter/concentric/equal-radius resolve against circles or arcs without approximating angular semantics.
- Fixed advanced entities are implemented at `80c2d1a94c4120cf2a3aef70f8a4b72a56db6c21`; arc, ellipse, elliptical-arc, and spline referenced points can be locked through the same fixed-entity contract. The solver's entity lookup maps were consolidated into one `SketchIndex` in the same slice.
- Cross-family concentricity is implemented at `a332dcc77c6060f775a2eb1248eeab3f9fdb8637`, allowing any mix of circle, arc, ellipse, and elliptical-arc centers to be constrained together.
- Finite point-on-curve RED is committed at `db5071c47d8dc923731f2307253dcb80df77e179`. Run `34705473720` proved the intended missing behavior: three finite/full-curve cases failed while an excluded-span fixed-point conflict remained conservatively non-convergent. The same synthetic merge also exposed a transient unrelated Crystal viewport module gap, which CAD did not modify.
- Uniform point-on-curve typing is committed at `f0709ad64349f9c0cecd8e0a6fc6c89fef832457`; exact solver behavior is committed at `24cbce43b6b4e57eeb77a2804ba16c79462b2f05`. The constraint supports circles, finite directed circular arcs, rotated ellipses, and finite directed elliptical arcs. Arc/elliptical-arc membership includes a directed-span residual, so a point on the excluded portion of the underlying circle/ellipse cannot be falsely accepted. Spline membership is explicitly rejected rather than approximated until a true spline evaluator exists. Run `34705680912` passed all four new point-on-curve tests and **747 tests overall**; the only failure was the expected stale CAD progress SHA corrected by this tracker-only commit. Crystal viewport tests were green again in that run.
- Current dependency research corroborates `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, and `ml-matrix@6.15.0`; fresh verification remains mandatory immediately before installation and no lockfile is hand-edited.
- Explicit environment exclusions remain IGES I/O, automatic arbitrary triangle-mesh-to-clean-parametric-B-Rep reconstruction, and guaranteed semantic STEP PMI embedding until adapter support is verified. Unrelated-domain and superseded exclusions remain documented in the expansion spec. There are no current `other` exclusions.
- G4 remains open: exact generalized tangency (especially ellipse/elliptical-arc tangency), true spline curve evaluation/constraints, accepted inference application, and the numerical-library/dependency policy remain outstanding. Ellipse minor radius is still serialized scalar geometry rather than a solver variable, so ellipse radius-family semantics must be designed rather than guessed. Foundations alone do not count as completed user-facing capabilities.
- `main` contains unrelated concurrent work; CAD remains isolated until G15 reconciliation.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any CAD functional/E2E test other than the guard itself, or the authoritative CAD specifications/plans. It derives the capability floor from the expansion specification, requires the ledger denominator to match it, and validates the declared gate denominator against the sequential gate list.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.
