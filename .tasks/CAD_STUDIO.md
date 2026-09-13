# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Capability expansion:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`
**Authoritative plans:** `docs/superpowers/plans/2026-09-11-cad-studio.md` + `docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `09536b94fbe3d2c5cf2d00262053915f526fa11a`
**Current gate:** G6 — exact solid/surface feature evaluator
**Completed gates:** 6 / 16
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
- [x] **G4 — Parameters and constrained sketch system.** Expanded sketch entities, named dimensional formulas, cycle/error handling, geometric/dimensional constraints, DOF analysis, drag solve, deterministic conflict isolation, profile/geometry diagnostics, accepted inference proposals, true spline constraints, and the pinned `ml-matrix` numerical policy are implemented and regression-tested.
- [x] **G5 — Exact OCCT worker kernel.** Exact pins are frozen; browser SIMD/tail-call/exception support is concretely probed before kernel initialization; OCCT owns opaque exact shapes in a dedicated module worker; revision/generation cancellation and hard restart are enforced; preview/final tessellation and zero-copy protocol transport are implemented; exact analytic geometry plus STEP/BREP round-trips pass; Vite emits a distinct worker and OCCT WASM asset; and real Chromium initializes the exact kernel successfully.
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

- G1–G4 are complete. The constrained sketch system includes expanded entities, formulas, deterministic conflict/DOF analysis, inference acceptance, spline constraints, and the pinned `ml-matrix` numerical path.
- Exact dependencies are pinned through pnpm-generated package state: `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, `ml-matrix@6.15.0`, and `wasm-feature-detect@1.9.0`. Normal project CI frozen installation resolves those exact versions.
- Real `occt-wasm` fixtures prove a 20×10×5 box at 1000 mm³ / 700 mm² with correct center/bounds and nonempty tessellation, a true cylindrical Boolean volume reduction, STEP volume-preserving round-trip, and binary BREP volume-preserving round-trip.
- Worker infrastructure provides opaque worker-local native handles, state replacement/release, preview/final tessellation, concrete WebAssembly feature detection, one lazy OCCT executor per worker lifetime, structured runtime errors, revision + generation stale-result protection, hard restart, transferables, and browser-worker construction through Vite's literal module-worker pattern.
- Worker lifecycle tests explicitly prove hard restart terminates the old worker and rejects every late result from that generation; client disposal terminates the current worker and prevents future requests.
- Aligned run `34729336137` passed the full unit suite and production TypeScript/Vite build after the worker-executor narrowing correction. Factory run `34729436992` passed both module-worker factory fixtures and all prior functional coverage for **831 passing tests** before its ledger alignment.
- Dedicated Vite bundle proof run `34729579557` emitted `cad.worker-DJ14lOhS.js` (121,389 bytes), a separate main-thread JS bundle (4,552 bytes), and `occt-wasm-aczw1sGm.wasm` (22,226,346 bytes), proving the exact kernel is physically separated from the caller rather than folded into the main bundle.
- Chromium runtime proof run `34729645509` launched Chrome 153 against the permanent CAD worker fixture. The real module worker passed WebAssembly/SIMD/tail-call/exception capability gating, initialized `occt-wasm`, and returned `{ proof: "response", code: "evaluation-failed", recoverable: "true" }`, which is the deliberate G6 evaluator sentinel reached only after exact-kernel initialization. The temporary proof workflow was removed immediately afterward.
- Fresh clean-head PR run `34729683483` passed the full unit stage and production build after all G5 proof scaffolding/workflow cleanup. The later generic browser stage is release/integration evidence and is not needed to establish the isolated G5 kernel contract.
- The permanent `tests/fixtures/cad-worker-bundle` fixture remains as a reproducible worker/bundle/runtime probe. Heavy OCCT worker code is not registered in the generic application graph yet; the G7 CAD workspace will import the worker factory lazily when the CAD route is integrated.
- Topology-ID-dependent fillet/chamfer/shell/draft resolution remains deliberately deferred to G6 rather than accepting raw unstable OCCT indexes. glTF/XCAF assembly export remains part of the later professional export path.
- Explicit environment exclusions remain IGES I/O, automatic arbitrary triangle-mesh-to-clean-parametric-B-Rep reconstruction, and guaranteed semantic STEP PMI embedding until adapter support is verified. There are no current `other` exclusions.
- `main` contains unrelated concurrent work; CAD remains isolated until G15 reconciliation. PR #28 remains draft; no unrelated tool implementation is intentionally modified by CAD work.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any CAD functional/E2E test other than the guard itself, or the authoritative CAD specifications/plans. It derives the capability floor from the expansion specification, requires the ledger denominator to match it, and validates the declared gate denominator against the sequential gate list.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.
