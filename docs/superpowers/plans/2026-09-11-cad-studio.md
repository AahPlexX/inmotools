# CAD Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, exact B-Rep, parametric CAD and solid-modeling workspace with constrained sketching, stable feature history, professional inspection, and metadata-aware export.

**Architecture:** A serializable `CadProject` is the source of truth. React owns only project/UI state. Exact modeling runs in a route-lazy module worker through a narrow `occt-wasm` adapter; Three.js renders transferred tessellation buffers; Manifold is reserved for mesh-specific repair/validation. CAD Studio's own reducer, dependency graph, topology references, and sketch solver remain independent of kernel handles.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Three.js 0.185.1, exact pinned `occt-wasm@5.0.0`, `manifold-3d@3.5.3`, `ml-matrix@6.15.0`, Vitest, Playwright, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-09-11-cad-studio-design.md`

**Dependency decision:** `docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md`

## Global Constraints

- Work in `feat/cad-studio` while other agents modify other tools; merge only after rebasing/merging the then-current `main` and validating conflicts.
- Direct new dependencies are exact pins only. No `^`, `~`, `*`, floating git refs, or uncorroborated package versions.
- `brepjs` remains excluded until the current latest stable version is corroborated by both official release data and npmjs.com.
- Three.js is presentation only; editable geometry is never reconstructed from viewport triangles.
- Expensive exact geometry stays off the React main thread.
- A late worker result may never overwrite a newer project revision.
- Raw face/edge indices are not persistent project references.
- Failed geometry retains the last valid display result and reports the failing feature.
- Core controls must work with keyboard and precise numeric input; drag-only precision is prohibited.
- Narrow layouts reflow without removing CAD capabilities.
- Run focused tests for the changed subsystem; run broader validation only when shared integration files or dependencies change.

---

## File map

### Project/domain core
- `src/tools/cad/cad-types.ts` — serializable domain types and invariants.
- `src/tools/cad/project-engine.ts` — project creation, immutable history, dependency closure, legal feature reordering, suppression, dirty-state propagation.
- `src/tools/cad/units.ts` — canonical mm/radian unit conversion and typed scalar utilities.
- `src/tools/cad/topology-ref.ts` — kernel-neutral semantic topology reference contract and scoring.

### Sketching
- `src/tools/cad/sketch-types.ts` — sketch entities, constraints, dimensions.
- `src/tools/cad/sketch-solver.ts` — residual construction, solve loop, degrees-of-freedom and conflict isolation.

### Exact geometry
- `src/tools/cad/kernel-contract.ts` — narrow CAD kernel interface used by feature evaluators.
- `src/tools/cad/occt-adapter.ts` — `occt-wasm` implementation, only loaded inside worker.
- `src/tools/cad/cad.worker.ts` — revisioned worker protocol, rebuild, tessellation, exact measurement, import/export.
- `src/tools/cad/feature-evaluator.ts` — feature graph -> kernel operations.

### UI
- `src/tools/cad/CadWorkspace.tsx` — workspace coordinator.
- `src/tools/cad/CadViewport.tsx` — Three.js viewport and selection presentation.
- `src/tools/cad/CadTree.tsx` — feature/body/component tree.
- `src/tools/cad/CadInspector.tsx` — contextual numeric editing and diagnostics.
- `src/tools/cad/CadSketchEditor.tsx` — DOM + SVG overlay sketch interaction.
- `src/tools/cad/CadExportPanel.tsx` — format/preflight/metadata workflow.
- `src/tools/cad/cad.css` — tool-local responsive styles.

### Persistence/export
- `src/tools/cad/cad-storage.ts` — IndexedDB project/autosave storage.
- `src/tools/cad/cad-export.ts` — native project, 3MF/GLB/OBJ/DXF/SVG/PNG metadata policies and sidecars.

### Integration/tests
- `src/catalog.ts`
- `src/tools/workspaces.tsx`
- `scripts/select-e2e-specs.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts` only if the route-lazy OCCT WASM asset needs an explicit runtime-cache exclusion/policy.
- `tests/unit/cad-project.test.ts`
- `tests/unit/cad-units.test.ts`
- `tests/unit/cad-topology.test.ts`
- `tests/unit/cad-sketch-solver.test.ts`
- `tests/unit/cad-feature-evaluator.test.ts`
- `tests/e2e/cad.spec.ts`

---

### Task 1: Parametric project foundation

**Files:**
- Create: `src/tools/cad/cad-types.ts`
- Create: `src/tools/cad/project-engine.ts`
- Create: `tests/unit/cad-project.test.ts`

**Interfaces:**
- Produces `CadProject`, `CadFeature`, `CadBody`, `CadProjectHistory`, `createCadProject()`, `commitCadProject()`, `undoCadProject()`, `redoCadProject()`, `featureDependencyClosure()`, `markFeatureDirty()`, `canReorderFeature()`, `reorderFeature()`, `setFeatureSuppressed()`.

- [ ] **Step 1: Write failing domain tests**

```ts
it('invalidates only downstream dependents', () => {
  const project = fixtureProject(['sketch', 'extrude', 'fillet', 'independent-box']);
  expect([...featureDependencyClosure(project, ['extrude'])]).toEqual(['extrude', 'fillet']);
});

it('rejects a reorder that moves a feature before its dependency', () => {
  expect(canReorderFeature(project, 'fillet', 0)).toBe(false);
});
```

- [ ] **Step 2: Run only `tests/unit/cad-project.test.ts` and verify RED.**
- [ ] **Step 3: Implement serializable types and pure immutable project/history/dependency operations.**
- [ ] **Step 4: Re-run the focused test and verify GREEN.**
- [ ] **Step 5: Commit `feat(cad): establish parametric project model`.**

### Task 2: Units, parameter values, and metadata-safe native project

**Files:**
- Create: `src/tools/cad/units.ts`
- Create: `tests/unit/cad-units.test.ts`
- Modify: `src/tools/cad/cad-types.ts`
- Modify: `src/tools/cad/project-engine.ts`

**Interfaces:**
- Produces `LengthUnit`, `AngleUnit`, `toMillimeters()`, `fromMillimeters()`, `toRadians()`, `fromRadians()`, `CadParameterValue`.

- [ ] **Step 1: Add exact conversion tests including inch/mm round-trip and degree/radian round-trip.**
- [ ] **Step 2: Run only `cad-units.test.ts` and verify RED.**
- [ ] **Step 3: Implement conversion functions with finite-number guards and canonical storage semantics.**
- [ ] **Step 4: Re-run `cad-units.test.ts` and `cad-project.test.ts`.**
- [ ] **Step 5: Commit `feat(cad): add canonical units and parameters`.**

### Task 3: Semantic topology references

**Files:**
- Create: `src/tools/cad/topology-ref.ts`
- Create: `tests/unit/cad-topology.test.ts`
- Modify: `src/tools/cad/cad-types.ts`

**Interfaces:**
- Produces `CadTopologyRef`, `TopologyCandidate`, `scoreTopologyCandidate()`, `resolveTopologyRef()` returning `resolved | ambiguous | missing`.

- [ ] **Step 1: Write tests proving raw ordinal/index is never sufficient and ambiguity is surfaced.**
- [ ] **Step 2: Run focused topology test and verify RED.**
- [ ] **Step 3: Implement provenance + geometry fingerprint scoring: producer feature, kind, surface/curve type, centroid, normal/axis, area/length, bounds, adjacency roles, original pick point.**
- [ ] **Step 4: Verify unique resolution, ambiguous resolution, and missing result cases.**
- [ ] **Step 5: Commit `feat(cad): add semantic topology references`.**

### Task 4: Constraint sketch model and solver

**Files:**
- Create: `src/tools/cad/sketch-types.ts`
- Create: `src/tools/cad/sketch-solver.ts`
- Create: `tests/unit/cad-sketch-solver.test.ts`

**Interfaces:**
- Produces `CadSketch`, `SketchEntity`, `SketchConstraint`, `solveSketch()`, `analyzeSketchConstraints()`.

- [ ] **Step 1: Add fixtures for coincident, horizontal/vertical, distance, radius, perpendicular, tangent, fixed, under-constrained and conflicting constraints.**
- [ ] **Step 2: Verify RED before implementation.**
- [ ] **Step 3: Install exact `ml-matrix@6.15.0` together with Task 5 dependency installation, not earlier in isolation.**
- [ ] **Step 4: Implement damped least-squares solve with tolerance/iteration caps and no silent constraint deletion.**
- [ ] **Step 5: Add conflict isolation by testing constraint removal around the failed set; return the smallest found conflicting set.**
- [ ] **Step 6: Run only CAD sketch/unit tests.**
- [ ] **Step 7: Commit `feat(cad): add constrained sketch solver`.**

### Task 5: Exact OCCT worker kernel

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/tools/cad/kernel-contract.ts`
- Create: `src/tools/cad/occt-adapter.ts`
- Create: `src/tools/cad/cad.worker.ts`
- Create: `src/tools/cad/feature-evaluator.ts`
- Create: `tests/unit/cad-feature-evaluator.test.ts`

**Interfaces:**
- Direct dependencies added exactly as `occt-wasm: "5.0.0"`, `manifold-3d: "3.5.3"`, `ml-matrix: "6.15.0"`.
- Worker request includes `{ revision, project, quality, operation }` and response always repeats `revision`.
- Kernel contract exposes primitives, booleans, extrude/revolve/sweep/loft, fillet/chamfer/shell/draft/offset/split, tessellation, exact measurement and STEP/STL/glTF I/O.

- [ ] **Step 1: Re-run official+npm stable-version verification immediately before install; abort dependency mutation if any latest stable changed.**
- [ ] **Step 2: Install all three exact dependencies in one package-manager operation so `package.json` and lockfile remain coherent.**
- [ ] **Step 3: Add focused analytic fixtures: 20×10×5 box has volume 1000 mm³; a cylindrical cut decreases volume; exported STEP re-imports as valid exact geometry.**
- [ ] **Step 4: Implement adapter and worker with explicit unsupported-browser/kernel-init errors.**
- [ ] **Step 5: Implement revision rejection and worker restart semantics so stale results are discarded.**
- [ ] **Step 6: Run CAD kernel/unit tests plus `pnpm build` because dependency/WASM packaging changed.**
- [ ] **Step 7: Commit `feat(cad): add exact OCCT worker kernel`.**

### Task 6: CAD workspace, viewport, tree, and inspector

**Files:**
- Create: `src/tools/cad/CadWorkspace.tsx`
- Create: `src/tools/cad/CadViewport.tsx`
- Create: `src/tools/cad/CadTree.tsx`
- Create: `src/tools/cad/CadInspector.tsx`
- Create: `src/tools/cad/CadSketchEditor.tsx`
- Create: `src/tools/cad/cad.css`

**Interfaces:**
- `CadWorkspace` owns serializable history and worker revision coordination.
- `CadViewport` consumes only tessellation/selection descriptors, never kernel handles.

- [ ] **Step 1: Add browser contract for new project -> box -> select face -> create sketch -> extrude -> edit dimension -> undo/redo.**
- [ ] **Step 2: Implement responsive six-zone desktop layout and drawer/bottom-sheet narrow layout.**
- [ ] **Step 3: Implement contextual actions, exact numeric inspector fields, feature diagnostics, selection filters and view controls.**
- [ ] **Step 4: Validate keyboard access and 320 CSS px reflow in the CAD Playwright spec.**
- [ ] **Step 5: Commit `feat(cad): add responsive CAD workspace`.**

### Task 7: Persistence, export, metadata, and manufacturing preflight

**Files:**
- Create: `src/tools/cad/cad-storage.ts`
- Create: `src/tools/cad/cad-export.ts`
- Create: `src/tools/cad/CadExportPanel.tsx`
- Modify: `src/tools/cad/CadWorkspace.tsx`
- Test: `tests/unit/cad-export.test.ts`
- Test: `tests/e2e/cad.spec.ts`

**Interfaces:**
- Native `.inmocad` package restores editable project state.
- Export preflight labels each metadata field `embedded`, `mapped`, or `sidecar` for the chosen format.

- [ ] **Step 1: Add save/reopen and export metadata tests.**
- [ ] **Step 2: Implement IndexedDB autosave with schema version and migration boundary.**
- [ ] **Step 3: Implement native project, STEP, 3MF, GLB/glTF, STL, OBJ, SVG/DXF projection and PNG paths only where the local library path is verified; otherwise disable with an explicit explanation.**
- [ ] **Step 4: Add manifold mesh diagnostics and print-bed/bounds preflight.**
- [ ] **Step 5: Run CAD export/unit/browser tests.**
- [ ] **Step 6: Commit `feat(cad): add persistence and professional export`.**

### Task 8: Shared integration and merge gate

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/tools/workspaces.tsx`
- Modify: `scripts/select-e2e-specs.mjs`
- Modify: `.tasks/IN_PROGRESS.md` only after reconciling concurrent task entries rather than replacing them.

**Interfaces:**
- Slug: `cad-studio`.
- Generic route only: `#/tools/cad-studio`; no `App.tsx` alias required.

- [ ] **Step 1: Fetch current `main` and compare it to `feat/cad-studio`; reconcile concurrent shared-file edits explicitly.**
- [ ] **Step 2: Register the tool and its focused E2E selection without deleting or overwriting other agents' entries.**
- [ ] **Step 3: Run CAD unit tests, CAD browser tests, build, and the full suite only because shared registry/dependency paths changed.**
- [ ] **Step 4: Run adversarial review against the approved design: confirm no decorative feature claims, stale-worker overwrite, raw-topology persistence, unsupported export claims, or narrow-layout capability loss.**
- [ ] **Step 5: Merge only when the branch is current with `main` and validation is green; after merge verify `main` contains the CAD head.**
- [ ] **Step 6: Remove the CAD branch only after containment is proven and no agent is still using it.**

## Execution order and stop gates

1. Tasks 1–3 can be completed without touching shared dependencies or global integration files.
2. Task 4 begins its pure types/tests before dependency mutation but its solver implementation completes together with Task 5's verified dependency install.
3. Task 5 is the first package/lockfile mutation and therefore must build successfully before any UI claims exact geometry support.
4. Tasks 6–7 consume stable domain/kernel contracts rather than reaching directly into OCCT.
5. Task 8 is the only intentional shared integration phase.

## Self-review

- All 100 approved capability targets map to sketching, solver, feature evaluator, viewport/inspection, component/persistence/export work in Tasks 4–7.
- Exact dependency versions are specified and the pre-install re-verification gate is explicit.
- The plan contains no requirement to install the currently uncorroborated `brepjs` release.
- Stable topology resolution, stale worker protection, last-valid geometry, metadata policy, accessibility, responsive reflow, and GitHub Pages WASM behavior have explicit implementation or validation tasks.
- No task requires broad unrelated tests before a shared integration/dependency boundary is changed.
