# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Capability expansion:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`
**Authoritative plans:** `docs/superpowers/plans/2026-09-11-cad-studio.md` + `docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `8b54e05f1d098146226e46a88c1d9010b0e73ccb`
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
- [ ] **G4 — Parameters and constrained sketch system.** Complete the expanded sketch-entity contract, named dimensional formulas, cycle/error handling, geometric/dimensional constraints, DOF analysis, drag solve, deterministic conflict isolation, profile/geometry diagnostics, accepted inference proposals, true spline constraints, and numerical-library policy.
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

- G1–G3 remain green from committed unit/build checkpoints. Parameter/formula dimensions, reference dimensions, public sketch analysis, DOF/conflict reporting, profile diagnostics, inference proposals/acceptance, advanced sketch entities, and the established geometric/dimensional constraint families are implemented at aligned checkpoints.
- Finite point-on-curve support at `24cbce43b6b4e57eeb77a2804ba16c79462b2f05` covers circles, directed circular arcs, rotated ellipses, and directed elliptical arcs without accepting excluded arc spans. Tracker-aligned run `34705743969` passed the full unit suite and production build.
- Transactional inference acceptance at `b40cd04091bd33a6c0dfd27b86c2ec93baef9780` rejects unsupported/duplicate/stale-unsatisfiable proposals without mutating the source sketch. Tracker-aligned run `34705958397` passed the full unit suite and production build.
- Exact generalized line-to-curve tangency at `d100f7a84b9e380537a7f0a5c51cbc1e76e4c8bf` supports circles, finite circular arcs, rotated/full ellipses, and finite elliptical arcs using analytic normalized-ellipse geometry plus directed contact-span enforcement. Its six focused tests passed, and tracker-aligned run `34706365029` passed the full unit suite and production build.
- True interpolating B-spline evaluation at `6801c6606a7508c548c773e68263a90edd291e7e` supports clamped open and periodic closed curves, degree 1–5, chord-length fit parameters, exact fit equations, optional open-spline endpoint derivatives, and deterministic minimum-norm interpolation. Run `34706667989` passed all five focused evaluator tests; tracker-aligned run `34715985946` passed the full unit suite and production build.
- True spline contact constraints are implemented at `8b54e05f1d098146226e46a88c1d9010b0e73ccb` after the serializable contact-parameter contract at `d256f8c70d8261357cc804bbea699b8580342594`. Spline-backed point-on-curve and tangent-curve constraints allocate a bounded solver-owned contact parameter, evaluate the spline from current solver geometry, include contact state in Jacobian/DOF analysis, and persist the solved parameter for deterministic replay. Run `34716324971` passed all three focused spline-contact tests and **774 tests overall**; only the expected stale progress SHA remained before this tracker-only alignment.
- Current dependency research corroborates `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, and `ml-matrix@6.15.0`; fresh verification remains mandatory immediately before installation and no lockfile is hand-edited.
- Explicit environment exclusions remain IGES I/O, automatic arbitrary triangle-mesh-to-clean-parametric-B-Rep reconstruction, and guaranteed semantic STEP PMI embedding until adapter support is verified. Unrelated-domain and superseded exclusions remain documented in the expansion spec. There are no current `other` exclusions.
- G4 remains open on the numerical-library/dependency policy. Ellipse minor radius remains serialized scalar geometry rather than a solver variable, so ellipse radius-family semantics must be designed rather than guessed. Foundations alone do not count as completed user-facing capabilities.
- `main` contains unrelated concurrent work; CAD remains isolated until G15 reconciliation.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any CAD functional/E2E test other than the guard itself, or the authoritative CAD specifications/plans. It derives the capability floor from the expansion specification, requires the ledger denominator to match it, and validates the declared gate denominator against the sequential gate list.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.
