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
- Branch head when this tracker was established: `25e6754056835864fe0240da7fe12aa1ee2a4948`
- Current `main` observed before tracker creation: `fbfade09aec3f73eb70a4d202949329036883947`
- Current phase: **Task 4 — export/metadata/batch hardening, workspace integration, final verification**
- Last exact-head CI evidence: workflow run `34633141208` completed successfully for `25e6754056835864fe0240da7fe12aa1ee2a4948`.

## Verified progress

- [x] Core typed `PhotoRecipe`, normalization, history, histogram, metadata serialization, and non-destructive renderer architecture exist.
- [x] Revision-aware preview/export rendering and stale-result rejection exist.
- [x] Direct on-image radial/local and retouch placement is implemented; pointer coordinates are normalized to the visually rendered image bounds.
- [x] Zoom interaction regression coverage includes above-100% zoom placement.
- [x] Lens distortion and horizontal/vertical perspective transforms are implemented in the shared geometry path.
- [x] Texture, clarity, sharpening, luminance/chroma denoise, and chromatic-aberration correction exist in the pixel engine.
- [x] Embedded-XMP container writer has focused unit coverage for JPEG APP1, PNG XMP `iTXt`, and WebP `XMP ` / VP8X behavior.
- [x] Batch engine contract exists for sequential processing and per-file failure isolation without retaining output blobs in the summary.
- [x] Safe editable export-filename contract exists.
- [x] Unified single/batch export orchestration exists for metadata policy, embedding fallback, output sharpening, and filename handling.
- [x] Exact-head CI at `25e6754056835864fe0240da7fe12aa1ee2a4948` passed the repository unit suite, production build, and focused Photo Studio browser tests through PR validation run `34633141208`.

## Remaining release work

1. Wire the unified export orchestration into `PhotoWorkspace.tsx` so actual single-photo downloads use embedded metadata with sidecar fallback and editable filenames.
2. Expose and verify batch workflow in the production workspace using the same export policy.
3. Expose a usable tone-curve editor/control path backed by the existing recipe/renderer behavior; verify it is not inert.
4. Finish any remaining project/recipe import-export UI needed by the design contract and prove normalized round-trip behavior.
5. Add focused browser coverage for the newly exposed export, metadata, batch, and tone-curve workflows; keep 320 CSS px reflow coverage.
6. Re-read the design/spec feature inventory and account for every promised capability; remove or explicitly defer anything not intended for the deterministic completion goal.
7. Reconcile `feat/photo-studio` with the latest moving `main` without rewriting other agents' branches; resolve only genuine integration conflicts.
8. Run fresh final unit/build/focused E2E against the exact merge state, then merge only if green.
9. Verify the exact merged `main` SHA in the Pages deployment and uncached live route.
10. Close shared task records only after all preceding gates are evidenced.

## Anti-staleness rule

- This tracker must be reviewed before and after each material Photo Studio implementation batch.
- When a gate changes from open to satisfied, update this file in the same branch before moving to a different release subsystem.
- CI evidence older than the current material implementation head is historical evidence only, not final completion evidence.
- A green PR branch is not equivalent to deployed completion; final evidence must come from the exact integrated `main` SHA.
- Parallel-agent branches are never deleted, force-moved, or rewritten as part of Photo Studio completion.
