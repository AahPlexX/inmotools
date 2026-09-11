# Photo Studio — Authoritative Completion Tracker

> This file is the single source of truth for Photo Studio completion state while `feat/photo-studio` is active. Update it whenever a Photo Studio commit changes a gate, remaining task, verification result, integration state, or deployment state. Do not claim completion from the implementation plan alone.

## Deterministic completion goal

Photo Studio is **COMPLETE** only when every gate below is checked on the same final integrated `origin/main` SHA and there are no unresolved Photo Studio release blockers.

- [ ] **Feature contract** — at least 30 genuinely functional, non-destructive editing capabilities are exposed in the production UI and each maps to recipe state plus real preview/export behavior; no inert controls.
- [ ] **Direct editing contract** — local masks and retouch operations can be placed directly on the rendered photo with image-space coordinates that remain correct across supported zoom levels; gestures commit as coherent undo steps.
- [ ] **Geometry/detail contract** — crop/rotation/flip/straighten, lens distortion, horizontal/vertical perspective, texture/clarity/sharpening, luminance/chroma denoise, chromatic-aberration correction, and tone curve are usable and export through the same renderer as preview.
- [ ] **Export contract** — JPEG/PNG/WebP capability probing prevents MIME mislabeling; safe canvas limits are enforced; filename, quality, resize, background, output sharpening, and metadata policy are user-controllable.
- [ ] **Metadata contract** — reviewed metadata can be serialized to XMP; JPEG/PNG/WebP exports attempt standards-compatible embedded XMP where supported; metadata packaging failure never destroys the rendered pixel export; XMP sidecar remains available.
- [ ] **Batch/project contract** — batch processing is sequential and failure-isolated, does not retain all full-resolution outputs in memory, uses the same export policy as single-file export, and recipe JSON import/export round-trips through normalization/version validation.
- [ ] **History/persistence contract** — undo/redo, snapshots/presets/recipe state used by the UI remain deterministic and reversible; stale asynchronous render results cannot replace newer revisions.
- [ ] **Responsive/accessibility contract** — production UI has no page-level horizontal overflow at 320 CSS px, remains keyboard operable for core editing/export flows, exposes meaningful labels/status, and respects reduced-motion behavior.
- [ ] **Focused verification contract** — fresh Photo Studio unit tests, production build, and `tests/e2e/photo.spec.ts` pass against the exact final merge state.
- [ ] **Integration contract** — branch is reconciled non-destructively with the then-current `origin/main`; changed-file review confirms no unrelated tool regressions or private/internal prompt leakage; PR merge state is green.
- [ ] **Deployment contract** — the exact integrated `origin/main` SHA is published by GitHub Pages and an uncached live check confirms `/#/tools/photo-studio` loads the intended production workspace.
- [ ] **Tracking closure contract** — this file records the final SHA/evidence, Photo Studio is moved out of `.tasks/IN_PROGRESS.md`, closure is recorded in `.tasks/DONE.md`/`.tasks/WORK_LOG.md`, and any intentionally deferred decoder enhancement is explicitly recorded rather than silently omitted.

If any box above is unchecked, Photo Studio is not complete.

## Current state

- Status: **IN PROGRESS**
- Working branch: `feat/photo-studio`
- Pull request: `#29`
- Current verified implementation head before this tracker-only commit: `df69b7d98bd5305023b8a1d49727445c401537c9`
- Current phase: **Task 4 / Milestone D — spec-gap closure, hardening, integration, deployment verification**
- Last fully verified exact-head CI evidence: workflow run `34643353378` completed successfully for `df69b7d98bd5305023b8a1d49727445c401537c9`; all 658 repository unit tests, production build, and all 22 focused Photo Studio browser tests succeeded on the PR merge state.

## Verified progress

- [x] Core typed `PhotoRecipe`, normalization, history, histogram, metadata serialization, and non-destructive renderer architecture exist.
- [x] Revision-aware preview/export rendering and stale-result rejection exist.
- [x] Direct on-image radial/local and retouch placement is implemented; pointer coordinates are normalized to the visually rendered image bounds.
- [x] Zoom interaction regression coverage includes above-100% zoom placement.
- [x] Lens distortion and horizontal/vertical perspective transforms are implemented in the shared geometry path.
- [x] Texture, clarity, sharpening, luminance/chroma denoise, and chromatic-aberration correction exist in the pixel engine.
- [x] Tone-curve editing is wired into normal recipe history and preview/export behavior with accessible graph + numeric editing.
- [x] Embedded-XMP container writer has focused unit coverage for JPEG APP1, PNG XMP `iTXt`, and WebP `XMP ` / VP8X behavior.
- [x] Single-photo export uses unified export orchestration with safe editable filename, resize policy, output sharpening, metadata policy, standards-compatible XMP embedding attempt, and pixel-export-preserving fallback.
- [x] Batch export is exposed in the production dialog, processes sequentially with per-file status, shares format/resize/sharpening/metadata policy, and does not retain completed full-resolution blobs in the batch summary.
- [x] Recipe JSON export/import, editable presets, history, and snapshot restore paths remain wired.
- [x] RGB + luminance histogram is presented in the live preview toolbar with four distinct channels.
- [x] Highlight/shadow clipping warnings render as a zoom-synchronized non-destructive overlay computed from the actual rendered preview pixels.
- [x] Color sampler reads the rendered preview in intrinsic image coordinates and reports hexadecimal, RGB, HSL, and alpha when relevant.
- [x] Browser coverage verifies tone-curve undo semantics, direct mask/retouch placement, reviewed XMP sidecar, actual embedded XMP in PNG, safe custom filename, output sharpening, production batch queue completion, RGB histogram, clipping overlay, color sampler, keyboard history, and 320 CSS px editor/export-dialog reflow.
- [x] Exact-head CI at `df69b7d98bd5305023b8a1d49727445c401537c9` passed all 658 repository unit tests, production build, and all 22 focused Photo Studio browser tests through PR validation run `34643353378`.

## Spec inventory blockers discovered during audit

These remain release blockers because they are promised by the design specification but are not yet fully represented in the production UI/behavior:

- [x] RGB histogram presentation.
- [x] Clipping-warning overlay/toggle for highlight/shadow clipping.
- [x] Color sampler with RGB, HSL, and hexadecimal readout.
- [ ] Individual-control reset affordances rather than reset-all only.
- [ ] Named snapshots; current snapshots are auto-numbered.
- [ ] Explicit long-edge and short-edge export resize modes.
- [ ] Explicit safe-size export choice/warning before an oversized render, rather than relying only on automatic safe scaling and post-render status.
- [ ] Browser coverage for unsupported encoder messaging and stale-render rejection at the workspace level if not already proven by equivalent focused coverage.
- [ ] Final feature-inventory accounting for before/after interaction wording, custom crop-ratio intent, copy/paste recipe semantics, and any other design-language mismatch discovered during final audit.

## Remaining release work

1. Close the remaining spec inventory blockers above with real UI/renderer behavior and focused tests; do not lower or reinterpret the completion goal to avoid them.
2. Re-audit the complete design feature list after blocker closure and account for every promised capability as implemented, intentionally deferred, or removed from the release specification before merge.
3. Reconcile `feat/photo-studio` with the latest moving `main` without rewriting other agents' branches; resolve only genuine integration conflicts.
4. Review the exact changed-file set for Photo-only scope, private/internal prompt leakage, and unrelated regressions.
5. Run fresh final unit/build/focused E2E against the exact merge state, then merge only if green.
6. Verify the exact merged `main` SHA in the Pages deployment and perform an uncached live-route check.
7. Close shared task records only after all preceding gates are evidenced.

## Anti-staleness rule

- This tracker must be reviewed before and after each material Photo Studio implementation batch.
- When a gate changes from open to satisfied, update this file in the same branch before moving to a different release subsystem.
- CI evidence older than the current material implementation head is historical evidence only, not final completion evidence.
- A green PR branch is not equivalent to deployed completion; final evidence must come from the exact integrated `main` SHA.
- Parallel-agent branches are never deleted, force-moved, or rewritten as part of Photo Studio completion.
