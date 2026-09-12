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
- [ ] **Focused verification contract** — fresh Photo Studio unit tests, production build, and the complete focused Photo Studio browser matrix pass against the exact final merge state.
- [ ] **Integration contract** — branch is reconciled non-destructively with the then-current `origin/main`; changed-file review confirms no unrelated tool regressions or private/internal prompt leakage; PR merge state is green.
- [ ] **Deployment contract** — the exact integrated `origin/main` SHA is published by GitHub Pages and an uncached live check confirms `/#/tools/photo-studio` loads the intended production workspace.
- [ ] **Tracking closure contract** — this file records the final SHA/evidence, Photo Studio is moved out of `.tasks/IN_PROGRESS.md`, closure is recorded in `.tasks/DONE.md`/`.tasks/WORK_LOG.md`, and any intentionally deferred decoder enhancement is explicitly recorded rather than silently omitted.

If any box above is unchecked, Photo Studio is not complete.

## Current state

- Status: **IN PROGRESS**
- Working branch: `feat/photo-studio`
- Pull request: `#29`
- Current material implementation head before this tracker-only commit: `5394c88b560af6ab5933968771334502da9c207e`
- Current phase: **Capability expansion Phase 0 — close the original release contract cleanly**
- Current verified merge-state evidence: PR workflow run `34706122558` completed successfully for Photo head `5394c88b560af6ab5933968771334502da9c207e`; the repository unit suite, production build, and the complete focused Photo Studio browser matrix all passed on the PR merge state.
- Most recent intentional RED evidence: workflow run `34705869311` passed 702 repository unit tests and the production build, then ran 40 focused Photo browser cases; all 36 pre-existing cases passed and only the four new desktop/mobile comparison cases failed because `Split` and `Side by side` did not yet exist.
- Historical exact-head CI evidence: workflow run `34662031647` completed successfully for `735f9f915cf8427c95444d3296ce065e688a2ea0`; all 661 repository unit tests, production build, and all 24 focused Photo Studio browser tests succeeded on that earlier PR merge state.

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
- [x] Every exposed scalar adjustment has an individual reset that restores its actual neutral/default value without resetting neighboring controls.
- [x] Snapshots accept user-provided names and restore the captured normalized recipe through ordinary history.
- [x] Validated custom crop-ratio inputs apply a centered exact-ratio crop through the same normalized recipe path as built-in presets.
- [x] RGB + luminance histogram is presented in the live preview toolbar with four distinct channels.
- [x] Highlight/shadow clipping warnings render as a zoom-synchronized non-destructive overlay computed from the actual rendered preview pixels.
- [x] Color sampler reads the rendered preview in intrinsic image coordinates and reports hexadecimal, RGB, HSL, and alpha when relevant.
- [x] Long-edge and short-edge export sizing preserve the edited aspect ratio for landscape and portrait frames.
- [x] The export dialog exposes planned dimensions before render and blocks known-oversized single exports until the user explicitly selects the offered verified-safe dimensions.
- [x] Safe export planning honors both edge and area ceilings and preserves aspect ratio.
- [x] Before/after comparison now supports an explicit split mode with a pointer-draggable, keyboard-operable split slider plus a side-by-side mode; both surfaces share synchronized zoom and preserve image-space registration for overlays and direct editing.
- [x] Photo source changes now select the full focused Photo browser matrix (`photo.spec.ts`, `photo-controls.spec.ts`, and `photo-compare.spec.ts`) rather than silently omitting specialized Photo specs.
- [x] Browser coverage verifies tone-curve undo semantics, direct mask/retouch placement, reviewed XMP sidecar, actual embedded XMP in PNG, safe custom filename, output sharpening, production batch queue completion, RGB histogram, clipping overlay, color sampler, individual resets, named snapshots, exact custom crop ratio, long-/short-edge sizing, explicit safe-size selection, keyboard history, synchronized split/side-by-side comparison, and 320 CSS px editor/export-dialog reflow.
- [x] Exact Photo head `5394c88b560af6ab5933968771334502da9c207e` passed repository unit tests, production build, and the full focused Photo browser matrix through PR validation run `34706122558`.

## Original spec inventory blockers discovered during audit

These remain release blockers because they are promised by the design specification but are not yet fully represented in the production UI/behavior or final evidence:

- [x] RGB histogram presentation.
- [x] Clipping-warning overlay/toggle for highlight/shadow clipping.
- [x] Color sampler with RGB, HSL, and hexadecimal readout.
- [x] Individual-control reset affordances rather than reset-all only.
- [x] Named snapshots.
- [x] Explicit long-edge and short-edge export resize modes.
- [x] Explicit safe-size export choice/warning before an oversized render.
- [x] True validated custom crop ratio.
- [x] Draggable and side-by-side before/after comparison.
- [ ] In-session copy/paste recipe semantics across sources as one undo step.
- [ ] Browser coverage for unsupported encoder messaging and stale-render rejection at the workspace level if not already proven by equivalent focused coverage.

## Capability expansion execution

- [x] Phase 0 / Task 0.1 — individual scalar resets.
- [x] Phase 0 / Task 0.2 — validated custom crop ratio, implemented at `b3fb5239dbd8910fd0edbb3071d9cf482bc9fa7f` with exact 5:4-on-4:3 desktop/mobile browser evidence.
- [x] Phase 0 / Task 0.3 — draggable and side-by-side comparison, implemented at `5394c88b560af6ab5933968771334502da9c207e` with strict RED evidence in run `34705869311` and GREEN merge-state evidence in run `34706122558`.
- [ ] Phase 0 / Task 0.4 — in-session copy/paste edits.
- [ ] Phase 0 / Task 0.5 — final base-contract evidence and explicit unsupported-encoder/stale-render accounting.
- [ ] Phases 1–7 — source acquisition and persistence; composition/scopes/tone/color; selection/masking/brushes; layers/compositing/detail; multi-image processing; workflow/export depth; final capability ledger, integration, and deployment.

## Remaining release work

1. Implement Phase 0 / Task 0.4 in-session copy/paste edits across sources as one undo step.
2. Complete Phase 0 / Task 0.5 evidence and explicitly account for unsupported encoder messaging and stale-render rejection.
3. Continue Phases 1–7 in the ordered, Photo-only batches defined by `docs/superpowers/plans/2026-09-12-photo-studio-capability-expansion.md`; maintain the 164-item capability ledger without silent omissions.
4. Reconcile `feat/photo-studio` with the latest moving `main` only when the planned integration gate is reached; do not rewrite parallel-agent branches.
5. Review the exact changed-file set, run exact merge-state validation, verify the Pages deployment, and close shared task records only after every completion gate is evidenced.

## Anti-staleness rule

- This tracker must be reviewed before and after each material Photo Studio implementation batch.
- When a gate changes from open to satisfied, update this file in the same branch before moving to a different release subsystem.
- CI evidence older than the current material implementation head is historical evidence only, not final completion evidence.
- A green PR branch is not equivalent to deployed completion; final evidence must come from the exact integrated `main` SHA.
- Parallel-agent branches are never deleted, force-moved, or rewritten as part of Photo Studio completion.
