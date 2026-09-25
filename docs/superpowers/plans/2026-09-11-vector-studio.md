# Vector Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use a disciplined task-by-task execution workflow. Each task below has an independently testable deliverable.

**Goal:** Convert the existing SVG Sprite Compiler workspace into a responsive, standards-native Vector Studio with 30+ functional illustration capabilities and professional export/metadata workflows while preserving sprite-compiler compatibility.

**Architecture:** Keep the existing sprite compiler engine intact. Add a focused SVG scene-graph model, pure immutable editing engine, native-SVG React canvas, accessible inspector/layers UI, and export engine. The existing catalog slug remains stable and the legacy compiler stays rendered below the studio so existing routes and browser regressions keep working.

**Tech Stack:** React 19, TypeScript 7, Vite 8, native SVG/DOM APIs, existing `svgo`, existing `pdf-lib`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-vector-studio-design.md`

## Completion status — 2026-09-24

**Complete: 66/66 design capabilities are implemented on `origin/main`.** The authoritative
product revision is `e5a31cf0a01da6ede1437f15a457a54afcdf3e29`.

Final closure work found and resolved two material validation/accessibility issues rather than
adding speculative feature scope:

1. focused SVG validation selected only `tests/e2e/svg.spec.ts` and silently omitted the
   already-integrated nested-composition regression; `scripts/select-e2e-specs.mjs` now maps
   SVG source changes to both Vector browser specs, with a selector-unit regression;
2. the shared Axe route sweep found a serious `scrollable-region-focusable` issue on the
   artboard viewport and active inspector. Scrollable Vector regions are now keyboard-focusable,
   visibly focused, and preserve native Arrow/Page/Home/End scrolling when the region itself owns
   focus. The existing SVG browser spec now carries the same serious/critical Axe sweep so the
   focused Vector lane protects this behavior directly.

Exact-main evidence:
- focused run `36052165692` / job `107810129727`: production build, selector step, Chromium
  install, and **22/22 browser checks passed** — 10 `svg.spec.ts` scenarios plus the
  nested-composition scenario on both desktop and mobile Chromium;
- Pages run `36052165503`: repository unit tests and production build passed; the Pages artifact
  built successfully and deployment job `107810383399` succeeded on the same revision;
- static closure scan: no Vector TODO/FIXME/HACK implementation markers and no `fetch`,
  `XMLHttpRequest`, or `WebSocket` path under `src/tools/svg/`;
- branch reconciliation: the historical `feat/vector-spec-completion` UI/export/test blobs are
  already present on `main`, while current `vector-engine.ts` is a strict superset with the
  later path-motion fix. `fix/vector-path-motion-20260916` is historical and must not be merged
  wholesale.

Future Vector work starts from current `origin/main`. New scope must enter the repository task
state before implementation. A future shared-suite failure reopens Vector only if it identifies a
Vector-specific regression.


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

- [x] Define the vector document and element types with stable IDs, artboard settings, metadata, swatches, and reusable definitions.
- [x] Add focused unit tests for creation, transform, grouping, ordering, alignment/distribution, snapping, repetition, history, and path helpers.
- [x] Implement the pure engine until the focused tests pass.

### Task 2: Standards-native serialization and export

**Files:**
- Create: `src/tools/svg/vector-export.ts`
- Test: `tests/unit/vector-export.test.ts`

**Consumes:** `VectorDocument` and its element types from Task 1.

**Produces:** safe SVG serialization, optimized SVG, project JSON, embed/data-URI helpers, raster renderer, and PDF export.

- [x] Test escaping, title/description/metadata output, gradients/patterns/symbols, visibility/locking semantics, dimensions/viewBox, project round-trip, and optimized output.
- [x] Serialize deterministic SVG with standards-native descriptive metadata.
- [x] Add browser-local PNG/JPEG/WebP rendering and PDF generation using existing dependencies.
- [x] Add copy/embed/data-URI utilities without external network calls.

### Task 3: Interactive canvas

**Files:**
- Create: `src/tools/svg/VectorCanvas.tsx`

**Consumes:** document, selection, active tool, zoom/pan, and edit callbacks.

**Produces:** native SVG artboard with object rendering, selection, direct move, freehand/pen creation, shape creation, smart/grid snapping feedback, pointer coordinates, keyboard nudge/delete/undo-redo shortcuts, and responsive pan/zoom.

- [x] Render all supported vector element kinds with reusable defs.
- [x] Implement pointer-safe select/multi-select and creation tools.
- [x] Implement move/pan/freehand interactions with pointer capture and explicit callbacks.
- [x] Keep canvas manipulation optional by providing equivalent inspector/tool actions.

### Task 4: Inspector, layers, appearance, and export UI

**Files:**
- Create: `src/tools/svg/VectorStudio.tsx`
- Create: `src/tools/svg/vector-studio.css`

**Consumes:** Tasks 1–3.

**Produces:** complete editor shell, tool rail, artboard controls, appearance/style controls, layer list, precision transforms, alignment/order/group/repeat operations, metadata/export dialog, import actions, status feedback, and responsive reflow.

- [x] Build accessible labeled tool groups and shortcuts.
- [x] Expose at least the complete capability set defined in the design spec with meaningful behavior.
- [x] Add non-drag layer ordering and numeric transform alternatives.
- [x] Add project/SVG/image import and export controls with editable metadata/tags.
- [x] Reflow to a single-column/mobile editor without clipped text or page-level horizontal overflow.

### Task 5: Integrate with the existing SVG tool without regressions

**Files:**
- Modify: `src/tools/svg/SvgWorkspace.tsx`
- Modify: `src/catalog.ts`
- Preserve: `src/tools/svg/svg-engine.ts`

**Produces:** Vector Studio as primary experience plus the existing Sprite Compiler as a compatibility/pro workflow on the same route.

- [x] Mount `VectorStudio` before the existing compiler UI.
- [x] Keep existing IDs, labels, buttons, output behavior, and sprite security controls.
- [x] Update catalog display copy/audience/steps/outputs to describe the expanded local vector workspace without changing the slug.

### Task 6: Browser coverage, task tracking, and integration gate

**Files:**
- Modify: `tests/e2e/svg.spec.ts`
- Modify: `.tasks/IN_PROGRESS.md`
- Modify: `.tasks/WORK_LOG.md`
- Modify: `.tasks/DONE.md` after validation

**Produces:** focused critical-path evidence and repository traceability.

- [x] Add browser coverage for creating/editing artwork, keyboard/non-drag transforms, responsive reflow, SVG import, metadata editing, and export-source generation while retaining existing sprite tests.
- [x] Run/obtain fresh PR CI evidence: all unit tests, TypeScript production build, and selected SVG browser tests (or full suite if global catalog changes trigger it).
- [x] Perform Gauntlet domain and adversarial review; fix at least the highest-value material defect and revalidate.
- [x] Reconcile integration against current `origin/main`; historical Vector branches are evidence only and are not merge sources.
- [x] Verify exact-main focused Vector validation plus repository unit/build and GitHub Pages artifact/deployment evidence, then close task tracking with the actual evidence.
