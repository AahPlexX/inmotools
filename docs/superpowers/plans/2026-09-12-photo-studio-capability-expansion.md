# Photo Studio Capability Expansion Implementation Plan

> **Execution rule:** Implement in small Photo-only batches using RED → GREEN → focused refactor. Do not advance a blocker in the authoritative tracker until the exact material implementation head has appropriate evidence. Reconcile with moving `main` non-destructively; never modify an unrelated tool to make Photo Studio green.

**Goal:** Expand Photo Studio from the approved base editor into the broadest realistically deliverable local-first browser photo workstation supported by the existing repository and GitHub Pages, while retaining deterministic completion, non-destructive state, accessibility, and safe memory behavior.

**Architecture:** Keep the existing `PhotoRecipe`/history/worker renderer as the stable base. Add large codecs and advanced processors behind lazy adapters, keep source data immutable, route all preview/export semantics through shared operations, and persist projects locally through capability-detected browser storage. Heavy multi-image operations use dedicated workers and bounded queues. New UI is grouped into the existing workspace rather than spawning disconnected mini-tools.

**Constraints:** Existing React/TypeScript/Vite stack; dependencies must be reverified against their official source/current registry immediately before installation and pinned to exact stable versions. GitHub Pages remains the production target. File System Access, clipboard, WebCodecs, pointer pressure, and similar browser APIs are progressive enhancements, never sole paths when a practical fallback exists.

---

## Phase 0 — Close the original release contract cleanly

### Task 0.1: Complete individual scalar resets

**Files:**
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Test: `tests/e2e/photo-controls.spec.ts`

**Acceptance:** Every currently exposed scalar adjustment has an individual reset with the correct neutral/default value; a reset changes only that scalar and is undoable.

**Verification:** focused Photo unit/build/browser suite against the exact implementation SHA.

### Task 0.2: Custom crop ratio

**Files:**
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Test: `tests/e2e/photo-controls.spec.ts`

**RED:** Add a 5:4 custom-ratio test on the 320×240 fixture and verify the resulting centered crop is 93.75% wide, 100% high.

**GREEN:** Add validated custom-ratio width/height inputs and an explicit apply action that reuses `applyCropRatio()`.

### Task 0.3: Draggable and side-by-side comparison

**Files:**
- Modify: `src/tools/photo/PhotoCanvas.tsx`
- Modify: `src/tools/photo/PhotoWorkspace.tsx` if comparison mode selection lives at workspace level
- Modify: `src/tools/photo/photo.css`
- Test: `tests/e2e/photo.spec.ts`

**RED:** Verify a visible split handle changes the before/after boundary by pointer and keyboard; verify side-by-side mode preserves synchronized zoom.

**GREEN:** Replace the fixed 50% overlay with controlled split state plus an accessible range/handle and add a side-by-side presentation mode.

### Task 0.4: In-session copy/paste edits

**Files:**
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Test: `tests/e2e/photo.spec.ts`

**RED:** Copy a non-neutral recipe, open/reset a second image state, paste once, and verify the copied values return as one undo step.

**GREEN:** Store a normalized deep recipe copy independently of the active source; paste through `commitRecipe()`.

### Task 0.5: Final base-contract evidence

**Files:**
- Modify: `.tasks/PHOTO_STUDIO.md`
- Test: `tests/e2e/photo.spec.ts` only if a deterministic missing browser assertion is genuinely useful

Account explicitly for unsupported encoder behavior and stale render rejection. Do not manufacture timing-sensitive browser tests if the existing unit/runtime evidence is stronger; record equivalent evidence truthfully.

---

## Phase 1 — Source acquisition, formats, and local project persistence

### Task 1.1: Drag/drop and clipboard acquisition

**Files:**
- Create: `src/tools/photo/photo-import.ts`
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Test: `tests/unit/photo-import.test.ts`
- Test: `tests/e2e/photo-import.spec.ts`

Normalize file input, drop, and clipboard blobs through one import contract. Clipboard failures must leave the active document intact and explain permission/capability limits.

### Task 1.2: Durable local projects and recovery

**Files:**
- Create: `src/tools/photo/photo-project-store.ts`
- Create: `src/tools/photo/photo-project-types.ts`
- Modify: `src/tools/photo/photo-types.ts`
- Modify: `src/tools/photo/PhotoWorkspace.tsx`
- Test: `tests/unit/photo-project-store.test.ts`
- Test: `tests/e2e/photo-project.spec.ts`

Persist serializable project state in IndexedDB; use OPFS for large local source/cache payloads when available. Include schema version, migration, quota/error handling, autosave debounce, recovery prompt, explicit delete, and cleanup.

### Task 1.3: Virtual copies and user presets

**Files:**
- Extend: project types/store and workspace workflow UI
- Test: project unit/browser specs

Variants share one immutable source identity and maintain independent recipes/snapshots. User presets are local, named, editable, importable/exportable, and removable.

### Task 1.4: TIFF import adapter

Before code, reverify a maintained browser-compatible decoder and its license/current stable version. Pin exactly.

**Files:**
- Create: `src/tools/photo/codecs/tiff-decoder.ts`
- Modify: `src/tools/photo/photo-import.ts`
- Test: `tests/unit/photo-tiff.test.ts`
- Fixture: smallest deterministic TIFFs needed for covered bit depths/compression modes

Dynamically load the decoder only for TIFF input. Preserve high-bit-depth intermediates where practical; fail clearly for unsupported TIFF variants.

### Task 1.5: Camera RAW adapter

Before code, reverify the selected LibRaw/WASM browser package, supported formats, worker API, license, bundle behavior, and exact current stable version. Pin exactly.

**Files:**
- Create: `src/tools/photo/codecs/raw-decoder.ts`
- Create: `src/tools/photo/codecs/raw.worker.ts` if the selected package does not already isolate work
- Extend: import contract/types
- Add: compact legal test fixtures for representative DNG plus format-detection fixtures where redistribution is permitted
- Test: `tests/unit/photo-raw.test.ts`
- Test: `tests/e2e/photo-import.spec.ts`

Expose capability-gated RAW controls only when the source supports them. Memory failure must not corrupt the current document.

---

## Phase 2 — Composition, scopes, advanced tone/color, and color management

### Task 2.1: Direct crop handles and composition overlays

**Files:**
- Create: `src/tools/photo/PhotoCropOverlay.tsx`
- Modify: `PhotoCanvas.tsx`, workspace, CSS
- Test: `tests/e2e/photo-geometry.spec.ts`

Provide direct crop rectangle manipulation, move, edge/corner handles, straighten interaction, thirds/grid/diagonal/golden overlays, and numerical parity with recipe state.

### Task 2.2: Per-channel curves, levels, and channel mixer

**Files:**
- Extend: `photo-types.ts`, `photo-engine.ts`, worker/renderer
- Create or extend curve controls
- Test: focused unit math plus browser control flow

All operations must be deterministic, clamped, serializable, snapshot-safe, and preview/export equivalent.

### Task 2.3: Deterministic auto tone and white balance

**Files:**
- Create: `photo-analysis.ts`
- Extend: workspace UI
- Test: deterministic fixture expectations

Algorithms produce ordinary visible numeric recipe changes that users can inspect, edit, undo, and reset; there is no opaque state.

### Task 2.4: LUT workflow

Reverify maintained parser/render approach immediately before implementation.

**Files:**
- Create: `photo-lut.ts`
- Extend recipe, renderer, worker, workspace
- Test `.cube` parsing/interpolation/strength and browser import/error flow

### Task 2.5: ICC profile transforms and soft proof

Reverify LittleCMS/WASM candidate and exact pinned version before installation.

**Files:**
- Create: `src/tools/photo/color/photo-color-management.ts`
- Create worker wrapper as appropriate
- Extend source/export profile state and export writer
- Test profile parsing/transform fixtures plus browser proof/gamut controls

Keep assign vs convert semantics explicit. Never claim control over OS monitor calibration.

### Task 2.6: Inspection scopes

**Files:**
- Create: `photo-scopes.ts`
- Create: `PhotoScopes.tsx`
- Extend renderer result or derive from rendered preview bytes
- Test: unit histogram/waveform/parade/vectorscope mapping and browser visibility

Add waveform, RGB parade, vectorscope, exposure zones, focus/detail map, pixel coordinates, multiple pinned samplers, and gamut overlay.

---

## Phase 3 — Selection, masking, and brush system

### Task 3.1: Selection model

**Files:**
- Extend: `photo-types.ts`, `photo-engine.ts`
- Create: `photo-selection.ts`
- Extend canvas direct manipulation
- Test: unit geometry/combine operations + browser pointer/keyboard flow

Support rectangle, ellipse, polygon/lasso, color tolerance, luminance selection, add/subtract/intersect, feather, grow/shrink, invert, deselect, and convert-to-mask.

### Task 3.2: Mask management

Add rename, duplicate, visibility, delete, overlay visualization, overlay appearance, and add/subtract/intersect mask composition.

### Task 3.3: Professional brush controls

Extend brush masks with hardness, flow, spacing, erase, smoothing, and pressure response when pointer pressure exists. Pointer pressure must degrade to deterministic constant pressure on unsupported devices.

### Task 3.4: Retouch workflow depth

Add source-offset visualization/locking, multi-stroke clone/heal, bypass/visibility, and operation management while preserving one logical undo step per stroke/action.

---

## Phase 4 — Layers, compositing, transforms, and advanced detail

### Task 4.1: Layer document model

**Files:**
- Create: `photo-layers.ts`
- Extend: project/recipe types without breaking legacy version-1 recipe imports
- Extend renderer with ordered compositing
- Add unit serialization/compositing tests

Layer state includes ID, name, visibility, opacity, transform, blend mode, optional mask, and source reference.

### Task 4.2: Layer UI

Add image layers, rename/reorder/duplicate/delete, opacity, visibility, supported photographic blend modes, transform, and masks. Use accessible DOM controls plus direct canvas manipulation.

### Task 4.3: Adjustment/text/watermark/shape layers

Reuse existing adjustment math for adjustment layers where semantics remain clear. Add text/image watermark layers and basic proofing annotation shapes.

### Task 4.4: Warp/liquify and deterministic filters

Add bounded mesh warp/liquify plus Gaussian, median, edge-preserving smoothing, high-pass, frequency separation, defringe, moiré reduction, hot-pixel correction, and dust visualization. Each algorithm gets small deterministic fixtures and explicit performance caps.

---

## Phase 5 — Multi-image photographic processing

### Task 5.1: Shared registration/merge worker foundation

Research/reverify the selected browser-compatible image-registration implementation before adding dependencies. Keep this subsystem lazily loaded.

**Files:**
- Create: `src/tools/photo/merge/photo-merge-types.ts`
- Create: `src/tools/photo/merge/photo-merge.worker.ts`
- Create adapters for registration and bounded image queues
- Unit-test worker messages/error isolation

### Task 5.2: Exposure fusion and HDR merge

Implement exposure fusion first, then HDR radiance/tone mapping if fixture and memory validation are acceptable. Show source-count, alignment, and memory diagnostics before processing.

### Task 5.3: Panorama stitching

Implement alignment, stitch, projection choice supported by the selected engine, and resulting crop/geometry handoff to the standard editor.

### Task 5.4: Focus/average/median stacking

Implement aligned focus stack plus average and median stacks. Outputs become ordinary local Photo Studio source documents so all existing edits/export functions remain available.

---

## Phase 6 — Workflow and export depth

### Task 6.1: Partial recipe copy/paste and sync

Provide adjustment-group selection for copy/paste and multi-file sync. Preserve one undo step per target application.

### Task 6.2: Batch queue depth

Add reorder, cancel/retry, batch rename, and bounded sequential processing without retaining finished full-resolution blobs.

### Task 6.3: Metadata and watermark templates

Add named local metadata templates, watermark presets, and clear location/sensitive-field opt-in semantics.

### Task 6.4: Export presets and multi-output recipes

Named presets capture format, resize, quality, output sharpening, metadata policy, profile, watermark, and filename rules. One source can render several presets sequentially.

### Task 6.5: High-quality resampling and additional validated output formats

Add selectable deterministic resampling kernels. Reverify browser/WASM TIFF and any additional still-image encoders immediately before implementation; add only formats whose bytes/MIME/profile behavior can be proven with fixtures.

### Task 6.6: Proof/contact sheets and print planning

Add contact/proof sheet output and print-size/PPI calculator. Do not claim native printer-driver control.

### Task 6.7: Progressive File System Access integration

Where supported, allow explicit open/save-to-file workflows. Preserve ordinary file input/download as the fallback on every supported browser.

---

## Phase 7 — Completion audit, integration, and deployment

### Task 7.1: Capability ledger closure

**File:** `.tasks/PHOTO_STUDIO.md`

Account for every capability in the original design and expansion addendum. No unclassified item remains. Any `other` exclusion is explicitly reported to the user before completion.

### Task 7.2: Accessibility/responsive audit

Verify 320 CSS px reflow, keyboard workflows, focus order/states, accessible names/status, reduced motion, touch target usability, and no inaccessible canvas-only essential action.

### Task 7.3: Memory/performance audit

Verify object URL/ImageBitmap cleanup, worker cancellation/revision behavior, bounded history/project storage, large-file safe limits, sequential batch/merge queues, and lazy heavyweight runtime loading.

### Task 7.4: Reconcile with moving `origin/main`

Merge/reconcile non-destructively only after Photo Studio material work is green in isolation. Do not force, rewrite, or delete parallel-agent branches. Resolve only genuine integration conflicts.

### Task 7.5: Exact merge-state verification

Run repository unit tests, production build, and every Photo Studio browser spec selected by the final diff. Review changed files for Photo-only scope and accidental private/internal text leakage.

### Task 7.6: Merge and Pages proof

Merge only when exact merge-state checks are green. Verify the exact integrated `origin/main` SHA is deployed by Pages and perform an uncached `/#/tools/photo-studio` route check.

### Task 7.7: Tracking closure

Close `.tasks/PHOTO_STUDIO.md` and shared task records only after implementation, integration, deployment, and capability-ledger gates all have evidence.
