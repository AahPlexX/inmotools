# CAD Studio Completion Ledger

**Status:** IN_PROGRESS
**Branch:** `feat/cad-studio`
**PR:** #28
**Authoritative design:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`
**Capability expansion:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`
**Authoritative plans:** `docs/superpowers/plans/2026-09-11-cad-studio.md` + `docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md`
**Dependency gate:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`
**Last tracked implementation commit:** `5966d0c85bd9b5cc4ed3a6825b3b4bd82d2c5e26`
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
- Dedicated Vite bundle proof run `34729579557` and Chromium runtime proof run `34729645509` establish physical worker/WASM splitting and successful real-browser OCCT initialization.
- G6 first evaluator slice `54dbecc1568597fecc74eefdc2199889d94f11e7` replays exact box/cylinder/sphere/cone/torus primitives and fuse/cut/common/section Booleans from the serializable feature history, validates feature parameters/body ownership, honors suppression, attributes failures to feature IDs, retains only each body's final exact shape, and deterministically releases intermediate/error-path native geometry. Run `34729840514` passed all four evaluator contracts and reached **835 passing tests**; only the stale ledger guard failed before alignment. Aligned run `34729937081` then passed the full unit stage and production build.
- Worker rebuild integration `ccbee07c2ff3da139ef114560e180fb84e0f7f77` attaches the exact evaluator to real `rebuild` requests, tessellates evaluated bodies, atomically replaces worker-owned exact state only after successful tessellation, preserves prior state on failed rebuilds, releases rejected new geometry, and maps `CadFeatureEvaluationError` to structured recoverable `evaluation-failed` responses with `featureId`. Run `34730030134` passed all five real OCCT worker-executor fixtures, including a serializable 20×10×5 box rebuild followed by BREP round-trip at 1000 mm³ and invalid-cylinder attribution to `bad-cylinder`; the repository reached **836 passing tests** with only the stale tracker guard before this alignment.
- Boolean solid chains are verified rather than reworked at `f3f8a45`: a second Boolean depending on a prior Boolean's own feature id already replays and releases correctly through the existing generic feature loop (the single end-of-run release pass frees the superseded intermediate result, keeping only the final per-body shape). No production change was needed; this closes that specific open question from the prior checkpoint. Full unit suite still green (no regression) at this commit.
- The sketch-to-profile architecture flagged at the prior checkpoint is now resolved by concurrent work through `e00c855`: `CadProject.sketches` is typed to real `CadSketch[]` (`0e56078`), `sketch-profile.ts` bridges a solved sketch plus a chosen closed profile region into 3D-placed exact edges via the sketch's origin plane (`466ba86`, `2e57cbc`), and the evaluator now handles `extrude`/`revolve` (`d9aee38`), `sweep`/`loft` with real exact wire construction (`7053248`, `69dba58`, `9417d65`, plus a same-day sweep-profile correction at `d66b7ae`), and `offset` (`a5a1084`) against the real kernel. Semantic topology fingerprints now resolve fillet edges by geometric identity rather than unstable OCCT ordinals (`b5eaf3a`, `5098701`, `f0de8e9`).
- This session's continuation found the branch tip (`e00c855`) left three defects uncaught by its own claimed-green state, verified each against the code before fixing, and closed all three:
  - `chamfer` features threw "not implemented by the exact evaluator yet" — the fillet/chamfer topology-bridging slice wired `fillet` into the evaluator's feature switch but not its sibling `chamfer`, even though `kernel.chamfer` and its topology resolution path already existed. Fixed at `998fa6d` by adding `chamferFeature`, mirroring `filletFeature` exactly.
  - The XZ origin-plane frame produced `-0` for any point with `y = 0` (JS negates exact zero to `-0`), which is numerically identical to `0` but fails strict downstream equality. The same latent bug existed in the generic edge-reversal `negate()` helper. Fixed at `9dfbf64` with a shared `negateComponent()` that keeps zero non-negative.
  - The real-kernel loft test asserted a frustum's (radius 2 → radius 4) bounding box as ±2 in y/z, which is simply wrong — a bounding box must contain the whole solid, so the correct extent is ±4 at the wide end. The exact `toEqual` masked this because real OCCT's tiny numerical noise (~1e-7) already made it fail for the *wrong* reason. Fixed at `13e0a33` by asserting bounds component-wise with `toBeCloseTo` (matching how volume is already asserted elsewhere in the same file) and correcting the expected values to ±4.
- `shell` is now implemented against the real kernel at `2979cb0464fe68e50239f052d80268fd1d7e55c6` (RED at `9ea177e`), following the fillet/chamfer semantic-face-resolution pattern exactly. Verified against real `occt-wasm`: a 1mm-thick open-top shell of a 20×10×5 box yields the exact expected 424 mm³ wall volume (1000 − 18×8×4). `draft` remains explicitly unimplemented rather than guessed: `occt-wasm`'s raw `draft()` takes a single face handle while the `CadExactKernel` contract's `draft(shape, faceIds: readonly string[], ...)` accepts an array, and no test oracle yet establishes whether multi-face draft should chain sequential single-face operations or needs a different kernel call.
- `mirror` is now implemented against the real kernel at `293d7fe80a640bb2bab616fbdd9d75bcaca1925e` (RED at `25c30ea`). This required a genuine `CadExactKernel` contract extension (`mirror(shape, planeOrigin, planeNormal)`) rather than a mechanical wire-up, since occt-wasm's raw `mirror()` existed but nothing in the adapter boundary exposed it yet. A mirror feature sources its plane from an existing sketch's own origin plane via a new `resolveSketchPlane3d()` in `sketch-profile.ts` — the same plane-frame math already used to place profiles, evaluated at the sketch's own origin — mirroring how `revolve` already sources its axis from a sketch construction line. Verified against the real kernel: mirroring a 20×10×5 box across the YZ plane preserves its exact 1000 mm³ volume and produces the exact expected reflected bounds.
- `thicken` is now implemented against the real kernel at `5966d0c85bd9b5cc4ed3a6825b3b4bd82d2c5e26` (RED at `9709bcc`), adding `thicken(shape, thickness)` to the `CadExactKernel` contract. No topology selection is involved (occt-wasm's raw `thicken()` grows a face/shell into a solid, or a solid uniformly), so it wires into the evaluator exactly like `offset`. Verified against the real kernel: thickening a planar 10×10 exact face by 2mm yields the exact expected 200 mm³ solid.
- G6 remains open. Booleans, extrude/revolve/sweep/loft, offset, fillet/chamfer, shell, mirror, and thicken are implemented against the real kernel with semantic topology resolution where applicable. Still unimplemented in the evaluator: hole, draft/split/rib, pattern/helix/thread/text, datum planes/axes as real placement (currently pass-through only), surfaces, defeaturing, and healing. `split` and `pattern` each carry the same open design question — a feature producing more than one output shape doesn't fit the current one-shape-per-feature evaluator model and needs a decision (keep one piece and warn, or extend the model) before implementation, not a guess. `draft` remains blocked on the single-face-vs-array question noted at the shell checkpoint.
- The permanent `tests/fixtures/cad-worker-bundle` fixture remains as a reproducible worker/bundle/runtime probe. Heavy OCCT worker code is not registered in the generic application graph yet; the G7 CAD workspace will import the worker factory lazily when the CAD route is integrated.
- glTF/XCAF assembly export remains part of the later professional export path.
- Explicit environment exclusions remain IGES I/O, automatic arbitrary triangle-mesh-to-clean-parametric-B-Rep reconstruction, and guaranteed semantic STEP PMI embedding until adapter support is verified. There are no current `other` exclusions.
- `main` contains unrelated concurrent work; CAD remains isolated until G15 reconciliation. PR #28 remains draft; no unrelated tool implementation is intentionally modified by CAD work.

## Freshness invariant

`tests/unit/cad-progress.test.ts` compares the SHA above with the newest commit touching CAD production code, any CAD functional/E2E test other than the guard itself, or the authoritative CAD specifications/plans. It derives the capability floor from the expansion specification, requires the ledger denominator to match it, and validates the declared gate denominator against the sequential gate list.

The shared `.tasks/IN_PROGRESS.md` remains untouched until integration so parallel agents do not overwrite one another.
