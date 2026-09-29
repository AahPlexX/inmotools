# Crystal Lattice Studio — live handoff

**Route:** `#/tools/crystal-lattice-studio`  
**Master design:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`  
**Active integration branch:** `feature/crystal-lattice-completion-20260927`  
**Integration target:** `origin/main` through draft PR #83.

This file is the live resume point for the Crystal Lattice Studio completion workstream. The numbered 1–163 capability list in the master design is the product contract; phase-completion documents are evidence records and do not supersede that numbered contract.

## Current verified baseline

Latest fully green branch baseline before the active UI-red cycle: `120324781327bc2e1681e5089359475c317219ee`.

GitHub Actions run `36366177069` on that revision passed:

- frozen dependency install;
- 216/216 unit files and 2111/2111 unit tests;
- production build;
- Chromium installation;
- focused Crystal browser lane: 67 passed across desktop/mobile Chromium.

The active TDD browser-red commit is `e9df29e7698233a57c03b75d23d22524de52f6dd`, which defines the Phase 4 end-user workflows. Do not treat that commit as green until its browser failure is observed for the intended missing UI behavior and the implementation is revalidated.

## Integrated scientific engines

Existing Phase 1–3 engines cover the structure document/history core, import/export foundations, periodic geometry, measurements, viewport/render model, local environments, validation, symmetry, reciprocal space, diffraction, observed powder overlays, reflection tables, stereographic projection, Ewald/Brillouin geometry, single-crystal/Laue simulation, and powder-profile broadening.

The completion branch additionally contains tested engines for:

- bounded least-squares refinement: `refinement-engine.ts`;
- observed-reflection residuals and difference-Fourier grids/extrema: `reflection-refinement-engine.ts`;
- CUBE, XSF, and CCP4/MRC scalar fields, slicing, bounded resampling, and isosurfaces: `volumetric-engine.ts`;
- periodic void/cavity estimates and selectable components: `void-analysis-engine.ts`;
- BFDH/Wulff morphology and twin/domain transforms: `morphology-engine.ts`;
- Caglioti/size/microstrain/March–Dollase powder terms, multiphase profiles, deterministic peak picking, and gated phase-fraction estimates: `powder-analysis-engine.ts`.

These engines are not counted as full master-capability completion where the master design also requires a reachable user interaction, error feedback, or applicable export path.

## Active completion sequence

1. **Phase 4 user workflows** — wire reflection/Fourier, volumetric fields, voids, morphology, and bounded refinement into reachable responsive UI; add focused browser acceptance and selector routing.
2. **Deferred earlier capabilities** — close remaining Phase 1–3 UI/import/state gaps such as empty-crystal creation, periodic-image controls, asymmetric-unit/symmetry-operation workflows, selection/appearance controls, source-vs-detected symmetry policy, and remaining reciprocal/diffraction controls.
3. **Phase 5 metadata/export** — searchable loop-aware metadata editor with bundled dictionary guidance; P1/mmCIF/PDB and remaining diffraction/table/report/scene exports with loss previews.
4. **Learnability/accessibility** — in-tool glossary, contextual help, beginner workflows, textual/chart alternatives, reflow/focus/keyboard/reduced-motion checks.
5. **Release audit** — reconcile every capability 1–163 as implemented, conditional, or explicitly excluded under the master design; run all-seven-crystal-system and malformed/disordered/volumetric fixtures; update task state; integrate to `origin/main`; verify exact-main Pages deployment.

## Scientific guardrails

- Preserve source data; no operation overwrites the imported file.
- Source symmetry and detected symmetry are distinct concepts and must not be silently conflated.
- Difference-Fourier density uses phases from the current calculated model and must be labeled model-dependent.
- BFDH output is a geometry/growth-rate heuristic, not a surface-energy result.
- Wulff output requires positive user-supplied facet energies in one consistent unit system.
- Void fractions are grid/probe/radius-model estimates; always expose spacing, probe radius, and radius basis.
- Refinement reports the active parameter set, bounds/fixed state, convergence, residuals, iteration count, and termination reason; non-converged results are never labeled converged.
- Potentially large operations remain explicitly bounded and must fail visibly rather than truncate silently.
- Client behavior remains local-first and backend-free.

## Conditional master items

Master capabilities 116 and 117 remain conditional by design until deterministic numerical validation is sufficient for constrained coordinate/occupancy/ADP refinement and charge-flipping exploration. They are not silently treated as complete.

Full macromolecular refinement/model building, proprietary database integration, bundled proprietary native refinement executables, and automatic magnetic-space-group solving retain only the exclusions/conditions stated in the master design.

## Resume rule

Before every write: re-read the branch tip and exact target files because other agents are active. Never force-push, rewrite shared history, or overwrite an unexpected parallel change. If this handoff and repository state disagree, repository state wins and this file must be repaired in the same work cycle.
