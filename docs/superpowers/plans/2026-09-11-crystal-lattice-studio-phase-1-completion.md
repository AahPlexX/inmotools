# Crystal Lattice Studio — Phase 1 Completion Ledger

**Completed:** 2026-09-13

**Design:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`

**Phase 1 plan:** `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1.md`

## Phase status

Phase 1 — Document core and interactive structure workstation — is complete as a bounded implementation phase. This does **not** mean the full Crystal Lattice Studio master design is complete. Phases 2–5 remain required by the master definition of done.

No Phase 1 acceptance failure required a final CSS or interaction patch. The acceptance tests passed against the integrated Crystal implementation, so no speculative polish change was made.

## Phase 1 delivered capability mapping

The following master-spec capabilities are complete at the Phase 1 boundary:

- **1–6 — core structure import:** CIF 1.1, deliberate CIF 2.0 parsing, structural mmCIF/PDBx, PDB with crystallographic cell records, POSCAR/CONTCAR-style structures, and XYZ/extended XYZ.
- **11 — starter structures:** simple cubic, BCC, FCC, diamond, NaCl, CsCl, zinc blende, graphite, perovskite, rutile, fluorite, wurtzite, and a molecular example.
- **13–15 — local project/history:** versioned project JSON persistence, bounded undo/redo, and reset to imported/starter state.
- **16 — cell editing:** editable cell lengths/angles with invalid-state rejection that preserves the previous valid document.
- **19–20 — site editing:** fractional/Cartesian conversion plus add, duplicate, delete, relabel, and coordinate editing through stable site identities.
- **25 — supercells:** independent integer repeats, site-count preview, deterministic expansion, provenance, and a 50,000-site Phase 1 guard.
- **35 — atom rendering:** instanced Three.js atom rendering driven from the canonical periodic document.
- **37 — camera/navigation:** perspective/orthographic views, orbit/pan/zoom, fit/reset, axis presets, and keyboard-operable view controls.
- **42 — periodic boundary bonds:** minimum-image bond geometry renders correctly across cell boundaries.
- **46–47 — publication graphics:** bounded PNG export with transparent/solid backgrounds and true-vector SVG structure diagrams rather than raster-wrapped SVG.
- **61–63 — measurements:** periodic nearest-image distance, angle, and torsion/dihedral calculations.
- **65 — periodic bond detection:** configurable covalent-radius-based periodic bond inference with explicit diagnostics for unsupported radii.
- **137 — loss-aware CIF preservation:** unknown CIF tags and loops are preserved by default through supported CIF editing/export flows.
- **139 — export diff:** preserved, changed, generated, and omitted metadata are classified before export.
- **141–142 — CIF export:** CIF 1.1 and CIF 2.0 output, including the CIF 2.0 magic header and preservation of supported source content.
- **146–147 — structure export:** POSCAR and XYZ/extended XYZ output from canonical coordinates.
- **150 — measurements CSV:** measurement export includes explicit units and safe CSV quoting.
- **154–155 — export metadata policy:** supported editable export metadata/custom CIF tags are previewable and no generated metadata is silently added.
- **156 — progressive disclosure:** the Phase 1 workspace exposes task-oriented structure workflows rather than inert controls for later phases.
- **162 — Phase 1 interaction/accessibility baseline:** semantic controls, keyboard operation, dialog Escape/focus restoration, five-size reflow acceptance, and a focused serious/critical Axe gate are covered by browser tests.

The following foundations exist in Phase 1 but are **not** counted as completed master capabilities because the master item requires a broader end-to-end surface:

- **10:** the CIF document model preserves multiple data blocks, but block selection/comparison remains a later UI capability.
- **12:** an empty-crystal engine exists, but the complete user-facing creation workflow remains later work.
- **18:** volume, metric, reciprocal-metric/basis mathematics exist, but the complete requested display surface remains later work.
- **21–24:** Phase 1 carries relevant site fields and wrapping primitives, but the complete isotope/oxidation/disorder/ADP and periodic-molecule reconstruction workflows remain later work.
- **26:** periodic image-shell generation exists as a deterministic engine primitive; the complete user-facing image-shell workflow remains later work.
- **36:** ball-and-stick, sticks, space-fill, points, and wireframe exist; polyhedral and thermal-ellipsoid completion remains later work.
- **38:** unit-cell edges exist; the complete lattice/reciprocal-vector/origin/axis/label surface remains later work.
- **40:** stable site selection exists; full multi-select/hide/isolate/invert/property selection remains later work.
- **134–136:** metadata inspection and scalar/loop mutation primitives exist, but the master dictionary-complete searchable/loop-editing surface remains Phase 5 work.

## Remaining master capabilities by required phase

No unapproved capability is removed from the master scope. Items not listed as complete above remain assigned to a named later phase.

### Phase 2 — Symmetry, local environments, validation, and model building

- Complete the deferred model-building/editor portions of **12, 17, 21–24, 26–34**.
- Complete advanced structure visualization portions of **36, 39–45** that depend on coordination, ADP, magnetic, selection, clipping, and model-building data.
- Implement symmetry/asymmetric-unit capabilities **49–60**.
- Implement local-environment and structure-validation capabilities **66–75**.

### Phase 3 — Reciprocal space and diffraction

- Add observed/reflection and powder-data imports **7–9**.
- Complete reciprocal-vector presentation from **18/38** where it belongs in reciprocal workflows.
- Implement real/reciprocal lattice and crystallographic-plane capabilities **76–87**.
- Implement diffraction/scattering capabilities **88–108**.
- Add reflection/powder exports **148–149** and reciprocal/reflection graphics from **151** as their underlying data becomes available.

### Phase 4 — Refinement, fields, voids, and morphology

- Implement powder/reflection refinement and Fourier capabilities **109–117**, subject to each capability's stated numerical-validation gates.
- Implement volumetric field, surface, void, and porosity capabilities **118–127**.
- Implement morphology/facet/twinning capabilities **128–133**.

### Phase 5 — Metadata/export completeness, learnability, performance, and release QA

- Complete multiple-block selection/comparison from **10** if not already surfaced by an earlier phase.
- Complete dictionary-aware metadata capabilities **134–140** beyond the Phase 1 preservation/edit foundations.
- Implement remaining export capabilities **143–145, 148–153**; retain the already-complete Phase 1 exporters.
- Complete learnability/accessibility capabilities **157–163**, retaining and extending the Phase 1 accessibility baseline.
- Perform the master-design performance/resource-guard audit, representative all-seven-crystal-system scientific fixtures, malformed-data fixtures, and final capability-by-capability release audit.

## Conditional and excluded items

- **48 — GLB visible-geometry export:** conditional. Phase 1 deliberately did not expose GLB because the plan requires a focused validity/load proof before exposing generated bytes. It remains in scope when that condition is satisfied; this is not an exclusion.
- **116 — constrained experimental coordinate/occupancy/ADP refinement:** Phase 4 and conditional on stable Jacobian/constraint validation as defined by the master design.
- **117 — charge-flipping exploration:** Phase 4 and conditional on deterministic suitable-dataset validation as defined by the master design.
- **Automatic magnetic-space-group solving:** remains conditional under the master design pending a browser-safe, scientifically validated engine/adapter. magCIF preservation/display work remains in scope.
- Full macromolecular model building/refinement, direct proprietary database integration, and bundled proprietary native refinement executables retain only the explicit master-design exclusions already approved there. No new exclusion was introduced by Phase 1.

## Acceptance evidence

### Scientific/unit and production-build evidence

At Phase 1 Task 11 integration commit `adb25f0caff740378efd42730c67218278512b2c`:

- 90/90 unit-test files passed.
- 682/682 unit tests passed.
- Production build passed.
- 22/22 then-current Crystal desktop/mobile browser cases passed.

### Task 12 acceptance evidence

The integrated acceptance test source is `tests/e2e/crystal-lattice-studio.spec.ts` (blob `a81d7606b2c098ec27d58ad7159e75eb876a74ac`). In Pages workflow run `34729051007`, job `103648349176`, against integrated commit `495ee945d60965b7e7e46bd6ed296e9b0fa8bb8d`:

- Crystal functional browser cases passed in desktop Chromium and mobile Chromium.
- Reflow passed at **320×568**, **390×844**, **844×390**, **768×1024**, and **1440×900**, each enforcing horizontal document overflow <= 1 px.
- The focused Crystal workspace Axe pass reported no serious or critical violations.
- Representative keyboard-only operation passed for starter selection, cell/site controls, supercell controls, measurements, and viewport presets.
- Metadata and export dialogs passed Escape-close and trigger-focus restoration checks.

The repository-wide browser job itself was red because three **Web Layout Studio** cases failed later in the same job. Those unrelated failures are not characterized as Crystal failures and were not modified under this tool's scope.

## Phase 1 invariants confirmed

- Local-first/browser-only structure and project processing; user-selected structure/project bytes are not uploaded by the Crystal workflow.
- No new Phase 1 dependency was added.
- Crystal remains lazy-loaded through the central tool registry/workspace loader.
- Invalid scientific edits fail visibly rather than replacing the previous valid structure.
- Unknown CIF content is preserved where Phase 1 promises preservation.
- Large supercell generation is bounded and previews the resulting site count.
- Rendering uses instancing and bounded device-pixel ratio behavior.
- Later-phase controls are not exposed as inert placeholder buttons.

## Next required milestone

Begin **Phase 2 — Symmetry, local environments, validation, and model building** from the master design. Phase 1 is a completed foundation, not the project's final completion state.