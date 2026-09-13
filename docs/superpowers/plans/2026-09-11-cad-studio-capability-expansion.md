# CAD Studio Capability Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend CAD Studio from the original 100-capability floor to the currently verified 195-capability floor without weakening the exact-B-Rep architecture, local-first GitHub Pages deployment, deterministic progress tracking, or professional export guarantees.

**Architecture:** The original serializable project model, sketch solver, exact OCCT worker boundary, semantic topology references, and Three.js presentation boundary remain authoritative. New domains are layered behind focused serializable models: import/reference bodies, sheet-metal semantics, drawing documents, model annotations, assembly properties, and export manifests. Mesh functionality remains explicitly secondary to exact B-Rep geometry.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Three.js 0.185.1, `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, `ml-matrix@6.15.0`, existing JSZip/fast-xml-parser/pdf-lib/OpenType stack, Vitest, Playwright, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md`

## Global Constraints

- The 195 capability count is a floor, not a ceiling; later feasible non-redundant capabilities increase the target.
- Capability removal requires an explicit committed classification: environment limitation, unrelated domain, superseded, or a separately written `other` rationale.
- End-user CAD copy must not introduce disallowed product terminology from internal development discussions.
- Exact B-Rep remains canonical; imported/processed triangle meshes are visibly typed as mesh/reference bodies.
- Three.js remains presentation only.
- Exact/expensive geometry remains off the React main thread.
- Shared package/registry files are changed only when the CAD task requires them and only after reconciling concurrent `main` work.
- New direct dependencies are exact pins after current official+npm verification; no floating ranges.
- No manual lockfile surgery.
- Static GitHub Pages deployment, no backend dependency, remains mandatory.
- Every drag workflow retains a precise numeric/single-pointer alternative.
- Focused subsystem tests precede implementation; broader build/browser validation is run when integration, WASM packaging, shared dependencies, or browser behavior changes.

---

### Task 8: Make deterministic tracking expandable instead of hard-coded to 100/12

**Files:**
- Modify: `tests/unit/cad-progress.test.ts`
- Modify: `.tasks/CAD_STUDIO.md`

**Interfaces:**
- Tracker declares `Capability target: 195`, `Completed user-facing capabilities: N / 195`, and `Completed gates: N / 16`.
- Freshness test derives/validates the declared gate total and capability target instead of hard-coding the original 12/100 ceiling.

- [ ] **Step 1: Write the failing tracker tests** requiring a declared capability target, requiring the completed-capability denominator to equal that target, requiring the gate denominator to equal the actual number of G-gates, and requiring `COMPLETE` to mean completed capabilities equal the target.
- [ ] **Step 2: Run `tests/unit/cad-progress.test.ts`; verify RED against the existing 100/12 tracker contract.**
- [ ] **Step 3: Implement the minimal dynamic parsing in `cad-progress.test.ts`; add the expansion spec/plan paths to `CAD_PROGRESS_PATHS`.**
- [ ] **Step 4: Update `.tasks/CAD_STUDIO.md` to 16 gates and target 195, retaining G0–G4 meanings, introducing G10 import/direct/mesh/material, G11 sheet metal, G12 drawings/MBD, G13 tolerance/content/guidance, moving accessibility/resilience to G14, and integration/release to G15.**
- [ ] **Step 5: Re-run the focused progress test and full unit suite; commit only after GREEN.**

### Task 9: Finish G4 sketch entity/intelligence contract

**Files:**
- Modify: `src/tools/cad/sketch-types.ts`
- Modify: `src/tools/cad/sketch-solver.ts`
- Modify: `src/tools/cad/sketch-dimensions.ts`
- Create: `src/tools/cad/sketch-diagnostics.ts`
- Test: `tests/unit/cad-sketch-entities.test.ts`
- Test: `tests/unit/cad-sketch-diagnostics.test.ts`

**Interfaces:**
- Adds serializable arc, ellipse/elliptical-arc, and spline/control data required by the authoritative sketch feature set.
- Produces `analyzeSketchProfiles(sketch)` returning closed regions, open endpoints/gaps, overlaps/self-intersections, and duplicate geometry diagnostics without mutating the sketch.
- Automatic constraint proposals are separate suggestions; accepted proposals become ordinary explicit constraints.

- [ ] **Step 1: Add failing fixtures for arc/ellipse/spline serialization, closed/open profile recognition, micro-gap reporting, duplicate segments, and self-intersection.**
- [ ] **Step 2: Verify focused RED.**
- [ ] **Step 3: Implement entity contracts and diagnostics as pure functions; do not silently modify user geometry.**
- [ ] **Step 4: Add failing tests for automatic horizontal/vertical/coincident/tangent proposal generation that does not commit constraints without caller acceptance.**
- [ ] **Step 5: Implement proposal generation, then run all CAD sketch/parameter tests and commit GREEN.**

### Task 10: Install and integrate exact/numerical dependencies; establish G5 kernel worker

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.ts` only if verified necessary for WASM asset policy
- Create: `src/tools/cad/kernel-contract.ts`
- Create: `src/tools/cad/occt-adapter.ts`
- Create: `src/tools/cad/cad.worker.ts`
- Create: `src/tools/cad/worker-client.ts`
- Modify: `src/tools/cad/sketch-solver.ts`
- Test: `tests/unit/cad-kernel-contract.test.ts`
- Test: `tests/unit/cad-worker-protocol.test.ts`

**Interfaces:**
- Exact direct dependencies remain `occt-wasm: "5.0.0"`, `manifold-3d: "3.5.3"`, `ml-matrix: "6.15.0"` unless a fresh official+npm check proves a newer stable before install.
- Worker requests/responses always carry project revision IDs; stale responses are discarded.
- `ml-matrix` replaces the solver's private dense linear-system implementation while preserving existing solver behavior/tests.

- [ ] **Step 1: Re-verify all three current stable versions/license/browser requirements immediately before installation.**
- [ ] **Step 2: Use pnpm to install all CAD direct dependencies in one coherent operation; never hand-edit the lockfile.**
- [ ] **Step 3: Write failing analytic kernel tests for a 20×10×5 box volume of 1000 mm³, cylindrical cut volume reduction, BREP/STEP round-trip validity, and unsupported-browser capability reporting.**
- [ ] **Step 4: Implement the narrow adapter and worker protocol; add revision cancellation/restart behavior.**
- [ ] **Step 5: Write a parity test proving the `ml-matrix` solver path preserves existing sketch outcomes; then replace the private linear solver.**
- [ ] **Step 6: Run CAD unit tests plus `pnpm build`; commit only after GREEN.**

### Task 11: Exact feature evaluator plus import/direct/advanced inspection foundations

**Files:**
- Create: `src/tools/cad/feature-evaluator.ts`
- Create: `src/tools/cad/cad-import.ts`
- Create: `src/tools/cad/cad-inspection.ts`
- Create: `src/tools/cad/material-library.ts`
- Test: `tests/unit/cad-feature-evaluator.test.ts`
- Test: `tests/unit/cad-import.test.ts`
- Test: `tests/unit/cad-inspection.test.ts`

**Interfaces:**
- Evaluator implements the authoritative exact feature graph through the kernel contract and emits semantic topology candidates/evolution roles.
- Import returns explicitly typed exact, mesh, or reference bodies; no arbitrary mesh is relabeled as exact B-Rep.
- Inspection exposes exact volume/area/length/center/inertia/curve/surface/curvature/classification data plus serializable pinned annotations.

- [ ] **Step 1: Write failing feature fixtures for primitives, extrude/revolve, booleans, sweep/loft, fillet/chamfer, shell/thicken, draft/offset/split, patterns/mirror, defeature, healing, and semantic-reference evolution.**
- [ ] **Step 2: Implement feature evaluation incrementally with last-valid-result failure semantics.**
- [ ] **Step 3: Write failing import tests for STEP/XCAF hierarchy/name/color, BREP exact round-trip, and mesh/reference imports.**
- [ ] **Step 4: Implement verified import paths; unsupported format features produce explicit diagnostics.**
- [ ] **Step 5: Write and satisfy exact inspection tests for inertia, point classification, curve/surface interrogation, geometry validity, and planar section properties.**
- [ ] **Step 6: Run focused CAD evaluator/import/inspection suites and build.**

### Task 12: Sheet-metal model and flat-pattern engine

**Files:**
- Create: `src/tools/cad/sheet-metal-types.ts`
- Create: `src/tools/cad/sheet-metal-engine.ts`
- Create: `src/tools/cad/sheet-metal-flat.ts`
- Create: `src/tools/cad/sheet-metal-export.ts`
- Test: `tests/unit/cad-sheet-metal.test.ts`

**Interfaces:**
- Serializable sheet-metal model stores thickness, bend rules, relief rules, joints/bends, feature IDs, and folded/flat correspondence.
- Flat-pattern generation is deterministic and preserves bend/tangent-line metadata for DXF/SVG export.

- [ ] **Step 1: Write failing tests for a single 90° flange with known thickness/radius/K-factor and expected developed length.**
- [ ] **Step 2: Implement bend-allowance/deduction math and one-flange folded/flat correspondence.**
- [ ] **Step 3: Add RED→GREEN slices for base flange, edge flange, bend/rip, hem, jog, relief/corner break, tabs/cutouts/forms, and eligible lofted sheet metal.**
- [ ] **Step 4: Add bend-table/sequence tests and flat-pattern export tests including bend/tangent-line toggles.**
- [ ] **Step 5: Validate exact folded bodies plus deterministic flat geometry; commit by coherent slices rather than one monolith.**

### Task 13: Technical drawing and MBD engine

**Files:**
- Create: `src/tools/cad/drawing-types.ts`
- Create: `src/tools/cad/drawing-engine.ts`
- Create: `src/tools/cad/drawing-annotations.ts`
- Create: `src/tools/cad/drawing-export.ts`
- Test: `tests/unit/cad-drawing.test.ts`

**Interfaces:**
- Drawing documents are serializable and reference semantic model entities/configurations rather than triangle indices.
- HLR-backed views expose stable 2D projected geometry to annotation/render/export layers.
- Model annotations remain native project data; unsupported STEP PMI embedding remains explicitly unmapped/sidecar rather than fabricated.

- [ ] **Step 1: Write failing HLR fixture for front/top/right/isometric projected edges of a known box.**
- [ ] **Step 2: Implement base/projected view records and exact HLR projection.**
- [ ] **Step 3: Add RED→GREEN slices for auxiliary, section/aligned/broken-out, detail/crop/break, and flat-pattern views.**
- [ ] **Step 4: Add associative dimensions, tolerance formatting, centers/hatching, hole/thread/bend callouts, datums, GD&T, finish/weld symbols, notes/leaders/markup, tables/BOM/balloons, templates/title blocks, and revision data as serializable annotation types.**
- [ ] **Step 5: Implement regeneration with broken-reference diagnostics and export to PDF/SVG/DXF/PNG.**
- [ ] **Step 6: Run drawing unit tests plus build; browser tests follow when UI surfaces exist.**

### Task 14: Expanded assembly, persistence/export, tolerance, mesh, and guidance services

**Files:**
- Create: `src/tools/cad/assembly-engine.ts`
- Create: `src/tools/cad/cad-storage.ts`
- Create: `src/tools/cad/cad-export.ts`
- Create: `src/tools/cad/tolerance-engine.ts`
- Create: `src/tools/cad/mesh-engine.ts`
- Create: `src/tools/cad/engineering-content.ts`
- Create: `src/tools/cad/command-registry.ts`
- Test: `tests/unit/cad-assembly.test.ts`
- Test: `tests/unit/cad-export.test.ts`
- Test: `tests/unit/cad-tolerance.test.ts`
- Test: `tests/unit/cad-mesh.test.ts`

**Interfaces:**
- Assembly engine adds instance patterns, relation offsets/limits, suppression, replacement/relink, exploded sequences, and BOM/property derivation.
- Storage/export produces versioned native project packages, migration results, per-format metadata disposition, batch jobs, manifests, and checksums.
- Tolerance engine provides explicit fit and 1D stack calculations with traceable inputs.
- Mesh engine never changes an exact body's canonical representation.
- Engineering content is parameter data/templates only; no arbitrary executable macros/plugins.

- [ ] **Step 1: Add assembly relation/pattern/relink/suppression/explode/BOM tests and implement GREEN.**
- [ ] **Step 2: Add native save/reopen, autosave recovery, and schema migration tests; implement IndexedDB plus portable package serializer.**
- [ ] **Step 3: Add export metadata/sidecar/preflight/batch/manifest tests for STEP, 3MF, glTF/GLB, STL, OBJ, SVG/DXF, PNG; implement only verified mappings.**
- [ ] **Step 4: Add fit and tolerance-stack RED→GREEN tests with explicit formulas and units.**
- [ ] **Step 5: Add manifold mesh boolean/repair/refinement tests while preserving source-of-truth typing.**
- [ ] **Step 6: Add deterministic standard-hardware and involute-gear fixture tests; implement local parameter-driven generators.**
- [ ] **Step 7: Add command registry/search/filter/favorites/shortcut and experience-depth contracts for later UI consumption.**

### Task 15: Unified CAD Studio UI, accessibility, browser validation, and integration

**Files:**
- Create/modify: `src/tools/cad/CadWorkspace.tsx`
- Create/modify: `src/tools/cad/CadViewport.tsx`
- Create/modify: `src/tools/cad/CadTree.tsx`
- Create/modify: `src/tools/cad/CadInspector.tsx`
- Create/modify: `src/tools/cad/CadSketchEditor.tsx`
- Create: `src/tools/cad/CadSheetMetalPanel.tsx`
- Create: `src/tools/cad/CadDrawingWorkspace.tsx`
- Create: `src/tools/cad/CadExportPanel.tsx`
- Create/modify: `src/tools/cad/cad.css`
- Modify only at integration: `src/catalog.ts`, `src/tools/workspaces.tsx`, `scripts/select-e2e-specs.mjs`, `.tasks/IN_PROGRESS.md`
- Test: `tests/e2e/cad.spec.ts`

**Interfaces:**
- All 195 capabilities are reachable through contextual selection, mode rail, inspector, or searchable command registry; no capability is phone/keyboard inaccessible merely because its desktop control is dense.

- [ ] **Step 1: Add browser contract for create sketch → constrain → exact feature → edit parameter → inspect → save/reopen → export.**
- [ ] **Step 2: Add browser contracts for sheet-metal folded/flat flow, drawing creation/annotation/export, and lightweight component relation/motion flow.**
- [ ] **Step 3: Implement desktop six-zone layout and narrow-screen drawer/sheet layout with no capability removal.**
- [ ] **Step 4: Wire command palette, tree filtering, contextual actions, guided/standard/precision presentation, keyboard paths, touch paths, and exact numeric alternatives.**
- [ ] **Step 5: Verify 320 CSS px reflow, browser zoom/text enlargement, focus behavior, reduced motion, screen-reader naming, worker recovery, stale-result rejection, and route-lazy loading.**
- [ ] **Step 6: Reconcile current `main`, resolve conflicts without overwriting parallel work, integrate shared registration files, run focused/full validation, and merge only after the deterministic completion equation is satisfied.**

## Plan self-review

- The expansion has implementation ownership for every capability group 101–195.
- No arbitrary mesh-to-parametric-BREP recovery or IGES path is planned because those are explicitly excluded in the expansion spec.
- STEP PMI is native/sidecar-safe until verified adapter support exists; the plan does not promise unsupported embedding.
- New major subsystems (sheet metal and drawings) have separate task boundaries and serializable models instead of being folded into the feature evaluator/UI monolith.
- Shared repository integration remains late to minimize collisions with concurrent agents.