# Vector Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use a disciplined task-by-task execution workflow. Each task below has an independently testable deliverable.

**Goal:** Convert the existing SVG Sprite Compiler workspace into a responsive, standards-native Vector Studio with 30+ functional illustration capabilities and professional export/metadata workflows while preserving sprite-compiler compatibility.

**Architecture:** Keep the existing sprite compiler engine intact. Add a focused SVG scene-graph model, pure immutable editing engine, native-SVG React canvas, accessible inspector/layers UI, and export engine. The existing catalog slug remains stable and the legacy compiler stays rendered below the studio so existing routes and browser regressions keep working.

**Tech Stack:** React 19, TypeScript 7, Vite 8, native SVG/DOM APIs, existing `svgo`, existing `pdf-lib`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-vector-studio-design.md`

## Global Constraints

- Work from and integrate back to `origin/main` without destructive history edits.
- GitHub Pages and browser-only execution: no server/API dependency.
- Do not change the existing `svg-sprite-compiler` slug.
- Preserve existing `#svg-files` sprite workflow and security behavior.
- SVG is the canonical vector editing/export format.
- Pointer drag actions require non-drag alternatives; interactive controls must meet WCAG 2.2 AA-relevant behavior.
- No decorative/fake feature controls: exposed capability must execute meaningful behavior.
- Do not introduce a new runtime dependency unless a verified implementation requirement cannot be met with current dependencies/platform APIs.

---

### Task 1: Vector document model and editing engine

**Files:**
- Create: `src/tools/svg/vector-types.ts`
- Create: `src/tools/svg/vector-engine.ts`
- Test: `tests/unit/vector-engine.test.ts`

**Produces:** typed document/elements, starter document, immutable element creation/update/removal, selection helpers, grouping, ordering, duplication, transforms, alignment/distribution, snapping, freehand simplification, polygon/star generation, repeat/mirror helpers, history reducer.

- [ ] Define the vector document and element types with stable IDs, artboard settings, metadata, swatches, and reusable definitions.
- [ ] Add focused unit tests for creation, transform, grouping, ordering, alignment/distribution, snapping, repetition, history, and path helpers.
- [ ] Implement the pure engine until the focused tests pass.

### Task 2: Standards-native serialization and export

**Files:**
- Create: `src/tools/svg/vector-export.ts`
- Test: `tests/unit/vector-export.test.ts`

**Consumes:** `VectorDocument` and its element types from Task 1.

**Produces:** safe SVG serialization, optimized SVG, project JSON, embed/data-URI helpers, raster renderer, and PDF export.

- [ ] Test escaping, title/description/metadata output, gradients/patterns/symbols, visibility/locking semantics, dimensions/viewBox, project round-trip, and optimized output.
- [ ] Serialize deterministic SVG with standards-native descriptive metadata.
- [ ] Add browser-local PNG/JPEG/WebP rendering and PDF generation using existing dependencies.
- [ ] Add copy/embed/data-URI utilities without external network calls.

### Task 3: Interactive canvas

**Files:**
- Create: `src/tools/svg/VectorCanvas.tsx`

**Consumes:** document, selection, active tool, zoom/pan, and edit callbacks.

**Produces:** native SVG artboard with object rendering, selection, direct move, freehand/pen creation, shape creation, smart/grid snapping feedback, pointer coordinates, keyboard nudge/delete/undo-redo shortcuts, and responsive pan/zoom.

- [ ] Render all supported vector element kinds with reusable defs.
- [ ] Implement pointer-safe select/multi-select and creation tools.
- [ ] Implement move/pan/freehand interactions with pointer capture and explicit callbacks.
- [ ] Keep canvas manipulation optional by providing equivalent inspector/tool actions.

### Task 4: Inspector, layers, appearance, and export UI

**Files:**
- Create: `src/tools/svg/VectorStudio.tsx`
- Create: `src/tools/svg/vector-studio.css`

**Consumes:** Tasks 1–3.

**Produces:** complete editor shell, tool rail, artboard controls, appearance/style controls, layer list, precision transforms, alignment/order/group/repeat operations, metadata/export dialog, import actions, status feedback, and responsive reflow.

- [ ] Build accessible labeled tool groups and shortcuts.
- [ ] Expose at least the complete capability set defined in the design spec with meaningful behavior.
- [ ] Add non-drag layer ordering and numeric transform alternatives.
- [ ] Add project/SVG/image import and export controls with editable metadata/tags.
- [ ] Reflow to a single-column/mobile editor without clipped text or page-level horizontal overflow.

### Task 5: Integrate with the existing SVG tool without regressions

**Files:**
- Modify: `src/tools/svg/SvgWorkspace.tsx`
- Modify: `src/catalog.ts`
- Preserve: `src/tools/svg/svg-engine.ts`

**Produces:** Vector Studio as primary experience plus the existing Sprite Compiler as a compatibility/pro workflow on the same route.

- [ ] Mount `VectorStudio` before the existing compiler UI.
- [ ] Keep existing IDs, labels, buttons, output behavior, and sprite security controls.
- [ ] Update catalog display copy/audience/steps/outputs to describe the expanded local vector workspace without changing the slug.

### Task 6: Browser coverage, task tracking, and integration gate

**Files:**
- Modify: `tests/e2e/svg.spec.ts`
- Modify: `.tasks/IN_PROGRESS.md`
- Modify: `.tasks/WORK_LOG.md`
- Modify: `.tasks/DONE.md` after validation

**Produces:** focused critical-path evidence and repository traceability.

- [ ] Add browser coverage for creating/editing artwork, keyboard/non-drag transforms, responsive reflow, SVG import, metadata editing, and export-source generation while retaining existing sprite tests.
- [ ] Run/obtain fresh PR CI evidence: all unit tests, TypeScript production build, and selected SVG browser tests (or full suite if global catalog changes trigger it).
- [ ] Perform Gauntlet domain and adversarial review; fix at least the highest-value material defect and revalidate.
- [ ] Merge only after the PR gate is green.
- [ ] Verify both main-branch validation workflows and GitHub Pages deployment, then close task tracking with the actual evidence.
